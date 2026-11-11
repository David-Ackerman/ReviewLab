import { getApi } from '@reviewlab/api';
import { after } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(request: Request) {
  try {
    return await (await getApi()).fetch(request, { afterResponse: after });
  } catch (error) {
    console.error('ReviewLab API:', error);
    return Response.json({ error: 'Serviço indisponível.' }, { status: 503 });
  }
}

export { handle as GET, handle as POST };
