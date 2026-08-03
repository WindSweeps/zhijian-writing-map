import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "枝间｜为写作而生的思维地图",
  description: "在线性写作与可视化脑图之间自由切换，组织正文、引用与灵感。",
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
