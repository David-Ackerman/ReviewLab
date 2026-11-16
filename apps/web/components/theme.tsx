'use client';

import { Moon, Sun } from 'lucide-react';
import { setNonce } from 'get-nonce';
import { ThemeProvider, useTheme } from 'next-themes';
import { createContext, useLayoutEffect, type ReactNode } from 'react';
import { Button } from './ui/button';

export const StyleNonceContext = createContext<string | undefined>(undefined);

export function Theme({ nonce, children }: { nonce?: string; children: ReactNode }) {
  useLayoutEffect(() => {
    // Radix usa este nonce ao injetar o CSS de bloqueio de rolagem.
    if (nonce) setNonce(nonce);
  }, [nonce]);

  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme={false} nonce={nonce}>
    <StyleNonceContext.Provider value={nonce}>{children}</StyleNonceContext.Provider>
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
