/** Mirrors `WatchLimitsService` in the API (admin/watch-limits/...). */

export type WatchLimitAction = 'ADD_PLAYS' | 'SET_REMAINING' | 'RESET_USED' | 'RESTORE_DEFAULT';

export type WatchLimitStatus =
  'AVAILABLE' | 'NEARLY_EXHAUSTED' | 'EXHAUSTED' | 'UNLIMITED' | 'NO_ACCESS';

export interface WatchLimitVideo {
  videoId: string;
  lessonId: string;
  title: string;
  titleAr: string | null;
  sectionId: string;
  sectionTitle: string;
  sectionTitleAr: string | null;
  isPreview: boolean;
  accessible: boolean;
  defaultLimit: number;
  /** The ceiling: a custom limit, or the default. */
  allowedPlays: number;
  customLimit: boolean;
  /** Counted plays since the last reset. */
  usedPlays: number;
  remainingPlays: number;
  /** Counted plays ever, including before a reset (history is never deleted). */
  lifetimePlays: number;
  countFrom: string | null;
  status: WatchLimitStatus;
  /** Other live courses using this same video. Non-zero = cannot be changed here. */
  sharedCourses: number;
}

export interface StudentWatchLimits {
  student: { id: string; fullName: string; phone: string };
  course: { id: string; title: string; titleAr: string | null };
  defaultLimit: number;
  summary: {
    totalVideos: number;
    accessibleVideos: number;
    watchedVideos: number;
    exhaustedVideos: number;
    customLimits: number;
    sharedVideos: number;
  };
  videos: WatchLimitVideo[];
}

export interface CourseResetSummary {
  course: { id: string; title: string; titleAr: string | null };
  restoreDefault: boolean;
  enrolledStudents: number;
  courseVideos: number;
  sharedVideos: number;
  affectedStudents: number;
  affectedVideos: number;
  affectedPlayRecords: number;
  customLimitsRestored: number;
  executedAt?: string;
}
