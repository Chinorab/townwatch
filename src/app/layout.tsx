import type { Metadata } from "next";
import Link from "next/link";
import { Playfair_Display, Public_Sans } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";

const serif = Playfair_Display({ variable: "--font-serif", subsets: ["latin"], weight: ["700", "800"], style: ["normal", "italic"] });
const sans = Public_Sans({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Townwatch", template: "%s | Townwatch" },
  description: "What your county, town and school board are deciding, explained in plain English from their official agendas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <a className={styles.skip} href="#main">
          Skip to the briefing
        </a>
        <header className={styles.bar}>
          <div className={`wrap ${styles.barInner}`}>
            <Link href="/" className={styles.brand}>
              Townwatch
            </Link>
            <nav aria-label="Site">
              <ul className={styles.nav}>
                <li>
                  <Link href="/#places">Places</Link>
                </li>
                <li>
                  <Link href="/privacy">Privacy</Link>
                </li>
              </ul>
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className={styles.footer}>
          <div className={`wrap ${styles.footerInner}`}>
            <p>
              Townwatch summarises public agendas automatically. The official record always prevails: every line links to the document it comes from.
            </p>
            <p className={styles.footerLinks}>
              <Link href="/privacy">Privacy</Link>
              <a href="https://github.com/Chinorab/townwatch">Source code</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
