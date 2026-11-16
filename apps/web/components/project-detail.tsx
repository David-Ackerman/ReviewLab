'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowUpRight, Bot, CircleCheck, FolderOpen, Globe, Mail, MessageSquare, Pencil, Rocket, Share2, Sparkles, Ticket as TicketIcon,
} from 'lucide-react';
import {
  platformLabels, projectStatusLabels, reportLabels, reviewsRemaining, ticketStatusLabels,
  type AnnouncementSummary, type Platform, type Project, type ProjectDetail, type ProjectStatus, type Session, type Ticket, type TicketStatus,
} from '@reviewlab/api/contracts';
import { api, errorMessage, formatDate, formatDateTime, projectApi, shortId, timeAgo } from '../lib/client';
import { projectOwnerLabel } from '../lib/locale';
import { cn } from '../lib/utils';
import { AndroidTesters } from './android-testers';
import { Button, Initials, buttonVariants } from './ui/button';

const panel = 'min-w-0 surface p-5 sm:p-[22px]';
const asidePanel = 'flex min-w-0 flex-col gap-3 surface p-[18px]';
const asideTitle = 'text-[13px] font-semibold text-muted-foreground';
const prose = 'text-[15px] leading-relaxed wrap-anywhere whitespace-pre-wrap text-soft';

export function PlatformTags({ platforms }: { platforms: Platform[] }) {
  return <ul className="flex flex-wrap gap-1.5" aria-label="Plataformas">
    {platforms.map(platform => <li key={platform} className="rounded-[5px] border border-border px-1.5 py-0.5 font-mono text-[11px] text-soft">{platformLabels[platform].toLowerCase()}</li>)}
  </ul>;
}

type StatusShape = 'open' | 'progress' | 'done' | 'dashed';
const statusTones: Record<string, { shape: StatusShape; text: string; bg: string }> = {
  open: { shape: 'open', text: 'text-status-open', bg: 'bg-status-open-muted' },
  working: { shape: 'progress', text: 'text-status-working', bg: 'bg-status-working-muted' },
  fixed: { shape: 'done', text: 'text-status-done', bg: 'bg-status-done-muted' },
  unreproduced: { shape: 'dashed', text: 'text-soft', bg: 'bg-muted' },
  dev: { shape: 'open', text: 'text-soft', bg: 'bg-muted' },
  review: { shape: 'progress', text: 'text-primary-strong', bg: 'bg-primary-muted' },
  prod: { shape: 'done', text: 'text-status-done', bg: 'bg-status-done-muted' },
};

// A forma do ícone repete a informação da cor para quem não distingue os tons.
export function StatusIcon({ state, className }: { state: string; className?: string }) {
  const { shape } = statusTones[state] ?? statusTones.unreproduced;
  return <svg width="12" height="12" viewBox="0 0 12 12" className={cn('shrink-0', className)} aria-hidden>
    {shape === 'done' ? <>
      <circle cx="6" cy="6" r="5" fill="currentColor" />
      <path d="M3.6 6.1l1.6 1.6 3.2-3.3" fill="none" stroke="var(--card)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </> : <>
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray={shape === 'dashed' ? '2 1.6' : undefined} />
      {shape === 'progress' && <path d="M6 1.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" />}
    </>}
  </svg>;
}

/** Tickets usam pílula com ícone; status de projeto usa etiqueta retangular, como no design. */
export function StatusTag({ state, label, compact = false }: { state: string; label: string; compact?: boolean }) {
  const tone = statusTones[state] ?? statusTones.unreproduced;
  const project = state in projectStatusLabels;
  return <span className={cn('inline-flex shrink-0 items-center gap-1.5 font-semibold whitespace-nowrap', tone.text, tone.bg,
    project ? 'rounded-md' : 'rounded-full', compact ? 'px-1.5 py-px text-[11px]' : 'px-2 py-[3px] text-xs')}>
    {!project && <StatusIcon state={state} />}{label}
  </span>;
}

export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const percent = Math.min(100, Math.round(value / Math.max(1, max) * 100));
  return <span className={cn('block h-1 overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label="Progresso de reviews">
    <span className="block h-full rounded-full bg-primary" style={{ width: percent + '%' }} />
  </span>;
}

/** Miniatura do projeto: a imagem enviada pelo dono ou as iniciais do nome. */
export function ProjectTile({ project, version, className }: { project: Project; version?: number; className?: string }) {
  if (project.has_cover) {
    return <img src={projectApi(project.id) + '/cover' + (version ? '?v=' + version : '')} alt="" loading="lazy"
      className={cn('shrink-0 border border-border bg-muted object-cover', className)} />;
  }
  return <Initials name={project.name} className={cn('border border-border', className)} />;
}

const eventLabels = {
  ...ticketStatusLabels,
  retest_requested: 'Reteste solicitado',
  retest_confirmed: 'Correção confirmada',
  retest_reopened: 'Ticket reaberto',
};

/** Executa uma ação da API com estado de envio e erro, sem precisar de um formulário. */
function useAction(onChange: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      onChange(message);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return <Button type="button" variant="outline" size="sm" className={className} onClick={async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* A área de transferência pode estar bloqueada; o texto continua selecionável. */ }
  }}>{copied ? 'Copiado' : label}</Button>;
}

function isTyping() {
  const element = document.activeElement;
  return element instanceof HTMLElement && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
    || Boolean(document.querySelector('[role="dialog"]'));
}

type Filter = 'action' | 'retest' | 'all';
const needsAction = (ticket: Ticket) => ticket.status === 'open' || ticket.status === 'working';

function TicketDetail({ ticket, owner, tickets, onChange, onShowReview }: {
  ticket: Ticket; owner: boolean; tickets: Ticket[]; onChange: (message: string) => void; onShowReview: (id: string) => void;
}) {
  const path = '/api/tickets/' + ticket.id;
  const { busy, error, run } = useAction(onChange);
  const files = ticket.attachments.map(file => ({ ...file, url: path + '/attachments/' + file.id }));
  if (ticket.has_evidence) files.unshift({ id: 'legacy', name: 'Captura de tela', type: 'image/', url: path + '/evidence' });
  const pending = ticket.retest_request_id;
  const triaging = ['queued', 'running'].includes(ticket.triage_state ?? '');
  const duplicate = ticket.duplicate_id ? tickets.find(item => item.id === ticket.duplicate_id) : undefined;
  const fields = (Object.keys(reportLabels) as Array<keyof typeof reportLabels>).filter(key => key !== 'title');
  const mono = (key: string) => key === 'steps' || key === 'environment';
  const setStatus = (status: TicketStatus) => run(() => api(path + '/status', { status }), 'Status atualizado.');
  const retest = (outcome: string) => run(() => api(path + '/retest', { outcome, requestId: pending }),
    outcome === 'request' ? 'Reteste solicitado.' : outcome === 'confirmed' ? 'Correção confirmada.' : 'Ticket reaberto.');

  return <article className="flex min-w-0 flex-col gap-5 px-1 py-6 sm:px-9 sm:pt-7 sm:pb-8" aria-labelledby={'ticket-title-' + ticket.id}>
    <header className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-xs text-muted-foreground">{shortId(ticket.id)}</span>
        <StatusTag state={ticket.status} label={ticketStatusLabels[ticket.status]} />
        <CopyButton value={window.location.origin + window.location.pathname + '#ticket-' + ticket.id} label="Copiar link" className="h-7 px-2 text-[11px]" />
      </div>
      <h2 id={'ticket-title-' + ticket.id} className="text-2xl leading-tight font-bold tracking-[-0.02em] wrap-anywhere">{ticket.title || 'Bug sem título'}</h2>
      <p className="text-[13px] text-muted-foreground">Relatado por <strong className="font-semibold text-foreground">{ticket.reporter}</strong> · {formatDateTime(ticket.created_at)} ·{' '}
        <button type="button" className="font-medium text-primary hover:text-primary-strong hover:underline" onClick={() => onShowReview(ticket.review_id)}>ver review de origem</button></p>
    </header>

    {(triaging || ticket.suggestion || ticket.duplicate_id || ticket.missing.length > 0) && <section aria-label="Triagem" className="flex flex-col gap-2.5 rounded-[10px] border border-input bg-card px-4 py-3.5">
      <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold"><Sparkles size={15} className="text-primary" aria-hidden />Triagem automática
        {ticket.suggestion && <span className="font-mono text-[11px] font-medium text-muted-foreground">confiança {ticket.suggestion.confidence}</span>}
        {triaging && <span className="font-mono text-[11px] font-medium text-muted-foreground">em andamento…</span>}
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        {ticket.suggestion && <span className="rounded-md bg-muted px-2 py-1 text-soft">Categoria: {ticket.suggestion.category}</span>}
        {ticket.duplicate_id && <a className="rounded-md bg-muted px-2 py-1 no-underline" href={'#ticket-' + ticket.duplicate_id}>Possível duplicata de {shortId(duplicate?.id ?? ticket.duplicate_id)}</a>}
        <span className={cn('rounded-md px-2 py-1', ticket.missing.length ? 'bg-status-open-muted text-status-open' : 'bg-status-done-muted text-status-done')}>
          {ticket.missing.length ? 'Faltam: ' + ticket.missing.map(field => reportLabels[field].toLowerCase()).join(', ') : 'Campos completos'}
        </span>
      </div>
      {ticket.suggestion && <p className="text-[13px] leading-relaxed text-soft"><strong className="font-semibold text-foreground">{ticket.suggestion.title}.</strong> {ticket.suggestion.summary}</p>}
    </section>}

    <dl className="grid gap-x-7 gap-y-[18px] sm:grid-cols-2">
      {fields.map(key => <div key={key} className="flex min-w-0 flex-col gap-1.5">
        <dt className="text-xs font-semibold text-muted-foreground">{reportLabels[key]}</dt>
        <dd className={cn('wrap-anywhere whitespace-pre-line', ticket[key] ? 'text-foreground/90' : 'text-muted-foreground italic',
          mono(key) ? 'font-mono text-[13px] leading-[1.8]' : 'text-sm leading-relaxed')}>{ticket[key] || 'Não informado'}</dd>
      </div>)}
    </dl>

    {files.length > 0 && <section aria-label="Evidências" className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-3">
      {files.map(file => <figure className="flex min-w-0 flex-col gap-1.5" key={file.id}>
        {file.type.startsWith('video/')
          ? <video className="max-h-56 w-full rounded-[10px] border border-border bg-muted" controls preload="metadata" src={file.url} aria-label={file.name} />
          : <img className="max-h-56 w-full rounded-[10px] border border-border bg-muted object-contain" src={file.url} alt={file.name} loading="lazy" />}
        <figcaption><a className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground no-underline hover:text-foreground" href={file.url} target="_blank" rel="noreferrer">
          <ArrowDownToLine size={12} aria-hidden />{file.name}</a></figcaption>
      </figure>)}
    </section>}

    {ticket.events.length > 0 && <details className="text-[13px] text-muted-foreground">
      <summary className="min-h-8 font-semibold text-soft">Histórico</summary>
      <ol className="mt-2 list-decimal pl-5 font-mono text-xs leading-[1.9]">
        {ticket.events.map((event, index) => <li key={index}>{formatDateTime(event.created_at)} · {eventLabels[event.status].toLowerCase()} · {event.actor}</li>)}
      </ol>
    </details>}

    {(owner || (ticket.status === 'fixed' && pending)) && <footer className="sticky bottom-20 mt-auto flex flex-wrap items-center gap-2.5 surface px-4 py-3.5 lg:bottom-3">
      {owner ? <>
        <div role="radiogroup" aria-label="Status do ticket" className="flex flex-wrap gap-0.5 rounded-[9px] bg-background p-[3px]">
          {(Object.entries(ticketStatusLabels) as Array<[TicketStatus, string]>).map(([status, label]) => <button key={status} type="button" role="radio"
            aria-checked={ticket.status === status} disabled={busy} onClick={() => ticket.status !== status && void setStatus(status)}
            className="h-9 rounded-[7px] px-3 text-[13px] font-medium text-soft hover:text-foreground aria-checked:bg-muted aria-checked:font-semibold aria-checked:text-foreground disabled:opacity-60">{label}</button>)}
        </div>
        <Button variant="outline" className="ml-auto" disabled={busy || ticket.status !== 'fixed' || Boolean(pending)} onClick={() => void retest('request')}>
          {pending ? 'Reteste solicitado' : 'Solicitar reteste'}
        </Button>
        <p className="basis-full text-xs text-muted-foreground">{ticket.status !== 'fixed' ? `Marque como Corrigido para pedir que ${ticket.reporter} reteste a correção.`
          : pending ? `Aguardando ${ticket.reporter} retestar a correção.` : `Peça para ${ticket.reporter} confirmar se a correção funcionou.`}</p>
      </> : <>
        <p className="basis-full text-sm">O dono marcou este bug como corrigido e pediu que você teste de novo.</p>
        <Button disabled={busy} onClick={() => void retest('confirmed')}><CircleCheck size={16} aria-hidden />Confirmar correção</Button>
        <Button variant="outline" disabled={busy} onClick={() => void retest('reopened')}>O bug ainda ocorre</Button>
      </>}
      {error && <p role="alert" className="basis-full text-sm text-destructive">{error}</p>}
    </footer>}
  </article>;
}

function TicketsPanel({ tickets, owner, selected, onSelect, onChange, onShowReview }: {
  tickets: Ticket[]; owner: boolean; selected?: string; onSelect: (id: string) => void; onChange: (message?: string) => void; onShowReview: (id: string) => void;
}) {
  const counts = { action: tickets.filter(needsAction).length, retest: tickets.filter(ticket => ticket.status === 'fixed').length, all: tickets.length };
  const [filter, setFilter] = useState<Filter>(owner && counts.action ? 'action' : 'all');
  const matches = (key: Filter) => (ticket: Ticket) => key === 'all' || (key === 'action' ? needsAction(ticket) : ticket.status === 'fixed');
  const visible = tickets.filter(matches(filter));
  const pickFilter = (key: Filter) => {
    setFilter(key);
    const first = tickets.find(matches(key));
    if (first) onSelect(first.id);
  };
  const current = tickets.find(ticket => ticket.id === selected) ?? visible[0];
  const position = visible.findIndex(ticket => ticket.id === current?.id);

  // Fixa o ticket mostrado como seleção, para ele continuar aberto depois de mudar de status e sair do filtro.
  useEffect(() => {
    if (!selected && current) onSelect(current.id);
  }, [selected, current, onSelect]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping()) return;
      const key = event.key.toLowerCase();
      if (key !== 'j' && key !== 'k') return;
      const next = visible[Math.min(visible.length - 1, Math.max(0, position + (key === 'j' ? 1 : -1)))];
      if (next) {
        event.preventDefault();
        onSelect(next.id);
        document.getElementById('ticket-row-' + next.id)?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!tickets.length) return <p className="flex items-center gap-2 rounded-md bg-muted p-4 text-sm text-muted-foreground"><FolderOpen size={18} aria-hidden />Os relatos de bugs aparecem aqui.</p>;
  const filters: Array<[Filter, string]> = [['action', 'Precisam de ação'], ['retest', 'Em reteste'], ['all', 'Todos']];

  return <div className="flex flex-col overflow-hidden surface">
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-sidebar px-4 py-3 sm:px-5">
      <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-1.5">
        {filters.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => pickFilter(key)}
          className="h-8 rounded-full border border-border px-3 text-xs font-medium text-soft hover:text-foreground aria-pressed:border-primary aria-pressed:bg-primary-subtle aria-pressed:font-semibold aria-pressed:text-primary-strong">
          {label} · {counts[key]}
        </button>)}
      </div>
      {tickets.some(ticket => ['queued', 'running'].includes(ticket.triage_state ?? '')) && <Button variant="ghost" size="sm" onClick={() => onChange()}>Atualizar triagem</Button>}
      <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><kbd>J</kbd><kbd>K</kbd>navegar</span>
    </div>
    <div className="flex flex-wrap items-stretch">
      <ul aria-label="Lista de tickets" className="min-w-0 flex-[1_1_20rem] border-border bg-sidebar lg:max-w-[26rem] lg:border-r">
        {visible.length ? visible.map(ticket => {
          const active = ticket.id === current?.id;
          const evidence = ticket.attachments.length + (ticket.has_evidence ? 1 : 0);
          return <li key={ticket.id}>
            <button id={'ticket-row-' + ticket.id} type="button" aria-current={active || undefined} onClick={() => onSelect(ticket.id)}
              className="flex w-full flex-col gap-1.5 border-b border-border px-5 py-4 text-left hover:bg-muted/60 aria-[current]:bg-primary-subtle aria-[current]:shadow-[inset_3px_0_0_var(--primary)]">
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{shortId(ticket.id)}</span>
                <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold', (statusTones[ticket.status] ?? statusTones.unreproduced).text)}>
                  <StatusIcon state={ticket.status} />{ticketStatusLabels[ticket.status]}{ticket.status === 'fixed' && ticket.retest_request_id ? ' · reteste pedido' : ''}
                </span>
              </span>
              <span className="text-sm font-semibold wrap-anywhere">{ticket.title || 'Bug sem título'}</span>
              {ticket.missing.length && needsAction(ticket)
                ? <span className="text-xs text-status-open">Faltam: {ticket.missing.map(field => reportLabels[field].toLowerCase()).join(', ')}</span>
                : <span className="text-xs text-muted-foreground">{ticket.reporter} · {timeAgo(ticket.created_at)}{evidence ? ` · ${evidence} ${evidence === 1 ? 'evidência' : 'evidências'}` : ''}</span>}
            </button>
          </li>;
        }) : <li className="px-5 py-6 text-sm text-muted-foreground">Nenhum ticket neste filtro.</li>}
      </ul>
      <div className="min-w-0 flex-[999_1_32rem]">
        {current ? <TicketDetail key={current.id} ticket={current} owner={owner} tickets={tickets} onChange={onChange} onShowReview={onShowReview} />
          : <p className="p-8 text-sm text-muted-foreground">Selecione um ticket.</p>}
      </div>
    </div>
  </div>;
}

function AnnouncementStatus({ summary, onRefresh }: { summary: AnnouncementSummary; onRefresh: () => void }) {
  const { enabled, queued, accepted, failed, unknown, cancelled } = summary;
  const counts = [
    { label: 'Aceitos pelo provedor', value: accepted },
    { label: 'Na fila', value: queued },
    { label: 'Recusados pelo provedor', value: failed - unknown },
    { label: 'Envio incerto', value: unknown },
    { label: 'Cancelados', value: cancelled },
  ].filter(item => item.value > 0);

  return <section className={panel} aria-labelledby="announcements-title">
    <h2 id="announcements-title" className="flex items-center gap-2 text-base font-semibold"><Mail size={17} className="text-muted-foreground" aria-hidden />Avisos por e-mail</h2>
    <div aria-live="polite" className="mt-3">
      {!enabled && <p className="text-sm text-muted-foreground">O envio está indisponível.</p>}
      {counts.length ? <dl className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
        {counts.map(item => <div className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2.5" key={item.label}>
          <dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="font-mono text-lg font-semibold">{item.value}</dd>
        </div>)}
      </dl> : enabled && <p className="text-sm text-muted-foreground">Nenhum testador inscrito para este anúncio.</p>}
    </div>
    {enabled && queued > 0 && <Button variant="outline" size="sm" className="mt-3" onClick={onRefresh}>Consultar fila</Button>}
  </section>;
}

type Tab = 'overview' | 'reviews' | 'tickets' | 'android' | 'announcements';
const tabHashes: Record<Tab, string> = { overview: '', reviews: '#reviews', tickets: '#tickets', android: '#testadores-android', announcements: '#avisos' };

function tabFromHash(hash: string): { tab: Tab; ticket?: string; review?: string } {
  if (hash.startsWith('#ticket-')) return { tab: 'tickets', ticket: hash.slice(8) };
  if (hash.startsWith('#review-')) return { tab: 'reviews', review: hash.slice(8) };
  const tab = (Object.entries(tabHashes) as Array<[Tab, string]>).find(([, value]) => value && value === hash)?.[0];
  return { tab: tab ?? 'overview' };
}

function Step({ icon: Icon, label, value, current, children }: { icon: typeof Rocket; label: string; value: string; current?: boolean; children?: ReactNode }) {
  return <li className={cn('flex flex-col gap-1 border-border px-4 py-3.5 not-last:border-b sm:not-last:border-r sm:not-last:border-b-0', current && 'bg-primary-subtle')} aria-current={current ? 'step' : undefined}>
    <span className={cn('flex items-center gap-1.5 text-xs', current ? 'text-primary-strong' : 'text-muted-foreground')}><Icon size={13} aria-hidden />{label}</span>
    <span className="text-[15px] font-semibold">{value}</span>
    {children}
  </li>;
}

export function ProjectView({ detail, session, version, onEdit, onReview, onChange }: {
  detail: ProjectDetail; session: Session; version?: number; onEdit: () => void; onReview: () => void; onChange: (message?: string) => void;
}) {
  const { project, reviews, tickets, myReview, emailAnnouncement } = detail;
  const owner = session.user?.id === project.owner_id;
  const android = project.platforms.includes('android');
  const remaining = reviewsRemaining(project);
  const open = tickets.filter(needsAction).length;
  const inRetest = tickets.filter(ticket => ticket.status === 'fixed' && ticket.retest_request_id).length;
  const [tab, setTab] = useState<Tab>('overview');
  const [ticketId, setTicketId] = useState<string>();
  const { busy, error, run } = useAction(message => onChange(message));
  const statuses = (Object.keys(projectStatusLabels) as ProjectStatus[]).filter(status => project.requested_at || status !== 'review');
  const bugsByReview = useMemo(() => tickets.reduce<Record<string, number>>((map, ticket) => ({ ...map, [ticket.review_id]: (map[ticket.review_id] ?? 0) + 1 }), {}), [tickets]);
  const steps = project.instructions.split('\n').map(line => line.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: 'overview', label: 'Visão geral' },
    { key: 'reviews', label: 'Reviews', count: reviews.length },
    ...(owner || tickets.length ? [{ key: 'tickets' as const, label: owner ? 'Tickets' : 'Seus tickets', count: tickets.length }] : []),
    ...(android ? [{ key: 'android' as const, label: 'Testadores Android' }] : []),
    ...(owner && emailAnnouncement ? [{ key: 'announcements' as const, label: 'Avisos' }] : []),
  ];

  function show(next: Tab, options: { ticket?: string; review?: string } = {}) {
    setTab(next);
    if (options.ticket) setTicketId(options.ticket);
    const hash = options.ticket ? '#ticket-' + options.ticket : options.review ? '#review-' + options.review : tabHashes[next];
    window.history.replaceState(null, '', window.location.pathname + window.location.search + hash);
    if (options.review) window.setTimeout(() => document.getElementById('review-' + options.review)?.scrollIntoView({ block: 'center' }));
  }

  useEffect(() => {
    const sync = () => {
      const target = tabFromHash(window.location.hash);
      setTab(target.tab);
      if (target.ticket) setTicketId(target.ticket);
      if (target.review) window.setTimeout(() => document.getElementById('review-' + target.review)?.scrollIntoView({ block: 'center' }));
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping()) return;
      const key = event.key.toLowerCase();
      if (key === 'e' && owner) { event.preventDefault(); onEdit(); }
      if (key === 'r' && !owner && project.requested_at) { event.preventDefault(); onReview(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [owner, onEdit, onReview, project.requested_at]);

  const shareLink = () => {
    const url = new URL(window.location.pathname, session.appOrigin || window.location.origin).href;
    const text = ['Novo projeto para review no ReviewLab!', project.name + ' · ' + project.platforms.map(platform => platformLabels[platform]).join(', '),
      project.description.slice(0, 240), 'Veja os detalhes e envie sua review: ' + url].join('\n\n');
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  };
  const publish = () => run(() => api(projectApi(project.id) + '/request', {}), 'Projeto publicado em Explorar.');
  const host = (() => { try { return new URL(project.url).host; } catch { return project.url; } })();

  const reviewList = (items: typeof reviews) => items.map(review => <article key={review.id} id={'review-' + review.id} className="flex scroll-mt-24 gap-3 border-t border-border py-3.5 target:bg-primary-subtle">
    <Initials name={review.author} className="size-8 rounded-full text-xs font-semibold" />
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-semibold">{review.author}</span>
        <time className="text-muted-foreground" dateTime={review.created_at} title={formatDate(review.created_at)}>{timeAgo(review.created_at)}</time>
        {bugsByReview[review.id] && <button type="button" onClick={() => show('tickets', { ticket: tickets.find(ticket => ticket.review_id === review.id)?.id })}
          className="rounded-full bg-status-open-muted px-2 py-px text-[11px] font-semibold text-status-open">{bugsByReview[review.id]} {bugsByReview[review.id] === 1 ? 'bug' : 'bugs'}</button>}
      </div>
      <p className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap text-soft">{review.feedback || 'Review enviada com relato de bug.'}</p>
    </div>
  </article>);

  return <div className="flex flex-col gap-[22px]">
    <nav aria-label="Trilha" className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <Link href={owner ? '/?meus' : '/'} className="text-muted-foreground no-underline hover:text-foreground">{owner ? 'Meus projetos' : 'Explorar'}</Link>
      <span aria-hidden>/</span><span className="truncate text-foreground" aria-current="page">{project.name}</span>
    </nav>

    <header className="flex flex-wrap items-start justify-between gap-5">
      <div className="flex min-w-0 items-center gap-4">
        <ProjectTile project={project} version={version} className="size-14 rounded-[14px] text-lg" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em] wrap-anywhere">{project.name}</h1>
            {project.requested_at ? <StatusTag state={project.status} label={projectStatusLabels[project.status]} />
              : <span className="rounded-md border border-dashed border-input px-2 py-[3px] text-xs font-semibold text-soft">Rascunho</span>}
          </div>
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
            <span>{project.requested_at ? 'Publicado em ' + formatDate(project.requested_at) : 'Criado em ' + formatDate(project.created_at)}</span>
            {!owner && <><span aria-hidden>·</span><span>por {projectOwnerLabel(project.owner, owner)}</span></>}
            <span aria-hidden>·</span><span className="font-mono text-xs">{project.platforms.map(platform => platformLabels[platform].toLowerCase()).join(' · ')}</span>
            <span aria-hidden>·</span><a href={project.url} target="_blank" rel="noreferrer" className="font-mono text-xs no-underline hover:underline">{host} ↗</a>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {owner ? <>
          <Button variant="outline" onClick={onEdit}><Pencil size={15} aria-hidden />Editar <kbd className="border-0 bg-transparent px-0">E</kbd></Button>
          {project.requested_at && <Button variant="outline" onClick={shareLink}><Share2 size={15} aria-hidden />Compartilhar</Button>}
          {!project.requested_at ? <Button disabled={busy} onClick={() => void publish()}><Rocket size={16} aria-hidden />Publicar em Explorar</Button>
            : open > 0 ? <Button onClick={() => show('tickets')}><TicketIcon size={16} aria-hidden />Triar {open} {open === 1 ? 'ticket' : 'tickets'}</Button>
            : <a className={buttonVariants()} href={project.url} target="_blank" rel="noreferrer">Abrir projeto <ArrowUpRight size={16} aria-hidden /></a>}
        </> : <>
          <a className={buttonVariants({ variant: 'outline' })} href={project.url} target="_blank" rel="noreferrer">Abrir projeto <ArrowUpRight size={16} aria-hidden /></a>
          {project.requested_at && <Button onClick={onReview}><MessageSquare size={16} aria-hidden />{myReview ? 'Editar review' : 'Enviar review'} <kbd className="border-primary-foreground/30 bg-transparent text-primary-foreground/80">R</kbd></Button>}
        </>}
      </div>
    </header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

    {owner && !project.requested_at && <section className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-input bg-card px-4 py-3.5">
      <p className="min-w-0 flex-1 text-sm text-soft">Este rascunho só aparece para você. Publique para que outras pessoas encontrem o projeto em <strong className="text-foreground">Explorar</strong> e enviem reviews.
        {session.emailAnnouncementsEnabled && ' Testadores inscritos nas plataformas do projeto também recebem um aviso por e-mail.'}</p>
    </section>}

    {owner && project.requested_at && <ol aria-label="Ciclo do projeto" className="grid overflow-hidden surface sm:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
      <Step icon={Globe} label="Publicado" value="Em Explorar" />
      <Step icon={Mail} label="Avisos por e-mail" value={!emailAnnouncement?.enabled ? 'Indisponível' : `${emailAnnouncement.accepted} ${emailAnnouncement.accepted === 1 ? 'aceito' : 'aceitos'}`} />
      <Step icon={MessageSquare} label="Reviews" value={`${project.review_count} de ${project.review_goal}${remaining ? ` · faltam ${remaining}` : ' · meta atingida'}`} current={project.status === 'review'}>
        <ProgressBar value={project.review_count} max={project.review_goal} className="mt-1" />
      </Step>
      <Step icon={TicketIcon} label="Tickets" value={tickets.length ? `${open} ${open === 1 ? 'aberto' : 'abertos'} · ${inRetest} em reteste` : 'Nenhum ainda'} />
      <Step icon={Rocket} label="Produção" value={project.status === 'prod' ? 'Em produção' : 'Próximo passo'} current={project.status === 'prod'} />
    </ol>}

    <div role="tablist" aria-label="Seções do projeto" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(item => <button key={item.key} type="button" role="tab" id={'tab-' + item.key} aria-selected={tab === item.key} aria-controls="project-panel"
        onClick={() => show(item.key)}
        className="h-[42px] shrink-0 border-b-2 border-transparent px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground aria-selected:border-primary aria-selected:font-semibold aria-selected:text-foreground">
        {item.label}{item.count !== undefined && <span className="ml-1.5 font-mono text-xs">{item.count}</span>}
      </button>)}
    </div>

    <div role="tabpanel" id="project-panel" aria-labelledby={'tab-' + tab}>
      {tab === 'overview' && <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_32rem] flex-col gap-4">
          <section className={cn(panel, 'flex flex-col gap-2.5')}>
            <h2 className="text-base font-semibold">Sobre o projeto</h2>
            <p className={prose}>{project.description}</p>
          </section>
          {steps.length > 0 && <section className={cn(panel, 'flex flex-col gap-3')}>
            <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">Como testar</h2><CopyButton value={project.instructions} label="Copiar passos" /></div>
            <ol className="list-decimal rounded-md border border-border bg-background py-3.5 pr-4 pl-9 font-mono text-[13px] leading-[1.9] wrap-anywhere text-soft">
              {steps.map((step, index) => <li key={index}>{step}</li>)}
            </ol>
          </section>}
          <section className={cn(panel, 'flex flex-col')}>
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-base font-semibold">Reviews recentes</h2>
              {reviews.length > 3 && <button type="button" className="text-[13px] font-medium text-primary hover:text-primary-strong" onClick={() => show('reviews')}>Ver todas</button>}
            </div>
            {reviews.length ? reviewList(reviews.slice(0, 3)) : <p className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground"><MessageSquare size={17} aria-hidden />As reviews enviadas aparecem aqui.</p>}
          </section>
        </div>

        <aside aria-label={owner ? 'Gerenciamento do projeto' : 'Sua participação'} className="flex min-w-0 flex-[1_1_17.5rem] flex-col gap-4">
          {owner ? <>
            <section className={asidePanel}>
              <h2 className={asideTitle} id="project-status">Status do projeto</h2>
              <div role="radiogroup" aria-labelledby="project-status" className="flex flex-col gap-1.5">
                {statuses.map(status => <button key={status} type="button" role="radio" aria-checked={project.status === status} disabled={busy}
                  onClick={() => project.status !== status && void run(() => api(projectApi(project.id) + '/status', { status }), 'Status atualizado.')}
                  className="h-10 rounded-md border border-border px-3 text-left text-sm font-medium text-soft hover:border-input aria-checked:border-primary aria-checked:bg-primary-subtle aria-checked:font-semibold aria-checked:text-primary-strong disabled:opacity-60">
                  {projectStatusLabels[status]}
                </button>)}
              </div>
              {!project.requested_at && <p className="text-xs text-muted-foreground">Publique em Explorar para usar o status Em review.</p>}
            </section>
            <section className={asidePanel}>
              <h2 className={asideTitle}>Tickets por status</h2>
              {(Object.entries(ticketStatusLabels) as Array<[TicketStatus, string]>).map(([status, label]) => <button key={status} type="button" onClick={() => show('tickets')}
                className="flex items-center justify-between text-sm text-foreground hover:text-primary-strong">
                <span className={cn('flex items-center gap-2', statusTones[status].text)}><StatusIcon state={status} /><span className="text-foreground">{status === 'fixed' ? label + ' · aguardando reteste' : label}</span></span>
                <span className="font-mono">{tickets.filter(ticket => ticket.status === status).length}</span>
              </button>)}
            </section>
            <section className={asidePanel}>
              <h2 className={cn(asideTitle, 'flex items-center gap-1.5')}><Bot size={14} aria-hidden />Acompanhar pelo agente</h2>
              <p className="text-[13px] leading-normal text-soft">Use o servidor MCP para ver o progresso sem sair do editor.</p>
              <code className="rounded-md border border-border bg-background p-2.5 font-mono text-xs text-primary-strong">get_project_review_progress</code>
              <Link href="/perfil#mcp-settings" className="text-[13px] font-medium">Configurar MCP</Link>
            </section>
          </> : <>
            <section className={asidePanel}>
              <h2 className={asideTitle}>Sua review</h2>
              <p className="text-sm text-soft">{myReview ? 'Review enviada. Você pode editá-la ou relatar outro bug.' : 'Você ainda não enviou review para este projeto.'}</p>
              {project.requested_at && <Button onClick={onReview}>{myReview ? 'Editar review' : 'Enviar review'}</Button>}
            </section>
            <section className={asidePanel}>
              <h2 className={asideTitle}>Meta de reviews</h2>
              <div className="flex justify-between text-[13px]"><span className="font-medium">{remaining ? `Faltam ${remaining}` : 'Meta atingida'}</span><span className="font-mono text-muted-foreground">{project.review_count} / {project.review_goal}</span></div>
              <ProgressBar value={project.review_count} max={project.review_goal} className="h-1.5" />
            </section>
            {tickets.length > 0 && <section className={asidePanel}>
              <h2 className={asideTitle}>Seus tickets</h2>
              {tickets.slice(0, 4).map(ticket => <button key={ticket.id} type="button" onClick={() => show('tickets', { ticket: ticket.id })} className="flex items-center gap-2 text-left text-sm hover:text-primary-strong">
                <span className={(statusTones[ticket.status] ?? statusTones.unreproduced).text}><StatusIcon state={ticket.status} /></span><span className="min-w-0 truncate">{ticket.title || 'Bug sem título'}</span>
              </button>)}
            </section>}
          </>}
        </aside>
      </div>}

      {tab === 'reviews' && <section className={panel} aria-label="Reviews">
        {owner && <p className="pb-3 text-sm text-muted-foreground">{project.review_count} de {project.review_goal} reviews · {remaining === 0 ? 'meta atingida' : `faltam ${remaining} para a meta`}</p>}
        {reviews.length ? reviewList(reviews) : <p className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground"><MessageSquare size={17} aria-hidden />As reviews enviadas aparecem aqui.</p>}
      </section>}

      {tab === 'tickets' && <TicketsPanel tickets={tickets} owner={owner} selected={ticketId} onSelect={id => show('tickets', { ticket: id })} onChange={onChange}
        onShowReview={id => show('reviews', { review: id })} />}

      {tab === 'android' && <div id="testadores-android"><AndroidTesters project={project} session={session} /></div>}

      {tab === 'announcements' && emailAnnouncement && <AnnouncementStatus summary={emailAnnouncement} onRefresh={() => onChange()} />}
    </div>
  </div>;
}
