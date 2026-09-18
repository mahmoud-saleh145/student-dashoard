import type { Capability } from '@/lib/permissions';

/**
 * The navigation model.
 *
 * Declared as data rather than as JSX so the same list drives the desktop
 * sidebar, the mobile drawer and the breadcrumb trail, and so a role's menu
 * cannot drift between them.
 *
 * `capability` is what decides visibility. That is a UX decision only — the
 * backend refuses the underlying endpoints regardless of what the menu shows.
 */

export interface NavItem {
  href: string;
  label: string;
  capability: Capability;
  icon: NavIcon;
  /** Nav badge fed from a live counter, e.g. open support tickets. */
  badgeKey?: 'support';
  /** Marks the item active for its own path only, not for descendants. */
  exact?: boolean;
}

export interface NavSection {
  id: string;
  label: string | null;
  items: NavItem[];
}

export type NavIcon =
  | 'stats'
  | 'courses'
  | 'students'
  | 'teachers'
  | 'codes'
  | 'batches'
  | 'support'
  | 'notifications'
  | 'announcements'
  | 'wallet'
  | 'library'
  | 'data'
  | 'logs'
  | 'admins'
  | 'settings';

/** Admin and master navigation, in the order the specification lists it. */
export const ADMIN_NAV: NavSection[] = [
  {
    id: 'overview',
    label: null,
    items: [
      {
        href: '/',
        label: 'Statistics',
        capability: 'viewStatistics',
        icon: 'stats',
        exact: true,
      },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    items: [
      { href: '/courses', label: 'Courses', capability: 'manageCourses', icon: 'courses' },
      { href: '/other-data', label: 'Other data', capability: 'manageCatalog', icon: 'data' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { href: '/students', label: 'Students', capability: 'manageStudents', icon: 'students' },
      { href: '/teachers', label: 'Teachers', capability: 'manageTeachers', icon: 'teachers' },
    ],
  },
  /**
   * Courses are sold offline — Vodafone Cash or InstaPay, then an admin issues
   * an access card. Course parts are the same system at a finer grain. No
   * wallet is involved anywhere in this section, and the separation from the
   * section below it is the point of having two sections rather than one.
   */
  {
    id: 'commerce',
    label: 'Courses & access codes',
    items: [
      { href: '/codes', label: 'Access codes', capability: 'manageCodes', icon: 'codes' },
      {
        href: '/code-batches',
        label: 'Batch generation',
        capability: 'manageCodes',
        icon: 'batches',
      },
      {
        href: '/part-purchases',
        label: 'Part unlocks',
        capability: 'viewPartPurchases',
        icon: 'courses',
      },
    ],
  },
  /**
   * The other financial system, deliberately kept apart. Money enters as a
   * recharge card, becomes wallet credit, and is spent only here. Nothing in
   * this section can grant course access, and nothing above it can spend
   * credit.
   */
  {
    id: 'library',
    label: 'Library & wallet',
    items: [
      { href: '/library', label: 'Library', capability: 'manageLibrary', icon: 'library' },
      {
        href: '/wallet',
        label: 'Wallet & recharge',
        capability: 'manageWallet',
        icon: 'wallet',
      },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [
      {
        href: '/support',
        label: 'Support centre',
        capability: 'manageSupport',
        icon: 'support',
        badgeKey: 'support',
      },
      {
        href: '/announcements',
        label: 'Announcements',
        capability: 'manageAnnouncements',
        icon: 'announcements',
      },
      {
        href: '/notifications',
        label: 'Notification centre',
        capability: 'sendBroadcastNotifications',
        icon: 'notifications',
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      { href: '/logs', label: 'Logs', capability: 'viewLogs', icon: 'logs' },
      { href: '/admins', label: 'Admin accounts', capability: 'manageAdmins', icon: 'admins' },
      { href: '/settings', label: 'Settings', capability: 'manageSettings', icon: 'settings' },
    ],
  },
];

/**
 * Teacher navigation.
 *
 * A short list on purpose: everything a teacher can reach is scoped to their
 * own courses, and offering menu entries that would 403 is worse than not
 * offering them.
 */
export const TEACHER_NAV: NavSection[] = [
  {
    id: 'overview',
    label: null,
    items: [
      { href: '/', label: 'Home', capability: 'manageCourses', icon: 'stats', exact: true },
    ],
  },
  {
    id: 'teaching',
    label: 'Teaching',
    items: [
      { href: '/courses', label: 'My courses', capability: 'manageCourses', icon: 'courses' },
      {
        href: '/notifications',
        label: 'Notifications',
        capability: 'sendCourseNotifications',
        icon: 'notifications',
      },
    ],
  },
];

/** True when `href` should be highlighted for the current `pathname`. */
export function isActivePath(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
