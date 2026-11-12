'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, Bell, MailCheck } from 'lucide-react';
import type { Notification, Session, User } from '@reviewlab/api/contracts';
import { api, errorMessage, formatDate, projectPath } from '../lib/client';
import { CheckField, PlatformChoices, SubmitForm } from './forms';
import { Button, buttonVariants } from './ui/button';
import { Input } from './ui/input';
import { WorkspaceShell } from './ui/workspace-shell';

type SignedIn = Session & { user: User };
const panel = 'min-w-0 rounded-lg border border-border bg-card p-4 sm:p-6';
const field = 'grid gap-1.5 text-sm font-medium';

function MemberPage({ active, children }: {
  active: 'profile' | 'notifications'; children: (session: SignedIn, setSession: (session: Session) => void) => ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const next = active === 'profile' ? '/perfil' : '/notificacoes';
  const signInHref = '/entrar?next=' + encodeURIComponent(next);

  useEffect(() => {
    const controller = new AbortController();
    api<Session>('/api/session', undefined, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      if (value.user) setSession(value);
      else router.replace(signInHref);
    }).catch(error => {
      if (!controller.signal.aborted) setError(errorMessage(error));
    });
    return () => controller.abort();
  }, [router, signInHref]);

  return <WorkspaceShell session={session} active={active} signInHref={signInHref}>
    {error ? <p className={panel + ' text-sm text-destructive'} role="alert">{error}</p>
      : session?.user ? children({ ...session, user: session.user }, setSession)
      : <p className="text-sm text-muted-foreground" role="status">Carregando…</p>}
  </WorkspaceShell>;
}

function ProfileSettings({ session, onUpdate }: { session: SignedIn; onUpdate: (session: Session) => void }) {
  const { user } = session;
  const [saved, setSaved] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  return <div className="grid max-w-2xl gap-5">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Meu perfil</h1>
      <p className="mt-2 text-sm text-muted-foreground">Gerencie sua conta, plataformas de teste e preferências.</p>
    </div>
    <section className={panel} aria-labelledby="account-email">
      <h2 id="account-email" className="flex items-center gap-2 font-semibold"><MailCheck className="text-primary" size={18} aria-hidden /> E-mail da conta</h2>
      <p className="mt-2 text-sm wrap-anywhere">{user.email}</p>
      <p className="mt-1 text-sm text-muted-foreground">{user.email_verified ? 'Endereço verificado' : 'Verificação pendente'}</p>
      {!user.email_verified && <div className="mt-4">
        {verificationSent ? <div className="grid justify-items-start gap-2">
          <p className="text-sm" role="status">Solicitação recebida. Confira sua caixa de entrada e a pasta de spam.</p>
          <Button type="button" variant="ghost" onClick={() => setVerificationSent(false)}>Pedir outro link</Button>
        </div>
          : <SubmitForm inline onSubmit={async () => {
            await api('/api/email/verify/request', {});
            setVerificationSent(true);
          }}><Button variant="outline">Enviar link de verificação</Button></SubmitForm>}
      </div>}
      <Link className="mt-4 inline-block text-sm font-semibold text-primary hover:underline" href="/recuperar-senha">Redefinir senha</Link>
    </section>
    <section className={panel} aria-labelledby="tester-settings">
      <h2 id="tester-settings" className="mb-4 font-semibold">Preferências de teste</h2>
      <SubmitForm onSubmit={async data => {
        setSaved(false);
        const { user } = await api<{ user: User }>('/api/profile', {
          name: data.get('name'), platforms: data.getAll('platforms'), announcement_emails: data.has('announcement_emails'),
          android_test_email: data.get('android_test_email'), android_test_email_public: data.has('android_test_email_public'),
        });
        onUpdate({ ...session, user });
        setSaved(true);
      }}>
        <label className={field}>Nome<Input name="name" autoComplete="name" defaultValue={user.name} maxLength={80} required /></label>
        <PlatformChoices title="Onde você consegue testar?" hint="Marque pelo menos uma plataforma." selected={user.platforms} />
        <div className="grid gap-2 rounded-lg border border-border p-3">
          <CheckField name="announcement_emails" defaultChecked={user.announcement_emails}>Receber pedidos de review por e-mail</CheckField>
          {!user.email_verified && <p className="text-xs text-muted-foreground">Verifique o e-mail da conta para começar a receber os avisos.</p>}
        </div>
        <fieldset className="grid gap-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Convites do Google Play</legend>
          <div className={field}>
            <label htmlFor="android-test-email">E-mail para receber projetos Android</label>
            <Input name="android_test_email" id="android-test-email" aria-describedby="android-test-hint" type="email" maxLength={254}
              defaultValue={user.android_test_email ?? ''} placeholder="Seu endereço do Google Play" />
            <small id="android-test-hint" className="font-normal text-muted-foreground">Opcional. Use o endereço que você usa para aceitar testes no Google Play.</small>
          </div>
          <CheckField name="android_test_email_public" defaultChecked={user.android_test_email_public}>
            Disponibilizar para todos os donos de projetos Android
          </CheckField>
          <p className="text-xs text-muted-foreground">Se deixar privado, você pode compartilhar o endereço em cada projeto que quiser testar.</p>
        </fieldset>
        <div><Button>Salvar perfil</Button></div>
      </SubmitForm>
      {saved && <p className="mt-3 text-sm font-medium text-primary" role="status">Perfil atualizado.</p>}
    </section>
  </div>;
}

export function ProfilePage() {
  return <MemberPage active="profile">{(session, onUpdate) => <ProfileSettings session={session} onUpdate={onUpdate} />}</MemberPage>;
}

function NotificationList({ session, onUpdate }: { session: SignedIn; onUpdate: (session: Session) => void }) {
  const [notifications, setNotifications] = useState<Notification[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let pending: AbortController | undefined;
    async function load() {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      try {
        const { notifications } = await api<{ notifications: Notification[] }>('/api/notifications', undefined, controller.signal);
        if (!controller.signal.aborted) {
          setNotifications(notifications);
          setError('');
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(errorMessage(error));
      }
    }
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      pending?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  async function markRead(id?: string) {
    setBusy(true);
    setError('');
    try {
      await api('/api/notifications/read', id ? { id } : { all: true });
      const { unreadNotifications } = await api<{ unreadNotifications: number }>('/api/notifications/count');
      onUpdate({ ...session, unreadNotifications });
      setNotifications(rows => rows?.map(row => !id || id === row.id ? { ...row, read: true } : row));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid max-w-3xl gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Notificações</h1>
        <p className="mt-2 text-sm text-muted-foreground">Veja quem compartilhou e-mail de teste com seus projetos Android.</p>
      </div>
      {notifications?.some(item => !item.read) && <Button variant="outline" disabled={busy} onClick={() => void markRead()}>Marcar todas como lidas</Button>}
    </header>
    {error && <p className={panel + ' text-sm text-destructive'} role="alert">{error}</p>}
    {!notifications ? !error && <p className="text-sm text-muted-foreground" role="status">Carregando notificações…</p>
      : notifications.length ? <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {notifications.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            {!item.read && <p className="mb-1 text-xs font-semibold text-primary">Não lida</p>}
            <p className="text-sm wrap-anywhere"><strong>{item.actorName}</strong> compartilhou o e-mail de teste com <strong>{item.projectName}</strong>.</p>
            <time className="mt-1 block text-xs text-muted-foreground" dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
          </div>
          <div className="flex flex-wrap gap-1">
            {!item.read && <Button variant="ghost" disabled={busy} onClick={() => void markRead(item.id)}>Marcar como lida</Button>}
            <Link className={buttonVariants({ variant: 'outline' })} href={projectPath(item.projectId) + '#testadores-android'}>Ver testadores <ArrowUpRight size={15} aria-hidden /></Link>
          </div>
        </li>)}
      </ul> : <div className={panel + ' grid min-h-48 place-content-center justify-items-center gap-3 text-center'}>
        <Bell size={24} className="text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Nenhuma notificação por enquanto.</p>
      </div>}
  </div>;
}

export function NotificationsPage() {
  return <MemberPage active="notifications">{(session, onUpdate) => <NotificationList session={session} onUpdate={onUpdate} />}</MemberPage>;
}
