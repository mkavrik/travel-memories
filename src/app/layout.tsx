import type { Metadata } from "next";
import { Dela_Gothic_One, Nunito } from "next/font/google";
import "./globals.css";

const delaGothic = Dela_Gothic_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dela",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Travel Memories",
  description: "Osobní nástroj pro zpracování cestovního obsahu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body
        className={`${delaGothic.variable} ${nunito.variable} bg-[#050509] text-slate-50 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
