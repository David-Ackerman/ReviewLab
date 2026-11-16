'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ImagePlus, Monitor, Smartphone, Upload, X } from 'lucide-react';
import { platformLabels, reportLabels, type Platform, type Project, type ProjectDetail, type Session } from '@reviewlab/api/contracts';
import { api, errorMessage, evidenceTypes, imageTypes, projectApi, stageUploads } from '../lib/client';
import { cn } from '../lib/utils';
import { Button, buttonVariants } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Input, Textarea } from './ui/input';

type Submit = (data: FormData) => Promise<void>;

export function Modal({ eyebrow, title, description, onClose, children }: {
  eyebrow?: string; title: string; description: string; onClose: () => void; children: ReactNode;
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
      <header className="shrink-0 border-b border-border py-5 pr-20 pl-5 sm:pl-7">
        {eyebrow && <p className="mb-1 truncate text-xs text-muted-foreground">{eyebrow}</p>}
        <DialogTitle className="text-[22px] leading-tight font-bold tracking-tight">{title}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">{description}</DialogDescription>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-6 sm:px-7">{children}</div>
    </DialogContent>
  </Dialog>;
}

/** Rodapé fixo do painel lateral, com atalho de envio e cancelamento. */
function SheetFooter({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 -mx-5 mt-auto flex items-center gap-2.5 border-t border-border bg-card px-5 py-4 sm:-mx-7 sm:px-7">
    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><kbd>Ctrl Enter</kbd>enviar</span>
    <DialogClose className={cn(buttonVariants({ variant: 'ghost' }), 'ml-auto')}>Cancelar</DialogClose>
    {children}
  </div>;
}

export function SubmitForm({ onSubmit, children, inline = false, className }: { onSubmit: Submit; children: ReactNode; inline?: boolean; className?: string }) {
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

  function shortcut(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  return <form onSubmit={submit} onKeyDown={shortcut} onChange={() => { if (error) setError(''); }} aria-busy={busy} className={cn(!inline && 'flex flex-1 flex-col', className)}>
    {error && <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
    <fieldset className={inline ? 'flex min-w-0 flex-wrap items-end gap-2' : 'flex min-w-0 flex-1 flex-col gap-5'} disabled={busy}>
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
    <legend className="text-[13px] font-semibold">{title}</legend>
    <p className="mb-2 text-xs text-muted-foreground" id={id + '-hint'}>{hint}</p>
    <div className="grid gap-2 sm:grid-cols-3">
      {platformOptions.map(platform => {
        const inputId = id + '-' + platform;
        const checked = selected?.includes(platform) ?? false;
        const Icon = platform === 'web' ? Monitor : Smartphone;
        return <label htmlFor={inputId} key={platform}
          className="flex min-w-0 cursor-pointer items-start gap-2.5 rounded-[10px] border border-input bg-card p-3 hover:bg-muted/60 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-subtle">
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

export function CheckField({ name, children, defaultChecked, checked, onChange, disabled, className }: {
  name: string; children: ReactNode; defaultChecked?: boolean; checked?: boolean; onChange?: (checked: boolean) => void; disabled?: boolean; className?: string;
}) {
  const id = useId();
  return <label htmlFor={id} className={cn('flex min-w-0 items-start gap-2.5 text-sm leading-relaxed', className)}>
    <Checkbox id={id} name={name} value="yes" defaultChecked={defaultChecked} checked={checked} disabled={disabled}
      onCheckedChange={onChange && (value => onChange(value === true))} />
    <span>{children}</span>
  </label>;
}

const fieldClass = 'grid min-w-0 gap-1.5 text-[13px] font-semibold';
const hintClass = 'text-xs font-normal text-muted-foreground';

const sizeFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const fileSize = (bytes: number) => bytes >= 1024 * 1024 ? sizeFormat.format(bytes / 1024 / 1024) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';

/**
 * Área de arquivos com arrastar e soltar e colar (Ctrl V). Os arquivos ficam num input real,
 * então o FormData do formulário continua igual ao de um input comum.
 */
function FileDrop({ name, accept, max, title, hint, icon: Icon = Upload }: {
  name: string; accept: string; max: number; title: string; hint: string; icon?: typeof Upload;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const allowed = accept.split(',');

  function sync(next: File[]) {
    const kept = next.filter(file => allowed.includes(file.type)).slice(0, max);
    const transfer = new DataTransfer();
    kept.forEach(file => transfer.items.add(file));
    if (input.current) input.current.files = transfer.files;
    setFiles(kept);
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pasted = [...(event.clipboardData?.files ?? [])];
      if (!pasted.length || !input.current || input.current.disabled || input.current.closest('[hidden]')) return;
      event.preventDefault();
      sync([...(max === 1 ? [] : files), ...pasted]);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  return <div className="grid gap-2">
    <label htmlFor={id}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); sync([...(max === 1 ? [] : files), ...event.dataTransfer.files]); }}
      className={cn('relative flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-input bg-card p-5 text-center hover:border-primary focus-within:border-ring',
        dragging && 'border-primary bg-primary-subtle')}>
      <Icon size={20} className="text-muted-foreground" aria-hidden />
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs font-normal text-muted-foreground">{hint}</span>
      <input ref={input} id={id} name={name} type="file" accept={accept} multiple={max > 1} className="sr-only"
        onChange={event => sync([...(max === 1 ? [] : files), ...(event.target.files ?? [])])} />
    </label>
    {files.map((file, index) => <div key={file.name + index} className="flex items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-2 text-[13px] font-normal">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted font-mono text-[10px] text-soft uppercase">{file.type.split('/')[1]?.slice(0, 4)}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.name}</span>
      <span className="font-mono text-xs text-muted-foreground">{fileSize(file.size)}</span>
      <Button type="button" variant="ghost" size="icon" className="size-8 px-0" aria-label={'Remover ' + file.name}
        onClick={() => sync(files.filter((_, position) => position !== index))}><X size={16} aria-hidden /></Button>
    </div>)}
  </div>;
}

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
      <Input name="url" type="url" maxLength={2048} placeholder="https://…" defaultValue={project?.url} className="font-mono text-[13px]" required />
    </label>
    <label className={fieldClass}>Descrição
      <Textarea name="description" maxLength={1600} rows={3} defaultValue={project?.description} placeholder="O que é o projeto e o que está pronto para testar?" required />
    </label>
    <div className={fieldClass}>
      <label htmlFor="project-instructions">Como testar{!mobile && ' (opcional)'}</label>
      <small className={hintClass} id="instructions-hint">{mobile
        ? 'Explique ' + mobileHints.join(' e ') + '. Um passo por linha.'
        : 'Um passo por linha. Inclua dados de acesso ou cenários que gostaria de testar.'}</small>
      <Textarea id="project-instructions" name="instructions" aria-describedby="instructions-hint" maxLength={2000} rows={4}
        className="font-mono text-[13px] leading-[1.7]" defaultValue={project?.instructions} required={mobile} />
    </div>
    <label className={fieldClass}>Meta de reviews
      <Input className="max-w-32 font-mono" name="review_goal" type="number" min={1} max={1000} step={1} defaultValue={project?.review_goal ?? 1} required />
    </label>
    <div className={fieldClass}>
      <span>{project?.has_cover ? 'Trocar imagem do projeto' : 'Imagem do projeto (opcional)'}</span>
      <FileDrop name="cover" accept={imageTypes} max={1} icon={ImagePlus} title="Arraste uma imagem ou cole com Ctrl V" hint="PNG, JPEG ou WebP até 5 MB" />
    </div>
    {Boolean(project?.has_cover) && <CheckField name="remove_cover">Remover a imagem atual</CheckField>}
    <SheetFooter><Button>{project ? 'Salvar alterações' : 'Salvar rascunho'}</Button></SheetFooter>
  </SubmitForm>;
}

function ReviewKind({ bug, onChange }: { bug: boolean; onChange: (bug: boolean) => void }) {
  const options = [
    { value: false, title: 'Só feedback', hint: 'Sem bugs para relatar' },
    { value: true, title: 'Encontrei um bug', hint: 'Cria um ticket para o dono' },
  ];
  return <div role="radiogroup" aria-label="Tipo de review" className="grid grid-cols-2 gap-2.5">
    {options.map(option => <button key={String(option.value)} type="button" role="radio" aria-checked={bug === option.value} onClick={() => onChange(option.value)}
      className="flex min-h-16 flex-col items-start gap-0.5 rounded-[10px] border border-input bg-card px-3.5 py-3 text-left aria-checked:border-[1.5px] aria-checked:border-primary aria-checked:bg-primary-subtle">
      <span className="text-sm font-semibold">{option.title}</span>
      <span className="text-xs text-muted-foreground">{option.hint}</span>
    </button>)}
  </div>;
}

export function ReviewForm({ detail, session, onSave }: { detail: ProjectDetail; session: Session; onSave: (ticketId?: string) => void }) {
  const [reportBug, setReportBug] = useState(false);
  async function submit(data: FormData) {
    if (session.directUploads) await stageUploads(data, 'evidence', detail.project.id);
    const result = await api<{ ticketId?: string }>(projectApi(detail.project.id) + '/reviews', data);
    onSave(result.ticketId);
  }
  return <SubmitForm onSubmit={submit}>
    <label className={fieldClass}>Como foi o teste?
      <Textarea name="feedback" maxLength={2000} rows={3} placeholder="O que funcionou bem, o que confundiu, o que faltou." defaultValue={detail.myReview?.feedback} />
    </label>
    <ReviewKind bug={reportBug} onChange={setReportBug} />
    {reportBug && <input type="hidden" name="report_bug" value="yes" />}
    <fieldset className="grid min-w-0 gap-4 rounded-lg border border-border bg-background p-4 sm:p-5" hidden={!reportBug} disabled={!reportBug}>
      <legend className="sr-only">Relato do bug</legend>
      <label className={fieldClass}>{reportLabels.title}<Input name="title" maxLength={140} placeholder="Ex.: Login trava após código 2FA" /></label>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className={fieldClass}>{reportLabels.observed}<Textarea name="observed" maxLength={2500} rows={3} /></label>
        <label className={fieldClass}>{reportLabels.expected}<Textarea name="expected" maxLength={1500} rows={3} /></label>
      </div>
      <label className={fieldClass}>{reportLabels.steps}
        <Textarea name="steps" maxLength={2500} rows={3} className="font-mono text-[13px] leading-[1.7]" placeholder={'1. Abrir o app\n2. …'} />
      </label>
      <label className={fieldClass}>{reportLabels.environment}
        <Input name="environment" maxLength={300} className="font-mono text-[13px]" placeholder="Ex.: Pixel 8 · Android 15 · build 1.4.2" />
      </label>
      <div className={fieldClass}>
        <span>Evidências</span>
        <FileDrop name="evidence" accept={evidenceTypes} max={4} title="Arraste arquivos ou cole com Ctrl V"
          hint="Até 4 arquivos, 25 MB no total · PNG, JPEG, WebP até 5 MB · MP4, WebM até 20 MB" />
      </div>
      {session.aiEnabled && <CheckField name="allow_gemini" disabled={!reportBug} className="rounded-md bg-muted p-3 text-[13px]">
        <strong className="font-semibold">Permitir triagem com Gemini.</strong>{' '}
        <span className="text-soft">Envia o relato e, se necessário, uma imagem ou um quadro e trecho de áudio ao Google Gemini para achar duplicatas. Não envie dados pessoais: no plano gratuito, o Google pode usar o conteúdo para melhorar seus serviços.</span>
      </CheckField>}
    </fieldset>
    <SheetFooter><Button>{reportBug ? 'Enviar e abrir ticket' : detail.myReview ? 'Atualizar review' : 'Enviar review'}</Button></SheetFooter>
  </SubmitForm>;
}
