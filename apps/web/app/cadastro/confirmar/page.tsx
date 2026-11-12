import { accountDestination } from '@reviewlab/api/contracts';
import { CompleteSignupPage } from '../../../components/account-pages';

export const metadata = { title: 'Finalizar cadastro | ReviewLab' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <CompleteSignupPage next={accountDestination(next) ?? '/perfil'} />;
}
