import { SessionPage } from "@/components/sessions";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionPage id={decodeURIComponent(id)} />;
}
