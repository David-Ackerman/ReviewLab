'use client';

import { Moon, Sun } from 'lucide-react';
import { ThemeProvider, useTheme } from 'next-themes';
import type { ReactNode } from 'react';
import { Button } from './ui/button';

export function Theme({ nonce, children }: { nonce?: string; children: ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme={false} nonce={nonce}>
    {children}
  </ThemeProvider>;
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return <Button type="button" variant="ghost" size="icon" aria-label="Alternar entre tema claro e escuro"
    onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
    <Moon size={18} className="dark:hidden" aria-hidden />
    <Sun size={18} className="hidden dark:block" aria-hidden />
  </Button>;
}
