import { useState } from 'react'
import type { SearchCandidate } from '../types/music'
import {
  actionsWorkflowUrl,
  dispatchWorkflow,
  loadGithubCredentials,
  waitForLatestWorkflowRun,
  type GithubCredentials,
} from '../lib/githubActions'
import { loadSongsManifest } from '../lib/songs'

interface ImportStatusProps {
  candidate: SearchCandidate
  creds: GithubCredentials | null
  onClose: () => void
  onNeedSetup: () => void
}

type ImportPhase = 'idle' | 'dispatching' | 'running' | 'done' | 'error'

export function ImportStatus({ candidate, creds, onClose, onNeedSetup }: ImportStatusProps) {
  const [title, setTitle] = useState(candidate.title)
  const [artist, setArtist] = useState(candidate.uploader ?? '')
  const [album, setAlbum] = useState('')
  const [license, setLicense] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [phase, setPhase] = useState<ImportPhase>('idle')
  const [statusText, setStatusText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runUrl, setRunUrl] = useState<string | null>(null)

  const busy = phase === 'dispatching' || phase === 'running'

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
        setError(`Import workflow ${run.conclusion ?? 'failed'}. Check the run log.`)
        return
      }

      // Prefer repository contents over Pages CDN.
      for (let i = 0; i < 12; i += 1) {
        const manifest = await loadSongsManifest(active).catch(() => null)
        const found = manifest?.songs.some((s) => s.sourceUrl === candidate.webpageUrl)
        const grew = (manifest?.songs.length ?? 0) > beforeCount
        if (found || grew) break
        await new Promise((r) => window.setTimeout(r, 1500))
      }

      setPhase('done')
      setStatusText('Import complete. Open Library (refresh if needed) to play the new track.')
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
          Confirm you have the right to download and store this audio. Import starts the GitHub Actions
          workflow from this page.
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
        <label>
          Artist
          <input value={artist} onChange={(e) => setArtist(e.target.value)} disabled={busy} />
        </label>
        <label>
          Album (optional)
          <input value={album} onChange={(e) => setAlbum(e.target.value)} disabled={busy} />
        </label>
        <label>
          License (optional)
          <input
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            placeholder="e.g. CC BY 4.0"
            disabled={busy}
          />
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

        <div className="search-card-actions">
          <button
            type="button"
            className="primary-btn"
            disabled={!confirmed || busy || phase === 'done'}
            onClick={() => void runImport()}
          >
            {busy ? 'Importing…' : phase === 'done' ? 'Imported' : 'Import now'}
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
    </div>
  )
}
