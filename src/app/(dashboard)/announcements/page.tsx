import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AnnouncementList } from '@/features/announcements/announcement-list';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Announcements' };

export default function AnnouncementsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <AnnouncementList />
    </Suspense>
  );
}
