import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
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
    <html lang="es" className={inter.variable}>
      <body>
        <div className="app-wrapper">
          <div className="glass-container">
            <Sidebar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Header />
              <main style={{ flex: 1, overflowY: 'auto', padding: '0 2.5rem 2.5rem' }}>
                {children}
              </main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
