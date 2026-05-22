import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppLogo from "@/components/AppLogo";
import MainNav from "@/components/MainNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aplikasi Pengatur Jam",
  description: "Penjadwalan Tata Usaha, tanpa Excel manual.",
  icons: {
    icon: "/app-logo.svg",
    shortcut: "/app-logo.svg",
    apple: "/app-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div className="app-shell">
          <header className="app-header">
            <AppLogo />
            <p>Penjadwalan Roster Guru, dan Ujian tanpa Excel manual. Dengan sistem dukungan penuh, Anda dapat mengatur jadwal dengan mudah dan efisien.</p>
            <MainNav />
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
