import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

/**
 * One App shell for every signed-in page (#168): moving between pages swaps only the content, so
 * the top bar and the sidebar (and what they fetched) stay as they are.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
