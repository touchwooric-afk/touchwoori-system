export const runtime = 'edge';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import DashboardClient from '@/components/dashboard/DashboardClient';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) redirect('/login');
  if (user.status === 'pending') redirect('/pending');
  if (user.status === 'inactive') redirect('/login');

  return <DashboardClient />;
}
