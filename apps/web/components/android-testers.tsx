'use client';

import Link from 'next/link';
import { Clipboard, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AndroidTestersResponse, Project, Session } from '@reviewlab/api/contracts';
import { api, errorMessage, projectApi } from '../lib/client';
import { Button } from './ui/button';

export function AndroidTesters({ project, session }: { project: Project; session: Session }) {
  const user = session.user;
  const owner = user?.id === project.owner_id;
  const hasPrivateEmail = Boolean(user?.android_test_email && !user.android_test_email_public);
  const path = projectApi(project.id) + '/android-testers';
  const [result, setResult] = useState<AndroidTestersResponse | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!owner && !hasPrivateEmail) return;
    const controller = new AbortController();
    api<AndroidTestersResponse>(path, undefined, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(error => {
      if (!controller.signal.aborted) setError(errorMessage(error));
    });
    return () => controller.abort();
  }, [path, owner, hasPrivateEmail, revision]);

  async function share(value: boolean) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { sharedByMe } = await api<{ sharedByMe: boolean }>(path + '/share', { share: value });
      setResult({ testers: [], sharedByMe });
      setNotice(value ? 'E-mail compartilhado com o dono do projeto.' : 'Compartilhamento removido.');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result?.testers.length) return;
    setError('');
    try {
      const emails = [...new Set(result.testers.map(tester => tester.email))];
      await navigator.clipboard.writeText(emails.join(', '));
      setNotice('E-mails copiados.');
    } catch {
      setError('Não foi possível copiar. Selecione os endereços na lista.');
    }
  }

  return <section className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight"><Smartphone size={18} className="text-primary" aria-hidden /> Testadores Android</h2>
      {owner && <Button variant="ghost" type="button" onClick={() => { setError(''); setResult(null); setRevision(value => value + 1); }}>Atualizar lista</Button>}
    </div>
    {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
    {notice && <p className="mt-2 text-sm text-muted-foreground" role="status">{notice}</p>}
    {owner ? <>
      <p className="mt-2 text-sm text-muted-foreground">Use os e-mails disponibilizados pelos testadores na lista de testes do Google Play.</p>
      {!result ? !error && <p className="mt-3 text-sm text-muted-foreground" role="status">Carregando testadores…</p>
        : result.testers.length ? <>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {result.testers.map(tester => <li key={tester.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium wrap-anywhere">{tester.name}</p>
                <p className="wrap-anywhere text-muted-foreground">{tester.email}</p>
              </div>
              {tester.shared && <span className="rounded-md bg-primary-muted px-2 py-0.5 text-xs font-medium text-primary">Só para este projeto</span>}
            </li>)}
          </ul>
          <Button variant="outline" type="button" className="mt-3" onClick={copy}><Clipboard size={15} aria-hidden /> Copiar e-mails</Button>
        </> : <p className="mt-3 text-sm text-muted-foreground">Nenhum testador disponibilizou e-mail para este projeto.</p>}
    </> : hasPrivateEmail ? <>
      <p className="mt-2 text-sm text-muted-foreground">{result?.sharedByMe
        ? 'O dono deste projeto pode ver seu e-mail de teste Android.'
        : 'Seu e-mail de teste é privado. Você pode compartilhá-lo com o dono deste projeto.'}</p>
      <Button type="button" className="mt-3" variant={result?.sharedByMe ? 'outline' : 'default'} disabled={busy || !result}
        onClick={() => void share(!result?.sharedByMe)}>{result?.sharedByMe ? 'Remover compartilhamento' : 'Compartilhar e-mail de teste'}</Button>
      {!result && error && <Button type="button" variant="ghost" className="mt-3" onClick={() => { setError(''); setRevision(value => value + 1); }}>Tentar novamente</Button>}
    </> : <p className="mt-2 text-sm text-muted-foreground">
      {user?.android_test_email ? 'Seu e-mail de teste está disponível aos donos de projetos Android.' : 'Adicione um e-mail de teste para receber convites do Google Play.'}{' '}
      <Link href="/perfil" className="font-semibold text-primary hover:underline">Configurar no perfil</Link>
    </p>}
  </section>;
}
