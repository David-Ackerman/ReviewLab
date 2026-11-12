'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowUpRight, CircleAlert, FolderOpen, MessageSquare, Plus, Search, UserRound } from 'lucide-react';
import { platformLabels, projectStatusLabels, type Platform, type Project, type ProjectDetail, type Session } from '@reviewlab/api/contracts';
import { api, errorMessage, projectApi, projectPath } from '../lib/client';
import { Modal, ProjectForm, ReviewForm } from './forms';
import { PlatformTags, ProjectCover, ProjectView, StatusTag } from './project-detail';
import { Button, buttonVariants } from './ui/button';
import { Input, NativeSelect } from './ui/input';
import { WorkspaceShell } from './ui/workspace-shell';

type Dialog = 'new' | 'edit' | 'review';
const dialogs: Record<Dialog, { title: string; description: string }> = {
  new: { title: 'Cadastrar projeto', description: 'Informe o que sua comunidade pode testar.' },
  edit: { title: 'Editar projeto', description: 'Atualize as informações e instruções de teste.' },
  review: { title: 'Enviar review', description: 'Conte como foi o teste e relate bugs que encontrou.' },
};

const emptyState = 'grid min-h-56 place-items-center content-center gap-3 rounded-lg border border-dashed border-border bg-card p-6 text-center';
const emptyIcon = 'grid size-11 place-items-center rounded-lg bg-muted text-muted-foreground';

function Catalog({ projects, mine, session, onNew }: { projects: Project[]; mine: boolean; session: Session; onNew: () => void }) {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const scope = projects.filter(project => mine ? project.owner_id === session.user?.id : project.requested_at);
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const visible = scope.filter(project => (!platform || project.platforms.includes(platform as Platform)) && (!status || status === project.status)
    && (!normalized || [project.name, project.description, project.owner].some(value => value.toLocaleLowerCase('pt-BR').includes(normalized))));
  const count = (state: Project['status']) => scope.filter(project => project.status === state).length;
  const filtered = Boolean(normalized || platform || status);
  const stats = [
    { label: mine ? 'Total' : 'Anunciados', value: scope.length },
    { label: 'Em review', value: count('review') },
    { label: 'Em desenvolvimento', value: count('dev') },
    { label: 'Em produção', value: count('prod') },
  ];

  return <>
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{mine ? 'Meus projetos' : 'Explorar projetos'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{mine
          ? 'Acompanhe as reviews e os retestes dos seus projetos.'
          : 'Encontre projetos da comunidade para testar.'}</p>
      </div>
      <Button onClick={onNew}><Plus size={17} aria-hidden />Novo projeto</Button>
    </header>
    <dl className="mb-8 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card md:grid-cols-4">
      {stats.map((metric, index) => <div key={metric.label} className="flex min-w-0 flex-col-reverse justify-end gap-1 border-border px-3.5 py-3 even:border-l nth-[n+3]:border-t sm:px-5 sm:py-4 md:nth-[n+3]:border-t-0 md:nth-[n+2]:border-l">
        <dt className="text-xs font-medium text-muted-foreground">{metric.label}</dt>
        <dd className={'text-2xl leading-none font-semibold tracking-tight tabular-nums' + (index === 1 ? ' text-primary' : '')}>{metric.value}</dd>
      </div>)}
    </dl>
    <section aria-labelledby="catalog-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 id="catalog-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {mine ? 'Seus projetos' : 'Catálogo'}
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{visible.length}</span>
        </h2>
        <div className="grid w-full items-center gap-2 min-[375px]:grid-cols-2 md:flex md:w-auto">
          <label className="relative min-w-0 min-[375px]:col-span-2">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <span className="sr-only">Buscar projetos</span>
            <Input className="pl-9 md:w-48" type="search" placeholder="Buscar projetos" value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <label className="min-w-0"><span className="sr-only">Plataforma</span><NativeSelect value={platform} onChange={event => setPlatform(event.target.value)}>
            <option value="">Todas as plataformas</option>
            {Object.entries(platformLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </NativeSelect></label>
          <label className="min-w-0"><span className="sr-only">Status</span><NativeSelect value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(projectStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </NativeSelect></label>
        </div>
      </div>
      {visible.length > 0 ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(project => <article className="group min-w-0 rounded-lg border border-border bg-card transition-colors hover:border-input" key={project.id}>
        <Link href={projectPath(project.id)} className="flex h-full flex-col overflow-hidden rounded-lg" aria-labelledby={'project-' + project.id}>
          <ProjectCover project={project} className="aspect-[3/1]" />
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div>
              <h3 id={'project-' + project.id} className="flex items-start justify-between gap-2 text-base leading-tight font-semibold tracking-tight wrap-anywhere">
                {project.name}<ArrowUpRight className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary" size={17} aria-hidden />
              </h3>
              <p className="mt-1.5 line-clamp-2 min-h-10 text-sm leading-5 wrap-anywhere text-muted-foreground">{project.description}</p>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <PlatformTags platforms={project.platforms} />
              <StatusTag state={project.status} label={projectStatusLabels[project.status]} />
            </div>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1.5 wrap-anywhere"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted font-semibold text-foreground" aria-hidden>{project.owner.slice(0, 1).toUpperCase()}</span>{project.owner}</span>
              <span className="flex shrink-0 items-center gap-1.5"><MessageSquare size={14} aria-hidden />{project.review_count} {project.review_count === 1 ? 'review' : 'reviews'}</span>
            </div>
            {Boolean(project.pending_retests) && <p className="text-xs font-semibold text-primary">{project.pending_retests} {project.pending_retests === 1 ? 'reteste pendente' : 'retestes pendentes'}</p>}
          </div>
        </Link>
      </article>)}</div> : <div className={emptyState}>
        <div className={emptyIcon}><FolderOpen size={22} aria-hidden /></div>
        <h3 className="text-base font-semibold">{filtered ? 'Nenhum projeto encontrado' : mine ? 'Você ainda não cadastrou projetos' : 'Nenhum projeto anunciado'}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{filtered ? 'Tente outro termo ou remova os filtros.' : mine ? 'Cadastre um projeto para organizar suas reviews e tickets.' : 'Os projetos aparecem aqui quando alguém solicita uma review.'}</p>
        {filtered && <Button variant="outline" onClick={() => { setQuery(''); setPlatform(''); setStatus(''); }}>Limpar filtros</Button>}
      </div>}
    </section>
  </>;
}

export function Workspace({ mine = false, projectId }: { mine?: boolean; projectId?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [dialog, open] = useState<Dialog | null>(null);
  const locked = Boolean(session && !session.user);
  const userId = session?.user?.id;
  const next = projectId ? projectPath(projectId) : mine ? '/?meus' : '';
  const authQuery = next ? '?' + new URLSearchParams({ next }) : '';
  const signInHref = '/entrar' + authQuery;

  useEffect(() => {
    const controller = new AbortController();
    api<Session>('/api/session', undefined, controller.signal).then(setSession).catch(error => {
      if (!controller.signal.aborted) setError(errorMessage(error));
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const load = async () => {
      try {
        if (projectId) {
          const result = await api<ProjectDetail>(projectApi(projectId), undefined, signal);
          if (!signal.aborted) setDetail(result);
        } else {
          const result = await api<{ projects: Project[] }>('/api/projects', undefined, signal);
          if (!signal.aborted) setProjects(result.projects);
        }
        if (!signal.aborted) setError('');
      } catch (error) {
        if (!signal.aborted) setError(errorMessage(error));
      } finally {
        if (!signal.aborted) setLoadedFor(userId);
      }
    };
    void load();
    return () => controller.abort();
  }, [projectId, userId, version]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const loadedProject = loadedFor === userId ? detail?.project.id : undefined;
  useEffect(() => {
    if (loadedProject && window.location.hash === '#testadores-android') {
      document.getElementById('testadores-android')?.scrollIntoView();
    }
  }, [loadedProject]);

  function refresh(message = '') {
    setNotice(message);
    setVersion(previous => previous + 1);
  }

  function handleLogout() {
    setProjects([]);
    setDetail(null);
    setLoadedFor(null);
    setError('');
    setSession(current => current ? { ...current, user: null } : null);
    router.replace('/');
  }

  const active = projectId ? detail?.project.owner_id === userId ? 'projects' : 'explore' : mine ? 'projects' : 'explore';

  return <WorkspaceShell session={session} active={active} signInHref={signInHref} onLogout={handleLogout}>
    {error ? <section className={emptyState} role="alert">
      <div className={emptyIcon}><CircleAlert size={22} aria-hidden /></div>
      <h1 className="text-xl font-semibold tracking-tight">Não foi possível carregar</h1>
      <p className="max-w-md text-sm text-muted-foreground">{error}</p>
      <Button variant="outline" onClick={() => window.location.reload()}>Tentar novamente</Button>
    </section> : locked ? <section className="mx-auto mt-8 grid max-w-xl justify-items-start gap-5 rounded-lg border border-border bg-card p-6 sm:mt-16 sm:p-10">
      <div className="grid size-11 place-items-center rounded-md bg-primary-muted text-primary"><UserRound size={22} aria-hidden /></div>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{projectId ? 'Entre para ver o projeto' : mine ? 'Acesse seus projetos' : 'Entre no ReviewLab'}</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Entre ou crie uma conta para acessar os projetos e acompanhar suas reviews.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={signInHref} className={buttonVariants()}>Entrar</Link>
        <Link href={'/cadastro' + authQuery} className={buttonVariants({ variant: 'outline' })}>Criar conta</Link>
      </div>
    </section> : !session || loadedFor !== userId ? <p className="py-12 text-sm text-muted-foreground" role="status">Carregando {projectId ? 'projeto' : 'projetos'}…</p>
      : detail ? <ProjectView detail={detail} session={session} version={version} onEdit={() => open('edit')} onReview={() => open('review')} onChange={refresh} />
      : !projectId && <Catalog key={String(mine)} projects={projects} mine={mine} session={session} onNew={() => open('new')} />}
    <div role="status" className="fixed right-4 bottom-4 z-30 max-w-[calc(100%-2rem)]">
      {notice && <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold shadow-lg">{notice}</p>}
    </div>
    {dialog && session?.user && <Modal {...dialogs[dialog]} onClose={() => open(null)}>
      {(dialog === 'new' || dialog === 'edit') && <ProjectForm project={dialog === 'edit' ? detail?.project : undefined} session={session}
        onSave={id => {
          open(null);
          if (dialog === 'edit') refresh('Projeto atualizado.');
          else router.push(projectPath(id));
        }} />}
      {dialog === 'review' && detail && <ReviewForm detail={detail} session={session} onSave={ticketId => {
        open(null);
        refresh(ticketId ? 'Review enviada e ticket criado.' : 'Review enviada.');
      }} />}
    </Modal>}
  </WorkspaceShell>;
}
