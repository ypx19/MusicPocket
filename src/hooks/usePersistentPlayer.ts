import { useAudioPlayer, type AudioPlayerApi } from './useAudioPlayer'
import { useMediaSession } from './useMediaSession'
import type { Song } from '../types/music'

/** Composes the persistent audio player with Media Session handlers. */
export function usePersistentPlayer(library: Song[]): AudioPlayerApi {
  const player = useAudioPlayer(library)

  useMediaSession({
    song: player.currentSong,
    isPlaying: player.isPlaying,
    currentTime: player.currentTime,
    duration: player.duration,
    onPlay: () => {
      void player.play()
    },
    onPause: player.pause,
    onPrevious: player.previous,
    onNext: player.next,
    onSeek: player.seek,
  })

  return player
}
