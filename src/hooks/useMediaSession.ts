import { useEffect, type RefObject } from 'react'
import type { Song } from '../types/music'
import { assetUrl } from '../lib/songs'

interface MediaSessionOptions {
  song: Song | null
  isPlaying: boolean
  currentTime: number
  duration: number
  audioRef?: RefObject<HTMLAudioElement | null>
  onPlay: () => void
  onPause: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (time: number) => void
}

function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iOS || iPadOS
}

export function useMediaSession({
  song,
  isPlaying,
  currentTime,
  duration,
  audioRef,
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
          { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '384x384', type: 'image/jpeg' },
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

    const preferTrackSkip = isAppleMobile()

    const bindHandlers = () => {
      setHandler('play', () => onPlay())
      setHandler('pause', () => onPause())
      setHandler('previoustrack', () => onPrevious())
      setHandler('nexttrack', () => onNext())
      setHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          onSeek(details.seekTime)
        }
      })

      // iOS shows EITHER seek ±10 OR previous/next — not both.
      // Prefer previous/next for a music library player.
      if (preferTrackSkip) {
        setHandler('seekbackward', null)
        setHandler('seekforward', null)
      } else {
        setHandler('seekbackward', (details) => {
          const offset = details.seekOffset ?? 10
          onSeek(Math.max(0, currentTime - offset))
        })
        setHandler('seekforward', (details) => {
          const offset = details.seekOffset ?? 10
          const max = duration || currentTime + offset
          onSeek(Math.min(max, currentTime + offset))
        })
      }
    }

    bindHandlers()

    // iOS often only paints next/prev after the audio is actually playing.
    const audio = audioRef?.current
    const onPlaying = () => bindHandlers()
    audio?.addEventListener('playing', onPlaying)

    return () => {
      audio?.removeEventListener('playing', onPlaying)
      setHandler('play', null)
      setHandler('pause', null)
      setHandler('previoustrack', null)
      setHandler('nexttrack', null)
      setHandler('seekbackward', null)
      setHandler('seekforward', null)
      setHandler('seekto', null)
    }
  }, [onPlay, onPause, onPrevious, onNext, onSeek, currentTime, duration, audioRef, song?.id])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

    if (Number.isFinite(duration) && duration > 0 && 'setPositionState' in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(Math.max(0, currentTime), duration),
          playbackRate: 1,
        })
      } catch {
        // Ignore invalid position state
      }
    }
  }, [isPlaying, currentTime, duration])
}
