import { useEffect, useRef } from 'react'
import type { LyricsState } from '../hooks/useLyrics'

interface LyricsPanelProps {
  lyrics: LyricsState
  onSeek: (time: number) => void
}

export function LyricsPanel({ lyrics, onSeek }: LyricsPanelProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (lyrics.activeIndex < 0) return
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [lyrics.activeIndex])

  if (lyrics.loading) {
    return (
      <section className="lyrics-panel" aria-label="Lyrics">
        <h2>Lyrics</h2>
        <p className="muted">Loading lyrics…</p>
      </section>
    )
  }

  if (lyrics.error) {
    return (
      <section className="lyrics-panel" aria-label="Lyrics">
        <h2>Lyrics</h2>
        <p className="muted">Lyrics unavailable.</p>
      </section>
    )
  }

  if (!lyrics.synced && lyrics.plainText) {
    return (
      <section className="lyrics-panel" aria-label="Lyrics">
        <h2>Lyrics</h2>
        <p className="muted">Unsynchronized lyrics</p>
        <pre className="lyrics-plain">{lyrics.plainText}</pre>
      </section>
    )
  }

  if (lyrics.lines.length === 0) {
    return (
      <section className="lyrics-panel" aria-label="Lyrics">
        <h2>Lyrics</h2>
        <p className="muted">No lyrics for this track.</p>
      </section>
    )
  }

  return (
    <section className="lyrics-panel" aria-label="Synchronized lyrics">
      <h2>Lyrics</h2>
      <div className="lyrics-scroll">
        {lyrics.lines.map((line, index) => {
          const active = index === lyrics.activeIndex
          return (
            <button
              key={`${line.time}-${index}`}
              type="button"
              ref={active ? activeRef : undefined}
              className={`lyric-line${active ? ' is-active' : ''}`}
              onClick={() => onSeek(line.time)}
            >
              {line.text}
            </button>
          )
        })}
      </div>
    </section>
  )
}
