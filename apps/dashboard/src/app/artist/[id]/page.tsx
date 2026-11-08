import { AppShell } from "@/components/app-shell";
import { ArtistView } from "@/components/catalog/browse";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <ArtistView id={id} />
    </AppShell>
  );
}
