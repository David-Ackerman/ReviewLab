import { Workspace } from '../components/workspace';

export default async function Page({ searchParams }: { searchParams: Promise<{ meus?: string; retestes?: string; q?: string }> }) {
  const query = await searchParams;
  const view = query.retestes !== undefined ? 'retests' : query.meus !== undefined ? 'mine' : 'explore';
  return <Workspace key={view} view={view} initialQuery={query.q ?? ''} />;
}
