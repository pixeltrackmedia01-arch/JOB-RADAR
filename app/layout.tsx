import "./globals.css";
import Link from "next/link";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "JobRadar — new jobs, found for you", template: "%s · JobRadar" },
  description: "JobRadar continuously checks job sources every 30 minutes and alerts you the moment a matching job appears. No account needed.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#0f766e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="logo"><span className="dot" />JobRadar</Link>
            <nav className="main">
              <Link href="/jobs">Jobs</Link>
              <Link href="/for-you">For you</Link>
              <Link href="/saved-searches">Saved</Link>
              <Link href="/job-market-insights">Market insights</Link>
              <Link href="/job-alerts">Job alerts</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="foot">
          <div className="wrap row" style={{ justifyContent: "space-between" }}>
            <span>© {new Date().getFullYear()} JobRadar · Jobs are collected from permitted sources and link to the original listing.</span>
            <span><Link href="/job-alerts">Get job alerts</Link> · <Link href="/admin">Admin</Link></span>
          </div>
        </footer>
      </body>
    </html>
  );
}
