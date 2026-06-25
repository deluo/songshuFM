import { useCallback } from 'preact/hooks';
import { sendMessage } from '../../lib/messaging';
import { MSG } from '../../lib/messaging';
import { playbackState } from '../state';

export function usePlayer() {
  const togglePlay = useCallback(() => {
    sendMessage(MSG.TOGGLE);
  }, []);

  const play = useCallback(() => {
    sendMessage(MSG.PLAY);
  }, []);

  const pause = useCallback(() => {
    sendMessage(MSG.PAUSE);
  }, []);

  const seek = useCallback((time: number) => {
    sendMessage(MSG.SEEK, { time });
  }, []);

  const setSpeed = useCallback((speed: number) => {
    sendMessage(MSG.SPEED, { speed });
  }, []);

  const setVolume = useCallback((volume: number) => {
    sendMessage(MSG.VOLUME, { volume });
  }, []);

  const next = useCallback(() => {
    sendMessage(MSG.NEXT);
  }, []);

  const prev = useCallback(() => {
    sendMessage(MSG.PREV);
  }, []);

  const playEpisode = useCallback(
    (episode: any, podcast?: any) => {
      playbackState.value = {
        ...playbackState.value!,
        loading: true,
        episode,
      };
      sendMessage(MSG.PLAY, { episode, podcast });
    },
    [],
  );

  return { togglePlay, play, pause, seek, setSpeed, setVolume, next, prev, playEpisode };
}
