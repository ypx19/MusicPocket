import type { PlayerPersistedState, RepeatMode } from '../types/music'

const STORAGE_KEY = 'musicpocket.player.v1'

const DEFAULT_STATE: PlayerPersistedState = {
  currentSongId: null,
  position: 0,
  queue: [],
  repeat: 'off',
  shuffle: false,
  volume: 0.85,
}

export function loadPersistedPlayerState(): PlayerPersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_STATE }
    const parsed = JSON.parse(raw) as Partial<PlayerPersistedState>
    return {
      currentSongId: parsed.currentSongId ?? null,
      position: typeof parsed.position === 'number' ? parsed.position : 0,
      queue: Array.isArray(parsed.queue) ? parsed.queue.filter((id): id is string => typeof id === 'string') : [],
      repeat: isRepeatMode(parsed.repeat) ? parsed.repeat : 'off',
      shuffle: Boolean(parsed.shuffle),
      volume: clampVolume(typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_STATE.volume),
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function savePersistedPlayerState(state: PlayerPersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota or private mode — ignore
  }
}

function isRepeatMode(value: unknown): value is RepeatMode {
  return value === 'off' || value === 'all' || value === 'one'
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_STATE.volume
  return Math.min(1, Math.max(0, value))
}
