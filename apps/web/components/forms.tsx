'use client';

import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { platformLabels, reportLabels, type Platform, type Project, type ProjectDetail, type Session } from '@reviewlab/api/contracts';
import { api, errorMessage, evidenceTypes, imageTypes, projectApi, stageUploads } from '../lib/client';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Input, Textarea } from './ui/input';

type Submit = (data: FormData) => Promise<void>;

export function Modal({ title, description, onClose, children }: {
  title: string; description: string; onClose: () => void; children: ReactNode;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (opener.current?.isConnected) opener.current.focus();
      }}
    >
      <header className="shrink-0 border-b border-border py-4 pr-16 pl-5 sm:pl-7">
        <DialogTitle className="text-xl font-bold tracking-tight">{title}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">{description}</DialogDescription>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-7">{children}</div>
    </DialogContent>
  </Dialog>;
}

export function SubmitForm({ onSubmit, children, inline = false }: { onSubmit: Submit; children: ReactNode; inline?: boolean }) {
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

  return <form onSubmit={submit} onChange={() => { if (error) setError(''); }} aria-busy={busy}>
    {error && <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
    <fieldset className={inline ? 'flex min-w-0 flex-wrap items-end gap-2' : 'grid min-w-0 gap-4'} disabled={busy}>
      {children}
    </fieldset>
    <p className="mt-2 text-xs text-muted-foreground empty:hidden" role="status">{busy ? 'Salvando…' : ''}</p>
  </form>;
}

const platformOptions = Object.keys(platformLabels) as Platform[];
const testerHints: Record<Platform, string> = {
  web: 'Navegador',
  android: 'Android ou Google Play',
  ios: 'iPhone, iPad ou TestFlight',
};

export function PlatformChoices({ title, hint, selected, onChange }: {
  title: string; hint: string; selected?: Platform[]; onChange?: (platform: Platform, checked: boolean) => void;
}) {
  const id = useId();
  return <fieldset className="min-w-0" aria-describedby={id + '-hint'}>
    <legend className="text-sm font-semibold">{title}</legend>
    <p className="mb-2 text-xs text-muted-foreground" id={id + '-hint'}>{hint}</p>
    <div className="grid gap-2 sm:grid-cols-3">
      {platformOptions.map(platform => {
        const inputId = id + '-' + platform;
        const checked = selected?.includes(platform) ?? false;
        const Icon = platform === 'web' ? Monitor : Smartphone;
        return <label htmlFor={inputId} key={platform}
          className="flex min-w-0 cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2.5 hover:bg-muted/60 has-aria-checked:border-primary has-aria-checked:bg-primary/5">
          <Checkbox id={inputId} name="platforms" value={platform} aria-labelledby={inputId + '-label'} aria-describedby={inputId + '-hint'}
            {...(onChange ? { checked, onCheckedChange: value => onChange(platform, value === true) } : { defaultChecked: checked })} />
          <span className="min-w-0">
            <span id={inputId + '-label'} className="flex items-center gap-1.5 text-sm font-semibold"><Icon size={14} aria-hidden />{platformLabels[platform]}</span>
            <small id={inputId + '-hint'} className="block text-xs text-muted-foreground">{testerHints[platform]}</small>
          </span>
        </label>;
      })}
    </div>
  </fieldset>;
}

export function CheckField({ name, children, defaultChecked, checked, onChange, disabled }: {
  name: string; children: ReactNode; defaultChecked?: boolean; checked?: boolean; onChange?: (checked: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  return <label htmlFor={id} className="flex min-w-0 items-start gap-2.5 text-sm">
    <Checkbox id={id} name={name} value="yes" defaultChecked={defaultChecked} checked={checked} disabled={disabled}
      onCheckedChange={onChange && (value => onChange(value === true))} />
    <span>{children}</span>
  </label>;
}

const fieldClass = 'grid min-w-0 gap-1.5 text-sm font-semibold';
const hintClass = 'text-xs font-normal text-muted-foreground';

export function ProjectForm({ project, session, onSave }: { project?: Project; session: Session; onSave: (id: string) => void }) {
  const [selected, setSelected] = useState<Platform[]>(project?.platforms ?? ['web']);
  const mobile = selected.some(platform => platform !== 'web');
  const mobileHints = [
    selected.includes('android') && 'como entrar no teste pelo Android',
    selected.includes('ios') && 'como aceitar o convite do TestFlight',
  ].filter(Boolean);

  async function submit(data: FormData) {
    if (!selected.length) throw new Error('Selecione pelo menos uma plataforma.');
    if (session.directUploads) await stageUploads(data, 'cover', project?.id ?? '');
    const path = project ? projectApi(project.id) + '/edit' : '/api/projects';
    const result = await api<{ id: string }>(path, data);
    onSave(project?.id ?? result.id);
  }

  return <SubmitForm onSubmit={submit}>
    <label className={fieldClass}>Nome<Input name="name" maxLength={100} defaultValue={project?.name} required /></label>
    <PlatformChoices title="Plataformas do projeto" hint="Selecione uma ou mais plataformas disponíveis para teste." selected={selected}
      onChange={(platform, checked) => setSelected(current => checked ? [...current, platform] : current.filter(item => item !== platform))} />
    <label className={fieldClass}>Link principal
      <Input name="url" type="url" maxLength={2048} placeholder="https://…" defaultValue={project?.url} required />
    </label>
    <label className={fieldClass}>Descrição
      <Textarea name="description" maxLength={1600} rows={3} defaultValue={project?.description} placeholder="O que é o projeto e o que está pronto para testar?" required />
    </label>
    <div className={fieldClass}>
      <label htmlFor="project-instructions">Instruções de teste{!mobile && ' (opcional)'}</label>
      <small className={hintClass} id="instructions-hint">{mobile
        ? 'Explique ' + mobileHints.join(' e ') + '. Inclua links adicionais, se houver.'
        : 'Inclua dados de acesso ou cenários que gostaria de testar.'}</small>
      <Textarea id="project-instructions" name="instructions" aria-describedby="instructions-hint" maxLength={2000} rows={2} defaultValue={project?.instructions} required={mobile} />
    </div>
    <div className={fieldClass}>
      <label htmlFor="project-cover">{project?.has_cover ? 'Trocar imagem de capa' : 'Imagem de capa (opcional)'}</label>
      <small className={hintClass} id="cover-hint">PNG, JPEG ou WebP de até 5 MB.</small>
      <Input id="project-cover" name="cover" type="file" aria-describedby="cover-hint" accept={imageTypes} />
    </div>
    {Boolean(project?.has_cover) && <CheckField name="remove_cover">Remover a capa atual</CheckField>}
    <div className="flex pt-1"><Button>{project ? 'Salvar alterações' : 'Cadastrar projeto'}</Button></div>
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
    <label className={fieldClass}>Comentário
      <Textarea name="feedback" maxLength={2000} rows={3} placeholder="Como foi testar este projeto?" defaultValue={detail.myReview?.feedback} />
    </label>
    <CheckField name="report_bug" checked={reportBug} onChange={setReportBug}>Encontrei um bug</CheckField>
    <fieldset className="grid min-w-0 gap-3 rounded-lg border border-border p-3" hidden={!reportBug} disabled={!reportBug}>
      <legend className="px-1 text-sm font-semibold">Relato do bug</legend>
      <p className="text-sm text-muted-foreground">Descreva o que você observou ou anexe uma evidência.</p>
      <label className={fieldClass}>{reportLabels.title}<Input name="title" maxLength={140} /></label>
      <label className={fieldClass}>{reportLabels.observed}<Textarea name="observed" maxLength={2500} rows={3} /></label>
      <label className={fieldClass}>{reportLabels.expected}<Textarea name="expected" maxLength={1500} rows={2} /></label>
      <label className={fieldClass}>{reportLabels.steps}<Textarea name="steps" maxLength={2500} rows={2} /></label>
      <label className={fieldClass}>{reportLabels.environment}
        <Input name="environment" maxLength={300} placeholder="Ex.: Chrome no Windows ou versão do app no Android" />
      </label>
      <div className={fieldClass}>
        <label htmlFor="review-evidence">Evidências</label>
        <small className={hintClass} id="evidence-hint">Até 4 arquivos e 25 MB no total. PNG, JPEG ou WebP até 5 MB por imagem. MP4 ou WebM até 20 MB por vídeo.</small>
        <Input id="review-evidence" type="file" name="evidence" aria-describedby="evidence-hint" accept={evidenceTypes} multiple />
      </div>
      {session.aiEnabled && <CheckField name="allow_gemini" disabled={!reportBug}>
        Autorizar o envio do relato e, se necessário, de uma imagem ou de um quadro e trecho de áudio ao Google Gemini.
        O título pode ajudar a comparar relatos do mesmo projeto. No plano gratuito, o Google pode usar o conteúdo para melhorar seus serviços.
      </CheckField>}
    </fieldset>
    <div className="flex pt-1"><Button>Enviar review</Button></div>
  </SubmitForm>;
}
