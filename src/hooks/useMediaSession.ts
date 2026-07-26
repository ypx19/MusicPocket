import { useEffect } from 'react'
import type { Song } from '../types/music'
import { assetUrl } from '../lib/songs'

interface MediaSessionOptions {
  song: Song | null
  isPlaying: boolean
  currentTime: number
  duration: number
  onPlay: () => void
  onPause: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (time: number) => void
}

export function useMediaSession({
  song,
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onSeek,
}: MediaSessionOptions): void {
  useEffect(() => {
    if (!('mediaSession' in navigator) || !song) return

    const artworkUrl = assetUrl(song.coverUrl)
    const artwork: MediaImage[] = artworkUrl
      ? [
          { src: artworkUrl, sizes: '400x400', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
        ]
      : []

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album ?? 'MusicPocket',
      artwork,
    })
  }, [song])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // Some actions unsupported on certain platforms
      }
    }

    setHandler('play', () => onPlay())
    setHandler('pause', () => onPause())
    setHandler('previoustrack', () => onPrevious())
    setHandler('nexttrack', () => onNext())
    setHandler('seekbackward', (details) => {
      const offset = details.seekOffset ?? 10
      onSeek(Math.max(0, currentTime - offset))
    })
    setHandler('seekforward', (details) => {
      const offset = details.seekOffset ?? 10
      const max = duration || currentTime + offset
      onSeek(Math.min(max, currentTime + offset))
    })
    setHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        onSeek(details.seekTime)
      }
    })

    return () => {
      setHandler('play', null)
      setHandler('pause', null)
      setHandler('previoustrack', null)
      setHandler('nexttrack', null)
      setHandler('seekbackward', null)
      setHandler('seekforward', null)
      setHandler('seekto', null)
    }
  }, [onPlay, onPause, onPrevious, onNext, onSeek, currentTime, duration])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

    if (Number.isFinite(duration) && duration > 0 && 'setPositionState' in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(currentTime, duration),
          playbackRate: 1,
        })
      } catch {
        // Ignore invalid position state
      }
    }
  }, [isPlaying, currentTime, duration])
}
