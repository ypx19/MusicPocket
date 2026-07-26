import type { Song } from '../types/music'
import { formatDuration } from '../lib/formatting'
import { assetUrl } from '../lib/songs'

interface MusicLibraryProps {
  songs: Song[]
  filter: string
  onFilterChange: (value: string) => void
  currentSongId: string | null
  isPlaying: boolean
  onPlaySong: (song: Song, queue: Song[]) => void
}

export function MusicLibrary({
  songs,
  filter,
  onFilterChange,
  currentSongId,
  isPlaying,
  onPlaySong,
}: MusicLibraryProps) {
  return (
    <section className="library" aria-label="Music library">
      <header className="library-header">
        <div>
          <h1 className="brand">MusicPocket</h1>
          <p className="subtitle">Your personal audio library</p>
        </div>
        <label className="library-search">
          <span className="sr-only">Filter library</span>
          <input
            type="search"
            placeholder="Filter by title or artist…"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
          />
        </label>
      </header>

      {songs.length === 0 ? (
        <p className="empty-state">No songs match your filter.</p>
      ) : (
        <ul className="song-list">
          {songs.map((song) => {
            const active = song.id === currentSongId
            return (
              <li key={song.id} className={`song-row${active ? ' is-active' : ''}`}>
                <button
                  type="button"
                  className="song-row-button"
                  onClick={() => onPlaySong(song, songs)}
                  aria-current={active ? 'true' : undefined}
                >
                  <img
                    className="song-cover"
                    src={assetUrl(song.coverUrl) ?? assetUrl('icons/icon-192.png')}
                    alt=""
                    width={56}
                    height={56}
                    loading="lazy"
                  />
                  <div className="song-meta">
                    <span className="song-title">
                      {active && isPlaying ? <span className="now-playing" aria-hidden="true" /> : null}
                      {song.title}
                    </span>
                    <span className="song-artist">{song.artist}</span>
                  </div>
                  <span className="song-duration">{formatDuration(song.duration)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
