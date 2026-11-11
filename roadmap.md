# Roadmap do ReviewLab

O fluxo central vai do pedido de review ao reteste de uma correção. O catálogo reúne projetos de várias plataformas e as evidências ficam vinculadas ao ticket. O piloto deve medir quantos pedidos viram reviews úteis e quanto tempo cada etapa leva.

## P0 · Critérios para operar o piloto

| Ponto crítico | Estado atual | Critério de aceite |
| --- | --- | --- |
| Avisos por e-mail | A fila registra a aceitação pelo provedor. A entrega é conferida no painel do Resend e a recuperação depende do tráfego e do cron diário. | Validar o envio real em homologação. Processar 95% dos avisos elegíveis em até cinco minutos no volume do piloto. Alertar quando o aviso mais antigo ultrapassar esse prazo e acompanhar entregas e bounces por ID da mensagem. |
| Controle de abuso e contas | O cadastro é aberto e os avisos dependem da preferência do perfil. | Verificar o endereço antes de enviar avisos a ele, limitar tentativas de login e frequência de anúncios, e permitir recuperação de senha com token expirável e de uso único. |
| Privacidade e acesso | Anexos são privados. A triagem externa depende de autorização por relato. | Testar permissões com dono, autor da review e terceiro, inclusive depois da expiração de URLs assinadas. Definir retenção e exclusão para anexos, contas e dados enviados à triagem. |
| Backup e recuperação | Há script de backup para SQLite. O ambiente hospedado depende do banco e do bucket. | Restaurar banco e anexos em homologação e registrar o tempo. Adotar como metas iniciais perda máxima de 24 horas e restauração em até quatro horas. |
| Regressões no fluxo principal | Existem cenários locais do fluxo de review. O deploy também usa PostgreSQL e upload direto. | Tornar obrigatórios no CI o typecheck, o build e os cenários de cadastro, projeto legado e multiplataforma, publicação, review, evidência e reteste. Rodar a mesma jornada em homologação com PostgreSQL e Storage. |
| Acessibilidade | Os formulários usam controles nativos e componentes Radix do shadcn/ui. Há temas claro e escuro. | Validar o fluxo completo por teclado e leitor de tela, com foco visível, mensagens de erro anunciadas e sem rolagem horizontal a 320 px. Medir contraste nos dois temas conforme WCAG 2.2 AA. |

## P1 · Melhorar a qualidade das reviews

- **Links e instruções por plataforma.** Hoje o projeto tem um link principal e instruções compartilhadas. Oferecer um link e passos de acesso por plataforma, preservando o link atual como padrão ao migrar projetos existentes.
- **Ambiente de teste estruturado.** Registrar plataforma, versão ou build, dispositivo e sistema no relato. Mostrar a versão testada ao solicitar reteste.
- **Catálogo de acordo com o perfil.** Oferecer um filtro de plataformas que o membro testa e destacar projetos com pedido em aberto e retestes atribuídos ao membro.
- **Acompanhar mudanças no produto.** Medir a mediana até a primeira review, a proporção de pedidos com review em até sete dias e a proporção de retestes concluídos. Coletar contagens e tempos sem copiar o conteúdo de relatos e anexos.

## P2 · Reduzir esforço de operação

- **Caixa de notificações e resumo periódico.** Concentrar pedidos de review e retestes, com frequência ajustável por membro.
- **Histórico de versões do projeto.** Agrupar reviews e tickets por release para que o testador veja o que mudou e o dono acompanhe regressões.
- **Avaliação da triagem.** Comparar sugestões de duplicidade com decisões do dono e medir custo e tempo economizado antes de expandir a automação.
- **Limites do catálogo e da página de projeto.** Medir consultas e tamanho das respostas em homologação. Paginar o catálogo e carregar reviews e tickets em lotes conforme o volume justificar.
