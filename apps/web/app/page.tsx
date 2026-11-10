import { Workspace } from '../components/workspace';

export default async function Page({ searchParams }: { searchParams: Promise<{ meus?: string }> }) {
  const query = await searchParams;
  return <Workspace mine={query.meus !== undefined} />;
}
