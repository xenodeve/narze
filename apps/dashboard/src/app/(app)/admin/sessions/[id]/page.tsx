import { AdminSessionPage } from "@/components/admin/users";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminSessionPage id={decodeURIComponent(id)} />;
}
