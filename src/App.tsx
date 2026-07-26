import { useEffect, useMemo, useState } from 'react'
import { MusicLibrary } from './components/MusicLibrary'
import { PlayerBar } from './components/PlayerBar'
import { LyricsPanel } from './components/LyricsPanel'
import { SearchPanel } from './components/SearchPanel'
import { usePersistentPlayer } from './hooks/usePersistentPlayer'
import { useLyrics } from './hooks/useLyrics'
import { filterSongs, loadSongsManifest } from './lib/songs'
import type { Song } from './types/music'
import './App.css'

type Tab = 'library' | 'search'

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

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const manifest = await loadSongsManifest()
        if (!cancelled) setSongs(manifest.songs)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load library')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

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
                />
                <LyricsPanel lyrics={lyrics} onSeek={player.seek} />
              </div>
            ) : null}
          </>
        ) : (
          <SearchPanel />
        )}
      </main>

      <PlayerBar player={player} />
    </div>
  )
}
