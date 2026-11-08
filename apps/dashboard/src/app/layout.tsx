import type { Metadata, Viewport } from "next";
import { Anuphan, Inter, JetBrains_Mono } from "next/font/google";
import "../styles/tokens.css";
import "../styles/base.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const anuphan = Anuphan({ subsets: ["thai", "latin"], variable: "--font-anuphan", display: "swap" });
// Mono is only used for small labels: not preloaded, so it never competes with the heading font for LCP.
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Narze",
  description: "บอทเพลง Discord พร้อมแดชบอร์ดที่ซิงก์แบบเรียลไทม์",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
};

/** Runs before paint: marks JS as available and restores a forced theme, so there is no flash. */
const prePaint = `document.documentElement.classList.add("js");try{var t=localStorage.getItem("narze.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${inter.variable} ${anuphan.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static pre-paint script, no user input */}
        <script dangerouslySetInnerHTML={{ __html: prePaint }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
