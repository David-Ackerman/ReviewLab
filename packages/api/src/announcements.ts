import type { Database } from './database.ts';
import { platformLabels, type Platform } from './contracts.ts';

const day = 86_400_000;
const dailyLimit = 100;

export async function createAnnouncements(db: Database, appOrigin: string | null) {
  const { get, all, run, transaction } = db;
  const key = process.env.RESEND_API_KEY?.trim();
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  const enabled = Boolean(key && sender && appOrigin?.startsWith('https://'));
  if ((key || sender) && !enabled) {
    console.warn('Anúncios por e-mail precisam de RESEND_API_KEY, RESEND_FROM_EMAIL e uma origem HTTPS.');
  }
  await transaction(async () => {
    await db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_emails (
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      state TEXT NOT NULL CHECK(state IN ('queued','sending','accepted','failed','unknown','cancelled')),
      created_at BIGINT NOT NULL,
      attempted_at BIGINT,
      message_id TEXT,
      PRIMARY KEY(project_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS announcement_email_queue ON announcement_emails(state, created_at);
    CREATE INDEX IF NOT EXISTS announcement_email_attempts ON announcement_emails(attempted_at);
  `);

    await db.addColumn('announcement_emails', 'retry_after', 'BIGINT');
    await db.run('CREATE INDEX IF NOT EXISTS announcement_email_retry ON announcement_emails(retry_after)');
    await db.protectTables('announcement_emails');
  });
  const platformMatch = db.postgres
    ? `SELECT 1 FROM json_array_elements_text(u.platforms::json) AS tester(value)
        JOIN json_array_elements_text(p.platforms::json) AS target(value) ON tester.value = target.value`
    : `SELECT 1 FROM json_each(u.platforms) AS tester
        JOIN json_each(p.platforms) AS target ON tester.value = target.value`;

  async function enqueue(project: { id: string; owner_id: string }) {
    if (!enabled) return;
    await run(`INSERT INTO announcement_emails (project_id, user_id, state, created_at)
      SELECT p.id, u.id, 'queued', ? FROM users u CROSS JOIN projects p
      WHERE p.id = ? AND u.id <> ? AND u.announcement_emails = 1
        AND EXISTS (${platformMatch})
      ON CONFLICT(project_id, user_id) DO NOTHING`, Date.now(), project.id, project.owner_id);
  }

  async function summary(projectId: string) {
    const counts = Object.fromEntries((await all<{ state: string; total: number }>(`SELECT state, COUNT(*) AS total FROM announcement_emails
      WHERE project_id = ? GROUP BY state`, projectId)).map(row => [row.state, row.total]));
    return {
      enabled,
      queued: (counts.queued || 0) + (counts.sending || 0),
      accepted: counts.accepted || 0,
      failed: (counts.failed || 0) + (counts.unknown || 0),
      unknown: counts.unknown || 0,
      cancelled: counts.cancelled || 0,
    };
  }

  async function claim() {
    return await transaction(async () => {
      const time = Date.now();
      await run("UPDATE announcement_emails SET state = 'unknown' WHERE state = 'sending' AND attempted_at <= ?", time - 60_000);
      await run(`UPDATE announcement_emails SET state = 'cancelled' WHERE state = 'queued'
        AND (created_at <= ? OR NOT EXISTS (
          SELECT 1 FROM users u JOIN projects p ON p.id = announcement_emails.project_id
          WHERE u.id = announcement_emails.user_id AND u.announcement_emails = 1
            AND EXISTS (${platformMatch})
        ))`, time - 2 * day);
      // A resposta 429 é do provedor. Pause a fila inteira durante o intervalo informado.
      if (await get("SELECT 1 FROM announcement_emails WHERE retry_after > ? LIMIT 1", time)) return null;
      if (((await get<{ total: number }>('SELECT COUNT(*) AS total FROM announcement_emails WHERE attempted_at >= ?', time - day))?.total ?? 0) >= dailyLimit) return null;
      const item = await get<{ project_id: string; user_id: string; email: string; name: string; platforms: string }>(`SELECT a.project_id, a.user_id, u.email, p.name, p.platforms
        FROM announcement_emails a JOIN projects p ON p.id = a.project_id JOIN users u ON u.id = a.user_id
        WHERE a.state = 'queued' ORDER BY a.created_at, a.project_id, a.user_id LIMIT 1`);
      if (!item) return null;
      await run("UPDATE announcement_emails SET state = 'sending', attempted_at = ?, retry_after = NULL WHERE project_id = ? AND user_id = ?",
        time, item.project_id, item.user_id);
      return item;
    });
  }

  let busy = false;
  async function processNext() {
    if (!enabled || busy || !key || !sender || !appOrigin) return;
    busy = true;
    try {
      const item = await claim();
      if (!item) return;
      const title = item.name.replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ').trim();
      const url = new URL('/projetos/' + item.project_id, appOrigin).href;
      const targets = (JSON.parse(item.platforms) as Platform[]).map(platform => platformLabels[platform]).join(', ');
      let state = 'unknown';
      let messageId: string | null = null;
      let retryAfter: number | null = null;
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Idempotency-Key': `review-request/${item.project_id}/${item.user_id}`,
            'User-Agent': 'ReviewLab',
          },
          signal: AbortSignal.timeout(12_000),
          body: JSON.stringify({
            from: `ReviewLab <${sender}>`,
            to: [item.email],
            subject: 'ReviewLab · Novo projeto para review: ' + title,
            text: `O projeto ${title} (${targets}) está aberto para review.\n\n${url}\n\nPara deixar de receber avisos, entre no ReviewLab e desmarque a opção no seu perfil.`,
            tags: [{ name: 'type', value: 'review-request' }],
          }),
        });
        if (response.ok) {
          const result = await response.json();
          if (typeof result?.id === 'string' && result.id) {
            state = 'accepted';
            messageId = result.id;
          }
        } else {
          await response.body?.cancel().catch(() => {});
          if (response.status === 429) {
            const header = response.headers.get('retry-after') ?? '';
            const time = Date.now();
            const delay = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - time;
            state = 'queued';
            retryAfter = time + (Number.isSafeInteger(delay) && delay > 60_000 ? delay : 60_000);
          } else if (response.status >= 400 && response.status < 500 && response.status !== 408) {
            state = 'failed';
          }
          console.warn('Resend recusou ou não confirmou um anúncio HTTP', response.status);
        }
      } catch {
        console.warn('Resend não confirmou o envio de um anúncio.');
      }
      // A chave do Resend expira em 24 horas. Envios incertos exigem verificação no provedor.
      await run(`UPDATE announcement_emails SET state = ?, message_id = ?, retry_after = ?
        WHERE project_id = ? AND user_id = ? AND state = 'sending'`, state, messageId, retryAfter, item.project_id, item.user_id);
      if (!retryAfter) return true;
    } catch (error) {
      console.error('Falha na fila de anúncios por e-mail:', error instanceof Error ? error.name : 'erro desconhecido');
    } finally {
      busy = false;
    }
  }

  return { enabled, enqueue, summary, processNext };
}
