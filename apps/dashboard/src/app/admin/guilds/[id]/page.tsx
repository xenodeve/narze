import { Suspense } from "react";
import { AdminGuildDetail } from "@/components/admin/guilds";
import { AppShell } from "@/components/app-shell";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      {/* The tab and channel live in the URL (useSearchParams needs a boundary). */}
      <Suspense>
        <AdminGuildDetail id={id} />
      </Suspense>
    </AppShell>
  );
}
