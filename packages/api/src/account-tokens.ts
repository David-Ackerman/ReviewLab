import { createHash, randomBytes } from 'node:crypto';
import type { Database } from './database.ts';
import type { Mailer } from './mailer.ts';

const hour = 60 * 60 * 1000;
const actions = {
  signup: { path: '/cadastro/confirmar', subject: 'Crie sua conta no ReviewLab', duration: 24 * hour },
  verify: { path: '/verificar-email', subject: 'Verifique seu e-mail no ReviewLab', duration: 24 * hour },
  reset: { path: '/redefinir-senha', subject: 'Redefina sua senha do ReviewLab', duration: hour / 2 },
};
type Purpose = keyof typeof actions;
type Token = { email: string; user_id: string | null };
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export function createAccountTokens(db: Database, mailer: Mailer) {
  const { get, run, transaction } = db;

  async function send(purpose: Purpose, email: string, userId: string | null = null, next?: string) {
    if (!mailer) return;
    const action = actions[purpose];
    const token = randomBytes(32).toString('hex');
    const hash = digest(token);
    const stored = await transaction(async () => {
      const time = Date.now();
      await run('DELETE FROM account_tokens WHERE expires <= ?', time);
      const recent = await get<{ total: number; latest: number | null }>(`SELECT COUNT(*) AS total, MAX(created_at) AS latest
        FROM account_tokens WHERE purpose = ? AND email = ? AND created_at > ?`, purpose, email, time - hour);
      if (recent && (recent.total >= 5 || (recent.latest ?? 0) > time - 60_000)) return false;
      await run(`INSERT INTO account_tokens (token_hash, purpose, email, user_id, created_at, expires)
        VALUES (?, ?, ?, ?, ?, ?)`, hash, purpose, email, userId, time, time + action.duration);
      return true;
    });
    if (!stored) return;

    const url = new URL(action.path, mailer.origin);
    if (next) url.searchParams.set('next', next);
    url.hash = 'token=' + token;
    const expiry = purpose === 'reset' ? '30 minutos' : '24 horas';
    const response = await mailer.send(email, action.subject,
      `${action.subject} usando este link:\n\n${url.href}\n\nO link expira em ${expiry}. Se você não fez este pedido, ignore a mensagem.`,
      purpose, `account-${purpose}/${hash}`);
    await response.body?.cancel().catch(() => {});
    if (!response.ok) console.warn('Resend recusou e-mail de conta', purpose, response.status);
  }

  async function find(purpose: Purpose, token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    return get<Token>('SELECT email, user_id FROM account_tokens WHERE token_hash = ? AND purpose = ? AND expires > ?',
      digest(token), purpose, Date.now());
  }

  async function invalidate(purpose: Purpose, email: string) {
    await run('DELETE FROM account_tokens WHERE purpose = ? AND email = ?', purpose, email);
  }

  return { send, find, invalidate };
}
