export function validateDeployment(env: NodeJS.ProcessEnv) {
  if (env.VERCEL !== '1') return;

  const errors: string[] = [];
  for (const name of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'CRON_SECRET']) {
    if (!env[name]?.trim()) errors.push('Configure ' + name + ' na Vercel.');
  }

  const database = URL.parse(env.DATABASE_URL || '');
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

  if (env.CRON_SECRET && env.CRON_SECRET.length < 16) {
    errors.push('CRON_SECRET deve ter pelo menos 16 caracteres.');
  }
  if (env.DATABASE_SSL === 'disable') {
    errors.push('Habilite SSL para conectar ao banco na Vercel.');
  }
  if (errors.length) throw new Error('Configuração de deploy incompleta.\n' + errors.join('\n'));
}

validateDeployment(process.env);
