export function validateDeployment(env: NodeJS.ProcessEnv) {
  if (env.VERCEL !== '1') return;

  const errors: string[] = [];
  for (const name of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'PILOT_INVITE_CODE', 'CRON_SECRET']) {
    if (!env[name]?.trim()) errors.push('Configure ' + name + ' na Vercel.');
  }

  const database = env.DATABASE_URL && URL.parse(env.DATABASE_URL);
  if (env.DATABASE_URL && (!database?.hostname || !['postgres:', 'postgresql:'].includes(database.protocol))) {
    errors.push('DATABASE_URL deve ser a URI PostgreSQL do Transaction pooler.');
  }

  for (const name of ['SUPABASE_URL', 'APP_ORIGIN']) {
    const value = env[name];
    if (!value) continue;
    const url = URL.parse(value);
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      errors.push(name + ' deve ser uma origem HTTPS, sem caminho ou credenciais.');
    }
  }

  const invite = env.PILOT_INVITE_CODE?.trim();
  if (invite && (invite.length < 16 || invite.length > 256)) {
    errors.push('PILOT_INVITE_CODE deve ter de 16 a 256 caracteres.');
  }
  if (env.CRON_SECRET && env.CRON_SECRET.length < 16) {
    errors.push('CRON_SECRET deve ter pelo menos 16 caracteres.');
  }
  if (env.DATABASE_SSL === 'disable') {
    errors.push('Habilite SSL para conectar ao banco na Vercel.');
  }
  if (errors.length) throw new Error('Configuração de deploy incompleta.\n' + errors.join('\n'));
}

validateDeployment(process.env);
