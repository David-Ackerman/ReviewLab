import { accountDestination } from '@reviewlab/api/contracts';
import { LoginPage } from '../../components/account-pages';

export const metadata = { title: 'Entrar | ReviewLab' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; senha?: string }> }) {
  const query = await searchParams;
  const next = accountDestination(query.next) ?? '/';
  return <LoginPage next={next} passwordChanged={query.senha === 'alterada'} />;
}
