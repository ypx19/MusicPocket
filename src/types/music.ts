export interface Song {
  id: string
  title: string
  artist: string
  album?: string
  duration?: number
  audioUrl: string
  coverUrl?: string
  lyricsUrl?: string
  sourceUrl: string
  sourceName?: string
  license?: string
  attribution?: string
  importedAt: string
}

export interface SongsManifest {
  version: number
  updatedAt: string
  songs: Song[]
}

export interface SearchCandidate {
  id: string
  title: string
  uploader: string | null
  duration: number | null
  thumbnail: string | null
  webpageUrl: string
  source: string
}

export interface SearchResults {
  query: string
  searchedAt: string | null
  maxResults: number
  candidates: SearchCandidate[]
  error?: string
}

export type RepeatMode = 'off' | 'all' | 'one'

export interface PlayerPersistedState {
  currentSongId: string | null
  position: number
  queue: string[]
  repeat: RepeatMode
  shuffle: boolean
  volume: number
}

export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error'

export interface LyricLine {
  time: number
  text: string
}
