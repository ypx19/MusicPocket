import { useCallback, useEffect, useState } from 'react'
import type { SearchCandidate, SearchResults } from '../types/music'
import { loadSearchResults } from '../lib/songs'
import {
  actionsWorkflowUrl,
  dispatchWorkflow,
  loadGithubCredentials,
  waitForLatestWorkflowRun,
  type GithubCredentials,
} from '../lib/githubActions'
import { SearchResultCard } from './SearchResultCard'
import { ImportStatus } from './ImportStatus'
import { GithubSetup } from './GithubSetup'
import { CookiePaste } from './CookiePaste'

type JobPhase = 'idle' | 'dispatching' | 'running' | 'refreshing' | 'done' | 'error'

interface SearchPanelProps {
  onImportComplete?: () => void | Promise<void>
}

export function SearchPanel({ onImportComplete }: SearchPanelProps) {
  const [creds, setCreds] = useState<GithubCredentials | null>(() => loadGithubCredentials())
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SearchCandidate | null>(null)
  const [queryDraft, setQueryDraft] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const [phase, setPhase] = useState<JobPhase>('idle')
  const [statusText, setStatusText] = useState<string | null>(null)
  const [runUrl, setRunUrl] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(() => !loadGithubCredentials())

  const refresh = useCallback(async (opts?: { preserveQuery?: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      const active = creds ?? loadGithubCredentials()
      const data = await loadSearchResults(active)
      setResults(data)
      if (!opts?.preserveQuery) {
        setQueryDraft((q) => q || data.query || '')
      }
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load search results')
      return null
    } finally {
      setLoading(false)
    }
  }, [creds])

  useEffect(() => {
    void refresh()
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [refresh])

  const runSearch = useCallback(async () => {
    const query = queryDraft.trim()
    if (!query) {
      setError('Enter a search keyword first.')
      return
    }
    const active = creds ?? loadGithubCredentials()
    if (!active) {
      setShowSetup(true)
      setError('Connect a GitHub PAT first so this page can start the search workflow.')
      return
    }

    setError(null)
    setRunUrl(null)
    setPhase('dispatching')
    setStatusText('Starting Search Authorized Audio…')
    const startedAt = new Date().toISOString()
    const previousSearchedAt = results?.searchedAt ?? null
    let resolvedEarly = false

    try {
      await dispatchWorkflow(active, {
        workflowFile: 'search-audio.yml',
        inputs: {
          query,
          max_results: '8',
        },
      })

      setPhase('running')
      setStatusText('Workflow queued — watching for results…')

      const isFresh = (latest: SearchResults | null | undefined) =>
        Boolean(
          latest &&
            latest.query === query &&
            latest.searchedAt &&
            latest.searchedAt !== previousSearchedAt &&
            Date.parse(latest.searchedAt) >= Date.parse(startedAt) - 60_000,
        )

      // Poll GitHub for latest.json in parallel so results appear as soon as the
      // commit lands — even before our workflow-status poll notices completion.
      const resultsPromise = (async () => {
        for (let attempt = 0; attempt < 90; attempt += 1) {
          if (resolvedEarly) return null
          try {
            const latest = await loadSearchResults(active)
            if (isFresh(latest)) {
              resolvedEarly = true
              return latest
            }
          } catch {
            // keep polling
          }
          await new Promise((r) => window.setTimeout(r, 1000))
        }
        return null
      })()

      const runPromise = waitForLatestWorkflowRun(active, 'search-audio.yml', startedAt, {
        pollMs: 1500,
        shouldCancel: () => resolvedEarly,
        onUpdate: (summary) => {
          if (resolvedEarly) return
          if (!summary) {
            setStatusText('Waiting for the workflow run to appear…')
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

      const raced = await Promise.race([
        resultsPromise.then((latest) => ({ kind: 'results' as const, latest })),
        runPromise.then((run) => ({ kind: 'run' as const, run })),
      ])

      let latest: SearchResults | null = null
      let run = null as Awaited<ReturnType<typeof waitForLatestWorkflowRun>> | null

      if (raced.kind === 'results' && raced.latest) {
        latest = raced.latest
        setPhase('done')
        setResults(latest)
        setQueryDraft(latest.query || query)
        setStatusText(`Found ${latest.candidates.length} candidates.`)
        // Still settle the run promise in background for the run URL
        void runPromise
          .then((finished) => {
            setRunUrl(finished.htmlUrl)
          })
          .catch(() => undefined)
        return
      }

      if (raced.kind === 'run') {
        run = raced.run
        setRunUrl(run.htmlUrl)
        if (run.conclusion !== 'success') {
          resolvedEarly = true
          setPhase('error')
          setError(`Search workflow ${run.conclusion ?? 'failed'}. Open the run log for details.`)
          return
        }
      }

      setPhase('refreshing')
      setStatusText('Search finished — loading candidates…')

      // Prefer the exact commit SHA from the finished run when available.
      for (let attempt = 0; attempt < 15; attempt += 1) {
        latest = await loadSearchResults(active, run?.headSha)
        if (isFresh(latest)) break
        latest = await loadSearchResults(active)
        if (isFresh(latest)) break
        await new Promise((r) => window.setTimeout(r, 800))
      }

      if (latest && isFresh(latest)) {
        setResults(latest)
        setQueryDraft(latest.query || query)
        setPhase('done')
        setStatusText(
          latest.candidates.length === 0
            ? `No candidates for “${query}”.`
            : `Found ${latest.candidates.length} candidates.`,
        )
        return
      }

      if (latest) {
        setResults(latest)
      }
      setPhase('done')
      setStatusText(
        'Workflow finished, but fresh results are not visible yet. Try Refresh results.',
      )
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : 'Failed to start search')
      setStatusText(null)
    }
  }, [creds, queryDraft, results?.searchedAt])

  return (
    <section className="search-panel" aria-label="Search authorized audio">
      <header className="section-header">
        <div>
          <h2>Find authorized audio</h2>
          <p className="muted">
            Search runs in GitHub Actions (no download). Pick a candidate, then copy the local import
            command — that uses your Mac browser login and is the reliable path.
          </p>
        </div>
        <div className="section-header-actions">
          <button type="button" className="ghost-btn" onClick={() => setShowSetup((v) => !v)}>
            {showSetup ? 'Hide setup' : 'GitHub setup'}
          </button>
          <button type="button" className="ghost-btn" onClick={() => void refresh({ preserveQuery: true })}>
            Refresh results
          </button>
        </div>
      </header>

      {offline ? (
        <p className="banner warn" role="status">
          You are offline. Library playback may still work from cache; search/import require network.
        </p>
      ) : null}

      {showSetup ? (
        <>
          <GithubSetup
            onSaved={(next) => {
              setCreds(next)
              setError(null)
            }}
          />
          <CookiePaste creds={creds} onNeedSetup={() => setShowSetup(true)} />
        </>
      ) : null}

      <form
        className="search-workflow-box"
        onSubmit={(e) => {
          e.preventDefault()
          void runSearch()
        }}
      >
        <label>
          Search keyword
          <input
            type="search"
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            placeholder="Song title, artist, or description"
            disabled={phase === 'dispatching' || phase === 'running' || phase === 'refreshing'}
          />
        </label>
        <div className="search-card-actions">
          <button
            type="submit"
            className="primary-btn"
            disabled={!queryDraft.trim() || phase === 'dispatching' || phase === 'running' || phase === 'refreshing'}
          >
            {phase === 'dispatching' || phase === 'running' || phase === 'refreshing'
              ? 'Searching…'
              : 'Search'}
          </button>
          {creds ? (
            <a
              className="ghost-btn link-btn"
              href={actionsWorkflowUrl(creds.repo, 'search-audio.yml')}
              target="_blank"
              rel="noreferrer"
            >
              View workflow
            </a>
          ) : null}
        </div>
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
        ) : (
          <p className="muted small">
            After one-time GitHub setup, Search triggers Actions from this page — no Actions UI required.
          </p>
        )}
      </form>

      {loading && phase === 'idle' ? <p className="muted">Loading latest search JSON…</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {!loading && results && results.candidates.length === 0 ? (
        <p className="empty-state">
          {results.query
            ? `No candidates for “${results.query}”. Try another keyword.`
            : 'No search results yet. Enter a keyword and press Search.'}
        </p>
      ) : null}

      {results?.searchedAt ? (
        <p className="muted small">
          Last search: “{results.query}” · {new Date(results.searchedAt).toLocaleString()}
        </p>
      ) : null}

      <div className="search-results">
        {results?.candidates.map((candidate) => (
          <SearchResultCard key={candidate.id} candidate={candidate} onSelect={setSelected} />
        ))}
      </div>

      {selected ? (
        <ImportStatus
          candidate={selected}
          creds={creds}
          onClose={() => setSelected(null)}
          onNeedSetup={() => setShowSetup(true)}
          onImportComplete={onImportComplete}
        />
      ) : null}
    </section>
  )
}
