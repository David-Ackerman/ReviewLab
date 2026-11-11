'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Boxes, CircleAlert, FolderOpen, LogOut, MessageCircle, MessageSquare, Plus, Search, UserRound } from 'lucide-react';
import { platformLabels, projectStatusLabels, type Project, type ProjectDetail, type Session } from '@reviewlab/api/contracts';
import { api, errorMessage, projectApi, projectPath } from '../lib/client';
import { AccountForm, Modal, ProjectForm, ReviewForm } from './forms';
import { PlatformTag, ProjectCover, ProjectView, StatusTag } from './project-detail';

type Dialog = 'login' | 'register' | 'profile' | 'new' | 'edit' | 'review';
const dialogTitles: Record<Dialog, string> = {
  login: 'Entrar no ReviewLab', register: 'Criar conta', profile: 'Perfil de testador',
  new: 'Cadastrar projeto', edit: 'Editar projeto', review: 'Enviar review',
};

function Catalog({ projects, mine, session, onNew }: { projects: Project[]; mine: boolean; session: Session; onNew: () => void }) {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const scope = projects.filter(project => mine ? project.owner_id === session.user?.id : project.requested_at);
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const visible = scope.filter(project => (!platform || platform === project.platform) && (!status || status === project.status)
    && (!normalized || [project.name, project.description, project.owner].some(value => value.toLocaleLowerCase('pt-BR').includes(normalized))));
  const count = (state: Project['status']) => scope.filter(project => project.status === state).length;
  const filtered = Boolean(normalized || platform || status);

  return <>
    <div className="page-heading">
      <div><h1>{mine ? 'Meus projetos' : 'Projetos da comunidade'}</h1>
        <p>{mine ? 'Organize seus projetos e acompanhe o que precisa de atenção.' : 'Encontre projetos para testar e compartilhe o que encontrou.'}</p></div>
      <button className="button primary" onClick={onNew}><Plus size={18} aria-hidden />Novo projeto</button>
    </div>
    <dl className="metrics">
      <div><dt>{mine ? 'Meus projetos' : 'Anunciados'}</dt><dd>{scope.length}</dd></div>
      <div><dt><i className="dot review-dot" />Em review</dt><dd>{count('review')}</dd></div>
      <div><dt><i className="dot dev-dot" />Em desenvolvimento</dt><dd>{count('dev')}</dd></div>
      <div><dt><i className="dot prod-dot" />Em produção</dt><dd>{count('prod')}</dd></div>
    </dl>
    <section aria-labelledby="catalog-title" className="catalog">
      <div className="catalog-heading"><h2 id="catalog-title">{mine ? 'Seus projetos' : 'Catálogo'} <span className="total">{visible.length}</span></h2>
        <div className="filters">
          <label className="search"><Search size={17} aria-hidden /><span className="sr-only">Buscar projetos</span>
            <input type="search" placeholder="Buscar projetos" value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <label><span className="sr-only">Plataforma</span><select value={platform} onChange={event => setPlatform(event.target.value)}>
            <option value="">Todas as plataformas</option>
            {Object.entries(platformLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label><span className="sr-only">Status</span><select value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(projectStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
        </div>
      </div>
      {visible.length > 0 ? <div className="project-grid">{visible.map(project => <article className="project-card" key={project.id}>
        <Link href={projectPath(project.id)} className="project-card-link" aria-label={'Ver projeto ' + project.name}>
          <ProjectCover project={project} />
          <div className="card-content">
            <div className="flex flex-wrap items-center justify-between gap-2"><PlatformTag platform={project.platform} />
              <StatusTag state={project.status} label={projectStatusLabels[project.status]} />
            </div>
            <h3>{project.name}<ArrowUpRight size={17} aria-hidden /></h3>
            <p className="card-description">{project.description}</p>
            <div className="card-footer">
              <span className="card-owner"><span className="avatar small" aria-hidden>{project.owner.slice(0, 1).toUpperCase()}</span>{project.owner}</span>
              <span><MessageSquare size={15} aria-hidden />{project.review_count} {project.review_count === 1 ? 'review' : 'reviews'}</span>
            </div>
            {Boolean(project.pending_retests) && <p className="retest-label">{project.pending_retests} {project.pending_retests === 1 ? 'reteste pendente' : 'retestes pendentes'}</p>}
          </div>
        </Link>
      </article>)}</div> : <div className="empty">
        <div className="empty-icon"><FolderOpen size={23} aria-hidden /></div>
        <h3>{filtered ? 'Nenhum projeto encontrado' : mine ? 'Você ainda não cadastrou projetos' : 'Nenhum projeto anunciado'}</h3>
        <p>{filtered ? 'Tente outro termo ou remova os filtros.' : mine ? 'Cadastre um projeto para organizar suas reviews e tickets.' : 'Os projetos aparecem aqui quando alguém solicita uma review.'}</p>
        {filtered ? <button className="button secondary" onClick={() => { setQuery(''); setPlatform(''); setStatus(''); }}>Limpar filtros</button>
          : <button className="button secondary" onClick={onNew}><Plus size={16} aria-hidden />Cadastrar projeto</button>}
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

  function refresh(message: string) {
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

  return <div className="site-shell">
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <header className="site-header"><div className="header-inner">
      <Link href="/" className="brand"><span className="brand-mark"><Boxes size={21} aria-hidden /></span>ReviewLab</Link>
      <nav className="main-nav" aria-label="Navegação principal">
        <Link href="/" aria-current={!mine && !projectId ? 'page' : undefined}>Explorar</Link>
        <Link href="/?meus" aria-current={mine ? 'page' : undefined}>Meus projetos</Link>
      </nav>
      <div className="header-actions">
        {session?.whatsappGroup && <a className="group-link" aria-label="Grupo do WhatsApp" href={session.whatsappGroup} target="_blank" rel="noreferrer">
          <MessageCircle size={17} aria-hidden /><span>Grupo do WhatsApp</span><ArrowUpRight className="group-arrow" size={13} aria-hidden />
        </a>}
        {session?.user ? <>
          <button className="profile-button" onClick={() => open('profile')} aria-label="Editar perfil" title="Editar perfil">
            <span className="avatar">{session.user.name.slice(0, 1).toUpperCase()}</span><span>{session.user.name}</span>
          </button>
          <button className="icon-button" aria-label="Sair da conta" title="Sair da conta" onClick={logout} disabled={loggingOut}><LogOut size={17} aria-hidden /></button>
        </> : session && <button className="button secondary" onClick={() => open('login')}><UserRound size={16} aria-hidden />Entrar</button>}
      </div>
    </div></header>
    <main className="main-content" id="main-content" tabIndex={-1}>
      {error ? <section className="empty" role="alert"><div className="empty-icon"><CircleAlert size={23} aria-hidden /></div><h1>Não foi possível carregar</h1>
        <p>{error}</p><button className="button secondary" onClick={() => window.location.reload()}>Tentar novamente</button>
      </section> : locked ? <section className="empty access">
        <div className="empty-icon"><UserRound size={24} aria-hidden /></div>
        <h1>{mine ? 'Acesse seus projetos' : 'Entre no ReviewLab'}</h1>
        <p>Entre ou crie uma conta para acessar os projetos e acompanhar suas reviews.</p>
        <div className="action-row"><button className="button primary" onClick={() => open('login')}>Entrar</button>
          <button className="button secondary" onClick={() => open('register')}>Criar conta</button></div>
      </section> : !loaded || !session ? <p className="loading" role="status">Carregando {projectId ? 'projeto' : 'projetos'}…</p>
        : detail ? <ProjectView detail={detail} session={session} version={version} onEdit={() => open('edit')} onReview={() => open('review')} onChange={refresh} />
        : !projectId && <Catalog key={String(mine)} projects={projects} mine={mine} session={session} onNew={() => open('new')} />}
    </main>
    <footer className="site-footer"><div><span>ReviewLab</span><span>Projetos, reviews e tickets da comunidade.</span></div></footer>
    {notice && <p className="notice" role="status">{notice}</p>}
    {dialog && session && <Modal title={dialogTitles[dialog]} onClose={() => open(null)}>
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
