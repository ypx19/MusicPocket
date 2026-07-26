import { describe, expect, test } from 'vitest'
import { findActiveLyricIndex, parseLrc } from './lrc'
import { formatDuration } from './formatting'

describe('parseLrc', () => {
  test('parses timed lines', () => {
    const lines = parseLrc(`[00:12.40]First lyric line\n[00:15.80]Second lyric line\n`)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({ time: 12.4, text: 'First lyric line' })
    expect(lines[1].text).toBe('Second lyric line')
  })

  test('finds active index', () => {
    const lines = parseLrc(`[00:01.00]A\n[00:03.00]B\n[00:05.00]C`)
    expect(findActiveLyricIndex(lines, 0.5)).toBe(-1)
    expect(findActiveLyricIndex(lines, 1.2)).toBe(0)
    expect(findActiveLyricIndex(lines, 4.9)).toBe(1)
    expect(findActiveLyricIndex(lines, 10)).toBe(2)
  })
})

describe('formatDuration', () => {
  test('formats seconds', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(null)).toBe('—')
  })
})
