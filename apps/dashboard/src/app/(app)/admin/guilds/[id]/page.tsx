import { Suspense } from "react";
import { AdminGuildDetail } from "@/components/admin/guilds";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The tab and channel live in the URL (useSearchParams needs a boundary).
  return (
    <Suspense>
      <AdminGuildDetail id={id} />
    </Suspense>
  );
}
