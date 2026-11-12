'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, Bell, Boxes, Compass, Folder, LogOut, MessageCircle, UserRound } from 'lucide-react';
import type { Session } from '@reviewlab/api/contracts';
import { api, errorMessage } from '../../lib/client';
import { ThemeToggle } from '../theme';
import { Button, buttonVariants } from './button';

type Destination = 'explore' | 'projects' | 'profile' | 'notifications';

const destinations = [
  { key: 'explore', label: 'Explorar', compactLabel: 'Explorar', href: '/', icon: Compass },
  { key: 'projects', label: 'Meus projetos', compactLabel: 'Projetos', href: '/?meus', icon: Folder },
  { key: 'notifications', label: 'Notificações', compactLabel: 'Notificações', href: '/notificacoes', icon: Bell },
  { key: 'profile', label: 'Meu perfil', compactLabel: 'Perfil', href: '/perfil', icon: UserRound },
] as const;

export function WorkspaceShell({ session, active, children, signInHref = '/entrar', onLogout }: {
  session: Session | null;
  active?: Destination;
  children: ReactNode;
  signInHref?: string;
  onLogout?: () => void;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const initialUnread = session?.unreadNotifications ?? 0;
  const [unread, setUnread] = useState(initialUnread);
  const userId = session?.user?.id;

  useEffect(() => {
    setUnread(initialUnread);
    if (!userId) return;
    const controller = new AbortController();
    let pending = false;

    async function refreshCount() {
      if (document.visibilityState !== 'visible' || pending) return;
      pending = true;
      try {
        const result = await api<{ unreadNotifications: number }>('/api/notifications/count', undefined, controller.signal);
        if (!controller.signal.aborted) setUnread(result.unreadNotifications);
      } catch {
        // A contagem inicial fica disponível durante uma falha transitória.
      } finally {
        pending = false;
      }
    }

    const timer = window.setInterval(refreshCount, 30_000);
    window.addEventListener('focus', refreshCount);
    document.addEventListener('visibilitychange', refreshCount);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshCount);
      document.removeEventListener('visibilitychange', refreshCount);
    };
  }, [initialUnread, userId]);

  async function logout() {
    setSigningOut(true);
    setError('');
    try {
      await api('/api/logout', {});
      if (onLogout) onLogout();
      else router.replace('/entrar');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSigningOut(false);
    }
  }

  return <div className="min-h-dvh lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
    <a className="sr-only focus:not-sr-only focus:absolute focus:z-30 focus:m-3 focus:rounded-md focus:bg-card focus:p-3" href="#main-content">Ir para o conteúdo</a>
    <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-b border-border bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
      <Link href="/" className="col-start-1 row-start-1 m-3 flex w-fit items-center gap-2.5 text-base font-semibold tracking-tight lg:mx-5 lg:my-7">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><Boxes size={18} aria-hidden /></span>
        ReviewLab
      </Link>
      {session?.user && <nav className="col-span-2 row-start-2 grid grid-cols-4 gap-1 border-t border-border px-2 py-1.5 lg:flex lg:flex-col lg:border-t-0 lg:px-3 lg:py-0" aria-label="Navegação principal">
        {destinations.map(({ key, label, compactLabel, href, icon: Icon }) => (
          <Link key={key} href={href} aria-current={active === key ? 'page' : undefined}
            aria-label={key === 'notifications' && unread ? `Notificações, ${unread} ${unread === 1 ? 'não lida' : 'não lidas'}` : label}
            className="relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-primary-muted aria-[current=page]:text-primary lg:flex-row lg:justify-start lg:gap-2.5 lg:px-3 lg:text-sm">
            <Icon size={17} aria-hidden />
            <span className="lg:hidden">{compactLabel}</span>
            <span className="hidden lg:inline">{label}</span>
            {key === 'notifications' && unread > 0 && <span aria-hidden className="absolute top-0.5 right-0.5 rounded-full bg-primary px-1.5 text-[10px] leading-4 font-bold text-primary-foreground tabular-nums lg:static lg:ml-auto">{unread > 99 ? '99+' : unread}</span>}
          </Link>
        ))}
        {session.whatsappGroup && <a href={session.whatsappGroup} target="_blank" rel="noreferrer"
          className="col-span-4 flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted">
          <MessageCircle size={17} aria-hidden />
          <span>Grupo do WhatsApp</span>
          <ArrowUpRight size={14} className="ml-auto text-muted-foreground" aria-hidden />
        </a>}
        <span className="sr-only" role="status">{unread > 0 ? `${unread} ${unread === 1 ? 'notificação não lida' : 'notificações não lidas'}` : ''}</span>
      </nav>}
      <div className="col-start-2 row-start-1 mr-2 flex items-center gap-1 lg:mt-auto lg:mr-0 lg:flex-wrap lg:border-t lg:border-border lg:p-3">
        <ThemeToggle />
        {session?.user ? <Button variant="ghost" size="icon" aria-label="Sair da conta" title="Sair da conta" onClick={logout} disabled={signingOut}><LogOut size={17} aria-hidden /></Button>
          : session && <Link href={signInHref} className={buttonVariants({ variant: 'outline' })}>Entrar</Link>}
      </div>
    </header>
    <main className="mx-auto min-w-0 w-full max-w-6xl px-4 pt-6 pb-14 sm:px-7 lg:px-9 lg:pt-10" id="main-content" tabIndex={-1}>
      {session?.user?.email_verified === false && active !== 'profile' && <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm">
        <p>Seu endereço de e-mail ainda está pendente de verificação.</p>
        <Link href="/perfil" className="font-semibold text-primary hover:underline">Verificar e-mail</Link>
      </div>}
      {error && <p role="alert" className="mb-6 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold">{error}</p>}
      {children}
    </main>
  </div>;
}
