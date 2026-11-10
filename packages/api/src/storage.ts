import { randomUUID } from 'node:crypto';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Database } from './database.ts';

type Fail = (status: ContentfulStatusCode, message: string) => never;

const uploadLifetime = 3 * 60 * 60 * 1000;
const maxImage = 5 * 1024 * 1024;
const maxVideo = 20 * 1024 * 1024;
const types = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'];
export const uploadIdPattern = /^[a-f0-9-]{36}$/;

export function mediaType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) && bytes.subarray(4, 64).includes('webm')) return 'video/webm';
  return null;
}

export function cleanFilename(name: unknown) {
  return String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120) || 'Anexo';
}

export async function createStorage(db: Database, fail: Fail) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    if (process.env.VERCEL === '1') throw new Error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY para publicar na Vercel.');
    return null;
  }
  const origin = new URL(url).origin;
  if (!origin.startsWith('https://')) throw new Error('SUPABASE_URL deve usar HTTPS.');
  const { StorageClient } = await import('@supabase/storage-js');
  const headers: Record<string, string> = { apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  const storageFetch = (input: RequestInfo | URL, options?: RequestInit) => fetch(input, { ...options, signal: options?.signal || AbortSignal.timeout(15_000) });
  const bucket = new StorageClient(origin + '/storage/v1', headers, storageFetch)
    .from(process.env.SUPABASE_BUCKET || 'reviewlab-private');
  const { get, all, run, transaction } = db;
  await transaction(async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS staged_uploads (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), project_id TEXT NOT NULL,
        purpose TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL,
        storage_path TEXT NOT NULL UNIQUE, expires BIGINT NOT NULL, used INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS staged_uploads_user ON staged_uploads(user_id, expires);
    `);
    await db.protectTables('staged_uploads');
  });

  async function reserve(userId: string, projectId: string, purpose: string, { type, size, name }: Record<string, unknown>) {
    if (typeof type !== 'string' || !types.includes(type) || (purpose === 'cover' && !type.startsWith('image/'))) fail(400, 'Formato de anexo inválido.');
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > (type.startsWith('image/') ? maxImage : maxVideo)) {
      fail(413, 'O arquivo ultrapassa o limite de tamanho.');
    }
    const id = randomUUID();
    const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' };
    const extension = extensions[type];
    const path = userId + '/' + id + '.' + extension;
    await transaction(async () => {
      const { total = 0 } = await get<{ total: number }>('SELECT COUNT(*) AS total FROM staged_uploads WHERE user_id = ? AND expires > ?', userId, Date.now()) ?? {};
      if (total >= 24) fail(429, 'Limite temporário de uploads atingido. Tente mais tarde.');
      await run('INSERT INTO staged_uploads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
        id, userId, projectId, purpose, cleanFilename(name), type, size, path, Date.now() + uploadLifetime);
    });
    const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.signedUrl) {
      await run('DELETE FROM staged_uploads WHERE id = ?', id);
      fail(502, 'Não foi possível iniciar o upload.');
    }
    return { id, url: data.signedUrl };
  }

  async function signedUrl(path: string) {
    const { data, error } = await bucket.createSignedUrl(path, 300);
    if (error || !data?.signedUrl) fail(502, 'Não foi possível abrir o anexo.');
    return data.signedUrl;
  }

  async function verify(id: unknown, userId: string, projectId: string, purpose: string) {
    if (typeof id !== 'string' || !uploadIdPattern.test(id)) fail(400, 'Identificador de upload inválido.');
    const item = await get<{ id: string; name: string; type: string; size: number; storage_path: string }>(`SELECT id, name, type, size, storage_path FROM staged_uploads
      WHERE id = ? AND user_id = ? AND project_id = ? AND purpose = ? AND used = 0 AND expires > ?`,
      id, userId, projectId, purpose, Date.now());
    if (!item) fail(400, 'Upload expirado ou inválido. Selecione o arquivo novamente.');
    const { data } = await bucket.info(item.storage_path);
    if (data?.size !== item.size || data?.contentType !== item.type) fail(400, 'O arquivo enviado não corresponde à seleção.');
    const response = await fetch(await signedUrl(item.storage_path), {
      headers: { Range: 'bytes=0-63' }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      fail(400, 'Não foi possível validar o conteúdo do anexo.');
    }
    const reader = response.body.getReader();
    const prefix = [];
    let size = 0;
    try {
      while (size < 64) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value.subarray(0, 64 - size));
        prefix.push(chunk);
        size += chunk.length;
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (mediaType(Buffer.concat(prefix)) !== item.type) fail(400, 'O conteúdo do arquivo não corresponde ao formato informado.');
    return { id, path: item.storage_path, bytes: Buffer.alloc(0), type: item.type, name: item.name, size: item.size };
  }

  async function consume(item: { id?: string }) {
    if (!item.id) return;
    const result = await run('UPDATE staged_uploads SET used = 1 WHERE id = ? AND used = 0 AND expires > ?', item.id, Date.now());
    if (!result.changes) fail(409, 'O upload já foi usado ou expirou.');
  }

  async function remove(path: string) {
    if (!path) return;
    const { error } = await bucket.remove([path]);
    if (error) console.warn('Não foi possível excluir um anexo substituído.');
  }

  async function cleanup() {
    const expired = await all<{ id: string; storage_path: string }>('SELECT id, storage_path FROM staged_uploads WHERE used = 0 AND expires <= ? LIMIT 50', Date.now());
    if (expired.length) {
      const { error } = await bucket.remove(expired.map(item => item.storage_path));
      if (!error) for (const { id } of expired) await run('DELETE FROM staged_uploads WHERE id = ? AND used = 0', id);
    }
    await run('DELETE FROM staged_uploads WHERE used = 1 AND expires <= ?', Date.now());
  }

  async function read(path: string) {
    const { data, error } = await bucket.download(path);
    if (error || !data) throw new Error('Anexo indisponível para triagem.');
    return Buffer.from(await data.arrayBuffer());
  }

  return { origin, reserve, verify, consume, signedUrl, read, remove, cleanup };
}
