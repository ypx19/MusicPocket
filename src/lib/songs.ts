import type { Song, SongsManifest, SearchResults } from '../types/music'

/** Resolve asset URLs relative to the Vite base (GitHub Pages subpath safe). */
export function assetUrl(path: string | undefined | null): string | undefined {
  if (!path) return undefined
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = path.replace(/^\//, '')
  return `${normalizedBase}${normalizedPath}`
}

export async function loadSongsManifest(): Promise<SongsManifest> {
  const url = assetUrl('data/songs.json')
  if (!url) {
    throw new Error('Unable to resolve songs manifest URL')
  }

  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`Failed to load library (${response.status})`)
  }

  const data = (await response.json()) as SongsManifest
  if (!data || !Array.isArray(data.songs)) {
    throw new Error('Invalid songs manifest')
  }
  return data
}

export async function loadSearchResults(): Promise<SearchResults> {
  const url = assetUrl('data/search/latest.json')
  if (!url) {
    throw new Error('Unable to resolve search results URL')
  }

  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`Failed to load search results (${response.status})`)
  }

  return (await response.json()) as SearchResults
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

export function findSongById(songs: Song[], id: string | null | undefined): Song | undefined {
  if (!id) return undefined
  return songs.find((s) => s.id === id)
}
