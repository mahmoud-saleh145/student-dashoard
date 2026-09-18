import type { Metadata } from 'next';
import { Suspense } from 'react';

import { WalletOverview } from '@/features/wallet/wallet-overview';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Wallet & recharge' };

export default function WalletPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <WalletOverview />
    </Suspense>
  );
}
