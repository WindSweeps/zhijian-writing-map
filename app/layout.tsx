import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "枝间｜本地优先的写作地图",
  description: "在本地文件夹中管理 Markdown 正文、JSON 结构、引用与多媒体内容。",
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
