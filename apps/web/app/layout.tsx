import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { ReactNode } from 'react';
import { Theme } from '../components/theme';
import { appLocale } from '../lib/locale';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReviewLab',
  description: 'Organize projetos e teste o trabalho de outros desenvolvedores.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return <html lang={appLocale} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
    <body><Theme nonce={nonce}>{children}</Theme></body>
  </html>;
}
