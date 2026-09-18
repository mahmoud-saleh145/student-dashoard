import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SettingsPage } from '@/features/settings/settings-page';
import { CardsSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Settings' };

export default function Settings() {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <SettingsPage />
    </Suspense>
  );
}
