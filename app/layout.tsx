import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "枝间｜本地优先的写作地图",
  description: "连接 Markdown 笔记与 PDF 资料的本地优先思维地图，支持页码引用、层级关系和便携工程。",
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
