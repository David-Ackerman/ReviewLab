'use client';

import { Moon, Sun } from 'lucide-react';
import { setNonce } from 'get-nonce';
import { ThemeProvider, useTheme } from 'next-themes';
import { createContext, useLayoutEffect, type ReactNode } from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

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

export function ThemeToggle({ bordered = false }: { bordered?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  return <Button type="button" variant={bordered ? 'outline' : 'ghost'} size="icon" className={cn(bordered && 'size-9 text-soft')}
    aria-label="Alternar entre tema claro e escuro" title="Alternar tema"
    onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
    <Moon size={16} className="dark:hidden" aria-hidden />
    <Sun size={16} className="hidden dark:block" aria-hidden />
  </Button>;
}
