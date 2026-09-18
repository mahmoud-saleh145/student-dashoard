'use client';

import { AdminStatistics } from '@/features/stats/admin-statistics';
import { TeacherHome } from '@/features/stats/teacher-home';
import { useSession } from '@/lib/session-context';

export function HomeRouter() {
  const { isTeacher } = useSession();
  return isTeacher ? <TeacherHome /> : <AdminStatistics />;
}
