'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Boxes, CircleAlert, FolderOpen, LogOut, MessageCircle, MessageSquare, Plus, Search, UserRound } from 'lucide-react';
import { platformLabels, projectStatusLabels, type Platform, type Project, type ProjectDetail, type Session } from '@reviewlab/api/contracts';
import { api, errorMessage, projectApi, projectPath } from '../lib/client';
import { AccountForm, Modal, ProjectForm, ReviewForm } from './forms';
import { PlatformTags, ProjectCover, ProjectView, StatusTag } from './project-detail';
import { ThemeToggle } from './theme';
import { Button, buttonVariants } from './ui/button';
import { Input, NativeSelect } from './ui/input';

type Dialog = 'login' | 'register' | 'profile' | 'new' | 'edit' | 'review';
const dialogTitles: Record<Dialog, string> = {
  login: 'Entrar no ReviewLab', register: 'Criar conta', profile: 'Perfil de testador',
  new: 'Cadastrar projeto', edit: 'Editar projeto', review: 'Enviar review',
};
const dialogDescriptions: Record<Dialog, string> = {
  login: 'Use o e-mail e a senha da sua conta.',
  register: 'Informe seus dados e em quais plataformas você pode testar.',
  profile: 'Atualize seu nome, suas plataformas e suas preferências de aviso.',
  new: 'Informe o que sua comunidade pode testar.',
  edit: 'Atualize as informações e instruções de teste do projeto.',
  review: 'Conte como foi o teste e relate bugs que encontrou.',
};

const emptyState = 'grid min-h-64 place-items-center content-center gap-3 rounded-2xl border border-dashed border-input bg-card p-6 text-center';
const emptyIcon = 'grid size-12 place-items-center rounded-xl bg-muted text-primary';
const navLink = 'flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-1 text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-primary';

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

  return <>
    <section className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex flex-col items-start justify-between gap-5 bg-linear-to-br from-primary/12 via-card to-card p-6 sm:flex-row sm:items-center sm:p-9">
        <div>
          <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-5xl">{mine ? 'Meus projetos' : 'Projetos da comunidade'}</h1>
          <p className="mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">{mine
            ? 'Acompanhe as reviews e veja quais projetos precisam de atenção.'
            : 'Encontre projetos para testar e compartilhe o que encontrou.'}</p>
        </div>
        <Button onClick={onNew}><Plus size={18} aria-hidden />Novo projeto</Button>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
        {[
          { label: mine ? 'Meus projetos' : 'Anunciados', value: scope.length, color: 'bg-muted-foreground' },
          { label: 'Em review', value: count('review'), color: 'bg-indigo-500' },
          { label: 'Em desenvolvimento', value: count('dev'), color: 'bg-amber-600' },
          { label: 'Em produção', value: count('prod'), color: 'bg-primary' },
        ].map(metric => <div key={metric.label} className="grid min-w-0 gap-1 bg-card px-4 py-3.5 sm:px-7">
          <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className={'size-2 shrink-0 rounded-full ' + metric.color} aria-hidden />{metric.label}
          </dt>
          <dd className="text-2xl font-semibold tracking-tight tabular-nums">{metric.value}</dd>
        </div>)}
      </dl>
    </section>
    <section aria-labelledby="catalog-title" className="mt-8 sm:mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 id="catalog-title" className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
          {mine ? 'Seus projetos' : 'Catálogo'}
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground tabular-nums">{visible.length}</span>
        </h2>
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto">
          <label className="relative col-span-2 min-w-0">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <span className="sr-only">Buscar projetos</span>
            <Input className="pl-9 sm:w-52" type="search" placeholder="Buscar projetos" value={query} onChange={event => setQuery(event.target.value)} />
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
      {visible.length > 0 ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map(project => <article className="group min-w-0 rounded-2xl border border-border bg-card shadow-xs transition-shadow hover:shadow-md" key={project.id}>
        <Link href={projectPath(project.id)} className="flex h-full flex-col overflow-hidden rounded-2xl" aria-label={'Ver projeto ' + project.name}>
          <ProjectCover project={project} />
          <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2"><PlatformTags platforms={project.platforms} />
              <StatusTag state={project.status} label={projectStatusLabels[project.status]} /></div>
            <h3 className="flex items-start justify-between gap-2 text-lg leading-tight font-bold tracking-tight wrap-anywhere">
              {project.name}<ArrowUpRight className="shrink-0 text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" size={17} aria-hidden />
            </h3>
            <p className="line-clamp-2 min-h-10 text-sm leading-5 wrap-anywhere text-muted-foreground">{project.description}</p>
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1.5 wrap-anywhere"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted font-bold text-primary" aria-hidden>{project.owner.slice(0, 1).toUpperCase()}</span>{project.owner}</span>
              <span className="flex shrink-0 items-center gap-1.5"><MessageSquare size={15} aria-hidden />{project.review_count} {project.review_count === 1 ? 'review' : 'reviews'}</span>
            </div>
            {Boolean(project.pending_retests) && <p className="text-xs font-semibold text-primary">{project.pending_retests} {project.pending_retests === 1 ? 'reteste pendente' : 'retestes pendentes'}</p>}
          </div>
        </Link>
      </article>)}</div> : <div className={emptyState}>
        <div className={emptyIcon}><FolderOpen size={23} aria-hidden /></div>
        <h3 className="text-lg font-bold">{filtered ? 'Nenhum projeto encontrado' : mine ? 'Você ainda não cadastrou projetos' : 'Nenhum projeto anunciado'}</h3>
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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [dialog, open] = useState<Dialog | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const locked = Boolean(session && !session.user);

  useEffect(() => {
    const controller = new AbortController();
    api<Session>('/api/session', undefined, controller.signal).then(setSession).catch(error => {
      if (!controller.signal.aborted) setError(errorMessage(error));
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!session || locked) return;
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
        if (!signal.aborted) setLoaded(true);
      }
    };
    void load();
    return () => controller.abort();
  }, [locked, projectId, session, version]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function refresh(message = '') {
    setNotice(message);
    setVersion(previous => previous + 1);
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await api('/api/logout', {});
      const next = await api<Session>('/api/session');
      setProjects([]);
      setDetail(null);
      setLoaded(false);
      setSession(next);
      router.push('/');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoggingOut(false);
    }
  }

  return <div className="flex min-h-dvh flex-col">
    <a className="sr-only focus:not-sr-only focus:absolute focus:z-30 focus:m-3 focus:rounded-lg focus:bg-card focus:p-3" href="#main-content">Ir para o conteúdo</a>
    <header className="border-b border-border bg-card"><div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 pt-2 sm:flex sm:min-h-16 sm:gap-6 sm:px-7 sm:pt-0">
      <Link href="/" className="flex w-fit min-w-0 shrink-0 items-center gap-2 text-lg font-bold tracking-tight">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Boxes size={20} aria-hidden /></span>ReviewLab
      </Link>
      <nav className="col-span-2 row-start-2 flex gap-4 self-stretch text-sm font-semibold sm:gap-5" aria-label="Navegação principal">
        <Link href="/" className={navLink} aria-current={!mine && !projectId ? 'page' : undefined}>Explorar</Link>
        <Link href="/?meus" className={navLink} aria-current={mine ? 'page' : undefined}>Meus projetos</Link>
      </nav>
      <div className="col-start-2 row-start-1 ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1">
        <ThemeToggle />
        {session?.whatsappGroup && <a className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label="Grupo do WhatsApp" title="Grupo do WhatsApp" href={session.whatsappGroup} target="_blank" rel="noreferrer">
          <MessageCircle size={18} aria-hidden />
        </a>}
        {session?.user ? <>
          <Button variant="ghost" className="max-w-40 min-w-10 px-1 sm:px-2" onClick={() => open('profile')} aria-label="Editar perfil" title="Editar perfil">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-primary">{session.user.name.slice(0, 1).toUpperCase()}</span>
            <span className="hidden truncate lg:inline">{session.user.name}</span>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Sair da conta" title="Sair da conta" onClick={logout} disabled={loggingOut}><LogOut size={17} aria-hidden /></Button>
        </> : session && <Button variant="outline" onClick={() => open('login')}>Entrar</Button>}
      </div>
    </div></header>
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-12 sm:px-7 sm:pt-10 sm:pb-16" id="main-content" tabIndex={-1}>
      {error ? <section className={emptyState} role="alert">
        <div className={emptyIcon}><CircleAlert size={23} aria-hidden /></div>
        <h1 className="text-2xl font-bold tracking-tight">Não foi possível carregar</h1>
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Tentar novamente</Button>
      </section> : locked ? <section className="mx-auto mt-4 grid min-h-80 max-w-2xl place-items-center content-center gap-4 rounded-3xl border border-border bg-linear-to-br from-primary/10 via-card to-card p-6 text-center sm:mt-12 sm:p-10">
        <div className={emptyIcon}><UserRound size={24} aria-hidden /></div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{mine ? 'Acesse seus projetos' : 'Entre no ReviewLab'}</h1>
        <p className="max-w-sm text-sm text-muted-foreground sm:text-base">Entre ou crie uma conta para acessar os projetos e acompanhar suas reviews.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => open('login')}>Entrar</Button>
          <Button variant="outline" onClick={() => open('register')}>Criar conta</Button>
        </div>
      </section> : !loaded || !session ? <p className="py-12 text-center text-sm text-muted-foreground" role="status">Carregando {projectId ? 'projeto' : 'projetos'}…</p>
        : detail ? <ProjectView detail={detail} session={session} version={version} onEdit={() => open('edit')} onReview={() => open('review')} onChange={refresh} />
        : !projectId && <Catalog key={String(mine)} projects={projects} mine={mine} session={session} onNew={() => open('new')} />}
    </main>
    <footer className="border-t border-border bg-card">
      <div className="mx-auto w-full max-w-7xl px-4 py-4 text-xs font-semibold text-muted-foreground sm:px-7">ReviewLab</div>
    </footer>
    <div role="status" className="fixed right-4 bottom-4 z-30 max-w-[calc(100%-2rem)]">
      {notice && <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold shadow-lg">{notice}</p>}
    </div>
    {dialog && session && <Modal title={dialogTitles[dialog]} description={dialogDescriptions[dialog]} onClose={() => open(null)}>
      {(dialog === 'login' || dialog === 'register' || dialog === 'profile') && <AccountForm key={dialog} mode={dialog} session={session}
        toggle={() => open(dialog === 'login' ? 'register' : 'login')}
        onSave={next => {
          setSession(next);
          if (dialog === 'profile') setNotice('Perfil atualizado.');
          open(null);
        }} />}
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
  </div>;
}
