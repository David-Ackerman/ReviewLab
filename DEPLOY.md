# Deploy do ReviewLab

## Piloto na Vercel com Supabase

Importe o repositório `David-Ackerman/ReviewLab` em um projeto **novo** chamado `reviewlab` na Vercel. Configure os campos abaixo antes de iniciar o deploy. [Turborepo na Vercel](https://vercel.com/docs/monorepos/turborepo)

Antes de importar pelo GitHub, faça commit e push das alterações locais de preparação de deploy.

| Campo | Valor |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | `apps/web` |
| Node.js Version | `24.x` |
| Build Command | Usar o valor versionado em `apps/web/vercel.json` |
| Install Command | Automático, usando o lockfile pnpm |
| Output Directory | Automático, `.next` |
| Include source files outside of the Root Directory | Habilitado |
| Fluid Compute | Habilitado |

O comando de build valida a configuração e compila `@reviewlab/web` pelo Turborepo. A validação ocorre antes de consultar o cache. A API Hono faz parte do deploy Next.js. A função permite até 300 segundos para os lotes da fila terminarem. [Duração de funções](https://vercel.com/docs/functions/configuring-functions/duration)

1. Crie um projeto **Free** separado no Supabase. Em **Connect**, copie a string **Transaction pooler** com a senha preenchida para `DATABASE_URL`. A aplicação cria as tabelas na primeira inicialização e habilita RLS sem liberar acesso pela API pública do banco. [Conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
2. Em **Storage**, crie o bucket privado `reviewlab-private`. Defina limite de 20 MB e tipos `image/png,image/jpeg,image/webp,video/mp4,video/webm`. Os arquivos vão direto do navegador ao Supabase. O ReviewLab verifica o tamanho, o formato e quem pode abrir cada anexo. Copie a **Secret key** do projeto em **Settings → API Keys** para `SUPABASE_SECRET_KEY`. [Buckets privados](https://supabase.com/docs/guides/storage/buckets/fundamentals)
3. Cadastre no projeto **ReviewLab** as variáveis abaixo em **Settings → Environment Variables**. Configure os ambientes **Preview** e **Production**. Um projeto Supabase separado para preview permite testar com dados próprios desse ambiente.

| Variável | Configuração |
| --- | --- |
| `DATABASE_URL` | String do Transaction pooler do Supabase. |
| `SUPABASE_URL` | URL HTTPS do projeto Supabase. |
| `SUPABASE_SECRET_KEY` | Chave secreta do Supabase com acesso ao bucket. Configure apenas no servidor. |
| `SUPABASE_BUCKET` | Nome do bucket privado. Padrão `reviewlab-private`. |
| `CRON_SECRET` | Segredo aleatório com pelo menos 16 caracteres para autorizar a execução diária da fila e a limpeza de uploads abandonados. |
| `APP_ORIGIN` | Opcional. Em produção, o app usa o endereço estável `vercel.app` do projeto. Em preview, usa a URL desse deploy. Preencha apenas quando precisar definir outra origem HTTPS. |
| `WHATSAPP_GROUP_URL` | Opcional. Link do convite do grupo. |
| `ENABLE_EXPERIMENTAL_COREPACK` | Use `1` para instalar com a versão de pnpm fixada no monorepo. |
| `BREVO_API_KEY` e `BREVO_SENDER_EMAIL` | Opcionais. Configure no ambiente que pode enviar avisos reais. |
| `GEMINI_API_KEY` | Opcional. Use um projeto gratuito para habilitar triagem de texto e imagem. |

Gere o `CRON_SECRET` com o comando abaixo e cadastre o resultado no painel da Vercel.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

O build valida as variáveis obrigatórias e seus formatos quando executado na Vercel. Deixe as integrações opcionais vazias no primeiro deploy. A ativação dos avisos por e-mail exige um remetente Brevo verificado.

4. O botão **Deploy** da importação publica a branch selecionada conforme a configuração de produção do projeto. Para testar um preview antes de abrir o piloto, configure o projeto e use uma branch diferente da branch de produção ou a CLI, a partir da raiz do monorepo.

```powershell
npx vercel login
npx vercel link
npx vercel deploy --environment preview
```

No vínculo, escolha o projeto `reviewlab` e confira `apps/web` como Root Directory no painel. [Deploy pela CLI](https://vercel.com/docs/projects/deploy-from-cli)

5. Abra `/healthz` na URL retornada. A resposta esperada é HTTP 200 com `{"ok":true}`. O endpoint confere banco e acesso ao bucket privado. HTTP 503 indica que uma dependência precisa ser corrigida. Se o preview exigir login da Vercel, use a sessão autorizada do navegador ou execute `npx vercel curl /healthz --deployment <URL_DO_PREVIEW>`.
6. Crie duas contas. Cadastre e anuncie um projeto na primeira. Na segunda, envie uma review com imagem e vídeo. Confirme a abertura dos anexos nas duas contas, atualize o ticket e conclua um reteste.
7. Depois de validar o preview, execute `npx vercel deploy --prod` ou publique pela integração Git. O endereço HTTPS `vercel.app` gerado pelo projeto atende ao piloto. O cron roda em produção uma vez por dia, com agendamento de 11h UTC em `apps/web/vercel.json`. [Cron na Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing)

O SQLite continua disponível para desenvolvimento local quando `DATABASE_URL` está vazia. O novo banco de preview começa vazio. A fila dispara em segundo plano quando há novas reviews ou solicitações de review, retoma no catálogo e tem uma execução diária de recuperação. Os vídeos podem ser enviados e reproduzidos na Vercel. A análise de quadros e áudio pelo Gemini exige FFmpeg no ambiente, que não vem configurado nesse deploy.

## Ativar o Gemini na Vercel

1. Crie uma chave em um projeto **Free** sem faturamento associado. [Google AI Studio](https://aistudio.google.com/apikey) · [Preços e cotas do Gemini](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite)
2. No ReviewLab, abra **Settings → Environment Variables**. Adicione `GEMINI_API_KEY` como **Secret** no ambiente **Preview**. O modelo padrão é `gemini-3.1-flash-lite`. Para limitar o piloto a 30 tentativas por mês, adicione `TRIAGE_MONTHLY_CALL_LIMIT=30`. [Variáveis na Vercel](https://vercel.com/docs/environment-variables)
3. Faça um novo deploy de preview. Envie um relato fictício com campos faltantes, marque a autorização para o Gemini e confira a sugestão da triagem no ticket. A integração roda apenas em relatos autorizados que precisam de ajuda com detalhes ou possíveis duplicatas.

## Deploy com Docker em servidor próprio

O piloto roda em uma única instância Node com Docker Compose. O volume `reviewlab-data` guarda o SQLite, as imagens e os vídeos. A imagem inclui FFmpeg e roda como usuário sem privilégios.

## Subir o piloto

1. Em um servidor com Docker e Compose, copie `.env.example` para `.env`. Defina `APP_ORIGIN` com o endereço HTTPS que os membros vão usar e `WHATSAPP_GROUP_URL` com o convite do grupo.
2. Para ativar a triagem, configure `GEMINI_API_KEY` no servidor com a chave de um projeto **Free** sem faturamento. Deixe a variável vazia para começar com a triagem local.
3. Execute os comandos abaixo no diretório do projeto.

```sh
docker compose config --quiet
docker compose up -d --build --wait
curl --fail http://127.0.0.1:3000/healthz
```

O Compose publica a porta apenas em `127.0.0.1`. Aponte um proxy HTTPS no mesmo host para essa porta e use o mesmo domínio de `APP_ORIGIN`. Exemplo de configuração do Caddy, usando um domínio com DNS apontado para o servidor.

```caddyfile
reviewlab.seudominio.com {
    reverse_proxy 127.0.0.1:3000
}
```

Se mudar `REVIEWLAB_PORT`, ajuste a porta no proxy e no teste de saúde executado no host. Valide pela URL HTTPS o cadastro, a review com anexo, a abertura do ticket e o link gerado em **Compartilhar no WhatsApp**.

## Backup e restauração

Gere uma cópia consistente do SQLite e guarde o arquivo fora do servidor. Use um nome diferente a cada execução. O comando funciona enquanto o app roda.

```sh
docker compose exec -T reviewlab node scripts/backup.ts /data/reviewlab-backup.sqlite
docker compose cp reviewlab:/data/reviewlab-backup.sqlite ./reviewlab-backup.sqlite
```

Para migrar um banco do ambiente local, gere o mesmo tipo de cópia com `pnpm backup ./reviewlab-backup.sqlite`. Para restaurar, use um volume novo antes da primeira inicialização. O comando abaixo grava em um arquivo temporário e só promove a cópia após o teste de integridade.

```sh
docker compose run --rm --no-deps -T reviewlab sh -ec '
  test ! -e /data/app.sqlite
  tmp=$(mktemp /data/restore-XXXXXX)
  trap "rm -f \"$tmp\"" EXIT
  cat > "$tmp"
  node --input-type=module -e "
    import { DatabaseSync } from \"node:sqlite\";
    const db = new DatabaseSync(process.argv[1], { readOnly: true });
    if (db.prepare(\"PRAGMA integrity_check\").get().integrity_check !== \"ok\") process.exit(1);
  " "$tmp"
  mv "$tmp" /data/app.sqlite
' < ./reviewlab-backup.sqlite
docker compose up -d --wait
```

Para acompanhar falhas da aplicação, use `docker compose logs --tail=100 reviewlab`. Atualize com `docker compose up -d --build --wait` após gerar um backup.

## WhatsApp

O piloto usa compartilhamento manual e o link de convite configurado. Para avaliar a automação, confirme no painel da Meta a elegibilidade do número e se a API oficial permite enviar ao grupo real. Só habilite o envio após esse teste. [Documentação da API de grupos da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups)
