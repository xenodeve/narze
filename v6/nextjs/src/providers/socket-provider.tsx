'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { createClient } from '@/lib/supabase/client';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface SocketContextValue {
  socket: Socket | null;
  status: ConnectionStatus;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, status: 'disconnected' });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  // useState (not useRef) so consumers re-render when socket instance changes
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  useEffect(() => {
    const supabase = createClient();

    async function connect(token: string) {
      setStatus('connecting');
      const s = getSocket(token);
      setSocket(s);
      s.on('connect', () => setStatus('connected'));
      s.on('disconnect', () => setStatus('disconnected'));
      s.on('connect_error', () => setStatus('reconnecting'));
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) connect(session.access_token);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        connect(session.access_token);
      } else {
        disconnectSocket();
        setSocket(null);
        setStatus('disconnected');
      }
    });

    return () => {
      subscription.unsubscribe();
      disconnectSocket();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, status }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
