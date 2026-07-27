import { useState } from 'react'
import {
  clearGithubToken,
  loadGithubCredentials,
  saveGithubCredentials,
  type GithubCredentials,
} from '../lib/githubActions'

interface GithubSetupProps {
  onSaved: (creds: GithubCredentials) => void
}

export function GithubSetup({ onSaved }: GithubSetupProps) {
  const existing = loadGithubCredentials()
  const [repo, setRepo] = useState(existing?.repo || import.meta.env.VITE_GITHUB_REPO || '')
  const [token, setToken] = useState(existing?.token || '')
  const [ref, setRef] = useState(existing?.ref || 'main')
  const [saved, setSaved] = useState(Boolean(existing))

  return (
    <div className="github-setup">
      <h3>Connect GitHub Actions</h3>
      <p className="muted small">
        Paste a fine-grained PAT once. It stays in this browser’s localStorage only — never in the repo
        or frontend bundle. Required scopes: Actions read/write, Contents read, and Secrets read/write
        (for pasting YouTube cookies).
      </p>
      <label>
        Repository (owner/name)
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="you/MusicPocket"
          autoComplete="off"
        />
      </label>
      <label>
        Branch
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="main" autoComplete="off" />
      </label>
      <label>
        Personal access token
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="github_pat_…"
          autoComplete="off"
        />
      </label>
      <div className="search-card-actions">
        <button
          type="button"
          className="primary-btn"
          onClick={() => {
            const creds = { repo: repo.trim(), token: token.trim(), ref: ref.trim() || 'main' }
            saveGithubCredentials(creds)
            setSaved(true)
            onSaved(creds)
          }}
          disabled={!repo.trim() || !token.trim()}
        >
          Save connection
        </button>
        {saved ? (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              clearGithubToken()
              setToken('')
              setSaved(false)
            }}
          >
            Clear token
          </button>
        ) : null}
      </div>
      {saved ? <p className="muted small">Connected to {repo}. Search will start Actions from this page.</p> : null}
    </div>
  )
}
