import { AppShell } from "@/components/app-shell";
import { GuildSettingsPage } from "@/components/settings";

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell guildId={id}>
      <GuildSettingsPage guildId={id} />
    </AppShell>
  );
}
