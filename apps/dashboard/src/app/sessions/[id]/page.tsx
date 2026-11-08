import { AppShell } from "@/components/app-shell";
import { SessionPage } from "@/components/sessions";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <SessionPage id={decodeURIComponent(id)} />
    </AppShell>
  );
}
