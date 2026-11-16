import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Theme } from '../components/theme';
import { appLocale } from '../lib/locale';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'ReviewLab',
  description: 'Organize projetos e teste o trabalho de outros desenvolvedores.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return <html lang={appLocale} className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
    <body><Theme nonce={nonce}>{children}</Theme></body>
  </html>;
}
