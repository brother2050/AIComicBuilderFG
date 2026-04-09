import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Comic Builder - AI漫剧生成器",
  description: "AI驱动的漫剧生成器，从剧本到动画视频的全自动流水线",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background antialiased">
        {children}
      </body>
    </html>
  );
}
