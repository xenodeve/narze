import { Account } from "@/components/account";
import { GuildView } from "@/components/guild-view";
import styles from "../../page.module.css";

export default async function GuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className={styles.main}>
      <div className={styles.bar}>
        <a className={`mono ${styles.kicker}`} href="/">
          ← NARZE · V7
        </a>
        <Account />
      </div>
      <GuildView guildId={id} />
    </main>
  );
}
