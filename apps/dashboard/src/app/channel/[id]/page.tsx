import { AppShell } from "@/components/app-shell";
import { ChannelView } from "@/components/catalog/browse";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <ChannelView id={id} />
    </AppShell>
  );
}
