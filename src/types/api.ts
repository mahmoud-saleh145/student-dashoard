/**
 * The wire contract with the NestJS backend.
 *
 * Transcribed from the backend's own `src/common/types/api-response.ts` and
 * `src/common/errors/error-codes.ts`, and kept deliberately identical to the
 * mobile app's `src/types/api.ts` so the three projects agree on what an error
 * looks like. Nothing here is invented for the dashboard.
 */

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    details?: Record<string, unknown>;
  };
  /** Flat mirror the shipped mobile client reads. Same values, same source. */
  statusCode: number;
  code: string;
  message: string;
  errors?: Record<string, string[]>;
  requestId?: string;
  timestamp: string;
  path?: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export const EMPTY_PAGE: PageMeta = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
};

/**
 * Every machine-readable code the backend can return, plus the few this client
 * raises for transport conditions the backend never sees.
 *
 * The UI branches on these, never on `message` — messages are developer-facing
 * and may change wording at any time.
 */
export type ApiErrorCode =
  // transport (client-side only)
  | 'NETWORK_OFFLINE'
  | 'NETWORK_TIMEOUT'
  | 'UNKNOWN'
  // generic
  | 'SERVER_ERROR'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'MAINTENANCE'
  | 'APP_UPDATE_REQUIRED'
  | 'CONFLICT'
  | 'INVALID_STATE'
  // auth
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_PENDING'
  | 'PHONE_ALREADY_REGISTERED'
  // authorization
  | 'FORBIDDEN'
  | 'INSUFFICIENT_ROLE'
  | 'NOT_COURSE_TEACHER'
  | 'CANNOT_MODIFY_MASTER'
  | 'MASTER_ALREADY_EXISTS'
  // devices
  | 'DEVICE_NOT_AUTHORIZED'
  | 'DEVICE_LIMIT_REACHED'
  | 'DEVICE_CHANGE_PENDING'
  | 'DEVICE_INTEGRITY_FAILED'
  // access & commerce
  | 'NOT_FOUND'
  | 'COURSE_NOT_AVAILABLE'
  | 'COURSE_ARCHIVED'
  | 'ACCESS_EXPIRED'
  | 'NOT_ENROLLED'
  | 'ENROLLMENT_PENDING'
  | 'ALREADY_ENROLLED'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_FAILED'
  | 'INVALID_CODE'
  | 'CODE_ALREADY_USED'
  // wallet & credits — the Library's payment path, never a course's
  | 'INSUFFICIENT_CREDIT'
  | 'WALLET_LOCKED'
  | 'AMOUNT_BELOW_MINIMUM'
  | 'CODE_NOT_RECHARGEABLE'
  // announcements — dashboard-only, never seen by the student app
  | 'AUDIENCE_RULE_INVALID'
  | 'AUDIENCE_TOO_LARGE'
  | 'ANNOUNCEMENT_NOT_EDITABLE'
  // media
  | 'PLAYBACK_DENIED'
  | 'PLAYBACK_TICKET_EXPIRED'
  | 'CONCURRENT_STREAM_LIMIT'
  | 'VIDEO_NOT_READY'
  | 'VIDEO_UNAVAILABLE'
  | 'CAPTURE_DETECTED'
  | 'UPLOAD_FAILED'
  | 'PROCESSING_FAILED'
  | 'STORAGE_UNAVAILABLE';

/** Codes that mean "this session is over" rather than "this request failed". */
export const SESSION_ENDING_CODES: ReadonlySet<string> = new Set([
  'UNAUTHORIZED',
  'SESSION_EXPIRED',
  'ACCOUNT_DISABLED',
]);
