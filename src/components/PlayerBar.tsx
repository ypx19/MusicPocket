import type { AudioPlayerApi } from '../hooks/useAudioPlayer'
import { formatClock } from '../lib/formatting'
import { assetUrl } from '../lib/songs'

interface PlayerBarProps {
  player: AudioPlayerApi
}

export function PlayerBar({ player }: PlayerBarProps) {
  const {
    currentSong,
    currentTime,
    duration,
    isPlaying,
    volume,
    muted,
    repeat,
    shuffle,
    status,
    error,
    togglePlay,
    previous,
    next,
    seek,
    setVolume,
    setMuted,
    setRepeat,
    setShuffle,
  } = player

  const progressMax = duration > 0 ? duration : 0
  const cover = assetUrl(currentSong?.coverUrl) ?? assetUrl('icons/icon-192.png')

  return (
    <footer className="player-bar" aria-label="Playback controls">
      <div className="player-now">
        {currentSong ? (
          <>
            <img className="player-cover" src={cover} alt="" width={52} height={52} />
            <div className="player-text">
              <div className="player-title">{currentSong.title}</div>
              <div className="player-artist">{currentSong.artist}</div>
            </div>
          </>
        ) : (
          <div className="player-text">
            <div className="player-title">Nothing playing</div>
            <div className="player-artist">Choose a song from your library</div>
          </div>
        )}
      </div>

      <div className="player-controls">
        <div className="player-buttons">
          <button
            type="button"
            className={`icon-btn${shuffle ? ' is-on' : ''}`}
            aria-pressed={shuffle}
            aria-label="Shuffle"
            onClick={() => setShuffle(!shuffle)}
          >
            ⇄
          </button>
          <button type="button" className="icon-btn" aria-label="Previous" onClick={previous}>
            ⏮
          </button>
          <button
            type="button"
            className="play-btn"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={togglePlay}
            disabled={!currentSong}
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <button type="button" className="icon-btn" aria-label="Next" onClick={next}>
            ⏭
          </button>
          <button
            type="button"
            className={`icon-btn${repeat !== 'off' ? ' is-on' : ''}`}
            aria-label={`Repeat ${repeat}`}
            onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
          >
            {repeat === 'one' ? '🔂' : '🔁'}
          </button>
        </div>

        <div className="seek-row">
          <span className="time">{formatClock(currentTime)}</span>
          <input
            className="seek"
            type="range"
            min={0}
            max={progressMax || 1}
            step={0.1}
            value={Math.min(currentTime, progressMax || 0)}
            aria-label="Seek"
            disabled={!currentSong || progressMax <= 0}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <span className="time">{formatClock(duration)}</span>
        </div>

        <div className="player-status" role="status">
          {error ? <span className="error-text">{error}</span> : null}
          {!error && status === 'loading' ? <span>Loading…</span> : null}
          {!error && status === 'error' ? <span className="error-text">Playback error</span> : null}
        </div>
      </div>

      <div className="player-volume desktop-only">
        <button
          type="button"
          className="icon-btn"
          aria-label={muted ? 'Unmute' : 'Mute'}
          onClick={() => setMuted(!muted)}
        >
          {muted || volume === 0 ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          aria-label="Volume"
          onChange={(e) => {
            setMuted(false)
            setVolume(Number(e.target.value))
          }}
        />
      </div>
    </footer>
  )
}
