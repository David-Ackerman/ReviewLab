import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { getCookie, setCookie } from 'hono/cookie';
import { waitUntil } from '@vercel/functions';
import { openDatabase } from './database.ts';
import { migrate } from './schema.ts';
import { aiEnabled, createTriage, missingFields } from './triage.ts';
import { createAnnouncements } from './announcements.ts';
import { createStorage, mediaType, cleanFilename, uploadIdPattern } from './storage.ts';
import { platformLabels, projectStatusLabels, ticketStatusLabels } from './contracts.ts';
import type { Attachment, Platform, Project, Review, Ticket, TicketEvent, User } from './contracts.ts';

type UserRecord = Omit<User, 'platforms' | 'announcement_emails'> & { platforms: string; announcement_emails: number };
type ProjectRecord = Omit<Project, 'platforms'> & { platforms: string };
const publicProject = (project: ProjectRecord): Project => ({
  ...project, platforms: JSON.parse(project.platforms) as Platform[],
});
type Media = { bytes: Uint8Array | null; type: string | null; path?: string; id?: string };
type Evidence = Media & { name: string };
type TicketAccess = { owner_id: string; user_id: string };
type TicketRow = Omit<Ticket, 'missing' | 'suggestion' | 'events' | 'attachments'> & { missing: string | null; suggestion: string | null };
type BackgroundTask = () => Promise<unknown>;
type AppEnv = {
  Bindings: { afterResponse?: (task: BackgroundTask) => void };
  Variables: { user: UserRecord | undefined };
};
type AppContext = Context<AppEnv>;

class HttpError extends Error {
  readonly status: ContentfulStatusCode;

  constructor(status: ContentfulStatusCode, message: string) {
    super(message);
    this.status = status;
  }
}
const fail: (status: ContentfulStatusCode, message: string) => never = (status, message) => {
  throw new HttpError(status, message);
};
const now = () => new Date().toISOString();
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
});
const maxImage = 5 * 1024 * 1024;
const maxVideo = 20 * 1024 * 1024;
const maxEvidence = 25 * 1024 * 1024;
const sessionAge = 7 * 24 * 60 * 60;
const platforms = Object.keys(platformLabels) as Platform[];
const isKey = <T extends object>(object: T, value: unknown): value is keyof T =>
  typeof value === 'string' && Object.hasOwn(object, value);

function groupLink(value: string | undefined) {
  if (!value) return null;
  const url = new URL(value);
  if (url.origin !== 'https://chat.whatsapp.com' || url.username || url.password || !/^\/[\w-]+\/?$/.test(url.pathname)) {
    throw new Error('WHATSAPP_GROUP_URL deve apontar para um convite de chat.whatsapp.com.');
  }
  return url.href;
}

async function readBody(req: Request, format: 'json', maxFiles?: number): Promise<Record<string, unknown>>;
async function readBody(req: Request, format: 'form', maxFiles?: number): Promise<FormData>;
async function readBody(req: Request, format: 'form' | 'json', maxFiles = maxImage) {
  const limit = format === 'form' ? maxFiles + 65536 : 16384;
  const type = req.headers.get('content-type') || '';
  if (!(format === 'form' ? type.startsWith('multipart/form-data;') : type.split(';')[0] === 'application/json')) {
    fail(415, 'Formato de envio inválido.');
  }
  if (Number(req.headers.get('content-length')) > limit) fail(413, 'O envio ultrapassa o limite permitido.');
  const reader = req.body?.getReader();
  if (!reader) fail(400, 'Dados inválidos.');
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        fail(413, 'O envio ultrapassa o limite permitido.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  try {
    if (format === 'form') return await new Response(bytes, { headers: { 'Content-Type': type } }).formData();
    const data = JSON.parse(bytes.toString('utf8'));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  } catch {
    fail(400, 'Não foi possível ler o envio.');
  }
  fail(400, 'Dados inválidos.');
}

function json(c: AppContext, data: object, status: ContentfulStatusCode = 200) {
  return c.json(data, status);
}

export async function createApi() {
  const vercel = process.env.VERCEL === '1';
  const cwd = process.cwd();
  const localData = basename(cwd) === 'web' && basename(dirname(cwd)) === 'apps' ? '../../data' : 'data';
  const dataDir = resolve(process.env.DATA_DIR || process.env.WEENY_DATA_DIR || localData);
  const vercelHost = process.env.VERCEL_ENV === 'production'
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
    : process.env.VERCEL_URL;
  const originSetting = process.env.APP_ORIGIN || (vercelHost && 'https://' + vercelHost);
  const appOrigin = originSetting ? new URL(originSetting).origin : null;
  const cronSecret = process.env.CRON_SECRET;
  const whatsappGroup = groupLink(process.env.WHATSAPP_GROUP_URL);
  const db = await openDatabase(dataDir);
  await migrate(db);
  const { get, all, run, transaction } = db;
  const storage = await createStorage(db, fail);
  const triage = await createTriage(db, storage);
  const announcements = await createAnnouncements(db, appOrigin);
  const app = new Hono<AppEnv>();

  async function drain(worker: { processNext: () => Promise<true | undefined> }, max: number) {
    for (let index = 0; index < max; index++) {
      if (!await worker.processNext()) break;
    }
  }
  function defer(task: BackgroundTask, c?: AppContext) {
    const work = async () => {
      try {
        await task();
      } catch (error) {
        console.error('Falha em tarefa do ReviewLab:', error instanceof Error ? error.name : 'erro desconhecido');
      }
    };
    if (c?.env?.afterResponse) c.env.afterResponse(work);
    else if (vercel) waitUntil(work());
    else void work();
  }
  function schedule(worker: Parameters<typeof drain>[0], max: number, c?: AppContext) {
    defer(() => drain(worker, max), c);
  }
  if (!vercel) {
    if (aiEnabled) setInterval(() => schedule(triage, 1), 5000).unref();
    if (announcements.enabled) setInterval(() => schedule(announcements, 1), 2500).unref();
    if (storage) setInterval(() => defer(() => storage.cleanup()), 3600_000).unref();
  }
  app.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Cache-Control', 'private, no-store');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    await next();
  });
  app.use('/api/*', async (c, next) => {
    if (c.req.method === 'POST') {
      const received = c.req.header('origin');
      const requestOrigin = (vercel ? 'https://' : 'http://') + (c.req.header('host') || new URL(c.req.url).host);
      const allowed = appOrigin || requestOrigin;
      if ((received && received !== allowed && !(vercel && received === requestOrigin)) || c.req.header('sec-fetch-site') === 'cross-site') {
        fail(403, 'Origem inválida.');
      }
    }
    c.set('user', await userFor(c));
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof HttpError) return json(c, { error: error.message }, error.status);
    console.error('Falha na API do ReviewLab:', error.name, 'code' in error ? error.code : '');
    return json(c, { error: 'Erro interno. Tente novamente.' }, 500);
  });
  app.notFound(c => json(c, { error: 'Página não encontrada.' }, 404));

  function field(data: Record<string, unknown> | FormData, key: string, label: string, max: number, required = false) {
    const input = data instanceof FormData ? data.get(key) : data[key];
    const value = typeof input === 'string' ? input.trim() : '';
    if (required && !value) fail(400, 'Preencha o campo ' + label + '.');
    if (value.length > max) fail(400, 'O campo ' + label + ' aceita até ' + max + ' caracteres.');
    return value;
  }

  function testerProfile(data: Record<string, unknown>) {
    const name = field(data, 'name', 'nome', 80, true);
    const chosen = platforms.filter(platform => Array.isArray(data.platforms) && data.platforms.includes(platform));
    if (!chosen.length) fail(400, 'Selecione ao menos uma plataforma de teste.');
    return { name, chosen };
  }

  async function projectInput(req: Request, user: UserRecord, project?: Project) {
    const form = await readBody(req, 'form');
    const name = field(form, 'name', 'nome', 100, true);
    const selection = form.has('platforms') ? form.getAll('platforms')
      : form.has('platform') ? [form.get('platform')] : project?.platforms ?? ['web'];
    if (!selection.every(value => isKey(platformLabels, value))) fail(400, 'Selecione Web, Android ou iOS.');
    const chosen = platforms.filter(platform => selection.includes(platform));
    if (!chosen.length) fail(400, 'Selecione pelo menos uma plataforma.');
    const description = field(form, 'description', 'descrição', 1600, true);
    const url = projectUrl(field(form, 'url', 'link', 2048, true));
    const instructions = field(form, 'instructions', 'instruções de teste', 2000, chosen.some(platform => platform !== 'web'));
    const cover = storage && form.has('cover_id')
      ? await storage.verify(form.get('cover_id'), user.id, project?.id || '', 'cover')
      : await image(form, 'cover');
    const removeCover = form.get('remove_cover') === 'yes';
    if (cover.bytes && removeCover) fail(400, 'Escolha entre trocar ou remover a imagem de capa.');
    return { name, chosen, description, url, instructions, cover, removeCover };
  }

  async function image(form: FormData, key: string): Promise<Media> {
    const file = form.get(key);
    if (!(file instanceof File) || !file.size) return { bytes: null, type: null };
    if (storage) fail(400, 'Envie a imagem pelo upload direto.');
    if (file.size > maxImage) fail(413, 'A imagem deve ter até 5 MB.');
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = mediaType(bytes);
    if (!type?.startsWith('image/')) fail(400, 'Envie uma imagem PNG, JPEG ou WebP.');
    return { bytes, type };
  }

  async function attachments(form: FormData, userId: string, projectId: string): Promise<Evidence[]> {
    const files = form.getAll('evidence').filter((file): file is File => file instanceof File && file.size > 0);
    if (storage) {
      if (files.length) fail(400, 'Envie os anexos pelo upload direto.');
      const ids = form.getAll('evidence_id');
      if (ids.length > 4 || new Set(ids).size !== ids.length) fail(400, 'Selecione até 4 anexos diferentes.');
      const items = await Promise.all(ids.map(id => storage.verify(id, userId, projectId, 'evidence')));
      if (items.reduce((size, file) => size + file.size, 0) > maxEvidence) fail(413, 'Os anexos juntos devem ter até 25 MB.');
      return items;
    }
    if (files.length > 4) fail(400, 'Anexe até 4 arquivos por relato.');
    if (files.reduce((size, file) => size + file.size, 0) > maxEvidence) fail(413, 'Os anexos juntos devem ter até 25 MB.');
    const records = [];
    for (const file of files) {
      if (file.size > maxVideo) fail(413, 'Cada vídeo deve ter até 20 MB.');
      const bytes = Buffer.from(await file.arrayBuffer());
      const type = mediaType(bytes);
      if (!type) fail(400, 'Use imagens PNG, JPEG ou WebP e vídeos MP4 ou WebM.');
      if (type.startsWith('image/') && file.size > maxImage) fail(413, 'Cada imagem deve ter até 5 MB.');
      records.push({ name: cleanFilename(file.name), bytes, type });
    }
    return records;
  }

  function projectUrl(input: string) {
    let url: URL;
    try { url = new URL(input); } catch { fail(400, 'Informe um link web válido.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      fail(400, 'Informe um link HTTP ou HTTPS sem credenciais.');
    }
    return url.href;
  }

  function sessionToken(c: AppContext) {
    const token = getCookie(c, 'session');
    return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
  }

  function publicUser(user: UserRecord | undefined): User | null {
    return user ? { ...user, platforms: JSON.parse(user.platforms) as Platform[], announcement_emails: Boolean(user.announcement_emails) } : null;
  }

  async function userFor(c: AppContext) {
    const token = sessionToken(c);
    if (!token) return undefined;
    return get<UserRecord>(`SELECT u.id, u.name, u.email, u.platforms, u.announcement_emails FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?`, hash(token), Date.now());
  }

  function sessionCookie(c: AppContext, token: string, age: number) {
    setCookie(c, 'session', token, { httpOnly: true, path: '/', sameSite: 'Lax', secure: Boolean(appOrigin?.startsWith('https:')), maxAge: age });
  }

  async function startSession(c: AppContext, id: string) {
    const token = randomBytes(32).toString('hex');
    const oldToken = sessionToken(c);
    await transaction(async () => {
      if (oldToken) await run('DELETE FROM sessions WHERE token_hash = ?', hash(oldToken));
      await run('DELETE FROM sessions WHERE expires <= ?', Date.now());
      await run('INSERT INTO sessions VALUES (?, ?, ?)', hash(token), id, Date.now() + sessionAge * 1000);
    });
    sessionCookie(c, token, sessionAge);
    return publicUser(await get<UserRecord>('SELECT id, name, email, platforms, announcement_emails FROM users WHERE id = ?', id));
  }

  function requireUser(user: UserRecord | undefined): asserts user is UserRecord {
    if (!user) fail(401, 'Entre na sua conta para continuar.');
  }

  function requireOwner(resource: { owner_id: string }, user: UserRecord | undefined): asserts user is UserRecord {
    requireUser(user);
    if (resource.owner_id !== user.id) fail(403, 'Apenas o dono pode alterar este item.');
  }

  const projectFields = `p.id, p.name, p.platform, p.platforms, p.description, p.url, p.instructions, p.status, p.requested_at,
    p.created_at, p.owner_id, u.name AS owner, p.cover IS NOT NULL AS has_cover,
    (SELECT COUNT(*) FROM reviews r WHERE r.project_id = p.id) AS review_count`;

  async function projectFor(id: string, user: UserRecord | undefined) {
    if (!uploadIdPattern.test(id)) fail(404, 'Projeto não encontrado.');
    const project = await get<ProjectRecord>(`SELECT ${projectFields} FROM projects p JOIN users u ON u.id = p.owner_id
      WHERE p.id = ? AND (p.requested_at IS NOT NULL OR p.owner_id = ?)`, id, user?.id ?? '');
    if (!project) fail(404, 'Projeto não encontrado.');
    return publicProject(project);
  }

  async function ticketFor(id: string, user: UserRecord | undefined) {
    requireUser(user);
    if (!uploadIdPattern.test(id)) fail(404, 'Ticket não encontrado.');
    const ticket = await get<TicketAccess>(`SELECT r.user_id, p.owner_id FROM tickets t JOIN reviews r ON r.id = t.review_id
      JOIN projects p ON p.id = r.project_id WHERE t.id = ?`, id);
    if (!ticket || ![ticket.owner_id, ticket.user_id].includes(user.id)) fail(404, 'Ticket não encontrado.');
    return ticket;
  }

  function sendImage(record: Media | undefined) {
    if (!record?.bytes || !record.type) fail(404, 'Imagem não encontrada.');
    return new Response(new Uint8Array(record.bytes), { headers: { 'Content-Type': record.type, 'Cache-Control': 'private, no-store' } });
  }

  async function redirectMedia(c: AppContext, path: string) {
    if (!storage) fail(503, 'O armazenamento de anexos não está configurado.');
    return c.redirect(await storage.signedUrl(path), 302);
  }

  const loginAttempts = new Map<string, { count: number; until: number }>();
  function limitAuth(c: AppContext) {
    const address = (vercel ? c.req.header('x-vercel-forwarded-for') : undefined) || 'local';
    const time = Date.now();
    for (const [key, value] of loginAttempts) if (value.until <= time) loginAttempts.delete(key);
    const entry = loginAttempts.get(address) || { count: 0, until: time + 60_000 };
    if (entry.count >= 20) fail(429, 'Muitas tentativas. Aguarde um minuto.');
    entry.count++;
    loginAttempts.set(address, entry);
  }

  async function sendAttachment(c: AppContext, id: string, ticketId: string) {
    const record = await get<{ type: string; storage_path: string | null; size: number }>('SELECT type, storage_path, length(bytes) AS size FROM ticket_attachments WHERE id = ? AND ticket_id = ?', id, ticketId);
    if (!record) fail(404, 'Anexo não encontrado.');
    if (record.storage_path) return redirectMedia(c, record.storage_path);
    const headers: Record<string, string> = { 'Content-Type': record.type, 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes' };
    const range = c.req.header('range');
    let start = 0;
    let end = record.size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        if (match[1]) {
          start = Number(match[1]);
          if (match[2]) end = Math.min(end, Number(match[2]));
        } else {
          start = Math.max(0, record.size - Number(match[2]));
        }
      } else {
        start = record.size;
      }
      if (start > end || !Number.isSafeInteger(start)) {
        return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': 'bytes */' + record.size } });
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${record.size}`;
    }
    const size = end - start + 1;
    const row = await get<{ bytes: Uint8Array }>('SELECT substr(bytes, ?, ?) AS bytes FROM ticket_attachments WHERE id = ?', start + 1, size, id);
    if (!row) fail(404, 'Anexo não encontrado.');
    return new Response(new Uint8Array(row.bytes), { status: range ? 206 : 200, headers: { ...headers, 'Content-Length': String(size) } });
  }

  app.get('/api/jobs', async c => {
    if (!cronSecret || !timingSafeEqual(Buffer.from(hash(c.req.header('authorization') || '')), Buffer.from(hash('Bearer ' + cronSecret)))) {
      fail(401, 'Acesso negado.');
    }
    await Promise.all([drain(triage, 3), drain(announcements, 20), storage?.cleanup()]);
    return json(c, { ok: true });
  });

  app.get('/healthz', async c => {
    try {
      await get('SELECT id FROM users LIMIT 1');
      await storage?.check();
      return json(c, { ok: true });
    } catch {
      return json(c, { ok: false, error: 'Verifique a conexão com o banco e o bucket privado.' }, 503);
    }
  });

  app.get('/api/session', async c => {
    const user = c.get('user');
    return json(c, { user: publicUser(user), whatsappGroup: user ? whatsappGroup : null,
      appOrigin, aiEnabled, emailAnnouncementsEnabled: announcements.enabled,
      directUploads: Boolean(storage) });
  });

  app.post('/api/uploads', async c => {
    const user = c.get('user');
    requireUser(user);
    if (!storage) fail(404, 'Upload direto indisponível.');
    const data = await readBody(c.req.raw, 'json');
    const { purpose, projectId = '' } = data;
    if ((purpose !== 'cover' && purpose !== 'evidence') || typeof projectId !== 'string'
      || (projectId ? !uploadIdPattern.test(projectId) : purpose !== 'cover')) fail(400, 'Destino de upload inválido.');
    if (projectId) {
      const project = await projectFor(projectId, user);
      if (purpose === 'cover') requireOwner(project, user);
      else if (!project.requested_at || project.owner_id === user.id) fail(403, 'Projeto indisponível para review.');
    }
    return json(c, await storage.reserve(user.id, projectId, purpose, data), 201);
  });

  app.post('/api/profile', async c => {
    const user = c.get('user');
    requireUser(user);
    const data = await readBody(c.req.raw, 'json');
    const { name, chosen } = testerProfile(data);
    const receive = typeof data.announcement_emails === 'boolean' ? data.announcement_emails : Boolean(user.announcement_emails);
    await run('UPDATE users SET name = ?, platforms = ?, announcement_emails = ? WHERE id = ?', name, JSON.stringify(chosen), Number(receive), user.id);
    return json(c, { user: { ...publicUser(user), name, platforms: chosen, announcement_emails: receive } });
  });

  async function authenticate(c: AppContext, register: boolean) {
    limitAuth(c);
    const data = await readBody(c.req.raw, 'json');
    const email = field(data, 'email', 'e-mail', 254, true).toLowerCase();
    const password = typeof data.password === 'string' ? data.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) {
      fail(400, 'Informe um e-mail válido e uma senha de 8 a 128 caracteres.');
    }
    if (register) {
      const { name, chosen } = testerProfile(data);
      const id = randomUUID();
      const salt = randomBytes(16).toString('hex');
      const key = await derive(password, salt);
      const inserted = await run(`INSERT INTO users (id, name, email, salt, password_hash, platforms, announcement_emails)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING`,
        id, name, email, salt, key.toString('hex'), JSON.stringify(chosen), Number(data.announcement_emails === true));
      if (!inserted.changes) fail(409, 'Já existe uma conta com esse e-mail.');
      return json(c, { user: await startSession(c, id) }, 201);
    }
    const record = await get<{ id: string; salt: string; password_hash: string }>('SELECT id, salt, password_hash FROM users WHERE email = ?', email);
    const key = await derive(password, record?.salt || 'missing-account-salt');
    if (!record || !timingSafeEqual(key, Buffer.from(record.password_hash, 'hex'))) {
      fail(401, 'E-mail ou senha inválidos.');
    }
    return json(c, { user: await startSession(c, record.id) });
  }
  app.post('/api/register', c => authenticate(c, true));
  app.post('/api/login', c => authenticate(c, false));

  app.post('/api/logout', async c => {
    await readBody(c.req.raw, 'json');
    const token = sessionToken(c);
    if (token) await run('DELETE FROM sessions WHERE token_hash = ?', hash(token));
    sessionCookie(c, '', 0);
    return json(c, {});
  });

  app.get('/api/projects', async c => {
    const user = c.get('user');
    requireUser(user);
    schedule(triage, 3, c);
    schedule(announcements, 8, c);
    const projects = await all<ProjectRecord>(`SELECT ${projectFields},
      (SELECT COUNT(*) FROM reviews r JOIN tickets t ON t.review_id = r.id
        WHERE r.project_id = p.id AND r.user_id = ? AND t.retest_request_id IS NOT NULL) AS pending_retests
      FROM projects p JOIN users u ON u.id = p.owner_id
      WHERE p.requested_at IS NOT NULL OR p.owner_id = ?
      ORDER BY pending_retests DESC, COALESCE(p.requested_at, p.created_at) DESC`, user.id, user.id);
    return json(c, { projects: projects.map(publicProject) });
  });

  app.post('/api/projects', async c => {
    const user = c.get('user');
    requireUser(user);
    const id = randomUUID();
    const { name, chosen, description, url, instructions, cover } = await projectInput(c.req.raw, user);
    await transaction(async () => {
      await storage?.consume(cover);
      await run(`INSERT INTO projects (id, owner_id, name, platform, platforms, description, url, instructions, status, cover, cover_type, cover_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'dev', ?, ?, ?, ?)`,
        id, user.id, name, chosen[0], JSON.stringify(chosen), description, url, instructions, cover.bytes, cover.type, cover.path ?? null, now());
    });
    return json(c, { id }, 201);
  });

  app.get('/api/projects/:id', async c => {
    const user = c.get('user');
    requireUser(user);
    const id = c.req.param('id');
    const project = await projectFor(id, user);
    const reviews = await all<Review>(`SELECT r.id, r.feedback, r.created_at, u.name AS author FROM reviews r
      JOIN users u ON u.id = r.user_id WHERE r.project_id = ? ORDER BY r.created_at DESC`, id);
    const rows = await all<TicketRow>(`SELECT t.id, t.title, t.observed, t.expected, t.steps, t.environment, t.status, t.retest_request_id,
      t.evidence IS NOT NULL AS has_evidence, t.created_at, r.id AS review_id, u.name AS reporter,
      q.state AS triage_state, q.missing, q.suggestion, q.duplicate_id
      FROM tickets t JOIN reviews r ON r.id = t.review_id JOIN users u ON u.id = r.user_id
      LEFT JOIN ticket_triage q ON q.ticket_id = t.id
      WHERE r.project_id = ? AND (? = ? OR r.user_id = ?) ORDER BY t.created_at DESC`,
      id, user.id, project.owner_id, user.id);
    const events = `SELECT e.status, e.created_at, u.name AS actor FROM ticket_events e
      JOIN users u ON u.id = e.actor_id WHERE e.ticket_id = ? ORDER BY e.id`;
    const fileList = 'SELECT id, name, type FROM ticket_attachments WHERE ticket_id = ? ORDER BY position';
    const tickets: Ticket[] = await Promise.all(rows.map(async row => ({
      ...row,
      events: await all<TicketEvent>(events, row.id),
      attachments: await all<Attachment>(fileList, row.id),
      missing: row.missing ? JSON.parse(row.missing) as Ticket['missing'] : missingFields(row),
      suggestion: row.suggestion ? JSON.parse(row.suggestion) as Ticket['suggestion'] : null,
      duplicate_id: user.id === project.owner_id ? row.duplicate_id : undefined,
    })));
    const myReview = await get<{ feedback: string }>('SELECT feedback FROM reviews WHERE project_id = ? AND user_id = ?', id, user.id);
    const emailAnnouncement = project.owner_id === user.id && project.requested_at ? await announcements.summary(id) : null;
    if (emailAnnouncement?.queued) schedule(announcements, 8, c);
    return json(c, { project, reviews, tickets, myReview: myReview ?? null, emailAnnouncement });
  });

  app.get('/api/projects/:id/cover', async c => {
    const user = c.get('user');
    requireUser(user);
    const id = c.req.param('id');
    const project = await projectFor(id, user);
    const cover = await get<Media & { cover_path: string | null }>('SELECT cover AS bytes, cover_type AS type, cover_path FROM projects WHERE id = ?', id);
    return cover?.cover_path ? redirectMedia(c, cover.cover_path) : sendImage(cover);
  });

  app.post('/api/projects/:id/edit', async c => {
    const user = c.get('user');
    requireUser(user);
    const id = c.req.param('id');
    const project = await projectFor(id, user);
    requireOwner(project, user);
    const { name, chosen, description, url, instructions, cover, removeCover } = await projectInput(c.req.raw, user, project);
    let previousCover: string | null | undefined;
    await transaction(async () => {
      await run('UPDATE projects SET name = ?, platform = ?, platforms = ?, description = ?, url = ?, instructions = ? WHERE id = ?',
        name, chosen[0], JSON.stringify(chosen), description, url, instructions, id);
      if (cover.bytes || removeCover) {
        previousCover = (await get<{ cover_path: string | null }>('SELECT cover_path FROM projects WHERE id = ?', id))?.cover_path;
        await storage?.consume(cover);
        await run('UPDATE projects SET cover = ?, cover_type = ?, cover_path = ? WHERE id = ?', cover.bytes, cover.type, cover.path ?? null, id);
      }
    });
    if (previousCover && storage) {
      const path = previousCover;
      defer(() => storage.remove(path), c);
    }
    return json(c, {});
  });

  app.post('/api/projects/:id/request', async c => {
    const user = c.get('user');
    requireUser(user);
    const id = c.req.param('id');
    const project = await projectFor(id, user);
    requireOwner(project, user);
    await readBody(c.req.raw, 'json');
    await transaction(async () => {
      const published = await get<{ id: string; owner_id: string }>(`UPDATE projects SET requested_at = ?, status = 'review'
        WHERE id = ? AND requested_at IS NULL RETURNING id, owner_id`, now(), id);
      if (published) await announcements.enqueue(published);
    });
    schedule(announcements, vercel ? 8 : 1, c);
    return json(c, {});
  });

  app.post('/api/projects/:id/status', async c => {
    const user = c.get('user');
    requireUser(user);
    const id = c.req.param('id');
    const project = await projectFor(id, user);
    requireOwner(project, user);
    const { status } = await readBody(c.req.raw, 'json');
    if (!isKey(projectStatusLabels, status)) fail(400, 'Status de projeto inválido.');
    if (status === 'review' && !project.requested_at) fail(409, 'Solicite a review para anunciar o projeto.');
    await run('UPDATE projects SET status = ? WHERE id = ?', status as string, id);
    return json(c, {});
  });

  app.post('/api/projects/:id/reviews', async c => {
    const user = c.get('user');
    requireUser(user);
    const id = c.req.param('id');
    const project = await projectFor(id, user);
    if (!project.requested_at) fail(409, 'O projeto ainda não foi anunciado.');
    if (project.owner_id === user.id) fail(403, 'Você não pode revisar seu próprio projeto.');
    const form = await readBody(c.req.raw, 'form', maxEvidence);
    const feedback = field(form, 'feedback', 'comentário da review', 2000);
    const observed = field(form, 'observed', 'resultado observado', 2500);
    const title = field(form, 'title', 'título do bug', 140);
    const expected = field(form, 'expected', 'resultado esperado', 1500);
    const steps = field(form, 'steps', 'passos', 2500);
    const environment = field(form, 'environment', 'ambiente', 300);
    const files = await attachments(form, user.id, id);
    const hasBug = Boolean(observed || title || expected || steps || environment || files.length);
    if (form.get('report_bug') === 'yes' && !hasBug) fail(400, 'Descreva o bug ou anexe uma evidência.');
    if (!feedback && !hasBug) fail(400, 'Escreva um comentário ou descreva um bug.');
    const ticketId = hasBug ? randomUUID() : null;
    await transaction(async () => {
      const createdAt = now();
      if (hasBug) {
        const since = new Date(Date.now() - 86_400_000).toISOString();
        const limits = await get<{ by_user: number; by_project: number }>(`SELECT COUNT(CASE WHEN r.user_id = ? THEN 1 END) AS by_user,
          COUNT(CASE WHEN r.project_id = ? THEN 1 END) AS by_project
          FROM tickets t JOIN reviews r ON r.id = t.review_id
          WHERE t.created_at >= ? AND (r.user_id = ? OR r.project_id = ?)`, user.id, id, since, user.id, id);
        if (limits && (limits.by_user >= 30 || limits.by_project >= 100)) fail(429, 'Limite de relatos em 24 horas atingido. Tente novamente mais tarde.');
      }
      const review = await get<{ id: string }>(`INSERT INTO reviews VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id, user_id) DO UPDATE SET feedback =
        CASE WHEN excluded.feedback = '' THEN reviews.feedback ELSE excluded.feedback END RETURNING id`,
        randomUUID(), id, user.id, feedback, createdAt);
      if (!review) throw new Error('Falha ao gravar a review.');
      if (ticketId) {
        await run(`INSERT INTO tickets (id, review_id, title, observed, expected, steps, environment, status, evidence, evidence_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, ?)`,
          ticketId, review.id, title, observed, expected, steps, environment, createdAt);
        for (const [position, file] of files.entries()) {
          await storage?.consume(file);
          await run('INSERT INTO ticket_attachments (id, ticket_id, position, name, type, bytes, storage_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
            randomUUID(), ticketId, position, file.name, file.type, file.bytes, file.path ?? null);
        }
        await triage.enqueue(ticketId, id, { title, observed, expected, steps, environment }, aiEnabled && form.get('allow_gemini') === 'yes');
        await run("INSERT INTO ticket_events (ticket_id, actor_id, status, created_at) VALUES (?, ?, 'open', ?)",
          ticketId, user.id, createdAt);
      }
    });
    if (ticketId) schedule(triage, vercel ? 3 : 1, c);
    return json(c, { ticketId }, 201);
  });

  app.get('/api/tickets/:id/evidence', async c => {
    const user = c.get('user');
    const id = c.req.param('id');
    await ticketFor(id, user);
    const legacy = await get<Media>('SELECT evidence AS bytes, evidence_type AS type FROM tickets WHERE id = ?', id);
    if (legacy?.bytes) return sendImage(legacy);
    const first = await get<{ id: string }>("SELECT id FROM ticket_attachments WHERE ticket_id = ? AND type LIKE 'image/%' ORDER BY position LIMIT 1", id);
    if (!first) fail(404, 'Imagem não encontrada.');
    return sendAttachment(c, first.id, id);
  });

  app.get('/api/tickets/:id/attachments/:attachment', async c => {
    const id = c.req.param('id');
    await ticketFor(id, c.get('user'));
    return sendAttachment(c, c.req.param('attachment'), id);
  });

  app.post('/api/tickets/:id/status', async c => {
    const user = c.get('user');
    requireUser(user);
    const id = c.req.param('id');
    const ticket = await ticketFor(id, user);
    requireOwner(ticket, user);
    const { status } = await readBody(c.req.raw, 'json');
    if (!isKey(ticketStatusLabels, status)) fail(400, 'Status de ticket inválido.');
    await transaction(async () => {
      const changed = await run('UPDATE tickets SET status = ?, retest_request_id = NULL WHERE id = ? AND status <> ?', status, id, status);
      if (changed.changes) await run('INSERT INTO ticket_events (ticket_id, actor_id, status, created_at) VALUES (?, ?, ?, ?)',
        id, user.id, status, now());
    });
    return json(c, {});
  });

  app.post('/api/tickets/:id/retest', async c => {
    const user = c.get('user');
    requireUser(user);
    const id = c.req.param('id');
    const ticket = await ticketFor(id, user);
    const { outcome, requestId } = await readBody(c.req.raw, 'json');
    await transaction(async () => {
      let event;
      if (outcome === 'request') {
        requireOwner(ticket, user);
        const result = await run("UPDATE tickets SET retest_request_id = ? WHERE id = ? AND status = 'fixed' AND retest_request_id IS NULL",
          randomUUID(), id);
        if (!result.changes) fail(409, 'Marque o ticket como corrigido e verifique se já existe um reteste pendente.');
        event = 'retest_requested';
      } else {
        if (user.id !== ticket.user_id) fail(403, 'Apenas quem relatou o bug pode responder ao reteste.');
        if ((outcome !== 'confirmed' && outcome !== 'reopened') || typeof requestId !== 'string') fail(400, 'Resultado de reteste inválido.');
        const status = outcome === 'confirmed' ? 'fixed' : 'open';
        const result = await run("UPDATE tickets SET status = ?, retest_request_id = NULL WHERE id = ? AND status = 'fixed' AND retest_request_id = ?",
          status, id, requestId);
        if (!result.changes) fail(409, 'Este pedido de reteste já foi atualizado. Recarregue a página.');
        event = outcome === 'confirmed' ? 'retest_confirmed' : 'retest_reopened';
      }
      await run('INSERT INTO ticket_events (ticket_id, actor_id, status, created_at) VALUES (?, ?, ?, ?)',
        id, user.id, event, now());
    });
    return json(c, {});
  });

  return app;
}

let instance: ReturnType<typeof createApi> | undefined;

export function getApi() {
  instance ??= createApi().catch(error => {
    instance = undefined;
    throw error;
  });
  return instance;
}
