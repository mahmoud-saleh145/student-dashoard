/**
 * Session cookie names.
 *
 * Their own module, with no `server-only` marker and no environment reads, so
 * the edge middleware can import them without dragging the server
 * configuration into the edge bundle. They are names, not secrets.
 */
export const COOKIE = {
  access: 'edu_at',
  refresh: 'edu_rt',
  /** Non-sensitive display copy of the session, readable by the server only. */
  profile: 'edu_pf',
} as const;
