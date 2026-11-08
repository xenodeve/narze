"use client";

import { ServerList } from "@/components/server-list";
import { useSession } from "@/lib/session";

/** What only a signed-in user sees on the home page. */
export function SignedInArea() {
  const session = useSession();
  return session.status === "signed-in" ? <ServerList userId={session.userId} /> : null;
}
