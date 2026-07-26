import type { Song, SongsManifest, SearchResults } from '../types/music'
import type { GithubCredentials } from './githubActions'

/** Resolve asset URLs relative to the Vite base (GitHub Pages subpath safe). */
export function assetUrl(path: string | undefined | null): string | undefined {
  if (!path) return undefined
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = path.replace(/^\//, '')
  return `${normalizedBase}${normalizedPath}`
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`)
  }
  return (await response.json()) as T
}

/** Read a public/ file from GitHub immediately after Actions commits (Pages CDN lags). */
export async function loadRepoPublicJson<T>(
  pathFromPublic: string,
  creds?: GithubCredentials | null,
  refOverride?: string | null,
): Promise<T> {
  const clean = pathFromPublic.replace(/^\//, '')
  const ref = refOverride || creds?.ref || 'main'

  if (creds) {
    const [owner, repo] = creds.repo.split('/')
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/public/${clean}?ref=${encodeURIComponent(ref)}`
    const response = await fetch(apiUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github.raw+json',
        Authorization: `Bearer ${creds.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Cache-Control': 'no-cache',
      },
    })
    if (response.ok) {
      return (await response.json()) as T
    }
  }

  // Public raw URL — available as soon as the commit is on the branch
  if (creds?.repo) {
    const rawUrl = `https://raw.githubusercontent.com/${creds.repo}/${ref}/public/${clean}?t=${Date.now()}`
    return fetchJson<T>(rawUrl)
  }

  throw new Error(`Unable to load ${clean} from repository`)
}

export async function loadSongsManifest(
  creds?: GithubCredentials | null,
  refOverride?: string | null,
): Promise<SongsManifest> {
  if (creds) {
    try {
      const data = await loadRepoPublicJson<SongsManifest>('data/songs.json', creds, refOverride)
      if (!data || !Array.isArray(data.songs)) {
        throw new Error('Invalid songs manifest')
      }
      return data
    } catch {
      // Fall through to Pages copy
    }
  }

  const url = assetUrl('data/songs.json')
  if (!url) {
    throw new Error('Unable to resolve songs manifest URL')
  }

  const data = await fetchJson<SongsManifest>(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`)
  if (!data || !Array.isArray(data.songs)) {
    throw new Error('Invalid songs manifest')
  }
  return data
}

export async function loadSearchResults(
  creds?: GithubCredentials | null,
  refOverride?: string | null,
): Promise<SearchResults> {
  if (creds) {
    try {
      return await loadRepoPublicJson<SearchResults>('data/search/latest.json', creds, refOverride)
    } catch {
      // Fall through to Pages copy
    }
  }

  const url = assetUrl('data/search/latest.json')
  if (!url) {
    throw new Error('Unable to resolve search results URL')
  }

  return fetchJson<SearchResults>(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`)
}

export function filterSongs(songs: Song[], query: string): Song[] {
  const q = query.trim().toLowerCase()
  if (!q) return songs
  return songs.filter((song) => {
    const haystack = [song.title, song.artist, song.album ?? '', song.license ?? '']
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

/** Resolve media/library files. Prefer raw GitHub when connected so new imports
 *  play before Pages finishes redeploying. */
export function mediaUrl(
  path: string | undefined | null,
  creds?: GithubCredentials | null,
  refOverride?: string | null,
): string | undefined {
  if (!path) return undefined
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path
  const clean = path.replace(/^\//, '')
  if (creds?.repo) {
    const ref = refOverride || creds.ref || 'main'
    return `https://raw.githubusercontent.com/${creds.repo}/${ref}/public/${clean}`
  }
  return assetUrl(clean)
}

export function findSongById(songs: Song[], id: string | null | undefined): Song | undefined {
  if (!id) return undefined
  return songs.find((s) => s.id === id)
}
