import { useMemo, useRef, useState } from 'react'
import type { SearchCandidate } from '../types/music'
import {
  actionsWorkflowUrl,
  dispatchWorkflow,
  explainFailedRun,
  loadGithubCredentials,
  waitForLatestWorkflowRun,
  type GithubCredentials,
} from '../lib/githubActions'
import { loadSongsManifest } from '../lib/songs'

function suggestDisplayTitle(raw: string): string {
  const book = raw.match(/《([^》]+)》/)
  if (book?.[1]) return book[1].trim()
  const cleaned = raw
    .replace(/\[[^\]]*official[^\]]*\]/gi, '')
    .replace(/\([^)]*official[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || raw
}

function shellQuote(value: string): string {
  if (value === '') return "''"
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function buildLocalImportCommand(sourceUrl: string, title: string, artist: string, album: string): string {
  const parts = [
    'scripts/import_local.sh',
    shellQuote(sourceUrl),
    shellQuote(title.trim() || 'Untitled'),
    shellQuote(artist.trim() || 'Unknown'),
  ]
  if (album.trim()) parts.push(shellQuote(album.trim()))
  return [
    parts.join(' '),
    "git add public && git commit -m 'feat: import authorized audio' && git push",
  ].join('\n')
}

async function writeClipboard(text: string, fallbackEl?: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      const check = navigator.clipboard.readText ? await navigator.clipboard.readText().catch(() => null) : text
      if (check === null || check === text || check.includes('import_local.sh')) {
        return true
      }
    }
  } catch {
    // fall through to execCommand
  }

  if (fallbackEl) {
    fallbackEl.focus()
    fallbackEl.select()
    fallbackEl.setSelectionRange(0, fallbackEl.value.length)
    try {
      return document.execCommand('copy')
    } catch {
      return false
    }
  }
  return false
}

interface ImportStatusProps {
  candidate: SearchCandidate
  creds: GithubCredentials | null
  onClose: () => void
  onNeedSetup: () => void
  onImportComplete?: () => void | Promise<void>
}

type ImportPhase = 'idle' | 'dispatching' | 'running' | 'done' | 'error'

export function ImportStatus({
  candidate,
  creds,
  onClose,
  onNeedSetup,
  onImportComplete,
}: ImportStatusProps) {
  const [title, setTitle] = useState(() => suggestDisplayTitle(candidate.title))
  const [artist, setArtist] = useState(candidate.uploader ?? '')
  const [album, setAlbum] = useState('')
  const [license, setLicense] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [phase, setPhase] = useState<ImportPhase>('idle')
  const [statusText, setStatusText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runUrl, setRunUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showCloud, setShowCloud] = useState(false)
  const commandRef = useRef<HTMLTextAreaElement | null>(null)

  const busy = phase === 'dispatching' || phase === 'running'
  const localCommand = useMemo(
    () => buildLocalImportCommand(candidate.webpageUrl, title, artist, album),
    [candidate.webpageUrl, title, artist, album],
  )

  async function copyLocalCommand() {
    if (!confirmed) {
      setError('先勾选权利确认，再复制命令。')
      return
    }
    if (!title.trim() || !artist.trim()) {
      setError('Title and artist are required.')
      return
    }
    setError(null)
    const ok = await writeClipboard(localCommand, commandRef.current)
    if (!ok) {
      commandRef.current?.focus()
      commandRef.current?.select()
      setError('自动复制失败：命令已选中，请手动 Cmd/Ctrl+C。')
      return
    }
    setCopied(true)
    setStatusText(`已复制本地命令（以 scripts/import_local.sh 开头）。到仓库根目录粘贴运行。`)
    window.setTimeout(() => setCopied(false), 2500)
  }

  async function runImport() {
    if (!confirmed) {
      setError('Rights confirmation is required before import.')
      return
    }
    const active = creds ?? loadGithubCredentials()
    if (!active) {
      onNeedSetup()
      setError('Connect a GitHub PAT first so this page can start the import workflow.')
      return
    }
    if (!title.trim() || !artist.trim()) {
      setError('Title and artist are required.')
      return
    }

    setError(null)
    setPhase('dispatching')
    setStatusText('Starting Import Authorized Audio…')
    const startedAt = new Date().toISOString()
    const beforeCount = (await loadSongsManifest(active).catch(() => null))?.songs.length ?? 0

    try {
      await dispatchWorkflow(active, {
        workflowFile: 'import-audio.yml',
        inputs: {
          source_url: candidate.webpageUrl,
          display_title: title.trim(),
          artist: artist.trim(),
          album: album.trim(),
          license: license.trim(),
          attribution: '',
          confirm_rights: 'true',
        },
      })

      setPhase('running')
      setStatusText('Import queued — waiting for Actions to finish…')

      const run = await waitForLatestWorkflowRun(active, 'import-audio.yml', startedAt, {
        pollMs: 2000,
        onUpdate: (summary) => {
          if (!summary) {
            setStatusText('Waiting for the import run to appear…')
            return
          }
          setRunUrl(summary.htmlUrl)
          setStatusText(
            summary.status === 'completed'
              ? `Run finished: ${summary.conclusion ?? 'unknown'}`
              : `Actions status: ${summary.status}`,
          )
        },
      })

      setRunUrl(run.htmlUrl)
      if (run.conclusion !== 'success') {
        setPhase('error')
        const hint = await explainFailedRun(active, run.id).catch(() => null)
        setError(
          [
            `Import workflow ${run.conclusion ?? 'failed'}.`,
            hint,
            'YouTube often blocks GitHub runners. Prefer the local command above.',
          ]
            .filter(Boolean)
            .join(' '),
        )
        return
      }

      for (let i = 0; i < 20; i += 1) {
        const manifest = await loadSongsManifest(active, run.headSha).catch(() => null)
        const found = manifest?.songs.some((s) => s.sourceUrl === candidate.webpageUrl)
        const grew = (manifest?.songs.length ?? 0) > beforeCount
        if (found || grew) break
        const fallback = await loadSongsManifest(active).catch(() => null)
        if (
          fallback?.songs.some((s) => s.sourceUrl === candidate.webpageUrl) ||
          (fallback?.songs.length ?? 0) > beforeCount
        ) {
          break
        }
        await new Promise((r) => window.setTimeout(r, 1000))
      }

      setPhase('done')
      setStatusText('Import complete. Updating library…')
      await onImportComplete?.()
      setStatusText('Import complete. Song is in your library.')
      onClose()
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : 'Failed to start import')
      setStatusText(null)
    }
  }

  return (
    <div className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="import-sheet">
        <header className="import-header">
          <h2 id="import-title">Import authorized audio</h2>
          <button type="button" className="ghost-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            Close
          </button>
        </header>

        <p className="muted">
          推荐：复制本地命令，在 Mac 仓库根目录运行（使用你浏览器里的 YouTube 登录）。
        </p>

        <dl className="import-summary">
          <div>
            <dt>Source URL</dt>
            <dd>
              <a href={candidate.webpageUrl} target="_blank" rel="noreferrer noopener">
                {candidate.webpageUrl}
              </a>
            </dd>
          </div>
          <div>
            <dt>Platform</dt>
            <dd>{candidate.source}</dd>
          </div>
        </dl>

        <label>
          Display title
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </label>
        <p className="muted small">干净歌名（如 红尘客栈）更容易匹配到歌词。</p>
        <label>
          Artist
          <input value={artist} onChange={(e) => setArtist(e.target.value)} disabled={busy} />
        </label>
        <label>
          Album (optional)
          <input value={album} onChange={(e) => setAlbum(e.target.value)} disabled={busy} />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={busy}
          />
          <span>I own this content or have permission to download and store it.</span>
        </label>

        <div className="import-copy">
          <p className="muted small">本地导入命令（应以 scripts/import_local.sh 开头）</p>
          <textarea
            ref={commandRef}
            className="command-box"
            readOnly
            value={localCommand}
            rows={3}
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Local import command"
          />
          <div className="search-card-actions">
            <button
              type="button"
              className="primary-btn"
              disabled={!confirmed || !title.trim() || !artist.trim()}
              onClick={() => void copyLocalCommand()}
            >
              {copied ? '已复制 ✓' : '复制本地命令'}
            </button>
          </div>
          <p className="muted small">
            Safari：在命令前加 <code>YTDLP_COOKIES_FROM_BROWSER=safari</code>
          </p>
        </div>

        <button type="button" className="ghost-btn" onClick={() => setShowCloud((v) => !v)}>
          {showCloud ? 'Hide cloud import' : 'Advanced: GitHub Actions import'}
        </button>

        {showCloud ? (
          <div className="cloud-import">
            <p className="muted small">
              Cloud import often fails on YouTube bot-checks. Prefer local import unless you have a
              self-hosted runner.
            </p>
            <label>
              License (optional)
              <input
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                placeholder="e.g. CC BY 4.0"
                disabled={busy}
              />
            </label>
            <div className="search-card-actions">
              <button
                type="button"
                className="ghost-btn"
                disabled={!confirmed || busy || phase === 'done'}
                onClick={() => void runImport()}
              >
                {busy ? 'Importing…' : phase === 'done' ? 'Imported' : 'Run Actions import'}
              </button>
              {creds ? (
                <a
                  className="ghost-btn link-btn"
                  href={actionsWorkflowUrl(creds.repo, 'import-audio.yml')}
                  target="_blank"
                  rel="noreferrer"
                >
                  View workflow
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}
        {statusText ? (
          <p className="muted small" role="status">
            {statusText}
            {runUrl ? (
              <>
                {' '}
                ·{' '}
                <a href={runUrl} target="_blank" rel="noreferrer">
                  open run
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  )
}
