import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "越过黄昏的长传｜枝间 Writing Map",
  description: "足球少年、活泼学妹与文艺学姐的校园恋爱视觉小说创作地图。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
