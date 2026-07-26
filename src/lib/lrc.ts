import type { LyricLine } from '../types/music'

const LRC_LINE = /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/

export function parseLrc(content: string): LyricLine[] {
  const lines: LyricLine[] = []

  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('[ti:') || trimmed.startsWith('[ar:') || trimmed.startsWith('[al:') || trimmed.startsWith('[by:') || trimmed.startsWith('[offset:')) {
      continue
    }

    const match = trimmed.match(LRC_LINE)
    if (!match) {
      // Plain lyric line without timestamp — keep at time 0 for fallback display
      if (trimmed.length > 0 && !trimmed.startsWith('[')) {
        lines.push({ time: 0, text: trimmed })
      }
      continue
    }

    const minutes = Number(match[1])
    const seconds = Number(match[2])
    const fraction = match[3] ?? '0'
    const millis = Number(fraction.padEnd(3, '0').slice(0, 3))
    const time = minutes * 60 + seconds + millis / 1000
    const text = match[4].trim()
    if (text) {
      lines.push({ time, text })
    }
  }

  return lines.sort((a, b) => a.time - b.time)
}

export function findActiveLyricIndex(lines: LyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1

  let active = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time <= currentTime + 0.05) {
      active = i
    } else {
      break
    }
  }
  return active
}
