import type { Metadata } from 'next';
import localFont from 'next/font/local';
import siteConfig from '@/data/site-config.json';
import './globals.css';

const sansSerifFont = localFont({
  src: '../fonts/TASAOrbiterVF.woff2',
  display: 'swap',
  variable: '--font-sans'
});

export const metadata: Metadata = {
  title: siteConfig.siteTitle,
  description: siteConfig.subtitle,
  openGraph: {
    title: siteConfig.siteTitle,
    description: siteConfig.subtitle,
    siteName: siteConfig.siteTitle,
    locale: 'zh_CN',
    type: 'website'
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${sansSerifFont.variable} font-sans`}>
      <body>{children}</body>
    </html>
  );
}
