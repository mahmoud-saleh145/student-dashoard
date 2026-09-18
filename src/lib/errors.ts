import type { ApiErrorCode } from '@/types/api';
import { SESSION_ENDING_CODES } from '@/types/api';

/**
 * One error type for the whole application.
 *
 * The backend answers with both a nested `error` object and a flat mirror of
 * the same values (see its `api-response.ts`); this reads whichever is present
 * so it cannot be broken by a change to either shape.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields: Record<string, string[]> | null;
  readonly requestId: string | null;

  /**
   * Marks a message as written for the person reading it, rather than for a
   * developer. Errors this application raises itself — "this dashboard is for
   * staff accounts only" — say something the generic per-code text cannot, so
   * they are shown verbatim instead of being flattened into it.
   *
   * Messages that came from the API are never flagged: they can name internal
   * entities and are not written for students or administrators to read.
   */
  readonly userFacing: boolean;

  constructor(params: {
    code: ApiErrorCode;
    message: string;
    status: number;
    fields?: Record<string, string[]> | null;
    requestId?: string | null;
    userFacing?: boolean;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.code = params.code;
    this.status = params.status;
    this.fields = params.fields ?? null;
    this.requestId = params.requestId ?? null;
    this.userFacing = params.userFacing ?? false;
  }

  get endsSession(): boolean {
    return SESSION_ENDING_CODES.has(this.code);
  }
}

interface UnknownErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
    fields?: unknown;
    details?: unknown;
    userFacing?: unknown;
  };
  code?: unknown;
  message?: unknown;
  errors?: unknown;
  statusCode?: unknown;
  requestId?: unknown;
  userFacing?: unknown;
}

/** Turns any response body into an ApiError, never throwing while doing it. */
export function toApiError(body: unknown, status: number): ApiError {
  const source = (body ?? {}) as UnknownErrorBody;

  const code =
    asString(source.error?.code) ?? asString(source.code) ?? fallbackCodeFor(status);

  const message =
    asString(source.error?.message) ??
    asString(source.message) ??
    DEFAULT_MESSAGES[code] ??
    'Something went wrong.';

  const fields =
    asFields(source.error?.fields) ?? asFields(source.errors) ?? null;

  return new ApiError({
    code: code as ApiErrorCode,
    message,
    status: typeof source.statusCode === 'number' ? source.statusCode : status,
    fields,
    requestId: asString(source.requestId) ?? null,
    // Set by this application's own route handlers, never by the API.
    userFacing: source.error?.userFacing === true || source.userFacing === true,
  });
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asFields(value: unknown): Record<string, string[]> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const out: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(messages)) {
      out[key] = messages.filter((m): m is string => typeof m === 'string');
    } else if (typeof messages === 'string') {
      out[key] = [messages];
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function fallbackCodeFor(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN';
}

/**
 * What a human is shown.
 *
 * Deliberately never the backend's own `message`: those are developer-facing
 * and sometimes name internal entities. An unmapped code falls back to the
 * server's text only when it is the only thing we have.
 */
const DEFAULT_MESSAGES: Partial<Record<string, string>> = {
  NETWORK_OFFLINE: 'You appear to be offline. Check your connection and try again.',
  NETWORK_TIMEOUT: 'The server took too long to respond. Please try again.',
  SERVER_ERROR: 'Something went wrong on the server. Please try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
  VALIDATION_ERROR: 'Please check the highlighted fields.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  MAINTENANCE: 'The platform is in maintenance mode. Please try again shortly.',
  CONFLICT: 'That change conflicts with the current state of the record.',
  INVALID_STATE: 'That action is not available for this record right now.',

  INVALID_CREDENTIALS: 'Incorrect phone number or password.',
  UNAUTHORIZED: 'Please sign in to continue.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  ACCOUNT_DISABLED: 'This account has been disabled.',
  ACCOUNT_PENDING: 'This account is not active yet.',

  FORBIDDEN: 'You do not have permission to do that.',
  INSUFFICIENT_ROLE: 'Your role does not allow this action.',
  NOT_COURSE_TEACHER: 'You are not assigned to this course.',
  CANNOT_MODIFY_MASTER: 'The master account cannot be modified.',

  NOT_FOUND: 'That record could not be found.',
  ALREADY_ENROLLED: 'This student already has access.',
  INVALID_CODE: 'That code is not valid.',
  CODE_ALREADY_USED: 'That code has already been used.',

  INSUFFICIENT_CREDIT: 'The student does not have enough wallet credit for this.',
  WALLET_LOCKED: 'This account’s wallet is not available.',
  AMOUNT_BELOW_MINIMUM: 'That amount is below the configured minimum.',
  CODE_NOT_RECHARGEABLE: 'That code is an access card, not a wallet recharge card.',

  AUDIENCE_RULE_INVALID:
    'The audience is not valid. An empty filter would reach nobody — remove it instead.',
  AUDIENCE_TOO_LARGE: 'That audience is larger than a single send is allowed to reach.',
  ANNOUNCEMENT_NOT_EDITABLE:
    'This announcement has already been sent. Cancel it and create a new one.',

  UPLOAD_FAILED: 'The upload did not complete. Please try again.',
  PROCESSING_FAILED: 'Processing failed. You can retry it from the video.',
  STORAGE_UNAVAILABLE: 'File storage is unavailable right now.',
};

/**
 * Per-field validation messages, ready to hand to `Field`'s `error` prop.
 *
 * Returns an empty object for anything that is not a field-level failure, so a
 * form can read `errors.faceValue` unconditionally instead of first testing
 * what kind of error it received. A network failure produces no field errors
 * and is shown by the form's summary line instead — which is the right split,
 * since no single input caused it.
 */
export function fieldErrors(error: unknown): Record<string, string[]> {
  return error instanceof ApiError ? (error.fields ?? {}) : {};
}

/** The message to render for any thrown value, including non-ApiErrors. */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.userFacing) return error.message;
    return DEFAULT_MESSAGES[error.code] ?? error.message;
  }
  if (error instanceof Error && error.message) {
    // Never surface a stack or an internal message verbatim.
    return 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

/** True when retrying the same request could plausibly succeed. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (
    error.code === 'NETWORK_OFFLINE' ||
    error.code === 'NETWORK_TIMEOUT' ||
    error.status >= 500
  );
}
