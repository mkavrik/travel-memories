import type { Metadata } from "next";
import "./globals.css";

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
      <body className="bg-[#050509] text-slate-50 antialiased">
        {children}
      </body>
    </html>
  );
}
