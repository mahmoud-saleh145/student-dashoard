/**
 * Formatting.
 *
 * Dates are rendered in the platform's own timezone, not the viewer's. An
 * administrator working from another country must read the same expiry date
 * that the student it applies to would read, otherwise a card that expires at
 * midnight Cairo time appears to expire on a different day depending on who
 * is looking. The zone is a build-time constant so client and server agree and
 * hydration does not mismatch.
 */

export const PLATFORM_TIMEZONE =
  process.env.NEXT_PUBLIC_PLATFORM_TIMEZONE?.trim() || 'Africa/Cairo';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PLATFORM_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PLATFORM_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PLATFORM_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : fallback;
}

export function formatDateTime(
  value: string | Date | null | undefined,
  fallback = '—',
): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : fallback;
}

export function formatTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : fallback;
}

/** "3 days ago" / "in 2 months". Falls back to an absolute date beyond a year. */
export function formatRelative(
  value: string | Date | null | undefined,
  fallback = '—',
): string {
  const date = toDate(value);
  if (!date) return fallback;

  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 1000],
    ['minute', 60_000],
    ['hour', 3_600_000],
    ['day', 86_400_000],
    ['week', 604_800_000],
    ['month', 2_629_800_000],
  ];

  if (abs >= 31_557_600_000) return formatDate(date);

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  let chosen: [Intl.RelativeTimeFormatUnit, number] = units[0]!;
  for (const unit of units) {
    if (abs >= unit[1]) chosen = unit;
  }

  return formatter.format(Math.round(diffMs / chosen[1]), chosen[0]);
}

const numberFormatter = new Intl.NumberFormat('en-US');

export function formatNumber(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return numberFormatter.format(value);
}

export function formatMoney(
  amount: number | null | undefined,
  currency = 'EGP',
  fallback = '—',
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return fallback;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function formatPercent(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return `${Math.round(value)}%`;
}

/** Seconds as `1:23:45` / `4:07`. */
export function formatDuration(seconds: number | null | undefined, fallback = '—'): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return fallback;
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

export function formatBytes(bytes: number | null | undefined, fallback = '—'): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return fallback;
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Masks an access code for a list view.
 *
 * The full code is what a card is worth, so it is never rendered in a table
 * that might be shoulder-surfed or screenshotted. Copy and the detail drawer
 * reveal it deliberately, one code at a time.
 */
export function maskCode(code: string | null | undefined): string {
  if (!code) return '—';

  const compact = code.replace(/-/g, '');
  if (compact.length <= 6) return '•'.repeat(compact.length);

  const head = compact.slice(0, 4);
  const tail = compact.slice(-2);
  return `${head}${'•'.repeat(Math.max(4, compact.length - 6))}${tail}`;
}

/** `01001234567` → `0100 123 4567`, for readability in dense tables. */
export function formatPhone(phone: string | null | undefined, fallback = '—'): string {
  if (!phone) return fallback;
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 11) return phone;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

/** An ISO string for the start of a day in the platform's timezone. */
export function startOfDayIso(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}

export function endOfDayIso(value: string): string {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

/** `YYYY-MM-DD` for `<input type="date">`, in the platform's timezone. */
export function toDateInputValue(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  return parts;
}
