import { useState } from 'react'
import type { GithubCredentials } from '../lib/githubActions'
import { loadGithubCredentials } from '../lib/githubActions'
import { openYoutubeLogin, syncYoutubeCookieSecrets } from '../lib/githubSecrets'

interface CookiePasteProps {
  creds: GithubCredentials | null
  onNeedSetup: () => void
}

export function CookiePaste({ creds, onNeedSetup }: CookiePasteProps) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveSecrets() {
    const active = creds ?? loadGithubCredentials()
    if (!active) {
      onNeedSetup()
      setError('先在 GitHub setup 里保存 PAT（需要 Secrets: Read and write）。')
      return
    }
    if (!text.trim()) {
      setError('请粘贴 Netscape 格式的 cookies.txt 内容。')
      return
    }

    setBusy(true)
    setError(null)
    setStatus('正在写入 GitHub Secrets（YTDLP_COOKIES_B64 + YTDLP_COOKIES）…')
    try {
      const result = await syncYoutubeCookieSecrets(active, text)
      setStatus(
        `已更新两个 Secret（raw ${result.rawBytes} chars, b64 ${result.b64Length} chars）。Actions 会优先用 B64，失败再试 raw。`,
      )
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync cookie secrets')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cookie-paste">
      <h3>YouTube cookies → Actions</h3>
      <p className="muted small">
        网页读不到 YouTube cookie。请先登录，再用扩展导出 Netscape <code>cookies.txt</code>，粘贴到下方。
        会同时写入 <code>YTDLP_COOKIES_B64</code> 与 <code>YTDLP_COOKIES</code>。
      </p>
      <div className="search-card-actions">
        <button type="button" className="ghost-btn" onClick={openYoutubeLogin}>
          打开 YouTube 登录
        </button>
        <a
          className="ghost-btn link-btn"
          href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
          target="_blank"
          rel="noreferrer"
        >
          Cookie 扩展（Chrome）
        </a>
      </div>
      <label>
        粘贴 cookies.txt
        <textarea
          className="command-box"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tNAME\tvalue'}
          spellCheck={false}
          disabled={busy}
          autoComplete="off"
        />
      </label>
      <div className="search-card-actions">
        <button type="button" className="primary-btn" disabled={busy || !text.trim()} onClick={() => void saveSecrets()}>
          {busy ? 'Saving…' : '保存到 GitHub Secrets'}
        </button>
      </div>
      {status ? (
        <p className="muted small" role="status">
          {status}
        </p>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
      <p className="muted small">
        PAT 需要细粒度权限：Actions read/write、Contents read、Secrets read/write。Cookie
        不会写入仓库，只进 Actions secrets。
      </p>
    </div>
  )
}
