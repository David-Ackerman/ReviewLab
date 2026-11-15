---
name: reviewlab-review-progress
description: Use o MCP do ReviewLab para conferir se um projeto da conta recebeu reviews e quantas faltam para a meta.
---

# Acompanhar reviews no ReviewLab

1. Identifique o `projectId` com o link fornecido ou com `list_my_projects`. Se houver projetos com o mesmo nome, peça ao usuário que escolha.
2. Chame `get_project_review_progress` com esse ID. Use `hasReviews`, `reviewCount`, `reviewGoal` e `reviewsRemaining` para responder. `found: false` indica que o projeto não está disponível para consulta nessa conta.
3. Diga se é rascunho quando `published` for falso. A meta mede reviews enviadas no ReviewLab e pode ser editada na página do projeto.

A contagem se refere a reviews do ReviewLab. Convites do Google Play, instalações, tempo de teste e tickets são métricas independentes.
