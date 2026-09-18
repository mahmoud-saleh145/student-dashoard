import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NotificationCentre } from '@/features/notifications/notification-centre';
import { CardsSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Notification centre' };

export default function NotificationsPage() {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <NotificationCentre />
    </Suspense>
  );
}
