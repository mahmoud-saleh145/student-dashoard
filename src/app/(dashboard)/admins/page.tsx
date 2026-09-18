import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AdminAccounts } from '@/features/admins/admin-accounts';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Admin accounts' };

export default function AdminsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <AdminAccounts />
    </Suspense>
  );
}
