import { accountDestination } from '@reviewlab/api/contracts';
import { RequestAccountLinkPage } from '../../components/account-pages';

export const metadata = { title: 'Criar conta | ReviewLab' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <RequestAccountLinkPage signup next={accountDestination(next)} />;
}
