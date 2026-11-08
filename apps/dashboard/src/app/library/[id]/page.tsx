import { AppShell } from "@/components/app-shell";
import { PlaylistPage } from "@/components/library";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <PlaylistPage id={id} />
    </AppShell>
  );
}
