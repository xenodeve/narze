import { BotStatusCard } from "@/components/bot-status-card";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={`mono ${styles.kicker}`}>NARZE · V7</p>
        <h1 className={styles.title}>เพลงของห้อง คุมได้จากทุกแท็บ</h1>
        <p className={styles.lede}>เล่น ค้นหา และจัดคิวเพลงใน Discord จากเบราว์เซอร์ ทุกการเปลี่ยนแปลงซิงก์ถึงทุกคนในไม่กี่อึดใจ</p>
      </header>
      <BotStatusCard />
    </main>
  );
}
