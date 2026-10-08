import type { Metadata } from "next";
import "./globals.css";
import "./fonts.css";
export const metadata: Metadata = { title: "Заруба второго цикла", description: "20 оплат. Одна команда. Большая цель. Общая касса и рейтинг акул продаж.", icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ru"><body>{children}</body></html>; }
