'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, FolderOpen, Plus, RotateCcw, Smartphone, UserRound } from 'lucide-react';
import { platformLabels, projectStatusLabels, type Platform, type Project, type ProjectDetail, type Session } from '@reviewlab/api/contracts';
import { api, errorMessage, projectApi, projectPath, timeAgo } from '../lib/client';
import { projectOwnerLabel } from '../lib/locale';
import { cn } from '../lib/utils';
import { Modal, ProjectForm, ReviewForm } from './forms';
import { ProgressBar, ProjectTile, ProjectView, StatusTag } from './project-detail';
import { Button, buttonVariants } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { SearchBox, WorkspaceShell, type ShellCounts } from './ui/workspace-shell';

export type View = 'explore' | 'mine' | 'retests' | 'project';
type Dialog = 'new' | 'edit' | 'review';
const dialogs: Record<Dialog, { title: string; description: string }> = {
  new: { title: 'Novo projeto', description: 'Salve um rascunho e publique em Explorar quando estiver pronto para receber reviews.' },
  edit: { title: 'Editar projeto', description: 'Atualize as informações e os passos de teste.' },
  review: { title: 'Enviar review', description: 'Conte como foi o teste e relate os bugs que encontrou.' },
};

const headings: Record<Exclude<View, 'project'>, { title: string; description: string }> = {
  explore: { title: 'Explorar', description: 'Projetos da comunidade esperando review. Mostramos primeiro o que combina com as plataformas que você testa.' },
  mine: { title: 'Meus projetos', description: 'Acompanhe as reviews, os tickets e os retestes dos seus projetos. Rascunhos aparecem só para você.' },
  retests: { title: 'Retestes', description: 'Bugs que você relatou e que o dono marcou como corrigidos. Confirme a correção ou reabra o ticket.' },
};

type Sort = 'recent' | 'fewest' | 'goal';
const sortLabels: Record<Sort, string> = { recent: 'Mais recentes', fewest: 'Menos reviews', goal: 'Mais perto da meta' };

const emptyState = 'grid min-h-56 place-items-center content-center gap-3 rounded-lg border border-dashed border-input bg-card p-6 text-center';
const emptyIcon = 'grid size-11 place-items-center rounded-lg bg-muted text-muted-foreground';
const nudge = 'flex items-start gap-3.5 rounded-lg border bg-card px-4.5 py-4 text-foreground no-underline hover:text-foreground';

// As contagens da barra lateral sobrevivem à navegação entre páginas do cliente.
let lastCounts: ShellCounts | undefined;
const countsFrom = (projects: Project[], userId: string): ShellCounts => ({
  projects: projects.filter(project => project.owner_id === userId).length,
  retests: projects.reduce((total, project) => total + (project.pending_retests ?? 0), 0),
});

function PlatformFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = [['', 'Todas'], ...Object.entries(platformLabels)];
  return <div role="group" aria-label="Plataforma" className="flex gap-0.5 overflow-x-auto rounded-[9px] bg-muted p-[3px]">
    {options.map(([key, label]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}
      className="h-8 shrink-0 rounded-[7px] px-3 text-[13px] font-medium text-soft hover:text-foreground aria-pressed:bg-card aria-pressed:font-semibold aria-pressed:text-foreground aria-pressed:shadow-[0_1px_2px_rgba(22,24,29,.08)]">
      {label}
    </button>)}
  </div>;
}

function ProjectCard({ project, own, retests }: { project: Project; own: boolean; retests: boolean }) {
  return <Link href={projectPath(project.id) + (retests ? '#tickets' : '')}
    className="group flex min-w-0 flex-col gap-3.5 surface p-4.5 text-foreground no-underline transition-colors hover:border-input hover:text-foreground">
    <div className="flex items-center gap-3">
      <ProjectTile project={project} className="size-10 rounded-[10px] text-sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em] group-hover:text-primary-strong">{project.name}</span>
          {own && (project.requested_at ? <StatusTag state={project.status} label={projectStatusLabels[project.status]} compact />
            : <span className="shrink-0 rounded-md border border-dashed border-input px-1.5 py-px text-[11px] font-semibold text-soft">Rascunho</span>)}
        </span>
        <span className="truncate text-xs text-muted-foreground">por {projectOwnerLabel(project.owner, own)} · {timeAgo(project.requested_at ?? project.created_at)}</span>
      </div>
    </div>
    <p className="line-clamp-2 min-h-[2.4rem] text-[13px] leading-normal wrap-anywhere text-soft">{project.description}</p>
    <div className="mt-auto flex flex-col gap-1.5">
      <div className="flex justify-between gap-2 font-mono text-[11px] text-muted-foreground">
        <span>{project.platforms.map(platform => platformLabels[platform].toLowerCase()).join(' · ')}</span>
        <span>{project.review_count} / {project.review_goal} reviews</span>
      </div>
      <ProgressBar value={project.review_count} max={project.review_goal} />
      {retests && <span className="mt-1 text-xs font-semibold text-primary-strong">{project.pending_retests} {project.pending_retests === 1 ? 'reteste pedido' : 'retestes pedidos'} · Retestar →</span>}
    </div>
  </Link>;
}

function ForYou({ projects, session }: { projects: Project[]; session: Session }) {
  const user = session.user!;
  const retest = projects.find(project => project.owner_id !== user.id && project.pending_retests);
  const android = user.platforms.includes('android')
    ? projects.filter(project => project.owner_id !== user.id && project.requested_at && project.status === 'review' && project.platforms.includes('android')).length : 0;
  if (!retest && !android) return null;
  return <section aria-labelledby="for-you" className="flex flex-col gap-3">
    <h2 id="for-you" className="section-label">Para você agora</h2>
    <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(18.75rem,1fr))]">
      {retest && <Link href={projectPath(retest.id) + '#tickets'} className={cn(nudge, 'border-primary shadow-[0_0_0_3px_var(--primary-muted)]')}>
        <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-primary-muted text-primary-strong"><RotateCcw size={18} aria-hidden /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-semibold">Reteste pedido em {retest.name}</span>
          <span className="text-[13px] leading-snug text-muted-foreground">O dono marcou como corrigido um bug que você relatou. Confirme se a correção funcionou.</span>
        </span>
        <span className="self-center text-[13px] font-semibold whitespace-nowrap text-primary-strong">Retestar →</span>
      </Link>}
      {android > 0 && <Link href="/perfil" className={cn(nudge, 'border-border hover:border-input')}>
        <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-muted text-soft"><Smartphone size={18} aria-hidden /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-semibold">{android} {android === 1 ? 'projeto Android precisa' : 'projetos Android precisam'} de você</span>
          <span className="text-[13px] leading-snug text-muted-foreground">{user.android_test_email
            ? user.android_test_email_public ? 'Seu e-mail de teste do Google Play está público para donos de projetos Android.' : 'Seu e-mail de teste é privado. Compartilhe em cada projeto que quiser testar.'
            : 'Adicione seu e-mail do Google Play no perfil para receber os convites de teste.'}</span>
        </span>
      </Link>}
    </div>
  </section>;
}

function Catalog({ projects, view, session, query, onClearQuery }: {
  projects: Project[]; view: Exclude<View, 'project'>; session: Session; query: string; onClearQuery: () => void;
}) {
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<Sort>(view === 'explore' ? 'fewest' : 'recent');
  const userId = session.user?.id;
  const isOwn = (project: Project) => project.owner_id === userId;
  const scope = projects.filter(project => view === 'mine' ? isOwn(project)
    : view === 'retests' ? !isOwn(project) && project.pending_retests
    : isOwn(project) || project.requested_at);
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const time = (project: Project) => new Date(project.requested_at ?? project.created_at).getTime();
  const visible = scope.filter(project => (!platform || project.platforms.includes(platform as Platform)) && (!status || status === project.status)
    && (!normalized || [project.name, project.description, project.owner].some(value => value.toLocaleLowerCase('pt-BR').includes(normalized))))
    .sort((a, b) => sort === 'fewest' ? a.review_count - b.review_count || time(b) - time(a)
      : sort === 'goal' ? (b.review_count / b.review_goal) - (a.review_count / a.review_goal) || time(b) - time(a)
      : time(b) - time(a));
  const filtered = Boolean(normalized || platform || status);
  const { title, description } = headings[view];

  return <div className="flex flex-col gap-7">
    <header className="flex flex-col gap-1.5">
      <h1 className="text-[30px] leading-tight font-bold tracking-[-0.025em]">{title}</h1>
      <p className="max-w-2xl text-[15px] text-muted-foreground">{description}</p>
    </header>
    {view === 'explore' && <ForYou projects={projects} session={session} />}
    <section aria-labelledby="catalog-title" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="catalog-title" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.01em]">
          {view === 'explore' ? 'Catálogo' : view === 'mine' ? 'Seus projetos' : 'Aguardando você'}
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">{visible.length}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <PlatformFilter value={platform} onChange={setPlatform} />
          <Select value={status || 'all'} onValueChange={value => setStatus(value === 'all' ? '' : value)}>
            <SelectTrigger aria-label="Status" className="h-[38px] w-auto gap-1.5 text-[13px] font-medium">
              <span className="text-muted-foreground">Status:</span><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(projectStatusLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={value => setSort(value as Sort)}>
            <SelectTrigger aria-label="Ordenar" className="h-[38px] w-auto gap-1.5 text-[13px] font-medium">
              <span className="text-muted-foreground">Ordenar:</span><SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(sortLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {visible.length > 0 ? <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(18.75rem,1fr))]">
        {visible.map(project => <ProjectCard key={project.id} project={project} own={isOwn(project)} retests={view === 'retests'} />)}
      </div> : <div className={emptyState}>
        <div className={emptyIcon}>{view === 'retests' ? <RotateCcw size={22} aria-hidden /> : <FolderOpen size={22} aria-hidden />}</div>
        <h3 className="text-base font-semibold">{filtered ? 'Nenhum projeto encontrado' : view === 'mine' ? 'Você ainda não cadastrou projetos' : view === 'retests' ? 'Nenhum reteste pendente' : 'Nenhum projeto anunciado'}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{filtered ? 'Tente outro termo ou remova os filtros.'
          : view === 'mine' ? 'Cadastre um projeto para organizar suas reviews e tickets.'
          : view === 'retests' ? 'Quando o dono corrigir um bug que você relatou, ele aparece aqui.'
          : 'Os projetos aparecem aqui depois que o dono publica um pedido de review.'}</p>
        {filtered && <Button variant="outline" onClick={() => { onClearQuery(); setPlatform(''); setStatus(''); }}>Limpar filtros</Button>}
      </div>}
    </section>
  </div>;
}

export function Workspace({ view, projectId, initialQuery = '' }: { view: View; projectId?: string; initialQuery?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [dialog, open] = useState<Dialog | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [counts, setCounts] = useState(lastCounts);
  const locked = Boolean(session && !session.user);
  const userId = session?.user?.id;
  const next = projectId ? projectPath(projectId) : view === 'mine' ? '/?meus' : view === 'retests' ? '/?retestes' : '';
  const authQuery = next ? '?' + new URLSearchParams({ next }) : '';
  const signInHref = '/entrar' + authQuery;

  const dataPath = projectId ? projectApi(projectId) : '/api/projects';
  // Pedido antecipado dos dados, feito junto com a sessão para evitar uma ida e volta extra ao servidor.
  const prefetch = useRef<{ path: string; result: Promise<unknown> } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    prefetch.current = { path: dataPath, result: api<unknown>(dataPath, undefined, controller.signal).catch(() => null) };
    api<Session>('/api/session', undefined, controller.signal).then(setSession).catch(error => {
      if (!controller.signal.aborted) setError(errorMessage(error));
    });
    return () => controller.abort();
    // O pedido antecipado vale só para a primeira carga; as atualizações usam o efeito abaixo.
  }, []);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const early = prefetch.current?.path === dataPath ? prefetch.current.result : null;
    prefetch.current = null;
    const fetchData = async <T,>() => ((early && await early) ?? await api<T>(dataPath, undefined, signal)) as T;
    const load = async () => {
      try {
        if (projectId) {
          const result = await fetchData<ProjectDetail>();
          if (!signal.aborted) setDetail(result);
        } else {
          const result = await fetchData<{ projects: Project[] }>();
          if (!signal.aborted) {
            setProjects(result.projects);
            lastCounts = countsFrom(result.projects, userId);
            setCounts(lastCounts);
          }
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
  }, [dataPath, projectId, userId, version]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function refresh(message = '') {
    setNotice(message);
    setVersion(previous => previous + 1);
  }

  function handleLogout() {
    setProjects([]);
    setDetail(null);
    setLoadedFor(null);
    setError('');
    lastCounts = undefined;
    setCounts(undefined);
    setSession(current => current ? { ...current, user: null } : null);
    router.replace('/');
  }

  const owner = Boolean(detail && detail.project.owner_id === userId);
  const active = view === 'project' ? owner ? 'projects' : 'explore' : view === 'mine' ? 'projects' : view;
  const toolbar = <>
    <SearchBox value={query} onChange={setQuery} placeholder="Buscar projetos, donos ou tecnologias"
      onSubmit={view === 'project' ? () => router.push('/?q=' + encodeURIComponent(query.trim())) : undefined} />
    <Button className="ml-auto" onClick={() => open('new')}><Plus size={17} aria-hidden /><span className="hidden min-[400px]:inline">Novo projeto</span><span className="sr-only min-[400px]:hidden">Novo projeto</span></Button>
  </>;

  return <WorkspaceShell session={session} active={active} signInHref={signInHref} onLogout={handleLogout} toolbar={toolbar} counts={counts}>
    {error ? <section className={emptyState} role="alert">
      <div className={emptyIcon}><CircleAlert size={22} aria-hidden /></div>
      <h1 className="text-xl font-semibold tracking-tight">Não foi possível carregar</h1>
      <p className="max-w-md text-sm text-muted-foreground">{error}</p>
      <Button variant="outline" onClick={() => window.location.reload()}>Tentar novamente</Button>
    </section> : locked ? <section className="mx-auto mt-8 grid max-w-xl justify-items-start gap-5 surface p-6 sm:mt-16 sm:p-10">
      <div className="grid size-11 place-items-center rounded-md bg-primary-muted text-primary-strong"><UserRound size={22} aria-hidden /></div>
      <div>
        <h1 className="text-3xl font-bold tracking-[-0.025em]">{projectId ? 'Entre para ver o projeto' : view === 'mine' ? 'Acesse seus projetos' : 'Entre no ReviewLab'}</h1>
        <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">Entre ou crie uma conta para acessar os projetos e acompanhar suas reviews.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={signInHref} className={buttonVariants()}>Entrar</Link>
        <Link href={'/cadastro' + authQuery} className={buttonVariants({ variant: 'outline' })}>Criar conta</Link>
      </div>
    </section> : !session || loadedFor !== userId ? <p className="py-12 text-sm text-muted-foreground" role="status">Carregando {projectId ? 'projeto' : 'projetos'}…</p>
      : detail ? <ProjectView detail={detail} session={session} version={version} onEdit={() => open('edit')} onReview={() => open('review')} onChange={refresh} />
      : view !== 'project' && <Catalog projects={projects} view={view} session={session} query={query} onClearQuery={() => setQuery('')} />}
    <div role="status" className="fixed right-4 bottom-24 z-30 max-w-[calc(100%-2rem)] lg:bottom-4">
      {notice && <p className="surface px-4 py-3 text-sm font-semibold shadow-lg">{notice}</p>}
    </div>
    {dialog && session?.user && <Modal {...dialogs[dialog]} eyebrow={dialog !== 'new' && detail
      ? [detail.project.name, ...detail.project.platforms.map(platform => platformLabels[platform].toLowerCase())].join(' · ') : undefined}
      onClose={() => open(null)}>
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
