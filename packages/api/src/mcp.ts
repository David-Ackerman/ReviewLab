import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { reviewsRemaining, type Project } from './contracts.ts';

const projectId = z.uuid();
const cursorSchema = z.object({ timestamp: z.iso.datetime(), id: projectId });
export type ProjectCursor = z.infer<typeof cursorSchema>;

export function readProjectCursor(value: string | undefined): ProjectCursor | null {
  if (!value) return null;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new Error('Cursor inválido. Inicie a listagem sem cursor.');
  }
}

function projectSummary(project: Project) {
  return {
    projectId: project.id, path: '/projetos/' + project.id, name: project.name, platforms: project.platforms,
    status: project.status, published: Boolean(project.requested_at), reviewCount: project.review_count,
    reviewGoal: project.review_goal, reviewsRemaining: reviewsRemaining(project),
  };
}

function result(data: Record<string, unknown>) {
  return { structuredContent: data, content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

type Operations = {
  canCreate: boolean;
  create: (form: FormData) => Promise<string>;
  list: (mine: boolean, cursor: ProjectCursor | null, limit: number) => Promise<Project[]>;
  progress: (id: string) => Promise<Project | undefined>;
  onError: (error: unknown) => string;
};

export async function handleMcp(request: Request, operations: Operations) {
  const server = new McpServer({ name: 'reviewlab', version: '1.0.0' });
  const readOnly = { readOnlyHint: true, openWorldHint: false };
  const paging = z.object({ cursor: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/).optional() }).strict();

  async function run(operation: () => Promise<Record<string, unknown>>) {
    try {
      return result(await operation());
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: operations.onError(error) }] };
    }
  }

  for (const [name, mine, limit, description] of [
    ['list_my_projects', true, 20, 'Lista os próprios projetos, inclusive rascunhos, em páginas de até 20.'],
    ['list_explore_projects', false, 5, 'Lista projetos publicados em Explorar, em páginas de cinco.'],
  ] as const) {
    server.registerTool(name, { description, annotations: readOnly, inputSchema: paging }, ({ cursor }) => run(async () => {
      let after: ProjectCursor | null;
      try { after = readProjectCursor(cursor); }
      catch { return { error: 'Cursor inválido. Inicie a listagem sem cursor.', projects: [], nextCursor: null }; }
      const rows = await operations.list(mine, after, limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const projects = page.map(project => ({
        ...projectSummary(project), ...(mine ? {} : { description: project.description, owner: project.owner }),
      }));
      const nextCursor = rows.length > limit && last ? Buffer.from(JSON.stringify({
        timestamp: mine ? last.created_at : last.requested_at, id: last.id,
      })).toString('base64url') : null;
      return { projects, nextCursor };
    }));
  }

  server.registerTool('get_project_review_progress', {
    description: 'Consulta se um projeto seu já recebeu reviews, quantas recebeu, a meta e quantas faltam.',
    annotations: readOnly,
    inputSchema: z.object({ projectId }).strict(),
  }, ({ projectId }) => run(async () => {
    const project = await operations.progress(projectId);
    if (!project) return { found: false };
    return { found: true, ...projectSummary(project), hasReviews: project.review_count > 0 };
  }));

  if (operations.canCreate) {
    server.registerTool('create_project', {
      description: 'Cadastra um rascunho no ReviewLab. Web, Android e iOS podem ser escolhidos juntos. Android e iOS exigem instruções de teste.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: z.object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().min(1).max(1600),
        url: z.url().max(2048),
        platforms: z.array(z.enum(['web', 'android', 'ios'])).min(1).max(3),
        instructions: z.string().trim().max(2000).optional(),
        reviewGoal: z.number().int().min(1).max(1000).optional(),
      }).strict(),
    }, input => run(async () => {
      const form = new FormData();
      form.set('name', input.name);
      form.set('description', input.description);
      form.set('url', input.url);
      form.set('instructions', input.instructions ?? '');
      for (const platform of input.platforms) form.append('platforms', platform);
      if (input.reviewGoal !== undefined) form.set('review_goal', String(input.reviewGoal));
      const id = await operations.create(form);
      return { projectId: id, path: '/projetos/' + id, published: false, reviewGoal: input.reviewGoal ?? 1 };
    }));
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true, maxRequestBodySize: 16_384 });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
