import 'server-only';

/**
 * Server-side configuration.
 *
 * Marked `server-only`: importing this from a client component is a build
 * error, not a runtime surprise. That matters because `API_BASE_URL` and the
 * cookie settings must never be bundled into the browser payload.
 *
 * There is deliberately no `NEXT_PUBLIC_API_URL`. The browser never calls the
 * backend directly — it calls this application's own `/api/proxy` route, which
 * attaches the access token server-side. That is what lets the token live in
 * an HTTP-only cookie instead of in JavaScript.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

function optionalBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

function optionalNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const isProduction = process.env.NODE_ENV === 'production';

export const serverConfig = {
  /** Base URL of the existing NestJS API, including its global prefix. */
  apiBaseUrl: required('API_BASE_URL', isProduction ? undefined : 'http://localhost:3000/api/v1')
    .trim()
    .replace(/\/+$/, ''),

  /** How long to wait on the backend before giving up on one request. */
  apiTimeoutMs: optionalNumber('API_TIMEOUT_MS', 20_000),

  /**
   * Secure cookies require HTTPS. Defaults to on in production and off in
   * development, because a Secure cookie is silently dropped over plain HTTP
   * and the resulting "login does nothing" is miserable to debug.
   */
  secureCookies: optionalBoolean('SECURE_COOKIES', isProduction),

  /**
   * The platform operates in Egypt. Dates are formatted in this zone rather
   * than the viewer's, so an administrator in another timezone reads the same
   * expiry date as the student it applies to.
   */
  timezone: process.env.PLATFORM_TIMEZONE?.trim() || 'Africa/Cairo',

  /** Optional: restrict which origins may drive mutating proxy calls. */
  appOrigin: process.env.APP_ORIGIN?.trim() || null,

  isProduction,
} as const;

/** Cookie names. Short and unremarkable — they carry no information. */
export const COOKIE = {
  access: 'edu_at',
  refresh: 'edu_rt',
  /** Non-sensitive display copy of the session, readable by the server only. */
  profile: 'edu_pf',
} as const;
