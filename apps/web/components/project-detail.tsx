import Link from 'next/link';
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, ClipboardList, FolderOpen, MessageSquare, Monitor, Pencil, Smartphone } from 'lucide-react';
import {
  platformLabels, projectStatusLabels, reportLabels, ticketStatusLabels,
  type Project, type ProjectDetail, type ProjectStatus, type Session, type Ticket,
} from '@reviewlab/api/contracts';
import { api, formatDate, projectApi } from '../lib/client';
import { SubmitForm } from './forms';

export function PlatformTag({ platform }: { platform: Project['platform'] }) {
  const Icon = platform === 'web' ? Monitor : Smartphone;
  return <span className="platform"><Icon size={14} aria-hidden />{platformLabels[platform]}</span>;
}

export function StatusTag({ state, label }: { state: string; label: string }) {
  return <span className={'status state-' + state}><span aria-hidden />{label}</span>;
}

export function ProjectCover({ project, version }: { project: Project; version?: number }) {
  const suffix = version ? '?v=' + version : '';
  if (project.has_cover) return <div className="project-cover"><img src={projectApi(project.id) + '/cover' + suffix} alt="" loading="lazy" /></div>;
  return <div className={'project-cover placeholder cover-' + project.platform} aria-hidden>
    <span>{project.name.trim().slice(0, 2).toLocaleUpperCase('pt-BR')}</span>
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
  return <SubmitForm className="inline-form" onSubmit={async data => {
    await api(path + '/status', { status: data.get('status') });
    onChange('Status atualizado.');
  }}>
    <label>{label}<select name="status" defaultValue={status} key={status}>
      {Object.entries(labels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select></label>
    <button className="button secondary">Atualizar</button>
  </SubmitForm>;
}

function TicketCard({ ticket, owner, onChange }: { ticket: Ticket; owner: boolean; onChange: (message: string) => void }) {
  const path = '/api/tickets/' + ticket.id;
  const files = ticket.attachments.map(file => ({ ...file, url: path + '/attachments/' + file.id }));
  if (ticket.has_evidence) files.unshift({ id: 'legacy', name: 'Captura de tela', type: 'image/', url: path + '/evidence' });
  const pending = ticket.retest_request_id;
  const incomplete = ticket.missing.length > 0 || ticket.suggestion?.confidence === 'baixa';
  const canRetest = ticket.status === 'fixed' && (owner ? !pending : Boolean(pending));

  return <article id={'ticket-' + ticket.id} className="ticket">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="ticket-number">#{ticket.id.slice(0, 8).toUpperCase()}</span>
      <StatusTag state={ticket.status} label={ticketStatusLabels[ticket.status]} />
    </div>
    <h3>{ticket.title || 'Bug sem título'}</h3>
    <p className="muted text-sm">{ticket.reporter} · {formatDate(ticket.created_at)} · <a className="text-link" href={'#review-' + ticket.review_id}>Ver review</a></p>
    <dl className="report">
      {(Object.keys(reportLabels) as Array<keyof typeof reportLabels>).filter(key => key !== 'title' && ticket[key]).map(key =>
        <div key={key}><dt>{reportLabels[key]}</dt><dd>{ticket[key]}</dd></div>)}
    </dl>
    {files.length > 0 && <div className="evidence-list">{files.map(file => <figure key={file.id}>
      {file.type.startsWith('video/') ? <video controls preload="metadata" src={file.url} aria-label={file.name} /> : <img src={file.url} alt={file.name} loading="lazy" />}
      <figcaption><a className="text-link" href={file.url} target="_blank" rel="noreferrer"><ArrowDownToLine size={14} aria-hidden />{file.name}</a></figcaption>
    </figure>)}</div>}
    {(incomplete || ticket.suggestion || ticket.duplicate_id || ['queued', 'running'].includes(ticket.triage_state ?? '')) && <div className="triage-note">
      {incomplete && <p><strong>Precisa de detalhes.</strong> {ticket.missing.map(field => reportLabels[field]).join(', ')}</p>}
      {['queued', 'running'].includes(ticket.triage_state ?? '') && <p>Triagem do relato em andamento.</p>}
      {ticket.suggestion && <><p><strong>Sugestão da triagem</strong> · {ticket.suggestion.category} · confiança {ticket.suggestion.confidence}</p>
        <p>{ticket.suggestion.title}</p><p>{ticket.suggestion.summary}</p></>}
      {ticket.duplicate_id && <a className="text-link" href={'#ticket-' + ticket.duplicate_id}>Ver possível duplicata</a>}
    </div>}
    {ticket.events.length > 0 && <details className="ticket-history"><summary>Histórico do ticket</summary>
      <ol>{ticket.events.map((event, index) => <li key={index}>{eventLabels[event.status]} · {event.actor} · {formatDate(event.created_at)}</li>)}</ol>
    </details>}
    {owner && <StatusForm path={path} status={ticket.status} labels={ticketStatusLabels} label="Status do ticket" onChange={onChange} />}
    {ticket.status === 'fixed' && owner && pending && <p className="muted text-sm">Aguardando quem relatou o bug retestar a correção.</p>}
    {canRetest && <SubmitForm className="inline-form" onSubmit={async data => {
      const outcome = String(data.get('outcome'));
      await api(path + '/retest', { outcome, requestId: pending });
      onChange(outcome === 'request' ? 'Reteste solicitado.' : outcome === 'confirmed' ? 'Correção confirmada.' : 'Ticket reaberto.');
    }}>
      {owner ? <button className="button secondary" name="outcome" value="request">Solicitar reteste</button> : <>
        <p className="w-full text-sm">O dono pediu que você teste a correção.</p>
        <button className="button primary" name="outcome" value="confirmed">Confirmar correção</button>
        <button className="button secondary" name="outcome" value="reopened">O bug ainda ocorre</button>
      </>}
    </SubmitForm>}
  </article>;
}

export function ProjectView({ detail, session, version, onEdit, onReview, onChange }: {
  detail: ProjectDetail; session: Session; version: number; onEdit: () => void; onReview: () => void; onChange: (message: string) => void;
}) {
  const { project, reviews, tickets, myReview, emailAnnouncement } = detail;
  const owner = session.user?.id === project.owner_id;
  const statuses: Partial<Record<ProjectStatus, string>> = project.requested_at ? projectStatusLabels : {
    dev: projectStatusLabels.dev, prod: projectStatusLabels.prod,
  };
  const shareLink = () => {
    const url = new URL(window.location.pathname, session.appOrigin || window.location.origin).href;
    const text = ['Novo projeto para review no ReviewLab!', project.name + ' · ' + platformLabels[project.platform],
      project.description.slice(0, 240), 'Veja os detalhes e envie sua review: ' + url].join('\n\n');
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  };

  return <>
    <Link className="back-link" href={owner ? '/?meus' : '/'}><ArrowLeft size={16} aria-hidden /> Voltar aos projetos</Link>
    <section className="project-hero">
      <div className="project-hero-content">
        <div className="flex flex-wrap items-center gap-3"><PlatformTag platform={project.platform} />
          <StatusTag state={project.status} label={projectStatusLabels[project.status]} />
        </div>
        <h1>{project.name}</h1>
        <p className="muted text-sm">Por {project.owner} · {project.requested_at ? 'Anunciado em ' + formatDate(project.requested_at) : 'Rascunho'}</p>
        <p className="project-description">{project.description}</p>
        <div className="action-row">
          <a className="button secondary" href={project.url} target="_blank" rel="noreferrer">
            {project.platform === 'web' ? 'Abrir projeto' : 'Abrir link do app'} <ArrowUpRight size={16} aria-hidden />
          </a>
          {owner && <button className="button secondary" onClick={onEdit}><Pencil size={15} aria-hidden />Editar</button>}
          {owner && project.requested_at && <button className="button secondary" onClick={shareLink}><MessageSquare size={16} aria-hidden />Compartilhar no WhatsApp</button>}
          {!owner && project.requested_at && <button className="button primary" onClick={onReview}><MessageSquare size={16} aria-hidden />
            {myReview ? 'Editar review ou relatar bug' : 'Enviar review'}
          </button>}
        </div>
        {owner && !project.requested_at && <SubmitForm className="inline-form" onSubmit={async () => {
          await api(projectApi(project.id) + '/request', {});
          onChange('Pedido de review publicado.');
        }}>
          <button className="button primary"><MessageSquare size={16} aria-hidden />Solicitar review</button>
          {session.emailAnnouncementsEnabled && <p className="muted text-sm">Testadores inscritos para esta plataforma recebem um aviso por e-mail.</p>}
        </SubmitForm>}
        {emailAnnouncement && (emailAnnouncement.enabled || emailAnnouncement.accepted || emailAnnouncement.failed || emailAnnouncement.queued) ? <div className="action-row">
          <p className="muted text-sm">Aviso por e-mail · {emailAnnouncement.accepted} aceitos pelo serviço · {emailAnnouncement.queued} na fila · {emailAnnouncement.failed} sem confirmação</p>
          {emailAnnouncement.queued > 0 && <button className="button quiet" onClick={() => onChange('Fila de avisos atualizada.')}>Atualizar fila</button>}
        </div> : null}
        {owner && <StatusForm path={projectApi(project.id)} status={project.status} labels={statuses} label="Status do projeto" onChange={onChange} />}
      </div>
      <ProjectCover project={project} version={version} />
    </section>
    {project.instructions && <section className="panel instructions"><h2><ClipboardList size={19} aria-hidden />Como testar</h2><p>{project.instructions}</p></section>}
    <div className={'detail-grid' + (owner || tickets.length ? ' with-tickets' : '')}>
      <section className="panel">
        <h2><MessageSquare size={19} aria-hidden />Reviews <span className="total">{reviews.length}</span></h2>
        {reviews.length ? reviews.map(review => <article className="review-item" key={review.id} id={'review-' + review.id}>
          <div><h3>{review.author}</h3><time className="muted text-sm" dateTime={review.created_at}>{formatDate(review.created_at)}</time></div>
          <p>{review.feedback || 'Review enviada com relato de bug.'}</p>
        </article>) : <p className="panel-empty"><MessageSquare size={18} aria-hidden />As reviews enviadas aparecem aqui.</p>}
      </section>
      {(owner || tickets.length > 0) && <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2><FolderOpen size={19} aria-hidden />{owner ? 'Tickets' : 'Seus tickets'} <span className="total">{tickets.length}</span></h2>
          {tickets.some(ticket => ['queued', 'running'].includes(ticket.triage_state ?? '')) && <button className="button quiet" onClick={() => onChange('Tickets atualizados.')}>Atualizar tickets</button>}
        </div>
        {tickets.length ? tickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} owner={owner} onChange={onChange} />)
          : <p className="panel-empty"><FolderOpen size={18} aria-hidden />Os relatos de bugs aparecem aqui.</p>}
      </section>}
    </div>
  </>;
}
