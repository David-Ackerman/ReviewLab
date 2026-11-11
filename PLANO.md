# Plano de execução — comunidade de review de projetos

## Objetivo

Reunir projetos de desenvolvedores, facilitar testes entre membros da comunidade e transformar relatos de bugs em tickets claros para quem mantém cada projeto. A primeira versão deve funcionar bem mesmo sem uma integração automática com o WhatsApp.

## Fluxo principal

1. A pessoa cria uma conta e informa onde consegue testar: navegador, Android e/ou iOS. Para Android, informa se tem aparelho compatível e conta Google; para iOS, se tem aparelho compatível e consegue usar TestFlight. Modelo do aparelho, versão do sistema e navegadores são opcionais e editáveis.
2. O dono cadastra o projeto com nome, descrição, imagem, tipo (web, Android, iOS ou outro), link de acesso/teste e instruções. Escolhe o estado: **em desenvolvimento**, **em review** ou **em produção**.
3. Ao solicitar review, o projeto aparece na lista. A plataforma gera um anúncio com imagem, resumo e link para a página do projeto. O envio ao grupo de WhatsApp depende da prova técnica descrita abaixo.
4. Um revisor abre o projeto, registra sua review e pode relatar um ou mais bugs em texto, imagem e/ou vídeo. O formulário pede passos para reproduzir, resultado esperado, resultado observado e ambiente de teste, sem impedir um relato inicial incompleto.
5. Um agente processa cada relato, extrai informações úteis das mídias quando necessário, identifica possível duplicidade e cria um ticket vinculado ao projeto. Se faltarem dados, o ticket fica marcado como **precisa de detalhes**; o relato original e as evidências permanecem anexados.
6. O dono acompanha tickets, responde, altera o estado para **em andamento**, **corrigido** ou **não reproduzido** e pode pedir reteste. O revisor confirma a correção ou reabre o ticket.

## Escopo da primeira versão

| Área | Entrega | Critério de aceite |
| --- | --- | --- |
| Conta | Cadastro, login, perfil de testador e plataformas disponíveis | A pessoa consegue editar suas capacidades e ver somente seus dados privados. |
| Projetos | Criar, editar, listar, filtrar e abrir projetos | Apenas o dono altera seus projetos; links de teste e instruções ficam visíveis aos revisores. |
| Reviews | Registrar review e mostrar contagem | A contagem representa reviews enviadas por pessoas distintas; bugs e comentários têm contagens separadas. |
| Bugs | Relatos com texto e anexos de imagem/vídeo | O revisor pode combinar formatos; arquivos têm limites de tipo e tamanho e acesso controlado. |
| Tickets | Fila do dono, estados e histórico | Todo ticket aponta para o relato original, suas evidências e o projeto correto. |
| IA | Estruturar relatos e sugerir duplicidades | O agente nunca descarta o relato; criação falha entra numa fila de retry/revisão. |
| WhatsApp | Link do grupo e anúncio compartilhável | O usuário consegue entrar no grupo e compartilhar o anúncio mesmo sem automação. |

Ficam para depois: reputação, ranking, pagamentos, integração com GitHub/Jira, chat interno, testes automatizados dos projetos e análise de vídeo em tempo real.

## Decisão técnica para o WhatsApp

Fazer uma prova técnica curta **antes** de desenvolver o envio automático:

1. Confirmar qual conta/número será usado, quem administra o grupo atual e se esse grupo pode receber mensagens pela API oficial de grupos da Meta.
2. Verificar elegibilidade da conta, permissão da API, limite de participantes, modelo de cobrança e se a API atende especificamente ao **grupo já existente**. Testar com um projeto fictício em ambiente controlado.
3. Se funcionar, publicar um evento `review_requested`, colocar o envio em fila, registrar sucesso/erro e evitar anúncio duplicado por idempotência.
4. Se não funcionar, gerar o texto do anúncio e abrir o compartilhamento do WhatsApp para um administrador confirmar o envio ao grupo. Manter o link de convite ao grupo na plataforma.

Não usar automação baseada em WhatsApp Web como fundamento do produto: a integração seria frágil e difícil de operar. O cadastro e as reviews não devem depender do sucesso do envio da mensagem.

## Agente de bugs com consumo baixo

Usar **um serviço assíncrono de triagem**, acionado apenas quando entra um relato novo ou quando o revisor acrescenta evidência relevante. O fluxo econômico é:

1. Validar campos, arquivos e autorização com código comum, sem IA.
2. Se o texto já trouxer passos, resultado e ambiente, criar o ticket por regras e usar IA apenas para título, resumo ou deduplicação ambígua.
3. Para imagem, usar visão somente se a imagem for necessária para entender o bug. Para vídeo, extrair poucos quadros representativos e transcrever o áudio; não enviar o vídeo inteiro ao modelo por padrão.
4. Buscar tickets parecidos do mesmo projeto antes da chamada ao modelo e passar apenas os candidatos relevantes.
5. Pedir uma saída JSON curta: título, resumo, passos, esperado, observado, ambiente, categoria, confiança, dados faltantes e possível duplicata. Validar o JSON no servidor.
6. Criar o ticket automaticamente. Em baixa confiança, manter o ticket visível com a marca **precisa de detalhes**, sem inventar fatos. Guardar versão do prompt, custo aproximado e resultado para medir qualidade.

Aplicar limites por usuário e projeto, tamanho máximo de mídia, filas com retry limitado e teto mensal de gasto. Começar com um modelo pequeno para texto; escalar para um modelo mais capaz apenas nos casos que falharem na validação ou exigirem leitura visual complexa.

## Dados essenciais

- `users`: conta e perfil.
- `tester_capabilities`: plataformas, aparelhos e disponibilidade; e-mail de conta de testes só se necessário, com visibilidade controlada.
- `projects`: dono, descrição, imagem, plataforma, links, instruções e estado.
- `review_requests`: pedido, data, estado de anúncio e identificador de idempotência.
- `reviews`: projeto, revisor, avaliação/observações e data.
- `bug_reports`: autor, projeto, texto, ambiente e estado de processamento.
- `attachments`: arquivo, tipo, tamanho e vínculo com o relato.
- `tickets`: relato de origem, título, descrição, prioridade sugerida, estado, responsável e possível duplicata.
- `ticket_events`: mudanças de estado e comentários, para auditoria.

Regras: autorização por projeto e papel; URLs validadas; anexos em armazenamento privado com links temporários; remoção de metadados sensíveis quando possível; consentimento para compartilhar informações de teste; retenção e exclusão de conta/dados definidas antes de abrir a plataforma ao público.

## Sequência de implementação

### Etapa 0 — decisões e prova técnica

- Definir se a comunidade é fechada ou pública, quem pode cadastrar projeto e quem administra o WhatsApp.
- Validar o anúncio no grupo por API oficial, com a alternativa manual pronta.
- Desenhar as telas do fluxo principal e o esquema de dados mínimo.

### Etapa 1 — plataforma sem IA

- Autenticação e perfil de testador.
- Cadastro/lista/detalhe de projetos e mudança de estado pelo dono.
- Solicitação de review, formulário de review e relatos com anexos.
- Tickets básicos criados por regras e painel do dono.
- Link do grupo e anúncio compartilhável.

### Etapa 2 — triagem inteligente

- Fila de processamento, análise de texto e extração seletiva de imagem/vídeo.
- Estruturação do ticket, detecção de duplicata e marcação de dados faltantes.
- Métricas: custo por relato, latência, taxa de tickets editados pelo dono e taxa de duplicatas incorretas.

### Etapa 3 — integração e operação

- Automatizar o anúncio apenas se a prova técnica aprovar o uso do grupo real.
- Alertas de falha, limites de uso, moderação de conteúdo e backups.
- Piloto com poucos desenvolvedores; corrigir os pontos de atrito antes de expandir.

## Como trabalhar com agentes de menor custo

Manter **um agente coordenador** com visão do produto e passar tarefas isoladas a agentes menores. Cada tarefa deve conter: arquivos afetados, contrato de entrada/saída, critérios de aceite e uma única decisão principal. Evitar vários agentes editando os mesmos arquivos.

| Tarefa delegável | Entrada para o agente | Saída verificável |
| --- | --- | --- |
| Modelo de dados | Fluxo e regras acima | Migrações e restrições de integridade. |
| API de projetos | Contrato de endpoints e permissões | CRUD e validações. |
| Interface de cadastro/lista | Wireframe e contrato da API | Telas responsivas com estados de erro/vazio. |
| Upload de evidências | Política de arquivos e acesso | Upload seguro e links temporários. |
| Triagem de bugs | Esquema JSON e exemplos reais anonimizados | Worker, validação e exemplos de saída. |
| WhatsApp | Resultado da prova técnica | Adaptador de envio ou fluxo de compartilhamento. |

O coordenador integra e revisa as entregas por fatias verticais: primeiro um projeto cadastrado e visto na lista; depois review e bug; depois ticket; por fim anúncio e IA. Usar agentes baratos para implementação delimitada e reservar um modelo mais forte para arquitetura, revisão de segurança, conflitos de integração e decisões ambíguas. Não repetir contexto completo a cada tarefa: fornecer um resumo curto, o contrato e os arquivos pertinentes.

## Primeiro marco demonstrável

Um dev cadastra um projeto web, solicita review, outro dev encontra um bug e anexa imagem, e o dono recebe um ticket rastreável e atualiza seu estado. O anúncio pode ser compartilhado no WhatsApp e a página mostra contagem de reviews e link do grupo.

## Questões a decidir antes de codificar

1. O cadastro é aberto. O catálogo exige login.
2. O grupo de WhatsApp já existe? Qual é seu tamanho e quem é administrador?
3. Reviews serão apenas relatos técnicos ou também terão nota/opinião geral?
4. Os projetos de teste podem exigir login e credenciais temporárias? Quem poderá vê-las?
5. Qual é o limite inicial de armazenamento para vídeos e por quanto tempo serão mantidos?

## Referências para cadastro de testadores

- Google Play: participantes de testes precisam de conta Google ou Google Workspace; testes internos aceitam até 100 participantes por app. Fonte: https://support.google.com/googleplay/android-developer/answer/9845334
- Apple TestFlight: testadores externos entram por convite ou link público e instalam pelo app TestFlight em dispositivo compatível; a primeira build externa passa por revisão. Fonte: https://developer.apple.com/testflight/ e https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers
- Meta: documentação da API de grupos a validar na prova técnica: https://developers.facebook.com/documentation/business-messaging/whatsapp/groups
