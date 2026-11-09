import { GuildSettingsPage } from "@/components/settings";

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GuildSettingsPage guildId={id} />;
}
