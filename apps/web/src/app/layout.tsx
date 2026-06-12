import type { Metadata } from "next";
import { Press_Start_2P, Silkscreen, VT323, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/nav-bar";

const press = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press", display: "swap" });
const silkscreen = Silkscreen({ weight: "400", subsets: ["latin"], variable: "--font-silkscreen", display: "swap" });
const vt323 = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323", display: "swap" });
const jbmono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap" });

export const metadata: Metadata = {
  title: "MyGrader",
  description: "Competitive programming grader",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${press.variable} ${silkscreen.variable} ${vt323.variable} ${jbmono.variable}`}
    >
      <body className="antialiased min-h-screen">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
