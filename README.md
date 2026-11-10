# ReviewLab

Plataforma de reviews entre devs. O monorepo TypeScript usa Turborepo e pnpm. A interface em `apps/web` usa Next.js, React e Tailwind. A API Hono em `packages/api` é servida pelo Next.js em `/api`. O modo local usa SQLite, e o deploy na Vercel usa PostgreSQL e Storage do Supabase.

## Rodar localmente

Instale Node.js 24 e pnpm 10.34.9. Na raiz do projeto, rode:

```powershell
pnpm install
pnpm dev
```

Abra [o ReviewLab local](http://127.0.0.1:3000). O banco fica em `data/app.sqlite` na raiz do monorepo. Para configurar integrações, copie `.env.example` para `apps/web/.env.local` e preencha as variáveis necessárias. Para conferir a compilação de produção, rode `pnpm typecheck`, `pnpm build` e `pnpm start`.

| Variável | Uso |
| --- | --- |
| `WHATSAPP_GROUP_URL` | Convite do grupo em `https://chat.whatsapp.com/…`. |
| `APP_ORIGIN` | Endereço público da instância, incluindo o protocolo. Use o endereço HTTPS da instalação para que outros membros abram os links compartilhados. |
| `PILOT_INVITE_CODE` | Código de 16 a 256 caracteres. Quando configurado, novas contas precisam do código e o catálogo só abre após login. |
| `PORT` | Porta de escuta. Defina no terminal antes de rodar o Next.js. O padrão é `3000`. |
| `DATA_DIR` | Caminho absoluto opcional para o diretório do banco local. |

## Demonstrar o fluxo

1. Crie uma conta, selecione as plataformas que você consegue testar e cadastre um projeto. Para Android e iOS, informe o link da versão e os passos para acessar o teste. Abra o projeto e clique em **Solicitar review** para anunciá-lo no catálogo. O botão **Editar projeto** aparece para o dono, e o perfil de testador pode ser editado pelo botão com seu nome.
2. Em outra sessão de navegador, crie uma segunda conta. Abra o projeto anunciado, clique em **Enviar review**, marque **Encontrei um bug** e descreva o que aconteceu ou anexe evidências. O formulário aceita até 4 arquivos e 25 MB no total. Imagens PNG, JPEG ou WebP podem ter até 5 MB cada. Vídeos MP4 ou WebM podem ter até 20 MB cada.
3. Na primeira conta, recarregue a página do projeto. A seção **Tickets** mostra o relato, sua review de origem e a evidência. Altere o status e consulte o histórico.
4. Marque o ticket como **Corrigido** e clique em **Solicitar reteste**. Na conta de quem relatou o bug, o projeto aparece com a indicação **Reteste para você**. Abra o ticket e confirme a correção ou reabra o chamado se o bug ainda ocorrer.
5. Use **Compartilhar no WhatsApp** para abrir a mensagem pronta e escolha o grupo no WhatsApp. O convite do grupo aparece no menu quando configurado.

## Triagem de bugs

O ticket é criado na hora. As regras destacam campos faltantes e sugerem possíveis duplicatas para o dono com base em tickets do mesmo projeto. As evidências ficam acessíveis ao dono e à pessoa que enviou o relato.

Para habilitar a triagem opcional pelo Gemini, configure as variáveis abaixo no ambiente do servidor. Para ficar na cota gratuita, use uma chave de um projeto marcado como **Free** no Google AI Studio, sem faturamento associado. A disponibilidade e os limites dependem da conta. [Preços](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite) · [Faturamento](https://ai.google.dev/gemini-api/docs/billing)

| Variável | Uso |
| --- | --- |
| `GEMINI_API_KEY` | Chave da API mantida no servidor. Com a chave configurada, o revisor pode autorizar o envio ao Google Gemini. |
| `TRIAGE_MODEL` | Modelo Gemini compatível com saída estruturada, mídia e nível de raciocínio mínimo. Padrão `gemini-3.1-flash-lite`. Confira a cota antes de trocar. |
| `TRIAGE_MONTHLY_CALL_LIMIT` | Teto de chamadas por mês UTC, incluindo tentativas. Padrão 100. Use 0 para desativar a IA. |
| `TRIAGE_FFMPEG` | Caminho do executável FFmpeg. Quando configurado, a triagem pode extrair um quadro de um vídeo em relatos com pouco texto e sem imagem. |
| `TRIAGE_TRANSCRIBE_AUDIO` | Use 1 para o Gemini considerar até 20 segundos de áudio, junto do quadro e do texto na mesma chamada. Requer FFmpeg. |

A fila usa IA em relatos autorizados que têm campos faltantes ou duplicidade incerta. Cada chamada recebe o texto, até três títulos de candidatos que autorizaram o Gemini e, quando necessário, uma imagem ou um quadro com áudio opcional. Ela registra modelo, versão do prompt, tokens e duração no SQLite. Ao atingir o limite ou em caso de falha, o ticket continua com a análise local.

Use a triagem gratuita para relatos sem informações pessoais, sensíveis ou confidenciais. O Google pode usar conteúdo enviado pela cota gratuita para melhorar os serviços. O formulário pede autorização por relato. [Termos do Gemini](https://ai.google.dev/gemini-api/terms)

## Deploy

O guia cobre o deploy na Vercel com Supabase e a execução com Docker e SQLite persistente. [Guia de deploy](DEPLOY.md)

## Avisos por e-mail

O primeiro pedido de review de um projeto entra na fila de e-mail para os testadores que ativaram os avisos e marcaram a plataforma correspondente. Cada pessoa recebe o próprio e-mail com o link do projeto. O dono vê o andamento na página do projeto. Os membros podem cancelar futuros avisos no perfil.

Use um remetente verificado em `BREVO_SENDER_EMAIL` e a chave do Brevo em `BREVO_API_KEY`. A fila só é ativada no modo por convite com `APP_ORIGIN` em HTTPS. O ReviewLab limita as tentativas a 100 em 24 horas, abaixo dos 300 envios diários incluídos no plano gratuito do Brevo. O Brevo pode substituir um remetente de domínio gratuito por um endereço próprio. [Plano gratuito do Brevo](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) · [Remetente sem domínio próprio](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)
