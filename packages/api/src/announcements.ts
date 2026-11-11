import type { Database } from './database.ts';
import type { Platform, Project } from './contracts.ts';

const platformNames = { web: 'Web', android: 'Android', ios: 'iOS' };
const day = 86_400_000;
const dailyLimit = 100;

export async function createAnnouncements(db: Database, appOrigin: string | null) {
  const { get, all, run, transaction } = db;
  const key = process.env.BREVO_API_KEY?.trim();
  const sender = process.env.BREVO_SENDER_EMAIL?.trim();
  const enabled = Boolean(key && sender && appOrigin?.startsWith('https://'));
  if ((key || sender) && !enabled) {
    console.warn('Anúncios por e-mail precisam de BREVO_API_KEY, BREVO_SENDER_EMAIL e uma origem HTTPS.');
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

    await db.protectTables('announcement_emails');
  });
  const platformMatch = db.postgres
    ? 'SELECT 1 FROM json_array_elements_text(u.platforms::json) AS selected(value) WHERE value = '
    : 'SELECT 1 FROM json_each(u.platforms) WHERE value = ';

  async function enqueue(project: Pick<Project, 'id' | 'owner_id' | 'platform'>) {
    if (!enabled) return;
    await run(`INSERT INTO announcement_emails (project_id, user_id, state, created_at)
      SELECT ?, u.id, 'queued', ? FROM users u
      WHERE u.id <> ? AND u.announcement_emails = 1
        AND EXISTS (${platformMatch}?)
      ON CONFLICT(project_id, user_id) DO NOTHING`, project.id, Date.now(), project.owner_id, project.platform);
  }

  async function summary(projectId: string) {
    const counts = Object.fromEntries((await all<{ state: string; total: number }>(`SELECT state, COUNT(*) AS total FROM announcement_emails
      WHERE project_id = ? GROUP BY state`, projectId)).map(row => [row.state, row.total]));
    return {
      enabled,
      queued: (counts.queued || 0) + (counts.sending || 0),
      accepted: counts.accepted || 0,
      failed: (counts.failed || 0) + (counts.unknown || 0),
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
            AND EXISTS (${platformMatch}p.platform)
        ))`, time - 2 * day);
      if (((await get<{ total: number }>('SELECT COUNT(*) AS total FROM announcement_emails WHERE attempted_at >= ?', time - day))?.total ?? 0) >= dailyLimit) return null;
      const item = await get<{ project_id: string; user_id: string; email: string; name: string; platform: Platform }>(`SELECT a.project_id, a.user_id, u.email, p.name, p.platform
        FROM announcement_emails a JOIN projects p ON p.id = a.project_id JOIN users u ON u.id = a.user_id
        WHERE a.state = 'queued' ORDER BY a.created_at, a.project_id, a.user_id LIMIT 1`);
      if (!item) return null;
      await run("UPDATE announcement_emails SET state = 'sending', attempted_at = ? WHERE project_id = ? AND user_id = ?",
        time, item.project_id, item.user_id);
      return item;
    });
  }

  let busy = false;
  async function processNext() {
    if (!enabled || busy || !key || !appOrigin) return;
    busy = true;
    try {
      const item = await claim();
      if (!item) return;
      const title = item.name.replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ').trim();
      const url = new URL('/projetos/' + item.project_id, appOrigin).href;
      let state = 'unknown';
      let messageId: string | null = null;
      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
          signal: AbortSignal.timeout(12_000),
          body: JSON.stringify({
            sender: { email: sender, name: 'ReviewLab' },
            to: [{ email: item.email }],
            subject: 'ReviewLab · Novo projeto para review: ' + title,
            textContent: `O projeto ${title} (${platformNames[item.platform]}) está aberto para review.\n\n${url}\n\nPara deixar de receber avisos, entre no ReviewLab e desmarque a opção no seu perfil.`,
            tags: ['review-request'],
          }),
        });
        if (response.ok) {
          const result = await response.json();
          if (typeof result.messageId === 'string' && result.messageId) {
            state = 'accepted';
            messageId = result.messageId;
          }
        } else {
          await response.body?.cancel();
          if (response.status < 500) state = 'failed';
          console.warn('Brevo recusou ou não confirmou um anúncio HTTP', response.status);
        }
      } catch {
        console.warn('Brevo não confirmou o envio de um anúncio.');
      }
      // Sem confirmação, uma nova tentativa pode entregar o mesmo e-mail duas vezes.
      await run('UPDATE announcement_emails SET state = ?, message_id = ? WHERE project_id = ? AND user_id = ? AND state = ?',
        state, messageId, item.project_id, item.user_id, 'sending');
      return true;
    } catch (error) {
      console.error('Falha na fila de anúncios por e-mail:', error instanceof Error ? error.name : 'erro desconhecido');
    } finally {
      busy = false;
    }
  }

  return { enabled, enqueue, summary, processNext };
}
