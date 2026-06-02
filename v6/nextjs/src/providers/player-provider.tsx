'use client';

import { createContext, useContext, useEffect, useReducer } from 'react';
import type { PlayerState, Track, LoopMode } from '@/types/player';
import { useSocket } from './socket-provider';

const initial: PlayerState = {
  guildId: '',
  botMode: 'standalone',
  isPlaying: false,
  isPaused: false,
  volume: 100,
  loopMode: 'off',
  position: 0,
  currentTrack: null,
  queue: [],
  voiceChannelId: null,
};

type Action =
  | { type: 'FULL_STATE'; payload: PlayerState }
  | { type: 'SET_GUILD'; payload: string }
  | { type: 'TRACK_START'; payload: { track: Track; position: number } }
  | { type: 'TRACK_END' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'VOLUME'; payload: number }
  | { type: 'LOOP'; payload: LoopMode }
  | { type: 'SEEK'; payload: number }
  | { type: 'QUEUE_UPDATE'; payload: Track[] };

function reducer(state: PlayerState, action: Action): PlayerState {
  switch (action.type) {
    case 'FULL_STATE':    return action.payload;
    case 'SET_GUILD':     return { ...initial, guildId: action.payload };
    case 'TRACK_START':   return { ...state, currentTrack: action.payload.track, position: action.payload.position, isPlaying: true, isPaused: false };
    case 'TRACK_END':     return { ...state, currentTrack: null, isPlaying: false, position: 0 };
    case 'PAUSE':         return { ...state, isPaused: true, isPlaying: false };
    case 'RESUME':        return { ...state, isPaused: false, isPlaying: true };
    case 'VOLUME':        return { ...state, volume: action.payload };
    case 'LOOP':          return { ...state, loopMode: action.payload };
    case 'SEEK':          return { ...state, position: action.payload };
    case 'QUEUE_UPDATE':  return { ...state, queue: action.payload };
    default:              return state;
  }
}

interface PlayerContextValue {
  state: PlayerState;
  selectGuild: (guildId: string) => void;
}

const PlayerContext = createContext<PlayerContextValue>({ state: initial, selectGuild: () => {} });

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    const onFull    = (p: PlayerState)                       => dispatch({ type: 'FULL_STATE', payload: p });
    const onStart   = (p: { track: Track; position: number }) => dispatch({ type: 'TRACK_START', payload: p });
    const onEnd     = ()                                      => dispatch({ type: 'TRACK_END' });
    const onPause   = ()                                      => dispatch({ type: 'PAUSE' });
    const onResume  = ()                                      => dispatch({ type: 'RESUME' });
    const onVolume  = (v: number)                             => dispatch({ type: 'VOLUME', payload: v });
    const onLoop    = (m: LoopMode)                           => dispatch({ type: 'LOOP', payload: m });
    const onSeek    = (p: number)                             => dispatch({ type: 'SEEK', payload: p });
    const onQueue   = (q: Track[])                            => dispatch({ type: 'QUEUE_UPDATE', payload: q });

    socket.on('state:full',        onFull);
    socket.on('player:trackStart', onStart);
    socket.on('player:trackEnd',   onEnd);
    socket.on('player:pause',      onPause);
    socket.on('player:resume',     onResume);
    socket.on('player:volume',     onVolume);
    socket.on('player:loop',       onLoop);
    socket.on('player:seek',       onSeek);
    socket.on('queue:update',      onQueue);

    return () => {
      socket.off('state:full',        onFull);
      socket.off('player:trackStart', onStart);
      socket.off('player:trackEnd',   onEnd);
      socket.off('player:pause',      onPause);
      socket.off('player:resume',     onResume);
      socket.off('player:volume',     onVolume);
      socket.off('player:loop',       onLoop);
      socket.off('player:seek',       onSeek);
      socket.off('queue:update',      onQueue);
    };
  }, [socket]);

  const selectGuild = (guildId: string) => {
    dispatch({ type: 'SET_GUILD', payload: guildId });
    socket?.emit('state:request', { guildId });
  };

  return (
    <PlayerContext.Provider value={{ state, selectGuild }}>
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => useContext(PlayerContext);
