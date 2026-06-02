'use client';

import { useSocket, type ConnectionStatus } from '@/providers/socket-provider';
import { usePlayer } from '@/providers/player-provider';
import type { GuildInfo } from '@/types/player';

const statusDot: Record<ConnectionStatus, string> = {
  connecting:   'bg-muted animate-pulse',
  connected:    'bg-accent animate-pulse',
  reconnecting: 'bg-muted animate-pulse',
  disconnected: 'bg-muted',
};

const statusLabel: Record<ConnectionStatus, string> = {
  connecting:   'Connecting',
  connected:    'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
};

export function Sidebar({ guilds }: { guilds: GuildInfo[] }) {
  const { status } = useSocket();
  const { state, selectGuild } = usePlayer();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
      {/* Brand mark — 48px zone (DESIGN.md §5 Navigation) */}
      <div className="flex h-12 items-center px-5">
        <span className="text-base font-semibold tracking-tight text-ink">
          Narze V6
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        <p className="mb-1 px-2 text-[11px] text-muted">Servers</p>
        {guilds.length === 0 ? (
          <div className="px-2 py-4 text-center">
            <p className="text-[12px] text-muted">No servers yet</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted opacity-60">
              Add the bot to a Discord server to get started
            </p>
          </div>
        ) : (
          guilds.map((g) => {
            const id   = g.guild_id;
            const name = g.guilds?.name ?? id;
            const active = state.guildId === id;
            return (
              <button
                key={id}
                onClick={() => selectGuild(id)}
                className={[
                  'w-full rounded-md px-3 py-2 text-left text-[13px] font-medium transition-colors duration-100',
                  active
                    ? 'bg-card text-ink'
                    : 'text-muted hover:bg-elevated hover:text-ink',
                ].join(' ')}
              >
                {name}
              </button>
            );
          })
        )}
      </nav>

      {/* Footer: connection status + bot mode */}
      <div className="border-t border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot[status]}`} aria-hidden />
          <span className="text-[11px] text-muted">{statusLabel[status]}</span>
        </div>
        {state.guildId && (
          <p className="mt-0.5 text-[11px] text-muted">
            {state.botMode === 'connected' ? 'Connected Mode' : 'Standalone Mode'}
          </p>
        )}
      </div>
    </aside>
  );
}
