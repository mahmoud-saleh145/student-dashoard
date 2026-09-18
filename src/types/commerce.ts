import type {
  AccountStatus,
  ContentStatus,
  EnrollmentState,
  NamedRef,
  UserRole,
} from '@/types/domain';
import type { PageMeta } from '@/types/api';

/**
 * The wire contract for the wallet, course-part, library and announcement
 * backends.
 *
 * Transcribed from the services' own return shapes, not from the Prisma models:
 * several endpoints map their rows before sending, so the model's field names
 * and the wire's field names differ (a batch's `targetNameSnapshot` arrives as
 * `targetName`; a library part's `objectKey` never arrives at all). Where the
 * service returns a raw Prisma row — announcements do — that is called out on
 * the type.
 *
 * Every money value on the wire is a JSON **number** in EGP. The backend
 * converts each Decimal through `Number()` or `toEgpNumber()` before sending,
 * so nothing here is a string that needs parsing, and nothing here should be
 * re-derived in the browser: the amounts are computed server-side and this
 * layer only renders them.
 */

// ---------------------------------------------------------------------------
// Enums — mirrored from the backend's Prisma schema
// ---------------------------------------------------------------------------

export const WALLET_TX_TYPES = [
  'CREDIT_RECHARGE',
  'PURCHASE',
  'REFUND',
  'ADMIN_ADJUSTMENT',
  'REVERSAL',
] as const;
export type WalletTxType = (typeof WALLET_TX_TYPES)[number];

export const WALLET_TX_DIRECTIONS = ['CREDIT', 'DEBIT'] as const;
export type WalletTxDirection = (typeof WALLET_TX_DIRECTIONS)[number];

export const WALLET_TX_SOURCES = [
  'PAYMENT_CODE',
  'COURSE_PART',
  'LIBRARY_PART',
  'LIBRARY_PACKAGE',
  'ADMIN',
  'SYSTEM',
] as const;
export type WalletTxSource = (typeof WALLET_TX_SOURCES)[number];

export const DISCOUNT_TYPES = ['NONE', 'PERCENTAGE', 'FIXED'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const PART_PRICING_MODELS = ['PERCENTAGE', 'FIXED'] as const;
export type PartPricingModel = (typeof PART_PRICING_MODELS)[number];

export const LIBRARY_PURCHASE_KINDS = ['PART', 'PACKAGE'] as const;
export type LibraryPurchaseKind = (typeof LIBRARY_PURCHASE_KINDS)[number];

export const ANNOUNCEMENT_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'SENDING',
  'SENT',
  'CANCELLED',
] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_FREQUENCIES = ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type AnnouncementFrequency = (typeof ANNOUNCEMENT_FREQUENCIES)[number];

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const WALLET_TX_TYPE_LABEL: Record<WalletTxType, string> = {
  CREDIT_RECHARGE: 'Recharge',
  PURCHASE: 'Purchase',
  REFUND: 'Refund',
  ADMIN_ADJUSTMENT: 'Manual adjustment',
  REVERSAL: 'Reversal',
};

export const WALLET_TX_SOURCE_LABEL: Record<WalletTxSource, string> = {
  PAYMENT_CODE: 'Recharge card',
  COURSE_PART: 'Course part',
  LIBRARY_PART: 'Library document',
  LIBRARY_PACKAGE: 'Library package',
  ADMIN: 'Administrator',
  SYSTEM: 'System',
};

export const DISCOUNT_TYPE_LABEL: Record<DiscountType, string> = {
  NONE: 'No discount',
  PERCENTAGE: 'Percentage',
  FIXED: 'Fixed amount',
};

export const PART_PRICING_MODEL_LABEL: Record<PartPricingModel, string> = {
  PERCENTAGE: 'Percentage of course price',
  FIXED: 'Fixed amount',
};

export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  SENDING: 'Sending',
  SENT: 'Sent',
  CANCELLED: 'Cancelled',
};

export const ANNOUNCEMENT_FREQUENCY_LABEL: Record<AnnouncementFrequency, string> = {
  ONCE: 'Once',
  DAILY: 'Every day',
  WEEKLY: 'Every week',
  MONTHLY: 'Every month',
};

/** ISO weekdays, as the backend numbers them: 1 = Monday … 7 = Sunday. */
export const ISO_WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 7, label: 'Sunday', short: 'Sun' },
];

// ---------------------------------------------------------------------------
// Shared row fragments
// ---------------------------------------------------------------------------

export interface PersonRef {
  id: string;
  fullName: string;
  phone: string;
}

export interface ActorRef {
  id: string;
  fullName: string;
}

/**
 * A list response that also carries totals.
 *
 * Three endpoints do this — recharge revenue, part purchases, library
 * purchases — and in all three the totals are a sibling of `items` and `meta`
 * rather than nested inside `meta`.
 */
export interface PaginatedWithTotals<TRow, TTotals> {
  items: TRow[];
  meta: PageMeta;
  totals: TTotals;
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export interface WalletSummary {
  balance: number;
  currency: string;
  totalRecharged: number;
  totalSpent: number;
  transactionCount: number;
  updatedAt: string;
}

export interface WalletRow {
  /** The wallet's own id, not the student's. */
  id: string;
  student: PersonRef;
  balance: number;
  currency: string;
  totalRecharged: number;
  totalSpent: number;
  transactionCount: number;
  updatedAt: string;
}

/**
 * One ledger entry.
 *
 * `student`, `performedBy` and `accessCodeId` are **absent keys** rather than
 * nulls on the student-facing route; the admin routes always include them. The
 * dashboard only ever calls the admin routes, but they stay optional so the
 * type cannot lie about what the student route returns.
 */
export interface WalletTxRow {
  id: string;
  type: WalletTxType;
  direction: WalletTxDirection;
  source: WalletTxSource;
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
  student?: PersonRef;
  performedBy?: ActorRef | null;
  accessCodeId?: string | null;
}

export interface WalletDetail {
  userId: string;
  wallet: WalletSummary;
  recent: { items: WalletTxRow[]; meta: PageMeta };
}

/**
 * The ledger re-derived from its entries, compared with the cached balance.
 *
 * `consistent: false` means the cached balance and the sum of the entries
 * disagree, which is a data-integrity alarm rather than a display quirk.
 */
export interface WalletIntegrity {
  walletId: string;
  userId: string;
  ledgerBalance: number;
  cachedBalance: number;
  difference: number;
  totalCredited: number;
  totalDebited: number;
  consistent: boolean;
}

// ---------------------------------------------------------------------------
// Recharge codes — the wallet's only funding route
// ---------------------------------------------------------------------------

export interface RechargeCodeRow {
  id: string;
  code: string;
  status: 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'REVOKED';
  /** The printed price of the card. */
  faceValue: number | null;
  discountType: DiscountType | null;
  discountPercent: number | null;
  discountAmount: number | null;
  /** What the student actually handed over. This is the revenue figure. */
  actualPaidAmount: number | null;
  /** What lands in the wallet. Not the same as what was paid. */
  creditAmount: number | null;
  currency: string;
  batch: { id: string; name: string | null } | null;
  issuedBy: ActorRef | null;
  redeemedAt: string | null;
  redeemedBy: PersonRef | null;
  revenueRecognizedAt: string | null;
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface RechargeRevenueRow {
  id: string;
  code: string;
  batchId: string | null;
  batchName: string | null;
  student: PersonRef | null;
  faceValue: number;
  discountType: DiscountType;
  discountPercent: number | null;
  discountAmount: number;
  actualPaidAmount: number;
  creditAmount: number;
  currency: string;
  recognizedAt: string;
}

export interface RechargeRevenueTotals {
  faceValue: number;
  /** Face value forgone. Never revenue, and never summed with it. */
  discountGiven: number;
  /** Cash actually taken — the only figure that is revenue. */
  revenue: number;
  /** Credit issued into wallets. A liability, not income. */
  creditsIssued: number;
  count: number;
}

export interface RechargePreview {
  faceValue: number;
  discountType: DiscountType;
  discountPercent: number | null;
  discountAmount: number;
  actualPaidAmount: number;
  creditAmount: number;
  count: number;
  expectedRevenue: number;
  expectedCredits: number;
  minimumRecharge: number;
  maximumRecharge: number;
  belowMinimum: boolean;
  overrideAllowed: boolean;
}

export interface GenerateRechargeInput {
  faceValue: number;
  discountType?: DiscountType;
  discountPercent?: number;
  discountAmount?: number;
  count: number;
  batchName?: string;
  expiresAt?: string;
  reservedForUserId?: string;
  note?: string;
  prefix?: string;
  overrideMinimum?: boolean;
}

export interface GeneratedRechargeBatch {
  batchId: string;
  batchName: string | null;
  requested: number;
  created: number;
  faceValue: number;
  discountType: DiscountType;
  discountPercent: number | null;
  discountAmount: number;
  actualPaidAmount: number;
  creditAmount: number;
  expectedRevenue: number;
  expectedCredits: number;
  /** Plaintext, returned once at creation and never retrievable again. */
  codes: string[];
}

// ---------------------------------------------------------------------------
// Course parts — the course payment system, never the wallet
// ---------------------------------------------------------------------------

export interface CoursePartSectionRef {
  id: string;
  title: string;
  sortOrder: number;
  status: ContentStatus;
}

export interface CoursePartRow {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  sortOrder: number;
  status: ContentStatus;
  isActive: boolean;
  pricingModel: PartPricingModel;
  pricePercent: number | null;
  priceAmount: number | null;
  /** What this part actually costs once allocation has run. */
  effectivePrice: number | null;
  currency: string;
  sections: CoursePartSectionRef[];
  sectionCount: number;
  entitlementCount: number;
  purchaseCount: number;
  createdAt: string;
}

/**
 * Every structural mutation returns this same view, so a create, a reorder and
 * a delete all refresh the screen from one shape.
 */
export interface CoursePartsView {
  courseId: string;
  coursePrice: number | null;
  /** Set when the parts no longer add up to the course price. */
  allocationError: string | null;
  parts: CoursePartRow[];
}

export interface CreateCoursePartInput {
  title: string;
  titleAr?: string;
  description?: string;
  pricingModel: PartPricingModel;
  pricePercent?: number;
  priceAmount?: number;
  sortOrder?: number;
  sectionIds?: string[];
}

export interface UpdateCoursePartInput {
  title?: string;
  titleAr?: string;
  description?: string;
  pricingModel?: PartPricingModel;
  pricePercent?: number;
  priceAmount?: number;
  isActive?: boolean;
  status?: ContentStatus;
}

export interface CoursePartPurchaseRow {
  id: string;
  student: PersonRef | null;
  courseId: string;
  courseTitle: string;
  partId: string;
  partTitle: string;
  priceAtPurchase: number;
  pricingModel: PartPricingModel;
  pricePercent: number | null;
  coursePriceAtPurchase: number | null;
  teacher: ActorRef | null;
  teacherAmount: number;
  platformAmount: number;
  currency: string;
  sectionsUnlocked: number;
  purchasedAt: string;
}

export interface CoursePartPurchaseTotals {
  /**
   * Catalogue value of what was unlocked — **not cash**. Parts are unlocked by
   * redeeming an access card, and the money for that card was taken offline.
   */
  valueAtAcquisition: number;
  teacherShare: number;
  platformShare: number;
  count: number;
}

// ---------------------------------------------------------------------------
// Library — the only place wallet credit is spent
// ---------------------------------------------------------------------------

export interface LibraryMaterialRow {
  id: string;
  title: string;
  titleAr: string | null;
  status: ContentStatus;
  isActive: boolean;
  sortOrder: number;
  subject: { id: string; name: string } | null;
  partCount: number;
  packageCount: number;
  createdBy: ActorRef | null;
  createdAt: string;
}

export interface LibraryPartRow {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  sortOrder: number;
  status: ContentStatus;
  isActive: boolean;
  price: number;
  currency: string;
  mimeType: string | null;
  sizeBytes: number | null;
  pageCount: number | null;
  /** Free to read without a purchase. A zero price is a mistake, not free. */
  isPreview: boolean;
  /** The object key itself is never sent to a client — only whether one exists. */
  hasDocument: boolean;
  entitlementCount: number;
  createdAt: string;
}

export interface LibraryPackageRow {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  status: ContentStatus;
  isActive: boolean;
  sortOrder: number;
  price: number;
  currency: string;
  /** Membership, in package order. Editing it never affects past purchases. */
  partIds: string[];
  purchaseCount: number;
}

export interface LibraryMaterialDetail {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  status: ContentStatus;
  isActive: boolean;
  sortOrder: number;
  universityId: string | null;
  facultyId: string | null;
  academicYearId: string | null;
  subjectId: string | null;
  coverUrl: string | null;
  parts: LibraryPartRow[];
  packages: LibraryPackageRow[];
}

export interface CreateMaterialInput {
  title: string;
  titleAr?: string;
  description?: string;
  universityId?: string;
  facultyId?: string;
  academicYearId?: string;
  subjectId?: string;
  coverKey?: string;
}

export interface UpdateMaterialInput extends Partial<CreateMaterialInput> {
  status?: ContentStatus;
  isActive?: boolean;
  sortOrder?: number;
}

export interface CreateLibraryPartInput {
  title: string;
  titleAr?: string;
  description?: string;
  price: number;
  objectKey: string;
  mimeType?: string;
  sizeBytes?: number;
  pageCount?: number;
  isPreview?: boolean;
  sortOrder?: number;
}

export interface UpdateLibraryPartInput {
  title?: string;
  titleAr?: string;
  description?: string;
  price?: number;
  status?: ContentStatus;
  isActive?: boolean;
  isPreview?: boolean;
  objectKey?: string;
  mimeType?: string;
  pageCount?: number;
}

export interface CreateLibraryPackageInput {
  materialId?: string;
  title: string;
  titleAr?: string;
  description?: string;
  price: number;
  partIds: string[];
  sortOrder?: number;
}

export interface UpdateLibraryPackageInput {
  title?: string;
  titleAr?: string;
  description?: string;
  price?: number;
  status?: ContentStatus;
  isActive?: boolean;
  sortOrder?: number;
  partIds?: string[];
}

export interface LibraryPurchaseRow {
  id: string;
  student: PersonRef | null;
  kind: LibraryPurchaseKind;
  title: string;
  materialTitle: string | null;
  pricePaid: number;
  currency: string;
  partCount: number;
  purchasedAt: string;
}

export interface LibraryPurchaseTotals {
  /**
   * Credit spent, never revenue. The cash was recognised when the credit was
   * bought; adding this to recharge revenue double-counts every pound.
   */
  creditsSpent: number;
  count: number;
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/**
 * The audience rule.
 *
 * Within a dimension the values OR together; across dimensions they AND. An
 * **omitted** field means "any"; an empty array is rejected by the backend
 * because it would match nobody while looking like a successful send.
 */
export interface AudienceRule {
  roles?: UserRole[];
  universityIds?: string[];
  facultyIds?: string[];
  departmentIds?: string[];
  academicYearIds?: string[];
  courseIds?: string[];
  subjectIds?: string[];
  enrollmentStates?: EnrollmentState[];
  includeInactiveAccounts?: boolean;
  excludeUserIds?: string[];
}

export const AUDIENCE_ID_DIMENSIONS = [
  'universityIds',
  'facultyIds',
  'departmentIds',
  'academicYearIds',
  'courseIds',
  'subjectIds',
] as const;
export type AudienceIdDimension = (typeof AUDIENCE_ID_DIMENSIONS)[number];

export const AUDIENCE_DIMENSION_LABEL: Record<AudienceIdDimension, string> = {
  universityIds: 'University',
  facultyIds: 'Faculty',
  departmentIds: 'Department',
  academicYearIds: 'Academic year',
  courseIds: 'Course',
  subjectIds: 'Subject',
};

/** Matches the backend's `MAX_IDS_PER_DIMENSION`. */
export const MAX_IDS_PER_DIMENSION = 200;

export interface AudiencePreview {
  total: number;
  sample: PersonRef[];
  /** True when the rule filters on nothing — a legitimate but loud choice. */
  targetsEveryone: boolean;
  limit: number;
  exceedsLimit: boolean;
}

/**
 * An announcement row.
 *
 * The backend returns the raw Prisma row here rather than a mapped shape, so
 * every column of the model is present — including the three legacy targeting
 * columns, which are read only when `audienceRule` is empty.
 */
export interface AnnouncementRow {
  id: string;
  title: string;
  titleAr: string | null;
  body: string;
  bodyAr: string | null;
  route: string | null;

  courseId: string | null;
  universityId: string | null;
  academicYearId: string | null;

  audienceRule: AudienceRule | null;

  status: AnnouncementStatus;

  sendAtLocal: string | null;
  timezone: string;
  frequency: AnnouncementFrequency;
  weekdays: number[];
  dayOfMonth: number | null;

  startsOn: string | null;
  endsOn: string | null;
  maxOccurrences: number | null;
  occurrenceCount: number;

  nextOccurrenceAt: string | null;
  lastOccurrenceAt: string | null;

  sendPush: boolean;
  publishedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;

  _count: { notifications: number; dispatches: number };
}

export interface AnnouncementDispatchRow {
  id: string;
  announcementId: string;
  /** The scheduled instant claimed, not when the worker ran. */
  occurrenceAt: string;
  recipientCount: number;
  createdCount: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

/** `detail()` carries only `notifications` in `_count`, unlike `list()`. */
export interface AnnouncementDetail extends Omit<AnnouncementRow, '_count'> {
  dispatches: AnnouncementDispatchRow[];
  _count: { notifications: number };
}

export interface AnnouncementScheduleInput {
  frequency?: AnnouncementFrequency;
  sendAtLocal?: string;
  timezone?: string;
  weekdays?: number[];
  dayOfMonth?: number;
  startsOn?: string;
  endsOn?: string;
  maxOccurrences?: number;
}

export interface CreateAnnouncementInput extends AnnouncementScheduleInput {
  title: string;
  titleAr?: string;
  body: string;
  bodyAr?: string;
  route?: string;
  sendPush?: boolean;
  audience?: AudienceRule;
  sendNow?: boolean;
}

export type UpdateAnnouncementInput = Omit<Partial<CreateAnnouncementInput>, 'sendNow'>;

export interface DispatchResult {
  announcementId: string;
  occurrenceAt: string;
  recipients?: number;
  created?: number;
  skipped?: 'already-claimed';
}

/** Re-exported so feature modules import one module rather than three. */
export type { AccountStatus, ContentStatus, EnrollmentState, NamedRef, UserRole };
