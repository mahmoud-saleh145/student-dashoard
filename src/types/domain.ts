/**
 * Domain types.
 *
 * Mirrors of the backend's Prisma enums and the shapes its admin endpoints
 * actually return. Where a name differs between the database and the screen
 * — `EXHAUSTED` vs "Used", `Faculty` vs "College" — the mapping is declared
 * here, once, rather than repeated in every component.
 */

// ---------------------------------------------------------------------------
// Enums (exact mirrors of prisma/schema.prisma)
// ---------------------------------------------------------------------------

export const USER_ROLES = ['MASTER', 'ADMIN', 'TEACHER', 'STUDENT'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** The roles that may sign in to this dashboard. Students may not. */
export const DASHBOARD_ROLES = ['MASTER', 'ADMIN', 'TEACHER'] as const;
export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export const ACCOUNT_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const GENDERS = ['MALE', 'FEMALE'] as const;
export type Gender = (typeof GENDERS)[number];

export const COURSE_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'HIDDEN',
  'SUSPENDED',
  'ARCHIVED',
] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const CONTENT_STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const ENROLLMENT_STATES = [
  'PENDING_APPROVAL',
  'PENDING_PAYMENT',
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
  'ARCHIVED',
] as const;
export type EnrollmentState = (typeof ENROLLMENT_STATES)[number];

export const ENROLLMENT_METHODS = ['FREE', 'PAYMENT', 'CODE', 'ADMIN_APPROVAL'] as const;
export type EnrollmentMethod = (typeof ENROLLMENT_METHODS)[number];

export const CODE_STATUSES = ['ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVOKED'] as const;
export type CodeStatus = (typeof CODE_STATUSES)[number];

/**
 * `PART` unlocks one part of a course — the same access-card system at a finer
 * grain, and never a wallet debit. It was added to the backend's
 * `CodeTargetType` alongside course parts; without it here a part-scoped card
 * renders with an undefined label.
 */
export const CODE_TARGET_TYPES = ['COURSE', 'SECTION', 'TEACHER', 'PART'] as const;
export type CodeTargetType = (typeof CODE_TARGET_TYPES)[number];

export const CODE_TARGET_TYPE_LABEL: Record<CodeTargetType, string> = {
  COURSE: 'Whole course',
  SECTION: 'Section',
  TEACHER: 'Teacher',
  PART: 'Course part',
};

export const VIDEO_STATUSES = [
  'UPLOADING',
  'QUEUED',
  'PROCESSING',
  'READY',
  'FAILED',
  'ARCHIVED',
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const SUPPORT_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_CATEGORIES = [
  'GENERAL',
  'TECHNICAL',
  'PAYMENT',
  'ACCESS',
  'CONTENT',
  'OTHER',
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const ATTACHMENT_KINDS = ['PDF', 'IMAGE', 'DOC', 'SHEET', 'LINK', 'OTHER'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/**
 * `CodeStatus` as the screens label it.
 *
 * The database says EXHAUSTED and REVOKED; operators say "used" and
 * "cancelled". Translating in one place means a status filter and a status
 * badge can never disagree about what a row means.
 */
export const CODE_STATUS_LABEL: Record<CodeStatus, string> = {
  ACTIVE: 'Active',
  EXHAUSTED: 'Used',
  EXPIRED: 'Expired',
  REVOKED: 'Cancelled',
};

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  fullName: string;
  phone: string;
  role: DashboardRole;
  avatarUrl: string | null;
  email: string | null;
  locale: 'en' | 'ar';
}

// ---------------------------------------------------------------------------
// Academic structure
//
// The backend's hierarchy is University → Faculty → Department, with academic
// years as a flat, platform-wide list that courses and students both point at.
// "College" on screen is this `Faculty`.
// ---------------------------------------------------------------------------

export interface NamedRef {
  id: string;
  name: string;
  nameAr: string;
}

export interface University extends NamedRef {
  code?: string | null;
  logoUrl?: string | null;
  isActive: boolean;
  sortOrder: number;
  facultyCount?: number;
  courseCount?: number;
  studentCount?: number;
}

export interface Faculty extends NamedRef {
  universityId: string;
  isActive: boolean;
  sortOrder: number;
  departmentCount?: number;
  courseCount?: number;
  studentCount?: number;
}

export interface Department extends NamedRef {
  facultyId: string;
  isActive: boolean;
  sortOrder: number;
  studentCount?: number;
}

export interface AcademicYear extends NamedRef {
  order: number;
  isActive: boolean;
  studentCount?: number;
}

export interface Subject extends NamedRef {
  isActive: boolean;
  sortOrder: number;
  courseCount: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: UserRole;
  status: AccountStatus;
  gender: Gender;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface StudentRow extends AdminUser {
  university: NamedRef | null;
  faculty: NamedRef | null;
  department: NamedRef | null;
  academicYear: (NamedRef & { order: number }) | null;
}

export interface TeacherRow {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  gender: Gender;
  status: AccountStatus;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  isPublic: boolean;
  courseCount: number;
  publishedCourseCount: number;
  studentCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface DeviceRow {
  id: string;
  name: string;
  platform: string;
  model: string | null;
  osVersion: string | null;
  appVersion: string | null;
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'REVOKED' | 'BLOCKED';
  firstSeenAt: string;
  lastSeenAt: string;
  isCurrent?: boolean;
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export interface CourseSummary {
  id: string;
  title: string;
  slug: string;
  status: CourseStatus;
  isFree: boolean;
  price: { amount: number; currency: string } | null;
  thumbnailKey: string | null;
  teachers: { id: string; fullName: string; isLead: boolean }[];
  counts: { enrollments: number; sections: number; lessons: number };
  studentCount: number;
  university: NamedRef | null;
  faculty: NamedRef | null;
  academicYear: (NamedRef & { order: number }) | null;
  subject: NamedRef | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SectionRow {
  id: string;
  courseId: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  sortOrder: number;
  status: ContentStatus;
  unlocksAt: string | null;
  lessonCount?: number;
  /** `GET /admin/courses/:id/sections` counts non-deleted lectures here. */
  _count?: { lessons: number };
  /** Every non-deleted lecture, any status — the staff authoring view. */
  lessons?: LessonRow[];
}

export interface LessonRow {
  id: string;
  sectionId: string;
  courseId: string;
  title: string;
  description: string | null;
  kind: 'VIDEO' | 'DOCUMENT' | 'QUIZ' | 'LIVE';
  sortOrder: number;
  status: ContentStatus;
  isPreview: boolean;
  durationSeconds: number;
  /** The lecture's live video; a deleted one is reported as null. */
  video?: {
    id: string;
    status: VideoStatus;
    durationSeconds: number;
    processingError?: string | null;
  } | null;
  /** From the lesson→video relation (0 or 1: a lecture holds one video). */
  videoCount?: number;
  attachmentCount?: number;
}

export interface AttachmentRow {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  kind: AttachmentKind;
  sizeBytes: number | null;
  isProtected: boolean;
  isDownloadable: boolean;
  isPreview: boolean;
  createdAt: string;
}

export interface CourseStudentRow {
  id: string;
  state: EnrollmentState;
  method: EnrollmentMethod;
  user: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    gender: Gender;
    status: AccountStatus;
    university: NamedRef | null;
    faculty: NamedRef | null;
    department: NamedRef | null;
    academicYear: (NamedRef & { order: number }) | null;
  };
  course: { id: string; title: string };
  coversAllSections: boolean;
  sectionIds: string[] | null;
  accessStartsAt: string;
  accessEndsAt: string | null;
  completedLessons: number;
  lastAccessedAt: string | null;
  createdAt: string;
  payments: { id: string; amount: number; currency: string; paidAt: string | null }[];
  redemption: {
    codeId: string;
    code: string;
    targetType: CodeTargetType;
    amount: number | null;
    currency: string;
    redeemedAt: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

export interface CodeRow {
  id: string;
  serial: number;
  code: string;
  status: CodeStatus;
  targetType: CodeTargetType;
  targetName: string;
  course: { id: string; title: string } | null;
  section: { id: string; title: string; courseId: string } | null;
  teacher: { id: string; fullName: string } | null;
  /** Set on a PART-scoped card. The backend selects it on every code row. */
  coursePart: { id: string; title: string } | null;
  batchId: string | null;
  batchName: string | null;
  amount: number | null;
  currency: string;
  maxRedemptions: number;
  redemptionCount: number;
  expiresAt: string | null;
  issuedBy: { id: string; fullName: string } | null;
  note: string | null;
  createdAt: string;
}

export interface CodeBatchRow {
  id: string;
  name: string | null;
  targetType: CodeTargetType;
  targetName: string;
  courseId: string | null;
  sectionId: string | null;
  teacherId: string | null;
  quantity: number;
  cardCount: number;
  prefix: string | null;
  amount: number | null;
  currency: string;
  expiresAt: string | null;
  note: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface CodeRedemptionRow {
  id: string;
  redeemedAt: string;
  ipAddress: string | null;
  user: { id: string; fullName: string; phone: string };
}

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

export interface SupportTicketRow {
  id: string;
  reference: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  priority: SupportPriority;
  student: { id: string; fullName: string; phone: string };
  assignedTo: { id: string; fullName: string } | null;
  messageCount: number;
  unreadForStaff: number;
  lastMessageAt: string;
  createdAt: string;
}

export interface SupportMessageRow {
  id: string;
  body: string;
  isInternal: boolean;
  authorRole: UserRole;
  author: { id: string; fullName: string; role: UserRole } | null;
  createdAt: string;
}

export interface SupportTicketDetail {
  id: string;
  reference: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  priority: SupportPriority;
  courseId: string | null;
  lastMessageAt: string;
  createdAt: string;
  messages: SupportMessageRow[];
  student: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    status: AccountStatus;
  };
  assignedTo: { id: string; fullName: string } | null;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface DashboardStats {
  period: { from: string; to: string };
  users: {
    students: number;
    blockedStudents: number;
    activeStudents: number;
    teachers: number;
    admins: number;
  };
  courses: {
    total: number;
    published: number;
    draft: number;
    hidden: number;
    suspended: number;
    archived: number;
    byStatus: Record<string, number>;
  };
  codes: {
    total: number;
    active: number;
    used: number;
    expired: number;
    cancelled: number;
    byStatus: Record<string, number>;
  };
  purchases: {
    paidPayments: number;
    transactionsAllTime: number;
    transactionsInPeriod: number;
    enrollmentsInPeriod: number;
    activeEnrollments: number;
  };
  revenue: {
    currency: string;
    grossAllTime: number;
    refundedAllTime: number;
    netAllTime: number;
    grossInPeriod: number;
    platformInPeriod: number;
    teachersInPeriod: number;
  };
  queues: { supportOpen: number; pendingDeviceRequests: number };
}

export interface RevenuePoint {
  day: string;
  amount: number;
  transactions?: number;
}

export interface LessonViewerRow {
  student: {
    id: string;
    fullName: string;
    phone: string;
    university: { name: string; nameAr: string } | null;
    faculty: { name: string; nameAr: string } | null;
    academicYear: { name: string; nameAr: string; order: number } | null;
  };
  firstWatchedAt: string;
  lastWatchedAt: string;
  positionSeconds: number;
  watchedSeconds: number;
  durationSeconds: number;
  percent: number;
  completed: boolean;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  note: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; role: UserRole; phone?: string } | null;
}

export interface LoginLogRow {
  id: string;
  student: {
    id: string;
    fullName: string;
    phone: string;
    university: { name: string; nameAr: string } | null;
    academicYear: { name: string; nameAr: string } | null;
    registeredAt: string;
  } | null;
  deviceKey: string | null;
  platform: string | null;
  model: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface PlatformSettings {
  'student.deviceLimit': number;
  'student.allowAcademicYearChange': boolean;
  'teacher.canDeleteLectures': boolean;
  'teacher.canDeleteVideos': boolean;
  'teacher.canEditVideoUrls': boolean;
  'teacher.canEditCoursePrices': boolean;
  'contact.phone': string;
  'contact.whatsapp': string;
  'contact.facebook': string;
  'contact.email': string;
}

export type SettingKey = keyof PlatformSettings;
