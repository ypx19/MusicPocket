import { useEffect, useMemo, useState } from 'react'
import type { LyricLine, Song } from '../types/music'
import { findActiveLyricIndex, parseLrc } from '../lib/lrc'
import { assetUrl } from '../lib/songs'

export interface LyricsState {
  lines: LyricLine[]
  activeIndex: number
  synced: boolean
  loading: boolean
  error: string | null
  plainText: string | null
}

export function useLyrics(song: Song | null, currentTime: number): LyricsState {
  const [lines, setLines] = useState<LyricLine[]>([])
  const [plainText, setPlainText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLines([])
      setPlainText(null)
      setError(null)
      setSynced(false)

      if (!song?.lyricsUrl) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const url = assetUrl(song.lyricsUrl)
        if (!url) throw new Error('Invalid lyrics URL')
        const response = await fetch(url, { cache: 'no-cache' })
        if (!response.ok) throw new Error(`Lyrics not found (${response.status})`)
        const text = await response.text()
        if (cancelled) return

        const parsed = parseLrc(text)
        const hasTimestamps = parsed.some((line) => line.time > 0)
        if (parsed.length > 0 && hasTimestamps) {
          setLines(parsed)
          setSynced(true)
          setPlainText(null)
        } else if (parsed.length > 0) {
          setLines(parsed)
          setSynced(false)
          setPlainText(parsed.map((l) => l.text).join('\n'))
        } else {
          setSynced(false)
          setPlainText(text.trim() || null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load lyrics')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [song?.id, song?.lyricsUrl])

  const activeIndex = useMemo(
    () => (synced ? findActiveLyricIndex(lines, currentTime) : -1),
    [synced, lines, currentTime],
  )

  return { lines, activeIndex, synced, loading, error, plainText }
}
