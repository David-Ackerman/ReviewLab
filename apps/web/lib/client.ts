export async function api<T = unknown>(path: string, data?: FormData | object, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = { signal };
  if (data !== undefined) {
    init.method = 'POST';
    if (data instanceof FormData) {
      init.body = data;
    } else {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(data);
    }
  }
  const response = await fetch(path, init);
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Não foi possível concluir. Tente novamente.');
  return result;
}

export const projectPath = (id: string) => '/projetos/' + encodeURIComponent(id);
export const projectApi = (id: string) => '/api/projects/' + encodeURIComponent(id);
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir.';
export const imageTypes = 'image/png,image/jpeg,image/webp';
export const evidenceTypes = imageTypes + ',video/mp4,video/webm';

const dates = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' });
export const formatDate = (value: string) => dates.format(new Date(value));

const times = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
export const formatDateTime = (value: string) => times.format(new Date(value));

/** Tempo relativo curto para listas: "há 2 h", "ontem", "há 4 dias". */
export function timeAgo(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return formatDate(value);
}

export const shortId = (id: string) => '#' + id.slice(0, 8).toUpperCase();

export async function stageUploads(data: FormData, field: 'cover' | 'evidence', projectId: string) {
  const files = data.getAll(field).filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length > 4 || files.reduce((size, file) => size + file.size, 0) > 25 * 1024 * 1024) {
    throw new Error('Selecione até 4 arquivos e 25 MB no total.');
  }
  data.delete(field);
  for (const file of files) {
    const { id, url } = await api<{ id: string; url: string }>('/api/uploads', {
      purpose: field, projectId, name: file.name, type: file.type, size: file.size,
    });
    const uploaded = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!uploaded.ok) throw new Error('Não foi possível enviar o arquivo ' + file.name + '.');
    data.append(field + '_id', id);
  }
}
