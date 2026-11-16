'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Bell, Compass, Folder, KeyRound, LogOut, MessageCircle, RotateCcw, Search, UserRound } from 'lucide-react';
import { platformLabels, type Session } from '@reviewlab/api/contracts';
import { api, errorMessage } from '../../lib/client';
import { ThemeToggle } from '../theme';
import { Button, Initials, Logo, buttonVariants } from './button';
import { cn } from '../../lib/utils';

export type Destination = 'explore' | 'projects' | 'retests' | 'profile' | 'notifications';
export type ShellCounts = { projects?: number; retests?: number };

const navItem = 'flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-soft no-underline hover:bg-muted hover:text-foreground aria-[current=page]:bg-primary-muted aria-[current=page]:font-semibold aria-[current=page]:text-primary-strong';
const tabItem = 'flex min-h-13 min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground no-underline hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-primary-strong';
const badge = 'ml-auto rounded-full px-1.5 text-[11px] leading-4 font-bold tabular-nums';

/** Campo de busca do topo. Ctrl K (ou ⌘ K) leva o foco para ele de qualquer lugar da página. */
export function SearchBox({ value, onChange, onSubmit, placeholder, label = 'Buscar' }: {
  value: string; onChange: (value: string) => void; onSubmit?: () => void; placeholder: string; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const field = <label className="flex h-10 min-w-0 flex-[1_1_16rem] items-center gap-2 rounded-md border border-input bg-background px-3 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-primary-muted sm:max-w-[32.5rem]">
    <Search size={16} className="shrink-0" aria-hidden />
    <span className="sr-only">{label}</span>
    <input ref={input} type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}
      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
    <kbd className="hidden bg-card sm:inline-block">Ctrl K</kbd>
  </label>;
  return onSubmit ? <form role="search" className="contents" onSubmit={event => { event.preventDefault(); onSubmit(); }}>{field}</form> : field;
}

export function WorkspaceShell({ session, active, children, signInHref = '/entrar', onLogout, toolbar, counts }: {
  session: Session | null;
  active?: Destination;
  children: ReactNode;
  signInHref?: string;
  onLogout?: () => void;
  /** Barra fixa no topo da área principal: busca e ação primária da tela. */
  toolbar?: ReactNode;
  counts?: ShellCounts;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const initialUnread = session?.unreadNotifications ?? 0;
  const [unread, setUnread] = useState(initialUnread);
  const user = session?.user;
  const userId = user?.id;

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

  const current = (key: Destination) => active === key ? 'page' as const : undefined;
  const unreadLabel = unread > 99 ? '99+' : String(unread);
  const notificationsLabel = unread ? `Notificações, ${unread} ${unread === 1 ? 'não lida' : 'não lidas'}` : undefined;
  const retests = counts?.retests ?? 0;

  return <div className="min-h-dvh lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)]">
    <a className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:bg-card focus:p-3" href="#main-content">Ir para o conteúdo</a>

    {/* Barra lateral (desktop) */}
    <aside className="hidden border-r border-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-1 lg:px-3.5 lg:py-5">
      <Link href="/" className="flex items-center gap-2.5 px-2 pt-1 pb-5 text-[15px] font-semibold text-foreground no-underline hover:text-foreground">
        <Logo />ReviewLab
      </Link>
      {user && <nav className="flex flex-col gap-1" aria-label="Navegação principal">
        <Link href="/" aria-current={current('explore')} className={navItem}><Compass size={17} aria-hidden />Explorar</Link>
        <Link href="/?meus" aria-current={current('projects')} className={navItem}><Folder size={17} aria-hidden />Meus projetos
          {counts?.projects !== undefined && <span className="ml-auto font-mono text-[11px] text-muted-foreground">{counts.projects}</span>}
        </Link>
        <Link href="/?retestes" aria-current={current('retests')} className={navItem}><RotateCcw size={17} aria-hidden />Retestes
          {retests > 0 && <span className={cn(badge, 'bg-primary text-primary-foreground')}>{retests}</span>}
        </Link>
        <Link href="/notificacoes" aria-current={current('notifications')} aria-label={notificationsLabel} className={navItem}><Bell size={17} aria-hidden />Notificações
          {unread > 0 && <span aria-hidden className={cn(badge, 'bg-border text-foreground')}>{unreadLabel}</span>}
        </Link>
        <p className="section-label px-2.5 pt-4 pb-1.5 text-[11px]">Integrações</p>
        <Link href="/perfil#mcp-settings" className={navItem}><KeyRound size={17} aria-hidden />Servidor MCP</Link>
        {session?.whatsappGroup && <a href={session.whatsappGroup} target="_blank" rel="noreferrer" className={navItem}>
          <MessageCircle size={17} aria-hidden />Grupo do WhatsApp<ArrowUpRight size={14} className="ml-auto text-muted-foreground" aria-hidden />
        </a>}
      </nav>}
      <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-4">
        {user ? <>
          <Link href="/perfil" aria-current={current('profile')} className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-foreground no-underline hover:text-foreground">
            <Initials name={user.name} className="size-8 rounded-full text-[13px] font-semibold" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-semibold group-hover:underline group-aria-[current=page]:text-primary-strong">{user.name}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{user.platforms.map(platform => platformLabels[platform].toLowerCase()).join(' · ')}</span>
            </span>
          </Link>
          <ThemeToggle bordered />
          <Button variant="ghost" size="icon" className="size-9" aria-label="Sair da conta" title="Sair da conta" onClick={logout} disabled={signingOut}><LogOut size={16} aria-hidden /></Button>
        </> : <>
          {session && <Link href={signInHref} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>Entrar</Link>}
          <ThemeToggle bordered />
        </>}
      </div>
    </aside>

    <div className="flex min-h-dvh min-w-0 flex-col pb-20 lg:pb-0">
      {/* Cabeçalho compacto (celular e tablet) */}
      <header className="flex items-center gap-2.5 px-4 pt-4 pb-2 lg:hidden">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight text-foreground no-underline hover:text-foreground"><Logo />ReviewLab</Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {user ? <Button variant="ghost" size="icon" aria-label="Sair da conta" onClick={logout} disabled={signingOut}><LogOut size={17} aria-hidden /></Button>
            : session && <Link href={signInHref} className={buttonVariants({ variant: 'outline' })}>Entrar</Link>}
        </div>
      </header>

      {toolbar && user && <div className="flex flex-wrap items-center gap-3 border-border px-4 py-2 sm:px-6 lg:sticky lg:top-0 lg:z-20 lg:border-b lg:bg-card lg:px-10 lg:py-3.5">{toolbar}</div>}

      <main className="mx-auto w-full max-w-[70rem] min-w-0 flex-1 px-4 pt-4 pb-14 sm:px-6 lg:px-10 lg:pt-8" id="main-content" tabIndex={-1}>
        {user?.email_verified === false && active !== 'profile' && <div className="mb-6 flex flex-wrap items-center justify-between gap-2 surface px-3.5 py-2.5 text-sm">
          <p>Seu endereço de e-mail ainda está pendente de verificação.</p>
          <Link href="/perfil" className="font-semibold">Verificar e-mail</Link>
        </div>}
        {error && <p role="alert" className="mb-6 surface px-3.5 py-2 text-sm font-semibold text-destructive">{error}</p>}
        {children}
      </main>
    </div>

    {/* Navegação inferior (celular e tablet) */}
    {user && <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-sidebar px-1.5 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <Link href="/" aria-current={current('explore')} className={tabItem}><Compass size={20} aria-hidden />Explorar</Link>
      <Link href="/?meus" aria-current={active === 'projects' || active === 'retests' ? 'page' : undefined} className={tabItem}><Folder size={20} aria-hidden />Projetos</Link>
      <Link href="/notificacoes" aria-current={current('notifications')} aria-label={notificationsLabel} className={tabItem}><Bell size={20} aria-hidden />{unread ? `Avisos · ${unreadLabel}` : 'Avisos'}</Link>
      <Link href="/perfil" aria-current={current('profile')} className={tabItem}><UserRound size={20} aria-hidden />Perfil</Link>
    </nav>}
    <span className="sr-only" role="status">{unread > 0 ? `${unread} ${unread === 1 ? 'notificação não lida' : 'notificações não lidas'}` : ''}</span>
  </div>;
}
