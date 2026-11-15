'use client';

import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { McpToken } from '@reviewlab/api/contracts';
import { api, errorMessage, formatDate } from '../lib/client';
import { CheckField, SubmitForm } from './forms';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function McpSettings() {
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [secret, setSecret] = useState<{ id: string; value: string }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [client, setClient] = useState<'codex' | 'vscode'>('codex');

  useEffect(() => {
    setEndpoint(new URL('/api/mcp', window.location.origin).href);
    const controller = new AbortController();
    api<{ tokens: McpToken[] }>('/api/mcp-tokens', undefined, controller.signal)
      .then(({ tokens }) => { if (!controller.signal.aborted) setTokens(tokens); })
      .catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => controller.abort();
  }, []);

  async function revoke(id: string) {
    setPending(true);
    setError('');
    setNotice('');
    try {
      await api('/api/mcp-tokens/' + id + '/revoke', {});
      setTokens(previous => previous.filter(token => token.id !== id));
      setSecret(previous => previous?.id === id ? undefined : previous);
      setNotice('Chave revogada.');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function copy(value: string, message: string) {
    setError('');
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
    } catch {
      setError('Não foi possível copiar. Selecione o texto para copiar.');
    }
  }

  const codexConfig = `[mcp_servers.reviewlab]\nurl = "${endpoint}"\nbearer_token_env_var = "REVIEWLAB_MCP_TOKEN"`;
  const vsCodeConfig = JSON.stringify({
    inputs: [{ type: 'promptString', id: 'reviewlab-token', description: 'Chave MCP do ReviewLab', password: true }],
    servers: { reviewlab: { type: 'http', url: endpoint, headers: { Authorization: 'Bearer ${input:reviewlab-token}' } } },
  }, null, 2);
  const config = client === 'codex' ? codexConfig : vsCodeConfig;

  return <section className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-6" aria-labelledby="mcp-settings">
    <h2 id="mcp-settings" className="flex items-center gap-2 font-semibold"><KeyRound size={18} className="text-primary" aria-hidden /> Integração MCP</h2>
    <p className="mt-2 text-sm text-muted-foreground">Conecte sua IA para consultar projetos e reviews. Habilite o cadastro ao criar a chave se quiser salvar rascunhos pela IA.</p>
    <div className="mt-4">
      <SubmitForm onSubmit={async data => {
        setError('');
        setNotice('');
        const result = await api<{ token: McpToken; secret: string }>('/api/mcp-tokens', {
          label: data.get('label'), canCreate: data.has('canCreate'),
        });
        setTokens(previous => [result.token, ...previous]);
        setSecret({ id: result.token.id, value: result.secret });
      }}>
        <label className="grid gap-1.5 text-sm font-medium">
          Nome da chave<Input name="label" maxLength={60} placeholder="Ex.: IA do meu computador" required />
        </label>
        <CheckField name="canCreate">Permitir cadastrar projetos</CheckField>
        <div><Button>Gerar chave</Button></div>
      </SubmitForm>
    </div>
    {secret && <div className="mt-4 grid gap-2 rounded-md bg-muted p-3 text-sm">
      <label className="grid gap-1.5 font-medium">
        Sua chave MCP<Input value={secret.value} readOnly autoComplete="off" spellCheck={false} className="font-mono" />
      </label>
      <p className="text-xs text-muted-foreground">Copie agora. A chave só é mostrada uma vez.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void copy(secret.value, 'Chave copiada.')}>Copiar chave</Button>
        <Button type="button" variant="ghost" onClick={() => setSecret(undefined)}>Ocultar chave</Button>
      </div>
    </div>}
    {tokens.length > 0 && <ul className="mt-4 divide-y divide-border border-y border-border">
      {tokens.map(token => <li className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm" key={token.id}>
        <div className="min-w-0">
          <p className="font-medium wrap-anywhere">{token.label}</p>
          <p className="text-xs text-muted-foreground">{token.canCreate ? 'Consulta e cadastro' : 'Consulta'} · expira em {formatDate(new Date(token.expiresAt).toISOString())}</p>
        </div>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => void revoke(token.id)} aria-label={'Revogar chave ' + token.label}>Revogar</Button>
      </li>)}
    </ul>}
    {endpoint && <details className="mt-4">
      <summary className="text-sm font-medium">Configurar cliente MCP</summary>
      <p className="mt-2 text-sm wrap-anywhere text-muted-foreground"><strong>Endpoint</strong> <code>{endpoint}</code></p>
      <label className="mt-3 grid max-w-xs gap-1.5 text-sm font-medium">Cliente
        <select className="min-h-10 rounded-md border border-input bg-card px-3" value={client} onChange={event => setClient(event.target.value === 'vscode' ? 'vscode' : 'codex')}>
          <option value="codex">Codex</option><option value="vscode">VS Code</option>
        </select>
      </label>
      <p className="mt-2 text-sm text-muted-foreground">{client === 'codex'
        ? 'Defina REVIEWLAB_MCP_TOKEN no ambiente que inicia o Codex e adicione esta configuração a ~/.codex/config.toml.'
        : 'Salve em .vscode/mcp.json. Ao iniciar o servidor no VS Code, cole a chave quando solicitado.'}</p>
      <pre className="my-2 overflow-auto rounded-md bg-muted p-3 text-xs">{config}</pre>
      <Button type="button" variant="outline" onClick={() => void copy(config, 'Configuração copiada.')}>Copiar configuração</Button>
    </details>}
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-primary">
      <a className="hover:underline" href="/skills/reviewlab-projects/SKILL.md" download="SKILL.md">Baixar skill de projetos</a>
      <a className="hover:underline" href="/skills/reviewlab-review-progress/SKILL.md" download="SKILL.md">Baixar skill de acompanhamento</a>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">No Codex, salve cada SKILL.md em sua própria pasta dentro de .agents/skills, com os nomes reviewlab-projects e reviewlab-review-progress.</p>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-primary">{notice}</p>}
  </section>;
}
