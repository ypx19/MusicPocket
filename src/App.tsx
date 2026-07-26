import { useCallback, useEffect, useMemo, useState } from 'react'
import { MusicLibrary } from './components/MusicLibrary'
import { PlayerBar } from './components/PlayerBar'
import { LyricsPanel } from './components/LyricsPanel'
import { SearchPanel } from './components/SearchPanel'
import { usePersistentPlayer } from './hooks/usePersistentPlayer'
import { useLyrics } from './hooks/useLyrics'
import { loadGithubCredentials } from './lib/githubActions'
import { filterSongs, loadSongsManifest, mediaUrl } from './lib/songs'
import type { Song } from './types/music'
import './App.css'

type Tab = 'library' | 'search'

function withPlayableUrls(songs: Song[]): Song[] {
  const creds = loadGithubCredentials()
  if (!creds) return songs
  return songs.map((song) => ({
    ...song,
    audioUrl: mediaUrl(song.audioUrl, creds) ?? song.audioUrl,
    coverUrl: mediaUrl(song.coverUrl, creds),
    lyricsUrl: mediaUrl(song.lyricsUrl, creds),
  }))
}

export default function App() {
  const [songs, setSongs] = useState<Song[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<Tab>('library')
  const [offline, setOffline] = useState(!navigator.onLine)

  const player = usePersistentPlayer(songs)
  const lyrics = useLyrics(player.currentSong, player.currentTime)
  const visibleSongs = useMemo(() => filterSongs(songs, filter), [songs, filter])

  const reloadLibrary = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const creds = loadGithubCredentials()
      const manifest = await loadSongsManifest(creds)
      setSongs(withPlayableUrls(manifest.songs))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load library')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadLibrary()
  }, [reloadLibrary])

  useEffect(() => {
    if (tab === 'library') {
      void reloadLibrary()
    }
  }, [tab, reloadLibrary])

  useEffect(() => {
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <div className="app-shell">
      <nav className="top-nav" aria-label="Primary">
        <button
          type="button"
          className={tab === 'library' ? 'is-active' : ''}
          onClick={() => setTab('library')}
        >
          Library
        </button>
        <button
          type="button"
          className={tab === 'search' ? 'is-active' : ''}
          onClick={() => setTab('search')}
        >
          Import
        </button>
      </nav>

      {offline ? (
        <p className="banner warn" role="status">
          Offline — cached assets may still play.
        </p>
      ) : null}

      <main className="main-pane">
        {tab === 'library' ? (
          <>
            {loading ? <p className="muted">Loading library…</p> : null}
            {loadError ? <p className="error-text">{loadError}</p> : null}
            {!loading && !loadError ? (
              <div className="library-layout">
                <MusicLibrary
                  songs={visibleSongs}
                  filter={filter}
                  onFilterChange={setFilter}
                  currentSongId={player.currentSong?.id ?? null}
                  isPlaying={player.isPlaying}
                  onPlaySong={(song, queue) => player.playSong(song, queue)}
                  onRefresh={() => void reloadLibrary()}
                />
                <LyricsPanel lyrics={lyrics} onSeek={player.seek} />
              </div>
            ) : null}
          </>
        ) : (
          <SearchPanel
            onImportComplete={async () => {
              await reloadLibrary()
              setTab('library')
            }}
          />
        )}
      </main>

      <PlayerBar player={player} />
    </div>
  )
}
