'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { platformLabels, reportLabels, type Platform, type Project, type ProjectDetail, type Session } from '@reviewlab/api/contracts';
import { api, errorMessage, evidenceTypes, imageTypes, projectApi, stageUploads } from '../lib/client';

type Submit = (data: FormData) => Promise<void>;

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return <dialog ref={dialog} className="modal" onClose={onClose} aria-labelledby="modal-title">
    <header className="modal-header"><h2 id="modal-title">{title}</h2>
      <button className="icon-button" type="button" aria-label="Fechar" onClick={() => dialog.current?.close()}><X size={20} /></button>
    </header>
    {children}
  </dialog>;
}

export function SubmitForm({ onSubmit, children, className = 'fields' }: { onSubmit: Submit; children: ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    setBusy(true);
    setError('');
    try {
      await onSubmit(data);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} aria-busy={busy}>
    <fieldset className={className} disabled={busy}>{children}</fieldset>
    {busy && <p className="form-note" role="status">Salvando…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}

const testerHints: Record<Platform, string> = {
  web: 'Navegador de desktop ou celular',
  android: 'Dispositivo Android e conta Google Play',
  ios: 'iPhone ou iPad com TestFlight',
};

function TesterFields({ selected, emails = false }: { selected: Platform[]; emails?: boolean }) {
  return <>
    <fieldset className="tester-fields">
      <legend>Onde você consegue testar?</legend>
      {Object.entries(platformLabels).map(([key, label]) => <label className="check" key={key}>
        <input type="checkbox" name="platforms" value={key} defaultChecked={selected.includes(key as Platform)} />
        <span>{label}<small>{testerHints[key as Platform]}</small></span>
      </label>)}
    </fieldset>
    <label className="check"><input type="checkbox" name="announcement_emails" value="yes" defaultChecked={emails} />
      <span>Receber por e-mail pedidos de review das plataformas que eu testo</span>
    </label>
  </>;
}

export function AccountForm({ mode, session, toggle, onSave }: {
  mode: 'login' | 'register' | 'profile'; session: Session; toggle: () => void; onSave: (session: Session) => void;
}) {
  const profile = mode === 'profile';
  const login = mode === 'login';
  const user = profile ? session.user : null;

  async function submit(data: FormData) {
    await api('/api/' + mode, {
      ...Object.fromEntries(data), platforms: data.getAll('platforms'), announcement_emails: data.has('announcement_emails'),
    });
    onSave(await api<Session>('/api/session'));
  }

  return <SubmitForm onSubmit={submit}>
    {!login && <label>Nome<input name="name" autoComplete="name" maxLength={80} defaultValue={user?.name} required /></label>}
    {!profile && <>
      <label>E-mail<input name="email" autoComplete="email" type="email" maxLength={254} required /></label>
      <label>Senha<input name="password" autoComplete={login ? 'current-password' : 'new-password'} type="password" minLength={8} maxLength={128} required /></label>
    </>}
    {mode === 'register' && session.inviteRequired && <label>Código de convite<input name="invite_code" autoComplete="off" maxLength={256} required /></label>}
    {!login && <TesterFields selected={user?.platforms ?? ['web']} emails={user?.announcement_emails} />}
    <div className="form-actions"><button className="button primary">{login ? 'Entrar' : profile ? 'Salvar perfil' : 'Criar conta'}</button>
      {!profile && <button className="button quiet" type="button" onClick={toggle}>{login ? 'Criar uma conta' : 'Já tenho conta'}</button>}
    </div>
  </SubmitForm>;
}

export function ProjectForm({ project, session, onSave }: { project?: Project; session: Session; onSave: (id: string) => void }) {
  const [platform, setPlatform] = useState<Platform>(project?.platform ?? 'web');
  const hint = {
    web: 'Opcional. Inclua dados de acesso ou cenários que gostaria de testar.',
    android: 'Explique como entrar no teste do Google Play ou acessar esta versão.',
    ios: 'Explique como aceitar o convite do TestFlight ou acessar esta versão.',
  };

  async function submit(data: FormData) {
    if (session.directUploads) await stageUploads(data, 'cover', project?.id ?? '');
    const path = project ? projectApi(project.id) + '/edit' : '/api/projects';
    const result = await api<{ id: string }>(path, data);
    onSave(project?.id ?? result.id);
  }

  return <SubmitForm onSubmit={submit}>
    <label>Nome<input name="name" maxLength={100} defaultValue={project?.name} required /></label>
    <label>Plataforma<select name="platform" value={platform} onChange={event => setPlatform(event.target.value as Platform)}>
      {Object.entries(platformLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>
    <label>Link do projeto<input name="url" type="url" maxLength={2048} placeholder="https://…" defaultValue={project?.url} required /></label>
    <label>Descrição<textarea name="description" maxLength={1600} rows={3} defaultValue={project?.description} required /></label>
    <label>Instruções de teste<small>{hint[platform]}</small>
      <textarea name="instructions" maxLength={2000} rows={2} defaultValue={project?.instructions} required={platform !== 'web'} />
    </label>
    <label>{project?.has_cover ? 'Trocar imagem de capa' : 'Imagem de capa'}
      <small>PNG, JPEG ou WebP de até 5 MB</small><input name="cover" type="file" accept={imageTypes} />
    </label>
    {Boolean(project?.has_cover) && <label className="check"><input name="remove_cover" type="checkbox" value="yes" />Remover a capa atual</label>}
    <div className="form-actions"><button className="button primary">Salvar projeto</button></div>
  </SubmitForm>;
}

export function ReviewForm({ detail, session, onSave }: { detail: ProjectDetail; session: Session; onSave: (ticketId?: string) => void }) {
  const [reportBug, setReportBug] = useState(false);
  async function submit(data: FormData) {
    if (session.directUploads) await stageUploads(data, 'evidence', detail.project.id);
    const result = await api<{ ticketId?: string }>(projectApi(detail.project.id) + '/reviews', data);
    onSave(result.ticketId);
  }
  return <SubmitForm onSubmit={submit}>
    <label>Comentário<textarea name="feedback" maxLength={2000} rows={3} placeholder="Como foi testar este projeto?" defaultValue={detail.myReview?.feedback} /></label>
    <label className="check"><input name="report_bug" type="checkbox" value="yes" checked={reportBug} onChange={event => setReportBug(event.target.checked)} />Encontrei um bug</label>
    <fieldset className="fields bug-fields" hidden={!reportBug} disabled={!reportBug}>
      <legend>Relato do bug</legend>
      <p className="muted text-sm">Descreva o que você observou ou anexe uma evidência.</p>
      <label>{reportLabels.title}<input name="title" maxLength={140} /></label>
      <label>{reportLabels.observed}<textarea name="observed" maxLength={2500} rows={3} /></label>
      <label>{reportLabels.expected}<textarea name="expected" maxLength={1500} rows={2} /></label>
      <label>{reportLabels.steps}<textarea name="steps" maxLength={2500} rows={2} /></label>
      <label>{reportLabels.environment}<input name="environment" maxLength={300} placeholder={detail.project.platform === 'web' ? 'Ex.: Chrome no Windows' : 'Ex.: aparelho, sistema e versão do app'} /></label>
      <label>Evidências <small>Até 4 arquivos e 25 MB no total. PNG, JPEG ou WebP até 5 MB por imagem. MP4 ou WebM até 20 MB por vídeo.</small>
        <input type="file" name="evidence" accept={evidenceTypes} multiple />
      </label>
      {session.aiEnabled && <label className="check"><input name="allow_gemini" type="checkbox" value="yes" />
        <span>Autorizar o envio do relato e, se necessário, de uma imagem ou de um quadro e trecho de áudio ao Google Gemini. O título pode ajudar a comparar relatos do mesmo projeto. No plano gratuito, o Google pode usar o conteúdo para melhorar seus serviços.</span>
      </label>}
    </fieldset>
    <div className="form-actions"><button className="button primary">Enviar review</button></div>
  </SubmitForm>;
}
