import { AppShell } from "@/components/app-shell";
import { GuildView } from "@/components/guild-view";

export default async function GuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell guildId={id}>
      <GuildView guildId={id} />
    </AppShell>
  );
}
