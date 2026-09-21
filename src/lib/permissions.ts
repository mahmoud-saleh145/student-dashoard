import type { DashboardRole } from '@/types/domain';

/**
 * What the interface offers each role.
 *
 * **This is presentation, not security.** Every one of these decisions is made
 * again — authoritatively — by the backend, which refuses the request whatever
 * the browser chose to render. Hiding a button here saves a user from a
 * pointless 403; it does not stop anyone who bypasses the UI.
 *
 * Teacher capabilities additionally depend on platform settings an admin
 * controls, which are fetched at runtime rather than hardcoded here — see
 * `useTeacherCapabilities`.
 */

export type Capability =
  | 'viewStatistics'
  | 'manageCatalog'
  | 'manageCourses'
  // Creating a course and staffing one are administrative decisions, distinct
  // from `manageCourses` — which a teacher holds for the courses assigned to
  // them. `POST /admin/courses` and `POST /admin/courses/:id/teachers` are both
  // `@AdminOnly()`, so offering either to a teacher would only produce a 403.
  | 'createCourses'
  | 'assignCourseTeachers'
  | 'viewAllCourses'
  | 'manageStudents'
  | 'manageTeachers'
  | 'manageCodes'
  // Wallet, library and announcements are @AdminOnly() on the backend — a
  // teacher receives 403 on every one of their endpoints, so they are not
  // offered. Course parts are the exception: those routes are @StaffOnly()
  // and scoped per course inside the service.
  | 'manageWallet'
  | 'manageLibrary'
  | 'manageCourseParts'
  | 'manageAnnouncements'
  | 'viewPartPurchases'
  | 'manageSupport'
  | 'sendBroadcastNotifications'
  | 'sendCourseNotifications'
  | 'viewLogs'
  | 'manageAdmins'
  | 'manageSettings'
  | 'viewRevenue';

const MATRIX: Record<DashboardRole, ReadonlySet<Capability>> = {
  MASTER: new Set<Capability>([
    'viewStatistics',
    'manageCatalog',
    'manageCourses',
    'createCourses',
    'assignCourseTeachers',
    'viewAllCourses',
    'manageStudents',
    'manageTeachers',
    'manageCodes',
    'manageWallet',
    'manageLibrary',
    'manageCourseParts',
    'manageAnnouncements',
    'viewPartPurchases',
    'manageSupport',
    'sendBroadcastNotifications',
    'sendCourseNotifications',
    'viewLogs',
    'manageAdmins',
    'manageSettings',
    'viewRevenue',
  ]),

  ADMIN: new Set<Capability>([
    'viewStatistics',
    'manageCatalog',
    'manageCourses',
    'createCourses',
    'assignCourseTeachers',
    'viewAllCourses',
    'manageStudents',
    'manageTeachers',
    'manageCodes',
    'manageWallet',
    'manageLibrary',
    'manageCourseParts',
    'manageAnnouncements',
    'viewPartPurchases',
    'manageSupport',
    'sendBroadcastNotifications',
    'sendCourseNotifications',
    'viewLogs',
    'manageSettings',
    'viewRevenue',
  ]),

  // A teacher sees their own courses, their own students and their own
  // numbers. Everything platform-wide is absent from their navigation, and
  // absent from what the backend will serve them.
  //
  // `manageCourseParts` is here because the part routes are `@StaffOnly()`,
  // and the service then checks that this teacher is assigned to this course
  // with the right capability. The part *purchase report* is not: it is
  // `@AdminOnly()`, so it stays out.
  //
  // `manageCourses` without `createCourses` is the shape of the teacher role:
  // they work on the courses an administrator created and assigned to them,
  // and they cannot bring a new one into existence or change who teaches it.
  TEACHER: new Set<Capability>([
    'manageCourses',
    'manageCourseParts',
    'sendCourseNotifications',
  ]),
};

export function can(role: DashboardRole, capability: Capability): boolean {
  return MATRIX[role].has(capability);
}

export function isAdminRole(role: DashboardRole): boolean {
  return role === 'ADMIN' || role === 'MASTER';
}

export function isMaster(role: DashboardRole): boolean {
  return role === 'MASTER';
}

export function isTeacher(role: DashboardRole): boolean {
  return role === 'TEACHER';
}

export const ROLE_LABEL: Record<DashboardRole, string> = {
  MASTER: 'Master admin',
  ADMIN: 'Admin',
  TEACHER: 'Teacher',
};
