import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pita Dixital - Admin",
  description: "Omnichannel AI Orchestrator",
};

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={outfit.variable}>
      <body>
        <div className="app-wrapper">
          <div className="glass-container">
            <Sidebar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Header />
              <main style={{ flex: 1, overflowY: 'auto', padding: '0 2rem 2rem' }}>
                {children}
              </main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
