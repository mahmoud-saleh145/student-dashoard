/**
 * A stand-in for the NestJS API, used only by the end-to-end tests.
 *
 * It is not a mock of the dashboard's own code — the dashboard runs exactly as
 * it does in production, cookies, proxy and all. This only replaces the
 * *upstream*, so the suite can assert on behaviour that is hard to reproduce
 * against a live backend: a student trying to sign in to a staff dashboard, an
 * access token expiring mid-session, a role receiving a 403.
 *
 * It implements the endpoints those journeys touch and nothing else. Anything
 * unimplemented answers 404 in the backend's own error shape, so a test that
 * accidentally depends on an unstubbed route fails loudly rather than silently
 * passing on an empty response.
 */

import { createServer } from 'node:http';

const PORT = Number(process.env.STUB_API_PORT ?? 4599);

// --- fixtures ---------------------------------------------------------------

const USERS = {
  '01000000001': {
    id: 'user-master',
    fullName: 'Master Owner',
    phone: '01000000001',
    role: 'MASTER',
    status: 'ACTIVE',
    password: 'master-pass',
  },
  '01000000002': {
    id: 'user-admin',
    fullName: 'Amira Admin',
    phone: '01000000002',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: 'admin-pass',
  },
  '01000000003': {
    id: 'user-teacher',
    fullName: 'Tarek Teacher',
    phone: '01000000003',
    role: 'TEACHER',
    status: 'ACTIVE',
    password: 'teacher-pass',
  },
  '01000000004': {
    id: 'user-student',
    fullName: 'Sara Student',
    phone: '01000000004',
    role: 'STUDENT',
    status: 'ACTIVE',
    password: 'student-pass',
  },
  '01000000005': {
    id: 'user-disabled',
    fullName: 'Dalia Disabled',
    phone: '01000000005',
    role: 'ADMIN',
    status: 'SUSPENDED',
    password: 'disabled-pass',
  },
};

/** Tokens are `stub.<userId>` — readable, and impossible to confuse with real ones. */
const tokenFor = (userId) => `stub.${userId}`;
const userIdFromToken = (token) => (token?.startsWith('stub.') ? token.slice(5) : null);

const byId = (id) => Object.values(USERS).find((user) => user.id === id) ?? null;

/**
 * Test control state.
 *
 * The suite pokes these through `/__test__/*` to force conditions the real API
 * would take days to produce naturally.
 */
/**
 * What the last write carried.
 *
 * Recorded so a test can assert on the *request* rather than on a rendered
 * string — "the dashboard sent coursePartId" is the claim that matters, and
 * reading it back off the screen would not prove it.
 */
const lastRequest = { generateCodes: null, libraryPart: null };

const control = {
  /** Makes the storage PUT fail, for the upload-failure path. */
  failUpload: false,
  /** When true, the next request with a valid token answers 401 once. */
  expireAccessTokenOnce: false,
  /** Endpoints that should answer 403 regardless of the caller. */
  forbid: new Set(),
  /** Every path the dashboard has asked for, in order. */
  requests: [],
};

const CODES = [
  {
    id: 'code-1',
    serial: 1,
    code: 'ABCD-EFGH-JKMN',
    status: 'ACTIVE',
    targetType: 'COURSE',
    targetName: 'Anatomy 101',
    course: { id: 'course-1', title: 'Anatomy 101' },
    section: null,
    teacher: null,
    batchId: 'batch-1',
    batchName: 'Term 1 cards',
    amount: 250,
    currency: 'EGP',
    maxRedemptions: 1,
    redemptionCount: 0,
    reservedForUserId: null,
    expiresAt: null,
    issuedBy: { id: 'user-admin', fullName: 'Amira Admin' },
    note: null,
    createdAt: '2026-01-05T10:00:00.000Z',
  },
];

const COURSES = [
  {
    id: 'course-1',
    title: 'Anatomy 101',
    slug: 'anatomy-101',
    status: 'PUBLISHED',
    isFree: false,
    price: { amount: 250, currency: 'EGP' },
    thumbnailKey: null,
    teachers: [{ id: 'user-teacher', fullName: 'Tarek Teacher', isLead: true }],
    counts: { enrollments: 12, sections: 3, lessons: 24 },
    studentCount: 12,
    university: { id: 'uni-1', name: 'Cairo University', nameAr: 'جامعة القاهرة' },
    faculty: { id: 'fac-1', name: 'Medicine', nameAr: 'الطب' },
    academicYear: { id: 'year-1', name: 'First year', nameAr: 'الفرقة الأولى', order: 1 },
    subject: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

const DASHBOARD_STATS = {
  period: { from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' },
  users: { students: 128, blockedStudents: 3, activeStudents: 125, teachers: 7, admins: 2 },
  courses: {
    total: 9,
    published: 5,
    draft: 2,
    hidden: 1,
    suspended: 0,
    archived: 1,
    byStatus: { PUBLISHED: 5, DRAFT: 2, HIDDEN: 1, ARCHIVED: 1 },
  },
  codes: {
    total: 400,
    active: 250,
    used: 120,
    expired: 20,
    cancelled: 10,
    byStatus: { ACTIVE: 250, EXHAUSTED: 120, EXPIRED: 20, REVOKED: 10 },
  },
  purchases: {
    paidPayments: 120,
    transactionsAllTime: 120,
    transactionsInPeriod: 30,
    enrollmentsInPeriod: 45,
    activeEnrollments: 300,
  },
  revenue: {
    currency: 'EGP',
    grossAllTime: 30000,
    refundedAllTime: 500,
    netAllTime: 29500,
    grossInPeriod: 7500,
    platformInPeriod: 5000,
    teachersInPeriod: 2500,
  },
  queues: { supportOpen: 4, pendingDeviceRequests: 1 },
};

const SETTINGS = {
  'student.deviceLimit': 1,
  'student.allowAcademicYearChange': false,
  'teacher.canDeleteLectures': false,
  'teacher.canDeleteVideos': false,
  'teacher.canEditVideoUrls': false,
  'teacher.canEditCoursePrices': false,
  'contact.phone': '',
  'contact.whatsapp': '',
  'contact.facebook': '',
  'contact.email': '',
};

// --- helpers ----------------------------------------------------------------

// --- Phase 1-4 fixtures: wallet, parts, library, announcements --------------
//
// The recharge figures are deliberately three *different* numbers. A stub that
// used one value for face value, paid and credit would let a bug that confuses
// them pass every test.

const WALLETS = [
  {
    id: 'wal-1',
    student: { id: 'user-student', fullName: 'Sara Student', phone: '01000000004' },
    balance: 150,
    currency: 'EGP',
    totalRecharged: 400,
    totalSpent: 250,
    transactionCount: 4,
    updatedAt: '2026-09-18T10:00:00.000Z',
  },
];

const WALLET_TX = [
  {
    id: 'wtx-1',
    type: 'CREDIT_RECHARGE',
    direction: 'CREDIT',
    source: 'PAYMENT_CODE',
    amount: 200,
    currency: 'EGP',
    balanceBefore: 0,
    balanceAfter: 200,
    referenceType: 'ACCESS_CODE',
    referenceId: 'code-1',
    note: null,
    createdAt: '2026-09-17T09:00:00.000Z',
    student: { id: 'user-student', fullName: 'Sara Student', phone: '01000000004' },
    performedBy: null,
  },
  {
    id: 'wtx-2',
    type: 'PURCHASE',
    direction: 'DEBIT',
    source: 'LIBRARY_PART',
    amount: 50,
    currency: 'EGP',
    balanceBefore: 200,
    balanceAfter: 150,
    referenceType: 'LIBRARY_PURCHASE',
    referenceId: 'lp-1',
    note: null,
    createdAt: '2026-09-18T09:00:00.000Z',
    student: { id: 'user-student', fullName: 'Sara Student', phone: '01000000004' },
    performedBy: null,
  },
];

const RECHARGE_CODES = [
  {
    id: 'rc-1',
    code: 'RCHG-AAAA-1111',
    status: 'ACTIVE',
    faceValue: 200,
    discountType: 'PERCENTAGE',
    discountPercent: 10,
    discountAmount: 20,
    actualPaidAmount: 180,
    creditAmount: 200,
    currency: 'EGP',
    batch: { id: 'rb-1', name: 'Kiosk batch' },
    issuedBy: { id: 'user-admin', fullName: 'Amira Admin' },
    redeemedAt: null,
    redeemedBy: null,
    revenueRecognizedAt: null,
    expiresAt: null,
    note: null,
    createdAt: '2026-09-15T08:00:00.000Z',
  },
  {
    id: 'rc-2',
    code: 'RCHG-BBBB-2222',
    status: 'EXHAUSTED',
    faceValue: 100,
    discountType: 'NONE',
    discountPercent: null,
    discountAmount: 0,
    actualPaidAmount: 100,
    creditAmount: 100,
    currency: 'EGP',
    batch: { id: 'rb-1', name: 'Kiosk batch' },
    issuedBy: { id: 'user-admin', fullName: 'Amira Admin' },
    redeemedAt: '2026-09-17T09:00:00.000Z',
    redeemedBy: { id: 'user-student', fullName: 'Sara Student', phone: '01000000004' },
    revenueRecognizedAt: '2026-09-17T09:00:00.000Z',
    expiresAt: null,
    note: null,
    createdAt: '2026-09-15T08:00:00.000Z',
  },
];

const RECHARGE_REVENUE = {
  items: [
    {
      id: 'rev-1',
      code: 'RCHG-BBBB-2222',
      batchId: 'rb-1',
      batchName: 'Kiosk batch',
      student: { id: 'user-student', fullName: 'Sara Student', phone: '01000000004' },
      faceValue: 100,
      discountType: 'NONE',
      discountPercent: null,
      discountAmount: 0,
      actualPaidAmount: 100,
      creditAmount: 100,
      currency: 'EGP',
      recognizedAt: '2026-09-17T09:00:00.000Z',
    },
  ],
  totals: {
    faceValue: 300,
    discountGiven: 20,
    revenue: 280,
    creditsIssued: 300,
    count: 2,
  },
};

const COURSE_PARTS = {
  courseId: 'course-1',
  coursePrice: 500,
  allocationError: null,
  parts: [
    {
      id: 'part-1',
      title: 'Part 1 - Before mid',
      titleAr: null,
      description: null,
      sortOrder: 1,
      status: 'PUBLISHED',
      isActive: true,
      pricingModel: 'PERCENTAGE',
      pricePercent: 60,
      priceAmount: null,
      effectivePrice: 300,
      currency: 'EGP',
      sections: [{ id: 'sec-1', title: 'Week 1', sortOrder: 1, status: 'PUBLISHED' }],
      sectionCount: 1,
      entitlementCount: 3,
      purchaseCount: 3,
      createdAt: '2026-09-10T08:00:00.000Z',
    },
    {
      id: 'part-2',
      title: 'Part 2 - After mid',
      titleAr: null,
      description: null,
      sortOrder: 2,
      status: 'PUBLISHED',
      isActive: true,
      pricingModel: 'PERCENTAGE',
      pricePercent: 40,
      priceAmount: null,
      effectivePrice: 200,
      currency: 'EGP',
      sections: [],
      sectionCount: 0,
      entitlementCount: 0,
      purchaseCount: 0,
      createdAt: '2026-09-10T08:00:00.000Z',
    },
  ],
};

const PART_PURCHASES = {
  items: [
    {
      id: 'pp-1',
      student: { id: 'user-student', fullName: 'Sara Student', phone: '01000000004' },
      courseId: 'course-1',
      courseTitle: 'Circuit Analysis II',
      partId: 'part-1',
      partTitle: 'Part 1 - Before mid',
      priceAtPurchase: 300,
      pricingModel: 'PERCENTAGE',
      pricePercent: 60,
      coursePriceAtPurchase: 500,
      teacher: { id: 'user-teacher', fullName: 'Tarek Teacher' },
      teacherAmount: 180,
      platformAmount: 120,
      currency: 'EGP',
      sectionsUnlocked: 1,
      purchasedAt: '2026-09-16T12:00:00.000Z',
    },
  ],
  totals: { valueAtAcquisition: 300, teacherShare: 180, platformShare: 120, count: 1 },
};

const LIBRARY_MATERIALS = [
  {
    id: 'mat-1',
    title: 'Physics Revision Papers',
    titleAr: null,
    status: 'PUBLISHED',
    isActive: true,
    sortOrder: 1,
    subject: { id: 'subj-1', name: 'Physics' },
    partCount: 2,
    packageCount: 1,
    createdBy: { id: 'user-admin', fullName: 'Amira Admin' },
    createdAt: '2026-09-12T08:00:00.000Z',
  },
];

const LIBRARY_MATERIAL_DETAIL = {
  id: 'mat-1',
  title: 'Physics Revision Papers',
  titleAr: null,
  description: 'Past papers with solutions.',
  status: 'PUBLISHED',
  isActive: true,
  sortOrder: 1,
  universityId: null,
  facultyId: null,
  academicYearId: null,
  subjectId: 'subj-1',
  coverUrl: null,
  parts: [
    {
      id: 'lpart-1',
      title: 'Paper 1',
      titleAr: null,
      description: null,
      sortOrder: 1,
      status: 'PUBLISHED',
      isActive: true,
      price: 50,
      currency: 'EGP',
      mimeType: 'application/pdf',
      sizeBytes: 1048576,
      pageCount: 20,
      isPreview: false,
      hasDocument: true,
      entitlementCount: 2,
      createdAt: '2026-09-12T08:00:00.000Z',
    },
    {
      id: 'lpart-2',
      title: 'Sample pages',
      titleAr: null,
      description: null,
      sortOrder: 2,
      status: 'PUBLISHED',
      isActive: true,
      price: 0,
      currency: 'EGP',
      mimeType: 'application/pdf',
      sizeBytes: null,
      pageCount: 3,
      isPreview: true,
      hasDocument: true,
      entitlementCount: 0,
      createdAt: '2026-09-12T08:00:00.000Z',
    },
  ],
  packages: [
    {
      id: 'pkg-1',
      title: 'Full bundle',
      titleAr: null,
      description: null,
      status: 'PUBLISHED',
      isActive: true,
      sortOrder: 1,
      price: 40,
      currency: 'EGP',
      partIds: ['lpart-1', 'lpart-2'],
      purchaseCount: 1,
    },
  ],
};

const LIBRARY_PURCHASES = {
  items: [
    {
      id: 'libp-1',
      student: { id: 'user-student', fullName: 'Sara Student', phone: '01000000004' },
      kind: 'PART',
      title: 'Paper 1',
      materialTitle: 'Physics Revision Papers',
      pricePaid: 50,
      currency: 'EGP',
      partCount: 1,
      purchasedAt: '2026-09-18T09:00:00.000Z',
    },
  ],
  totals: { creditsSpent: 50, count: 1 },
};

const ANNOUNCEMENTS = [
  {
    id: 'ann-1',
    title: 'Revision week starts Sunday',
    titleAr: null,
    body: 'Sessions run every evening.',
    bodyAr: null,
    route: null,
    courseId: null,
    universityId: null,
    academicYearId: null,
    audienceRule: { academicYearIds: ['y2'] },
    status: 'SCHEDULED',
    sendAtLocal: '19:00',
    timezone: 'Africa/Cairo',
    frequency: 'WEEKLY',
    weekdays: [7],
    dayOfMonth: null,
    startsOn: null,
    endsOn: null,
    maxOccurrences: null,
    occurrenceCount: 2,
    nextOccurrenceAt: '2026-09-20T16:00:00.000Z',
    lastOccurrenceAt: '2026-09-13T16:00:00.000Z',
    sendPush: true,
    publishedAt: '2026-09-13T16:00:00.000Z',
    createdById: 'user-admin',
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-13T16:00:00.000Z',
    _count: { notifications: 240, dispatches: 2 },
  },
  {
    id: 'ann-2',
    title: 'Fees deadline',
    titleAr: null,
    body: 'Settle before the end of the month.',
    bodyAr: null,
    route: null,
    courseId: null,
    universityId: null,
    academicYearId: null,
    audienceRule: {},
    status: 'SENT',
    sendAtLocal: null,
    timezone: 'Africa/Cairo',
    frequency: 'ONCE',
    weekdays: [],
    dayOfMonth: null,
    startsOn: null,
    endsOn: null,
    maxOccurrences: null,
    occurrenceCount: 1,
    nextOccurrenceAt: null,
    lastOccurrenceAt: '2026-09-01T10:00:00.000Z',
    sendPush: true,
    publishedAt: '2026-09-01T10:00:00.000Z',
    createdById: 'user-admin',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    _count: { notifications: 1200, dispatches: 1 },
  },
];

const ANNOUNCEMENT_DISPATCHES = [
  {
    id: 'disp-2',
    announcementId: 'ann-1',
    occurrenceAt: '2026-09-13T16:00:00.000Z',
    recipientCount: 120,
    createdCount: 120,
    startedAt: '2026-09-13T16:00:01.000Z',
    finishedAt: '2026-09-13T16:00:04.000Z',
    error: null,
  },
  {
    id: 'disp-1',
    announcementId: 'ann-1',
    occurrenceAt: '2026-09-06T16:00:00.000Z',
    recipientCount: 120,
    createdCount: 0,
    startedAt: '2026-09-06T16:00:01.000Z',
    finishedAt: '2026-09-06T16:00:02.000Z',
    error: 'queue unavailable',
  },
];

/**
 * A deterministic stand-in for the backend's audience compiler.
 *
 * It reproduces the two properties the dashboard tests care about, and nothing
 * else: adding values *within* a dimension widens the audience (OR), adding a
 * second dimension narrows it (AND). Exclusions come off last.
 */
function previewAudience(rule = {}) {
  const dimensions = [
    'universityIds',
    'facultyIds',
    'departmentIds',
    'academicYearIds',
    'courseIds',
    'subjectIds',
  ].filter((key) => Array.isArray(rule[key]) && rule[key].length > 0);

  if (dimensions.length === 0 && !rule.enrollmentStates) {
    return {
      total: 1000,
      sample: [{ id: 'user-student', fullName: 'Sara Student', phone: '01000000004' }],
      targetsEveryone: true,
      limit: 50000,
      exceedsLimit: false,
    };
  }

  // OR within the first dimension, then halved for every further AND.
  let total = 100 * rule[dimensions[0]].length;
  for (let i = 1; i < dimensions.length; i += 1) total = Math.floor(total / 2);
  total = Math.max(0, total - (rule.excludeUserIds?.length ?? 0));

  return {
    total,
    sample: [{ id: 'user-student', fullName: 'Sara Student', phone: '01000000004' }],
    targetsEveryone: false,
    limit: 50000,
    exceedsLimit: total > 50000,
  };
}

/** The `meta` block, for the endpoints that carry `totals` beside it. */
function metaFor(items) {
  return {
    page: 1,
    pageSize: 20,
    total: items.length,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  };
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function ok(res, data, meta) {
  send(res, 200, { success: true, data, ...(meta ? { meta } : {}) });
}

function page(res, items) {
  ok(res, {
    items,
    meta: {
      page: 1,
      pageSize: 20,
      total: items.length,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    },
  });
}

function fail(res, status, code, message) {
  send(res, status, {
    success: false,
    error: { code, message },
    statusCode: status,
    code,
    message,
    timestamp: new Date().toISOString(),
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

/** Normalises an Egyptian mobile the way the real backend does. */
function normalisePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('20')) return `0${digits.slice(2)}`;
  return digits;
}

// --- server -----------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/api\/v1/, '') || '/';
  const method = req.method ?? 'GET';

  control.requests.push(`${method} ${path}`);

  // --- test control -------------------------------------------------------
  if (path.startsWith('/__test__/')) {
    if (path === '/__test__/last-generate-codes') {
      return ok(res, lastRequest.generateCodes ?? {});
    }
    if (path === '/__test__/last-library-part') {
      return ok(res, lastRequest.libraryPart ?? {});
    }
    if (path === '/__test__/fail-upload') {
      control.failUpload = true;
      return ok(res, { armed: true });
    }
    if (path === '/__test__/reset') {
      control.failUpload = false;
      lastRequest.generateCodes = null;
      lastRequest.libraryPart = null;
      control.expireAccessTokenOnce = false;
      control.forbid.clear();
      control.requests.length = 0;
      return ok(res, { reset: true });
    }
    if (path === '/__test__/expire-access-token') {
      control.expireAccessTokenOnce = true;
      return ok(res, { armed: true });
    }
    if (path === '/__test__/forbid') {
      const target = url.searchParams.get('path');
      if (target) control.forbid.add(target);
      return ok(res, { forbidden: [...control.forbid] });
    }
    if (path === '/__test__/requests') {
      return ok(res, { requests: control.requests });
    }
    return fail(res, 404, 'NOT_FOUND', 'Unknown control endpoint.');
  }

  // --- object storage stand-in --------------------------------------------
  //
  // The browser PUTs here directly, cross-origin, exactly as it would to R2 —
  // which means a real CORS preflight. Proxying the bytes through the app
  // instead would test a flow the product does not have.
  if (path.startsWith('/__storage__/')) {
    const cors = {
      'Access-Control-Allow-Origin': req.headers.origin ?? '*',
      'Access-Control-Allow-Methods': 'PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, Content-Type',
      'Access-Control-Max-Age': '600',
    };

    if (method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }

    if (method === 'PUT') {
      // Drain the body so the socket is not left half-read.
      await new Promise((resolve) => {
        req.on('data', () => undefined);
        req.on('end', resolve);
        req.on('error', resolve);
      });

      if (control.failUpload) {
        res.writeHead(500, { ...cors, 'content-type': 'text/plain' });
        return res.end('storage unavailable');
      }

      res.writeHead(200, { ...cors, etag: '"stub-etag"' });
      return res.end();
    }

    res.writeHead(405, cors);
    return res.end();
  }

  // --- login (unauthenticated) --------------------------------------------
  if (path === '/auth/login' && method === 'POST') {
    const body = await readBody(req);
    const user = USERS[normalisePhone(body.phone)];

    if (!user || user.password !== body.password) {
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Incorrect phone number or password.');
    }

    // Notice what this does NOT do: it happily authenticates a student. The
    // dashboard is what refuses them, and that refusal is what the test
    // asserts on.
    return ok(res, {
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        status: user.status,
        avatarUrl: null,
        email: null,
        locale: 'en',
      },
      accessToken: tokenFor(user.id),
      refreshToken: `refresh.${user.id}`,
      expiresIn: 3600,
    });
  }

  if (path === '/auth/refresh' && method === 'POST') {
    const body = await readBody(req);
    const userId = String(body.refreshToken ?? '').replace(/^refresh\./, '');
    if (!byId(userId)) return fail(res, 401, 'SESSION_EXPIRED', 'Refresh token rejected.');

    return ok(res, { accessToken: tokenFor(userId), refreshToken: `refresh.${userId}` });
  }

  if (path === '/auth/logout' && method === 'POST') {
    return ok(res, { ok: true });
  }

  // --- everything else is authenticated ------------------------------------
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const user = byId(userIdFromToken(token));

  if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Missing or invalid token.');

  if (control.expireAccessTokenOnce) {
    control.expireAccessTokenOnce = false;
    return fail(res, 401, 'SESSION_EXPIRED', 'Access token expired.');
  }

  if (control.forbid.has(path)) {
    return fail(res, 403, 'INSUFFICIENT_ROLE', 'Your role does not allow this action.');
  }

  const isAdmin = user.role === 'ADMIN' || user.role === 'MASTER';

  // Role gates, mirroring the real backend's decorators. These are what make
  // the authorization tests meaningful: the dashboard hiding a link proves
  // nothing unless the API refuses the call underneath it.
  const adminOnly = [
    '/analytics/dashboard',
    '/admin/settings',
    '/admin/support/counters',
    '/audit',
    '/audit/logins',
    // Wallet, library and announcements are @AdminOnly() on the real backend.
    // A teacher hitting any of these must receive 403, which is what makes the
    // teacher-isolation test meaningful rather than a check on menu rendering.
    '/admin/wallets',
    '/admin/wallet-transactions',
    '/admin/recharge-codes',
    '/admin/recharge-revenue',
    '/admin/library',
    '/admin/announcements',
    '/admin/part-purchases',
    // @AdminOnly() on the real controller. /storage/uploads/attachment stays
    // @StaffOnly(), so only this one path is listed rather than all of
    // /storage.
    '/storage/uploads/library-document',
    // Every admin code route is @AdminOnly(), including generation. Adding
    // the PART target changed none of that.
    '/admin/codes',
    '/admin/code-batches',
  ];

  if (adminOnly.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) && !isAdmin) {
    return fail(res, 403, 'INSUFFICIENT_ROLE', 'Your role does not allow this action.');
  }

  if (path === '/auth/me') {
    return ok(res, {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      status: user.status,
      avatarUrl: null,
      email: null,
      locale: 'en',
    });
  }

  if (path === '/analytics/dashboard') return ok(res, DASHBOARD_STATS);
  if (path === '/analytics/revenue') return ok(res, { points: [] });

  if (path === '/admin/courses') {
    // A teacher only ever sees their own — the same scoping the real service
    // applies, so the teacher-isolation test exercises a real refusal.
    const rows =
      user.role === 'TEACHER'
        ? COURSES.filter((course) => course.teachers.some((t) => t.id === user.id))
        : COURSES;
    return page(res, rows);
  }


  // --- storage presign ----------------------------------------------------
  if (path === '/storage/uploads/library-document' && method === 'POST') {
    const body = await readBody(req);
    const ext = (body.filename ?? '').includes('.')
      ? `.${String(body.filename).split('.').pop().toLowerCase()}`
      : '.bin';

    return ok(res, {
      // A write-only, short-lived URL. The key is chosen by the server; the
      // client never names one.
      uploadUrl: `http://127.0.0.1:${PORT}/__storage__/library/stub-${Date.now()}${ext}`,
      objectKey: `library/stub-object${ext}`,
      expiresIn: 3600,
      requiredHeaders: { 'Content-Type': body.contentType },
    });
  }

  if (path === '/admin/codes/generate' && method === 'POST') {
    const body = await readBody(req);
    lastRequest.generateCodes = body;

    return ok(res, {
      batchId: 'batch-new',
      batchName: body.batchName ?? null,
      targetType: body.targetType ?? 'COURSE',
      targetName:
        body.targetType === 'PART' ? 'Part 1 - Before mid' : 'Anatomy 101',
      requested: body.count ?? 0,
      created: body.count ?? 0,
      codes: Array.from({ length: Math.min(body.count ?? 0, 5) }, (_, i) =>
        `CARD-${String(i + 1).padStart(4, '0')}`,
      ),
    });
  }

  // --- wallet (admin only) ------------------------------------------------
  if (path === '/admin/wallets' && method === 'GET') return page(res, WALLETS);
  if (path === '/admin/wallet-transactions') return page(res, WALLET_TX);

  if (path === '/admin/recharge-codes') return page(res, RECHARGE_CODES);
  if (path === '/admin/recharge-revenue') {
    return send(res, 200, {
      success: true,
      data: { items: RECHARGE_REVENUE.items, meta: metaFor(RECHARGE_REVENUE.items), totals: RECHARGE_REVENUE.totals },
    });
  }

  if (path === '/admin/recharge-codes/preview' && method === 'POST') {
    const body = await readBody(req);
    const faceValue = Number(body.faceValue ?? 0);
    const discountAmount =
      body.discountType === 'PERCENTAGE'
        ? Math.round(faceValue * (Number(body.discountPercent ?? 0) / 100) * 100) / 100
        : body.discountType === 'FIXED'
          ? Number(body.discountAmount ?? 0)
          : 0;
    const actualPaidAmount = Math.max(0, faceValue - discountAmount);
    const count = Number(body.count ?? 1);

    return ok(res, {
      faceValue,
      discountType: body.discountType ?? 'NONE',
      discountPercent: body.discountPercent ?? null,
      discountAmount,
      actualPaidAmount,
      // Credit is the FACE value, not what was paid. A stub that returned
      // actualPaidAmount here would hide exactly the bug this screen exists
      // to make visible.
      creditAmount: faceValue,
      count,
      expectedRevenue: actualPaidAmount * count,
      expectedCredits: faceValue * count,
      minimumRecharge: 10,
      maximumRecharge: 100000,
      belowMinimum: faceValue > 0 && faceValue < 10,
      overrideAllowed: true,
    });
  }

  if (path === '/admin/recharge-codes/generate' && method === 'POST') {
    const body = await readBody(req);
    const faceValue = Number(body.faceValue ?? 0);
    const count = Number(body.count ?? 1);
    const discountAmount =
      body.discountType === 'PERCENTAGE'
        ? Math.round(faceValue * (Number(body.discountPercent ?? 0) / 100) * 100) / 100
        : Number(body.discountAmount ?? 0);
    const actualPaidAmount = Math.max(0, faceValue - discountAmount);

    return ok(res, {
      batchId: 'rb-new',
      batchName: body.batchName ?? null,
      requested: count,
      created: count,
      faceValue,
      discountType: body.discountType ?? 'NONE',
      discountPercent: body.discountPercent ?? null,
      discountAmount,
      actualPaidAmount,
      creditAmount: faceValue,
      expectedRevenue: actualPaidAmount * count,
      expectedCredits: faceValue * count,
      codes: Array.from({ length: count }, (_, i) => `RCHG-NEW-${String(i + 1).padStart(4, '0')}`),
    });
  }

  const walletDetail = /^\/admin\/wallets\/([^/]+)$/.exec(path);
  if (walletDetail && method === 'GET') {
    return ok(res, {
      userId: walletDetail[1],
      wallet: {
        balance: 150,
        currency: 'EGP',
        totalRecharged: 400,
        totalSpent: 250,
        transactionCount: WALLET_TX.length,
        updatedAt: '2026-09-18T10:00:00.000Z',
      },
      recent: { items: WALLET_TX, meta: metaFor(WALLET_TX) },
    });
  }

  const walletIntegrity = /^\/admin\/wallets\/([^/]+)\/integrity$/.exec(path);
  if (walletIntegrity) {
    return ok(res, {
      walletId: 'wal-1',
      userId: walletIntegrity[1],
      ledgerBalance: 150,
      cachedBalance: 150,
      difference: 0,
      totalCredited: 400,
      totalDebited: 250,
      consistent: true,
    });
  }

  if (/^\/admin\/wallets\/[^/]+\/adjust$/.test(path) && method === 'POST') {
    return ok(res, { ok: true });
  }

  // --- one course, so the course detail page (and its Parts tab) renders ---
  // Anchored with `$`, so these never shadow /admin/courses/:id/parts.
  const courseDetail = /^\/admin\/courses\/([^/]+)$/.exec(path);
  if (courseDetail && method === 'GET') {
    return ok(res, COURSES.find((c) => c.id === courseDetail[1]) ?? COURSES[0]);
  }

  if (/^\/admin\/courses\/[^/]+\/sections$/.test(path)) {
    return ok(res, [
      { id: 'sec-1', title: 'Week 1', sortOrder: 1, status: 'PUBLISHED', lessonCount: 4 },
      { id: 'sec-2', title: 'Week 2', sortOrder: 2, status: 'PUBLISHED', lessonCount: 3 },
    ]);
  }

  // --- course parts (staff, scoped per course by the real backend) --------
  if (/^\/admin\/courses\/[^/]+\/parts(\/default)?$/.test(path)) return ok(res, COURSE_PARTS);
  if (/^\/admin\/courses\/[^/]+\/parts\/order$/.test(path)) return ok(res, COURSE_PARTS);
  if (/^\/admin\/course-parts\/[^/]+(\/sections)?$/.test(path)) return ok(res, COURSE_PARTS);

  if (path === '/admin/part-purchases') {
    return send(res, 200, {
      success: true,
      data: { items: PART_PURCHASES.items, meta: metaFor(PART_PURCHASES.items), totals: PART_PURCHASES.totals },
    });
  }

  // --- library (admin only) -----------------------------------------------
  if (path === '/admin/library/materials' && method === 'GET') {
    return page(res, LIBRARY_MATERIALS);
  }
  if (path === '/admin/library/materials' && method === 'POST') {
    return ok(res, LIBRARY_MATERIAL_DETAIL);
  }
  if (path === '/admin/library/purchases') {
    return send(res, 200, {
      success: true,
      data: { items: LIBRARY_PURCHASES.items, meta: metaFor(LIBRARY_PURCHASES.items), totals: LIBRARY_PURCHASES.totals },
    });
  }
  if (/^\/admin\/library\/materials\/[^/]+\/parts$/.test(path) && method === 'POST') {
    lastRequest.libraryPart = await readBody(req);
    return ok(res, LIBRARY_MATERIAL_DETAIL);
  }

  if (/^\/admin\/library\/materials\/[^/]+(\/parts)?$/.test(path)) {
    return ok(res, LIBRARY_MATERIAL_DETAIL);
  }
  if (/^\/admin\/library\/(parts|packages)(\/[^/]+)?$/.test(path)) {
    return ok(res, LIBRARY_MATERIAL_DETAIL);
  }

  // --- announcements (admin only) -----------------------------------------
  // `preview` is matched before `:id`, exactly as the real controller orders
  // its routes.
  if (path === '/admin/announcements/preview' && method === 'POST') {
    const body = await readBody(req);
    return ok(res, previewAudience(body.audience ?? {}));
  }

  if (path === '/admin/announcements' && method === 'GET') {
    const status = url.searchParams.get('status');
    return page(res, status ? ANNOUNCEMENTS.filter((a) => a.status === status) : ANNOUNCEMENTS);
  }

  if (path === '/admin/announcements' && method === 'POST') {
    const body = await readBody(req);
    return ok(res, { ...ANNOUNCEMENTS[0], id: 'ann-new', title: body.title ?? 'New' });
  }

  const sendNow = /^\/admin\/announcements\/([^/]+)\/send-now$/.exec(path);
  if (sendNow && method === 'POST') {
    return ok(res, {
      announcementId: sendNow[1],
      occurrenceAt: '2026-09-20T16:00:00.000Z',
      recipients: 120,
      created: 120,
    });
  }

  const announcement = /^\/admin\/announcements\/([^/]+)$/.exec(path);
  if (announcement) {
    const row = ANNOUNCEMENTS.find((a) => a.id === announcement[1]) ?? ANNOUNCEMENTS[0];

    if (method === 'PATCH') {
      // Mirrors the real refusal: once it has sent, the text is what people
      // received and editing it would make the record disagree with them.
      if (row.occurrenceCount > 0) {
        return fail(
          res,
          409,
          'ANNOUNCEMENT_NOT_EDITABLE',
          `Already sent ${row.occurrenceCount} time(s). Cancel it and create a new one.`,
        );
      }
      return ok(res, row);
    }

    if (method === 'DELETE') return ok(res, { ...row, status: 'CANCELLED', nextOccurrenceAt: null });

    return ok(res, {
      ...row,
      dispatches: ANNOUNCEMENT_DISPATCHES.filter((d) => d.announcementId === row.id),
      _count: { notifications: row._count.notifications },
    });
  }

  if (path === '/admin/codes') return page(res, CODES);
  if (path === '/admin/code-batches') return page(res, []);
  if (path === '/admin/users') return page(res, []);
  if (path === '/admin/users/teachers') return page(res, []);
  if (path === '/admin/enrollments') return page(res, []);
  if (path === '/admin/support/tickets') return page(res, []);
  if (path === '/admin/support/counters') {
    return ok(res, { open: 4, pending: 2, resolved: 10, closed: 5, unread: 3, total: 21 });
  }
  if (path === '/audit') return page(res, []);
  if (path === '/audit/logins') return page(res, []);
  if (path === '/catalog/universities') return ok(res, []);
  if (path === '/catalog/academic-years') return ok(res, []);
  if (path === '/catalog/tree') return ok(res, { universities: [] });
  if (path === '/subjects') return ok(res, []);

  if (path === '/admin/settings') {
    if (method === 'PUT') return ok(res, { keys: Object.keys(SETTINGS), settings: SETTINGS });
    return ok(res, { keys: Object.keys(SETTINGS), settings: SETTINGS });
  }

  if (path === '/meta/app-config') {
    return ok(res, {
      environment: 'test',
      features: {},
      teacher: {
        canDeleteLectures: false,
        canDeleteVideos: false,
        canEditVideoUrls: false,
        canEditCoursePrices: false,
      },
    });
  }

  return fail(res, 404, 'NOT_FOUND', `Stub API has no route for ${method} ${path}`);
});

server.listen(PORT, () => {
  process.stdout.write(`stub api listening on ${PORT}\n`);
});
