import Link from 'next/link';
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, ClipboardList, FolderOpen, Mail, MessageSquare, Monitor, Pencil, Smartphone, Users } from 'lucide-react';
import {
  platformLabels, projectStatusLabels, reportLabels, ticketStatusLabels,
  type AnnouncementSummary, type Platform, type Project, type ProjectDetail, type ProjectStatus, type Session, type Ticket,
} from '@reviewlab/api/contracts';
import { api, formatDate, projectApi } from '../lib/client';
import { SubmitForm } from './forms';
import { cn } from '../lib/utils';
import { Button, buttonVariants } from './ui/button';
import { NativeSelect } from './ui/input';
import { AndroidTesters } from './android-testers';

const panel = 'min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5';
const panelTitle = 'flex items-center gap-2 text-lg font-semibold tracking-tight [&>svg]:shrink-0 [&>svg]:text-muted-foreground';
const emptyPanel = 'mt-4 flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground [&>svg]:shrink-0';
const entry = 'mt-4 grid scroll-mt-4 gap-2 border-t border-border pt-4';
const textLink = 'inline-flex items-center gap-1 wrap-anywhere text-primary underline underline-offset-2 [&>svg]:shrink-0';
const prose = 'text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap';

export function PlatformTags({ platforms }: { platforms: Platform[] }) {
  return <ul className="flex flex-wrap gap-1.5" aria-label="Plataformas">
    {platforms.map(platform => {
      const Icon = platform === 'web' ? Monitor : Smartphone;
      return <li key={platform} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        <Icon size={13} aria-hidden />{platformLabels[platform]}
      </li>;
    })}
  </ul>;
}

export function StatusTag({ state, label }: { state: string; label: string }) {
  const inProgress = state === 'review' || state === 'working';
  return <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs leading-none font-medium', inProgress ? 'bg-primary-muted text-primary' : 'bg-muted text-muted-foreground')}>
    <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />{label}
  </span>;
}

export function ProjectCover({ project, version, className }: { project: Project; version?: number; className?: string }) {
  const suffix = version ? '?v=' + version : '';
  return <div className={cn('relative grid aspect-[2/1] shrink-0 place-items-center overflow-hidden border-b border-border bg-muted', className)}>
    {project.has_cover ? <img className="absolute inset-0 size-full object-cover" src={projectApi(project.id) + '/cover' + suffix} alt="" loading={version === undefined ? 'lazy' : undefined} />
      : <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--input)_65%,transparent)_0.7px,transparent_0.7px)] bg-size-[14px_14px]" aria-hidden>
        <span className="grid size-11 place-items-center rounded-md border border-border bg-card text-base font-semibold tracking-tight text-foreground">
          {project.name.trim().slice(0, 2).toLocaleUpperCase('pt-BR')}
        </span>
      </div>}
  </div>;
}

const eventLabels = {
  ...ticketStatusLabels,
  retest_requested: 'Reteste solicitado',
  retest_confirmed: 'Correção confirmada',
  retest_reopened: 'Ticket reaberto',
};

function StatusForm({ path, status, labels, label, onChange }: {
  path: string; status: string; labels: Record<string, string>; label: string; onChange: (message: string) => void;
}) {
  return <SubmitForm inline onSubmit={async data => {
    await api(path + '/status', { status: data.get('status') });
    onChange('Status atualizado.');
  }}>
    <label className="grid min-w-0 gap-1 text-xs font-semibold text-muted-foreground">{label}<NativeSelect name="status" defaultValue={status} key={status}>
      {Object.entries(labels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </NativeSelect></label>
    <Button variant="outline">Atualizar</Button>
  </SubmitForm>;
}

function TicketCard({ ticket, owner, onChange }: { ticket: Ticket; owner: boolean; onChange: (message: string) => void }) {
  const path = '/api/tickets/' + ticket.id;
  const files = ticket.attachments.map(file => ({ ...file, url: path + '/attachments/' + file.id }));
  if (ticket.has_evidence) files.unshift({ id: 'legacy', name: 'Captura de tela', type: 'image/', url: path + '/evidence' });
  const pending = ticket.retest_request_id;
  const incomplete = ticket.missing.length > 0 || ticket.suggestion?.confidence === 'baixa';
  const canRetest = ticket.status === 'fixed' && (owner ? !pending : Boolean(pending));

  return <article id={'ticket-' + ticket.id} className={entry}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-mono text-xs text-muted-foreground">#{ticket.id.slice(0, 8).toUpperCase()}</span>
      <StatusTag state={ticket.status} label={ticketStatusLabels[ticket.status]} />
    </div>
    <h3 className="font-semibold wrap-anywhere">{ticket.title || 'Bug sem título'}</h3>
    <p className="text-sm wrap-anywhere text-muted-foreground">{ticket.reporter} · {formatDate(ticket.created_at)} · <a className={textLink} href={'#review-' + ticket.review_id}>Ver review</a></p>
    <dl className="grid gap-2">
      {(Object.keys(reportLabels) as Array<keyof typeof reportLabels>).filter(key => key !== 'title' && ticket[key]).map(key =>
        <div key={key}><dt className="text-xs font-semibold text-muted-foreground">{reportLabels[key]}</dt><dd className={prose}>{ticket[key]}</dd></div>)}
    </dl>
    {files.length > 0 && <div className="grid grid-cols-2 gap-3">{files.map(file => <figure className="min-w-0" key={file.id}>
      {file.type.startsWith('video/')
        ? <video className="max-h-56 w-full rounded-lg bg-muted" controls preload="metadata" src={file.url} aria-label={file.name} />
        : <img className="max-h-56 w-full rounded-lg bg-muted object-contain" src={file.url} alt={file.name} loading="lazy" />}
      <figcaption className="mt-1 text-xs"><a className={textLink} href={file.url} target="_blank" rel="noreferrer"><ArrowDownToLine size={14} aria-hidden />{file.name}</a></figcaption>
    </figure>)}</div>}
    {(incomplete || ticket.suggestion || ticket.duplicate_id || ['queued', 'running'].includes(ticket.triage_state ?? '')) && <div className="grid gap-1 rounded-lg bg-muted p-3 text-xs wrap-anywhere">
      {incomplete && <p><strong>Precisa de detalhes.</strong> {ticket.missing.map(field => reportLabels[field]).join(', ')}</p>}
      {['queued', 'running'].includes(ticket.triage_state ?? '') && <p>Triagem do relato em andamento.</p>}
      {ticket.suggestion && <><p><strong>Sugestão da triagem</strong> · {ticket.suggestion.category} · confiança {ticket.suggestion.confidence}</p>
        <p>{ticket.suggestion.title}</p><p>{ticket.suggestion.summary}</p></>}
      {ticket.duplicate_id && <a className={textLink} href={'#ticket-' + ticket.duplicate_id}>Ver possível duplicata</a>}
    </div>}
    {ticket.events.length > 0 && <details className="text-xs wrap-anywhere"><summary>Histórico do ticket</summary>
      <ol className="mt-2 list-inside list-disc text-muted-foreground">{ticket.events.map((event, index) => <li key={index}>{eventLabels[event.status]} · {event.actor} · {formatDate(event.created_at)}</li>)}</ol>
    </details>}
    {owner && <StatusForm path={path} status={ticket.status} labels={ticketStatusLabels} label="Status do ticket" onChange={onChange} />}
    {ticket.status === 'fixed' && owner && pending && <p className="text-sm text-muted-foreground">Aguardando quem relatou o bug retestar a correção.</p>}
    {canRetest && <SubmitForm inline onSubmit={async data => {
      const outcome = String(data.get('outcome'));
      await api(path + '/retest', { outcome, requestId: pending });
      onChange(outcome === 'request' ? 'Reteste solicitado.' : outcome === 'confirmed' ? 'Correção confirmada.' : 'Ticket reaberto.');
    }}>
      {owner ? <Button variant="outline" name="outcome" value="request">Solicitar reteste</Button> : <>
        <p className="w-full text-sm">O dono pediu que você teste a correção.</p>
        <Button name="outcome" value="confirmed">Confirmar correção</Button>
        <Button variant="outline" name="outcome" value="reopened">O bug ainda ocorre</Button>
      </>}
    </SubmitForm>}
  </article>;
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

  return <section className={panel}>
    <h2 className="flex items-center gap-2 text-sm font-semibold"><Mail size={16} className="text-muted-foreground" aria-hidden />Avisos por e-mail</h2>
    <div aria-live="polite">
      {!enabled && <p className="mt-1.5 text-sm text-muted-foreground">O envio está indisponível.</p>}
      {counts.length ? <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {counts.map(item => <div className="flex gap-1.5" key={item.label}>
          <dt>{item.label}</dt><dd className="font-semibold text-foreground tabular-nums">{item.value}</dd>
        </div>)}
      </dl> : enabled && <p className="mt-1.5 text-sm text-muted-foreground">Nenhum testador inscrito para este anúncio.</p>}
    </div>
    {enabled && queued > 0 && <Button variant="ghost" className="mt-1 -ml-2 px-2" onClick={onRefresh}>Consultar fila</Button>}
  </section>;
}

export function ProjectView({ detail, session, version, onEdit, onReview, onChange }: {
  detail: ProjectDetail; session: Session; version: number; onEdit: () => void; onReview: () => void; onChange: (message?: string) => void;
}) {
  const { project, reviews, tickets, myReview, emailAnnouncement } = detail;
  const owner = session.user?.id === project.owner_id;
  const android = project.platforms.includes('android');
  const statuses: Partial<Record<ProjectStatus, string>> = project.requested_at ? projectStatusLabels : {
    dev: projectStatusLabels.dev, prod: projectStatusLabels.prod,
  };
  const shareLink = () => {
    const url = new URL(window.location.pathname, session.appOrigin || window.location.origin).href;
    const text = ['Novo projeto para review no ReviewLab!', project.name + ' · ' + project.platforms.map(platform => platformLabels[platform]).join(', '),
      project.description.slice(0, 240), 'Veja os detalhes e envie sua review: ' + url].join('\n\n');
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  };

  return <>
    <Link className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline" href={owner ? '/?meus' : '/'}><ArrowLeft size={16} aria-hidden /> Voltar aos projetos</Link>
    <header className="grid min-w-0 gap-4 border-b border-border pb-5 sm:pb-6">
      <div className="flex flex-wrap items-center gap-2"><PlatformTags platforms={project.platforms} />
        <StatusTag state={project.status} label={projectStatusLabels[project.status]} />
      </div>
      <div>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight wrap-anywhere sm:text-4xl">{project.name}</h1>
        <p className="mt-1 text-sm wrap-anywhere text-muted-foreground">Por {project.owner} · {project.requested_at ? 'Anunciado em ' + formatDate(project.requested_at) : 'Rascunho'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a className={buttonVariants({ variant: owner && project.requested_at ? 'default' : 'outline' })} href={project.url} target="_blank" rel="noreferrer">
          Abrir projeto <ArrowUpRight size={16} aria-hidden />
        </a>
        {owner && <Button variant="outline" onClick={onEdit}><Pencil size={15} aria-hidden />Editar</Button>}
        {owner && android && <a className={buttonVariants({ variant: 'outline' })} href="#testadores-android"><Users size={16} aria-hidden />Testadores Android</a>}
        {owner && project.requested_at && <Button variant="outline" onClick={shareLink}><MessageSquare size={16} aria-hidden />Compartilhar no WhatsApp</Button>}
        {!owner && project.requested_at && <Button onClick={onReview}><MessageSquare size={16} aria-hidden />
          {myReview ? 'Editar review ou relatar bug' : 'Enviar review'}
        </Button>}
      </div>
    </header>
    <div className={cn('mt-5 grid items-start gap-4', owner && 'xl:grid-cols-[minmax(0,1fr)_18rem]')}>
      <div className="grid min-w-0 gap-4">
        {project.has_cover ? <ProjectCover project={project} version={version} className="aspect-[2/1] rounded-lg border" /> : null}
        <section className={cn(panel, 'grid gap-2')}>
          <h2 className={panelTitle}>Sobre o projeto</h2>
          <p className={prose}>{project.description}</p>
        </section>
        {android && <div id="testadores-android" className="min-w-0 scroll-mt-5">
          <AndroidTesters project={project} session={session} />
        </div>}
        {project.instructions && <section className={cn(panel, 'grid gap-3')}>
          <h2 className={panelTitle}><ClipboardList size={19} aria-hidden />Como testar</h2>
          <p className={prose}>{project.instructions}</p>
        </section>}
      </div>
      {owner && <aside className="grid min-w-0 gap-4" aria-label="Gerenciamento do projeto">
        {!project.requested_at && <section className={panel}>
          <SubmitForm inline onSubmit={async () => {
            await api(projectApi(project.id) + '/request', {});
            onChange('Pedido de review publicado.');
          }}>
            <Button><MessageSquare size={16} aria-hidden />Solicitar review</Button>
            <p className="w-full text-sm text-muted-foreground">{session.emailAnnouncementsEnabled
              ? 'Envia um aviso aos testadores inscritos em pelo menos uma das plataformas do projeto.'
              : 'O pedido aparece no catálogo. Os avisos por e-mail estão indisponíveis.'}</p>
          </SubmitForm>
        </section>}
        {emailAnnouncement && <AnnouncementStatus summary={emailAnnouncement} onRefresh={() => onChange()} />}
        <section className={panel}><StatusForm path={projectApi(project.id)} status={project.status} labels={statuses} label="Status do projeto" onChange={onChange} /></section>
      </aside>}
    </div>
    <div className={cn('mt-4 grid items-start gap-4', (owner || tickets.length > 0) && 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]')}>
      <section className={panel}>
        <h2 className={panelTitle}><MessageSquare size={19} aria-hidden />Reviews <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{reviews.length}</span></h2>
        {reviews.length ? reviews.map(review => <article className={entry} key={review.id} id={'review-' + review.id}>
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-semibold wrap-anywhere">{review.author}</h3>
            <time className="text-sm text-muted-foreground" dateTime={review.created_at}>{formatDate(review.created_at)}</time>
          </div>
          <p className={prose}>{review.feedback || 'Review enviada com relato de bug.'}</p>
        </article>) : <p className={emptyPanel}><MessageSquare size={18} aria-hidden />As reviews enviadas aparecem aqui.</p>}
      </section>
      {(owner || tickets.length > 0) && <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={panelTitle}><FolderOpen size={19} aria-hidden />{owner ? 'Tickets' : 'Seus tickets'} <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{tickets.length}</span></h2>
          {tickets.some(ticket => ['queued', 'running'].includes(ticket.triage_state ?? '')) && <Button variant="ghost" onClick={() => onChange()}>Atualizar tickets</Button>}
        </div>
        {tickets.length ? tickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} owner={owner} onChange={onChange} />)
          : <p className={emptyPanel}><FolderOpen size={18} aria-hidden />Os relatos de bugs aparecem aqui.</p>}
      </section>}
    </div>
  </>;
}
