import { GuildView } from "@/components/guild-view";

export default async function GuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GuildView guildId={id} />;
}
