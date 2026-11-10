import { getApi } from '@reviewlab/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  try {
    return await (await getApi()).fetch(request);
  } catch (error) {
    console.error('ReviewLab API:', error);
    return Response.json({ error: 'Serviço indisponível.' }, { status: 503 });
  }
}

export { handle as GET, handle as POST };
