import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SocketProvider } from '@/providers/socket-provider';
import { PlayerProvider } from '@/providers/player-provider';
import { Sidebar } from '@/components/sidebar';
import { NowPlayingPanel } from '@/components/now-playing-panel';
import { QueuePanel } from '@/components/queue-panel';
import { SearchPanel } from '@/components/search-panel';
import type { GuildInfo } from '@/types/player';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: guilds } = await supabase
    .from('guild_members')
    .select('guild_id, guild_role, guilds(id, name)')
    .eq('user_id', user.id);

  return (
    <SocketProvider>
      <PlayerProvider>
        <div className="flex h-full bg-bg">
          <Sidebar guilds={(guilds ?? []) as unknown as GuildInfo[]} />
          {/* Two-column layout: Now Playing ~55% / Queue+Search ~45% (PRD §4.3.1) */}
          <main className="flex flex-1 gap-4 overflow-hidden p-4">
            <div className="flex w-[55%] flex-col overflow-hidden">
              <NowPlayingPanel />
            </div>
            <div className="flex w-[45%] flex-col gap-4 overflow-hidden">
              <div className="flex-1 min-h-0">
                <QueuePanel />
              </div>
              <div className="flex-1 min-h-0">
                <SearchPanel />
              </div>
            </div>
          </main>
        </div>
      </PlayerProvider>
    </SocketProvider>
  );
}
