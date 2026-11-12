'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Boxes, CheckCircle2, Mail } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/client';
import { CheckField, PlatformChoices, SubmitForm } from './forms';
import { ThemeToggle } from './theme';
import { Button, buttonVariants } from './ui/button';
import { Input } from './ui/input';

const fieldClass = 'grid gap-1.5 text-sm font-medium';
const textLink = 'font-medium text-primary underline-offset-4 hover:underline';

function AccountLayout({ title, description, children, footer }: {
  title: string; description: string; children: ReactNode; footer?: ReactNode;
}) {
  return <div className="flex min-h-dvh flex-col">
    <header className="flex min-h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-8">
      <Link href="/" className="inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight">
        <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground"><Boxes size={18} aria-hidden /></span>
        ReviewLab
      </Link>
      <ThemeToggle />
    </header>
    <main className="mx-auto grid w-full max-w-md flex-1 content-start gap-6 px-4 py-10 sm:py-18">
      <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft size={15} aria-hidden /> Voltar ao início</Link>
      <section className="rounded-lg border border-border bg-card p-5 shadow-xs sm:p-7">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </header>
        {children}
        {footer && <div className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">{footer}</div>}
      </section>
    </main>
  </div>;
}

function useLinkToken() {
  const [token, setToken] = useState<string | null>();
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    setToken(value && /^[a-f0-9]{64}$/.test(value) ? value : null);
  }, []);
  return token;
}

function clearLinkToken() {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

function EmailField() {
  return <label className={fieldClass}>E-mail<Input name="email" type="email" autoComplete="email" maxLength={254} required /></label>;
}

function NewPasswordFields() {
  return <>
    <div className={fieldClass}>
      <label htmlFor="new-password">Nova senha</label>
      <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128}
        aria-describedby="password-rules" required />
      <small id="password-rules" className="font-normal text-muted-foreground">Use pelo menos 8 caracteres.</small>
    </div>
    <label className={fieldClass}>Confirmar senha
      <Input name="confirm_password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
    </label>
  </>;
}

function checkedPassword(data: FormData) {
  if (data.get('password') !== data.get('confirm_password')) throw new Error('As senhas precisam ser iguais.');
  return data.get('password');
}

function LinkForm({ token, requestPath, requestLabel, children }: {
  token?: string | null; requestPath: string; requestLabel: string; children: (token: string) => ReactNode;
}) {
  if (token === undefined) return <p className="text-sm text-muted-foreground" role="status">Lendo o link…</p>;
  if (token === null) return <div className="grid gap-4">
    <p className="text-sm text-muted-foreground" role="alert">Abra o link completo do e-mail ou solicite um novo.</p>
    <Link className={buttonVariants({ variant: 'outline' })} href={requestPath}>{requestLabel}</Link>
  </div>;
  return <>{children(token)}<Link className={textLink + ' mt-4 inline-block text-sm'} href={requestPath}>{requestLabel}</Link></>;
}

export function LoginPage({ next, passwordChanged }: { next: string; passwordChanged: boolean }) {
  const router = useRouter();
  const signupHref = next === '/' ? '/cadastro' : '/cadastro?next=' + encodeURIComponent(next);
  return <AccountLayout title="Entrar" description="Acesse seus projetos, reviews e notificações."
    footer={<>Primeira vez no ReviewLab? <Link className={textLink} href={signupHref}>Criar conta</Link></>}>
    {passwordChanged && <p className="mb-4 rounded-md bg-muted p-3 text-sm" role="status">Senha alterada. Entre com sua nova senha.</p>}
    <SubmitForm onSubmit={async data => {
      await api('/api/login', { email: data.get('email'), password: data.get('password') });
      router.replace(next);
    }}>
      <EmailField />
      <label className={fieldClass}>Senha
        <Input name="password" type="password" autoComplete="current-password" maxLength={128} required />
      </label>
      <Link className={textLink + ' w-fit text-sm'} href="/recuperar-senha">Esqueci minha senha</Link>
      <Button>Entrar <ArrowRight size={16} aria-hidden /></Button>
    </SubmitForm>
  </AccountLayout>;
}

export function RequestAccountLinkPage({ signup, next }: { signup: boolean; next?: string }) {
  const [sent, setSent] = useState(false);
  return <AccountLayout title={signup ? 'Criar conta' : 'Recuperar senha'}
    description={signup ? 'Informe seu e-mail para receber o link de cadastro.' : 'Informe o e-mail associado à sua conta.'}
    footer={<Link className={textLink} href="/entrar">Voltar para entrar</Link>}>
    {sent ? <div className="grid gap-3 rounded-md bg-muted p-4" role="status">
      <Mail size={20} className="text-primary" aria-hidden />
      <p className="text-sm">Se o endereço estiver apto a receber o link, ele chegará por e-mail. Confira também o spam.</p>
      <Button type="button" variant="outline" className="w-fit" onClick={() => setSent(false)}>Usar outro endereço ou reenviar</Button>
    </div> : <SubmitForm onSubmit={async data => {
      await api(signup ? '/api/register' : '/api/password/reset/request', { email: data.get('email'), next });
      setSent(true);
    }}>
      <EmailField />
      <Button>Enviar link</Button>
    </SubmitForm>}
  </AccountLayout>;
}

export function CompleteSignupPage({ next }: { next: string }) {
  const router = useRouter();
  const token = useLinkToken();
  return <AccountLayout title="Finalize seu cadastro" description="Defina seu nome, sua senha e as plataformas em que você pode testar.">
    <LinkForm token={token} requestPath="/cadastro" requestLabel="Pedir outro link de cadastro">{value =>
      <SubmitForm onSubmit={async data => {
        await api('/api/register/complete', {
          token: value, name: data.get('name'), password: checkedPassword(data), platforms: data.getAll('platforms'),
          announcement_emails: data.has('announcement_emails'),
        });
        clearLinkToken();
        router.replace(next);
      }}>
        <label className={fieldClass}>Nome<Input name="name" autoComplete="name" maxLength={80} required /></label>
        <NewPasswordFields />
        <PlatformChoices title="Onde você consegue testar?" hint="Marque pelo menos uma plataforma." selected={['web']} />
        <CheckField name="announcement_emails">Receber pedidos de review por e-mail</CheckField>
        <Button>Criar conta</Button>
      </SubmitForm>}
    </LinkForm>
  </AccountLayout>;
}

export function VerifyEmailPage() {
  const token = useLinkToken();
  const [confirmed, setConfirmed] = useState(false);
  return <AccountLayout title="Verificar e-mail" description="Confirme que você tem acesso ao e-mail da conta.">
    {confirmed ? <div className="grid gap-3" role="status">
      <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="text-primary" size={18} aria-hidden />E-mail verificado.</p>
      <Link className={buttonVariants()} href="/perfil">Abrir perfil</Link>
    </div> : <LinkForm token={token} requestPath="/perfil" requestLabel="Voltar ao perfil">{value =>
      <SubmitForm onSubmit={async () => {
        await api('/api/email/verify', { token: value });
        clearLinkToken();
        setConfirmed(true);
      }}>
        <Button>Confirmar e-mail</Button>
      </SubmitForm>}
    </LinkForm>}
  </AccountLayout>;
}

export function ResetPasswordPage() {
  const token = useLinkToken();
  const router = useRouter();
  return <AccountLayout title="Redefinir senha" description="Escolha uma nova senha. Após a alteração, entre novamente nos seus dispositivos.">
    <LinkForm token={token} requestPath="/recuperar-senha" requestLabel="Pedir outro link de recuperação">{value =>
      <SubmitForm onSubmit={async data => {
        await api('/api/password/reset', { token: value, password: checkedPassword(data) });
        clearLinkToken();
        router.replace('/entrar?senha=alterada');
      }}>
        <NewPasswordFields />
        <Button>Salvar nova senha</Button>
      </SubmitForm>}
    </LinkForm>
  </AccountLayout>;
}
