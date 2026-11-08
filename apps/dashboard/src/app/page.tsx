import { Account } from "@/components/account";
import { BotStatusCard } from "@/components/bot-status-card";
import { SignedInArea } from "@/components/signed-in-area";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.bar}>
        <p className={`mono ${styles.kicker}`}>NARZE · V7</p>
        <Account />
      </div>
      <header className={styles.head}>
        <h1 className={styles.title}>เพลงของห้อง คุมได้จากทุกแท็บ</h1>
        <p className={styles.lede}>เล่น ค้นหา และจัดคิวเพลงใน Discord จากเบราว์เซอร์ ทุกการเปลี่ยนแปลงซิงก์ถึงทุกคนในไม่กี่อึดใจ</p>
      </header>
      <div className={styles.grid}>
        <BotStatusCard />
        <SignedInArea />
      </div>
    </main>
  );
}
