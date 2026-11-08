import { AdminSessionPage } from "@/components/admin/users";
import { AppShell } from "@/components/app-shell";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <AdminSessionPage id={decodeURIComponent(id)} />
    </AppShell>
  );
}
