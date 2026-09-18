/**
 * Query keys.
 *
 * Centralised so invalidation is precise: after creating a course, the code
 * that invalidates `courses.all` is looking at the same key the list used, not
 * a hand-typed string that drifted. Every key is an array whose first element
 * names the domain, so a whole domain can be invalidated at once.
 */
export const queryKeys = {
  session: ['session'] as const,

  stats: {
    dashboard: (params: unknown) => ['stats', 'dashboard', params] as const,
    revenue: (params: unknown) => ['stats', 'revenue', params] as const,
  },

  catalog: {
    tree: ['catalog', 'tree'] as const,
    universities: ['catalog', 'universities'] as const,
    faculties: (universityId: string) => ['catalog', 'faculties', universityId] as const,
    departments: (facultyId: string) => ['catalog', 'departments', facultyId] as const,
    academicYears: ['catalog', 'academic-years'] as const,
  },

  subjects: {
    all: ['subjects'] as const,
    list: (params: unknown) => ['subjects', 'list', params] as const,
    detail: (id: string) => ['subjects', 'detail', id] as const,
  },

  courses: {
    all: ['courses'] as const,
    list: (params: unknown) => ['courses', 'list', params] as const,
    detail: (id: string) => ['courses', 'detail', id] as const,
    sections: (id: string) => ['courses', 'sections', id] as const,
    students: (id: string, params: unknown) => ['courses', 'students', id, params] as const,
    priceHistory: (id: string) => ['courses', 'price-history', id] as const,
    analytics: (id: string, params: unknown) => ['courses', 'analytics', id, params] as const,
  },

  lessons: {
    all: ['lessons'] as const,
    viewers: (lessonId: string, params: unknown) =>
      ['lessons', 'viewers', lessonId, params] as const,
  },

  students: {
    all: ['students'] as const,
    list: (params: unknown) => ['students', 'list', params] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
    devices: (id: string) => ['students', 'devices', id] as const,
    enrollments: (id: string, params: unknown) =>
      ['students', 'enrollments', id, params] as const,
    payments: (id: string, params: unknown) => ['students', 'payments', id, params] as const,
    history: (id: string) => ['students', 'history', id] as const,
    sessions: (id: string) => ['students', 'sessions', id] as const,
  },

  teachers: {
    all: ['teachers'] as const,
    list: (params: unknown) => ['teachers', 'list', params] as const,
    detail: (id: string) => ['teachers', 'detail', id] as const,
    earnings: (id: string, params: unknown) => ['teachers', 'earnings', id, params] as const,
  },

  codes: {
    all: ['codes'] as const,
    list: (params: unknown) => ['codes', 'list', params] as const,
    redemptions: (id: string, params: unknown) =>
      ['codes', 'redemptions', id, params] as const,
    batches: (params: unknown) => ['codes', 'batches', params] as const,
    batchCodes: (id: string) => ['codes', 'batch-codes', id] as const,
  },

  /**
   * Wallet and recharge cards.
   *
   * One domain root because a recharge redemption changes a balance, a ledger
   * and the revenue report at once — invalidating `wallet.all` after a
   * generation or an adjustment refreshes every view that could have moved.
   */
  wallet: {
    all: ['wallet'] as const,
    wallets: (params: unknown) => ['wallet', 'wallets', params] as const,
    detail: (userId: string) => ['wallet', 'detail', userId] as const,
    integrity: (userId: string) => ['wallet', 'integrity', userId] as const,
    transactions: (params: unknown) => ['wallet', 'transactions', params] as const,
    rechargeCodes: (params: unknown) => ['wallet', 'recharge-codes', params] as const,
    rechargeRevenue: (params: unknown) => ['wallet', 'recharge-revenue', params] as const,
  },

  courseParts: {
    all: ['course-parts'] as const,
    forCourse: (courseId: string) => ['course-parts', 'course', courseId] as const,
    purchases: (params: unknown) => ['course-parts', 'purchases', params] as const,
  },

  library: {
    all: ['library'] as const,
    materials: (params: unknown) => ['library', 'materials', params] as const,
    material: (id: string) => ['library', 'material', id] as const,
    purchases: (params: unknown) => ['library', 'purchases', params] as const,
  },

  announcements: {
    all: ['announcements'] as const,
    list: (params: unknown) => ['announcements', 'list', params] as const,
    detail: (id: string) => ['announcements', 'detail', id] as const,
    /** Keyed by the rule itself, so an unchanged rule is not re-counted. */
    preview: (rule: unknown) => ['announcements', 'preview', rule] as const,
  },

  support: {
    all: ['support'] as const,
    counters: ['support', 'counters'] as const,
    list: (params: unknown) => ['support', 'list', params] as const,
    detail: (id: string) => ['support', 'detail', id] as const,
  },

  logs: {
    audit: (params: unknown) => ['logs', 'audit', params] as const,
    logins: (params: unknown) => ['logs', 'logins', params] as const,
    security: (params: unknown) => ['logs', 'security', params] as const,
  },

  admins: {
    all: ['admins'] as const,
    list: (params: unknown) => ['admins', 'list', params] as const,
  },

  settings: {
    all: ['settings'] as const,
  },
} as const;
