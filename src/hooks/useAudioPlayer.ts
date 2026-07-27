import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { PlayerStatus, RepeatMode, Song } from '../types/music'
import { assetUrl } from '../lib/songs'
import { clampVolume, loadPersistedPlayerState, savePersistedPlayerState } from '../lib/persistence'

export interface AudioPlayerApi {
  audioRef: RefObject<HTMLAudioElement | null>
  status: PlayerStatus
  error: string | null
  currentSong: Song | null
  queue: Song[]
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  repeat: RepeatMode
  shuffle: boolean
  isPlaying: boolean
  playSong: (song: Song, queue?: Song[]) => void
  togglePlay: () => void
  pause: () => void
  play: () => Promise<void>
  seek: (time: number) => void
  next: () => void
  previous: () => void
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  setRepeat: (mode: RepeatMode) => void
  setShuffle: (shuffle: boolean) => void
  setQueueFromList: (songs: Song[], currentId?: string | null) => void
}

function shuffleOrder(ids: string[], currentId: string | null): string[] {
  const rest = ids.filter((id) => id !== currentId)
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return currentId ? [currentId, ...rest] : rest
}

export function useAudioPlayer(library: Song[]): AudioPlayerApi {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const persistTimer = useRef<number | null>(null)
  const libraryRef = useRef(library)
  libraryRef.current = library

  const initial = loadPersistedPlayerState()

  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [currentSongId, setCurrentSongId] = useState<string | null>(initial.currentSongId)
  const [queueIds, setQueueIds] = useState<string[]>(initial.queue)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(initial.volume)
  const [muted, setMuted] = useState(false)
  const [repeat, setRepeat] = useState<RepeatMode>(initial.repeat)
  const [shuffle, setShuffleState] = useState(initial.shuffle)
  const [pendingSeek, setPendingSeek] = useState(initial.position)
  const restoredRef = useRef(false)
  /** Play after the next src load finishes (avoids racing setTimeout play vs audio.load). */
  const autoplayAfterLoadRef = useRef(false)

  const songMap = useCallback((ids: string[]) => {
    const map = new Map(libraryRef.current.map((s) => [s.id, s]))
    return ids.map((id) => map.get(id)).filter((s): s is Song => Boolean(s))
  }, [])

  const currentSong = library.find((s) => s.id === currentSongId) ?? null
  const queue = songMap(queueIds.length ? queueIds : library.map((s) => s.id))

  // Create a single audio element for the app lifetime
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio()
      audio.preload = 'metadata'
      audio.setAttribute('playsinline', 'true')
      ;(audio as HTMLAudioElement & { webkitPlaysInline?: boolean }).webkitPlaysInline = true
      audioRef.current = audio
    }

    const audio = audioRef.current
    audio.volume = clampVolume(loadPersistedPlayerState().volume)

    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onDurationChange = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onWaiting = () => setStatus('loading')
    const onCanPlay = () => setStatus((s) => (s === 'loading' ? (audio.paused ? 'ready' : 'playing') : s))
    const onPlaying = () => {
      setStatus('playing')
      setError(null)
    }
    const onPause = () => {
      if (!audio.ended) setStatus('paused')
    }
    const onError = () => {
      setStatus('error')
      setError('Audio playback failed. The file may be missing or unsupported.')
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('error', onError)
      // Keep the element alive for Media Session / background playback
    }
  }, [])

  // Restore queue when library first loads
  useEffect(() => {
    if (restoredRef.current || library.length === 0) return
    restoredRef.current = true

    const validIds = new Set(library.map((s) => s.id))
    let nextQueue = queueIds.filter((id) => validIds.has(id))
    if (nextQueue.length === 0) {
      nextQueue = library.map((s) => s.id)
    }
    setQueueIds(nextQueue)

    const restoreId =
      currentSongId && validIds.has(currentSongId) ? currentSongId : nextQueue[0] ?? null
    if (restoreId) {
      setCurrentSongId(restoreId)
    }
  }, [library, currentSongId, queueIds])

  const play = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    try {
      await audio.play()
      setStatus('playing')
      setError(null)
    } catch (err) {
      setStatus('paused')
      const message = err instanceof Error ? err.message : 'Playback blocked'
      setError(`Press play to start audio (${message})`)
    }
  }, [])

  const pause = useCallback(() => {
    autoplayAfterLoadRef.current = false
    audioRef.current?.pause()
    setStatus('paused')
  }, [])

  // Load src when song changes (never recreate element)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentSong) return

    const url = assetUrl(currentSong.audioUrl)
    if (!url) return

    const absolute = new URL(url, window.location.href).href
    const shouldAutoplay = autoplayAfterLoadRef.current

    if (audio.src !== absolute) {
      setStatus('loading')
      setError(null)
      audio.src = url
      audio.load()
    }

    let cancelled = false

    const applySeek = () => {
      if (pendingSeek > 0 && Number.isFinite(pendingSeek)) {
        try {
          audio.currentTime = pendingSeek
        } catch {
          // ignore
        }
        setPendingSeek(0)
      }
    }

    const startIfNeeded = () => {
      if (cancelled) return
      applySeek()
      if (shouldAutoplay) {
        autoplayAfterLoadRef.current = false
        void play()
      }
    }

    // HAVE_FUTURE_DATA (3): enough data to start playback
    if (audio.readyState >= 3) {
      startIfNeeded()
      return () => {
        cancelled = true
      }
    }

    const onCanPlay = () => {
      startIfNeeded()
      audio.removeEventListener('canplay', onCanPlay)
    }
    const onMeta = () => {
      applySeek()
      audio.removeEventListener('loadedmetadata', onMeta)
    }

    if (shouldAutoplay) {
      audio.addEventListener('canplay', onCanPlay)
    } else if (audio.readyState >= 1) {
      applySeek()
    } else {
      audio.addEventListener('loadedmetadata', onMeta)
    }

    return () => {
      cancelled = true
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('loadedmetadata', onMeta)
    }
  }, [currentSong, pendingSeek, play])

  // Persist state (debounced)
  useEffect(() => {
    if (persistTimer.current) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      savePersistedPlayerState({
        currentSongId,
        position: currentTime,
        queue: queueIds,
        repeat,
        shuffle,
        volume,
      })
    }, 400)
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current)
    }
  }, [currentSongId, currentTime, queueIds, repeat, shuffle, volume])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      void play()
    } else {
      pause()
    }
  }, [play, pause])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) return
    const next = Math.max(0, Math.min(time, Number.isFinite(audio.duration) ? audio.duration : time))
    audio.currentTime = next
    setCurrentTime(next)
  }, [])

  const setVolume = useCallback((value: number) => {
    const next = clampVolume(value)
    setVolumeState(next)
    if (audioRef.current) {
      audioRef.current.volume = next
    }
  }, [])

  const playSong = useCallback(
    (song: Song, nextQueue?: Song[]) => {
      if (nextQueue) {
        setQueueIds(nextQueue.map((s) => s.id))
      } else if (queueIds.length === 0) {
        setQueueIds(libraryRef.current.map((s) => s.id))
      }
      setPendingSeek(0)
      if (song.id === currentSongId) {
        const audio = audioRef.current
        if (audio) {
          audio.currentTime = 0
          void play()
          return
        }
      }
      autoplayAfterLoadRef.current = true
      setCurrentSongId(song.id)
    },
    [queueIds.length, currentSongId, play],
  )

  const setQueueFromList = useCallback((songs: Song[], currentId?: string | null) => {
    const ids = songs.map((s) => s.id)
    setQueueIds(ids)
    if (currentId && ids.includes(currentId)) {
      setCurrentSongId(currentId)
    }
  }, [])

  const goToRelative = useCallback(
    (delta: number) => {
      const ids = queueIds.length ? queueIds : libraryRef.current.map((s) => s.id)
      if (ids.length === 0) return
      const index = Math.max(0, ids.indexOf(currentSongId ?? ''))
      let nextIndex = index + delta
      if (repeat === 'all') {
        nextIndex = ((nextIndex % ids.length) + ids.length) % ids.length
      } else if (nextIndex < 0 || nextIndex >= ids.length) {
        return
      }
      const nextId = ids[nextIndex]
      setPendingSeek(0)
      if (nextId === currentSongId) {
        const audio = audioRef.current
        if (audio) {
          audio.currentTime = 0
          void play()
          return
        }
      }
      autoplayAfterLoadRef.current = true
      setCurrentSongId(nextId)
    },
    [queueIds, currentSongId, repeat, play],
  )

  const next = useCallback(() => goToRelative(1), [goToRelative])
  const previous = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      seek(0)
      return
    }
    goToRelative(-1)
  }, [goToRelative, seek])

  // Auto-advance
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onEnded = () => {
      if (repeat === 'one') {
        seek(0)
        void play()
        return
      }
      const ids = queueIds.length ? queueIds : libraryRef.current.map((s) => s.id)
      const index = ids.indexOf(currentSongId ?? '')
      if (index >= 0 && index < ids.length - 1) {
        next()
      } else if (repeat === 'all' && ids.length > 0) {
        setPendingSeek(0)
        const firstId = ids[0]
        if (firstId === currentSongId) {
          seek(0)
          void play()
        } else {
          autoplayAfterLoadRef.current = true
          setCurrentSongId(firstId)
        }
      } else {
        setStatus('paused')
      }
    }

    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [repeat, queueIds, currentSongId, next, play, seek])

  const setShuffle = useCallback(
    (enabled: boolean) => {
      setShuffleState(enabled)
      const ids = libraryRef.current.map((s) => s.id)
      if (enabled) {
        setQueueIds(shuffleOrder(ids, currentSongId))
      } else {
        setQueueIds(ids)
      }
    },
    [currentSongId],
  )

  return {
    audioRef,
    status,
    error,
    currentSong,
    queue,
    currentTime,
    duration,
    volume,
    muted,
    repeat,
    shuffle,
    isPlaying: status === 'playing',
    playSong,
    togglePlay,
    pause,
    play,
    seek,
    next,
    previous,
    setVolume,
    setMuted: (value: boolean) => {
      setMuted(value)
      if (audioRef.current) audioRef.current.muted = value
    },
    setRepeat,
    setShuffle,
    setQueueFromList,
  }
}
