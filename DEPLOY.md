# Deploy do ReviewLab

## Piloto na Vercel com Supabase

Importe o repositório em um projeto **novo** na Vercel. Use Node.js 24, preset **Next.js** e **Root Directory** `apps/web`. Mantenha a opção **Include source files outside of the Root Directory** ligada para incluir `packages/api` e o workspace pnpm. O endereço HTTPS gerado pela Vercel é suficiente para o piloto. [Turborepo na Vercel](https://vercel.com/docs/monorepos/turborepo) · [Pacotes compartilhados](https://vercel.com/docs/monorepos/monorepo-faq)

1. Crie um projeto **Free** separado no Supabase. Em **Connect**, copie a string **Transaction pooler** com a senha preenchida para `DATABASE_URL`. A aplicação cria as tabelas na primeira inicialização e habilita RLS sem liberar acesso pela API pública do banco. [Conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
2. Em **Storage**, crie o bucket privado `reviewlab-private`. Defina limite de 20 MB e, se configurar os tipos aceitos, use `image/png,image/jpeg,image/webp,video/mp4,video/webm`. Os arquivos vão direto do navegador ao Supabase. O ReviewLab verifica o tamanho, o formato e quem pode abrir cada anexo.
3. Cadastre no projeto **ReviewLab** as variáveis abaixo. Use chaves separadas para preview e produção se os ambientes precisarem de dados independentes.

| Variável | Configuração |
| --- | --- |
| `DATABASE_URL` | String do Transaction pooler do Supabase. |
| `SUPABASE_URL` | URL HTTPS do projeto Supabase. |
| `SUPABASE_SECRET_KEY` | Chave secreta do Supabase com acesso ao bucket. Configure apenas no servidor. |
| `SUPABASE_BUCKET` | Nome do bucket privado. Padrão `reviewlab-private`. |
| `PILOT_INVITE_CODE` | Código de convite de 16 a 256 caracteres. Obrigatório na Vercel. |
| `CRON_SECRET` | Segredo aleatório para autorizar a execução diária da fila e a limpeza de uploads abandonados. |
| `APP_ORIGIN` | URL final HTTPS para os links dos e-mails. O app usa a URL da Vercel como padrão. |
| `WHATSAPP_GROUP_URL` | Opcional. Link do convite do grupo. |
| `ENABLE_EXPERIMENTAL_COREPACK` | Use `1` para instalar com a versão de pnpm fixada no monorepo. |
| `BREVO_API_KEY` e `BREVO_SENDER_EMAIL` | Opcionais. Configure no ambiente que pode enviar avisos reais. |
| `GEMINI_API_KEY` | Opcional. Use um projeto gratuito para habilitar triagem de texto e imagem. |

4. Faça o primeiro deploy como preview a partir de uma branch de teste. Valide `/healthz`, cadastro por convite e envio de uma review com vídeo. A Vercel lê o cron de `apps/web/vercel.json` para a execução agendada em produção.

O SQLite continua disponível para desenvolvimento local quando `DATABASE_URL` está vazia. O novo banco de preview começa vazio. A fila dispara em segundo plano quando há novas reviews ou solicitações de review, retoma no catálogo e tem uma execução diária de recuperação. Os vídeos podem ser enviados e reproduzidos na Vercel. A análise de quadros e áudio pelo Gemini exige FFmpeg no ambiente, que não vem configurado nesse deploy.

## Deploy com Docker em servidor próprio

O piloto roda em uma única instância Node com Docker Compose. O volume `reviewlab-data` guarda o SQLite, as imagens e os vídeos. A imagem inclui FFmpeg e roda como usuário sem privilégios.

## Subir o piloto

1. Em um servidor com Docker e Compose, copie `.env.example` para `.env`. Defina `APP_ORIGIN` com o endereço HTTPS que os membros vão usar, `PILOT_INVITE_CODE` com um código aleatório de pelo menos 16 caracteres e `WHATSAPP_GROUP_URL` com o convite do grupo.
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

Se mudar `REVIEWLAB_PORT`, ajuste a porta no proxy e no teste de saúde executado no host. Valide pela URL HTTPS o cadastro por convite, a review com anexo, a abertura do ticket e o link gerado em **Compartilhar no WhatsApp**.

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
