'use client';

import { Field, Select, TextInput } from '@/components/ui/field';
import { Badge } from '@/components/ui/primitives';
import { PLATFORM_TIMEZONE, formatDate } from '@/lib/format';
import {
  ANNOUNCEMENT_FREQUENCIES,
  ANNOUNCEMENT_FREQUENCY_LABEL,
  ISO_WEEKDAYS,
} from '@/types/commerce';
import type { AnnouncementFrequency, AnnouncementScheduleInput } from '@/types/commerce';

/**
 * When an announcement goes out.
 *
 * Two things this form deliberately does not offer:
 *
 *  - **No cron expression.** One wrong field in a cron string sends a push to
 *    every student every minute, and a delivered push cannot be recalled. The
 *    frequencies below cover what a study platform actually schedules.
 *  - **No UTC.** The time is a wall-clock time in {PLATFORM_TIMEZONE}. Egypt
 *    observes daylight saving, so the UTC instant behind "19:00 Cairo" moves
 *    twice a year; storing the local time is what keeps an evening
 *    announcement in the evening.
 *
 * Leaving the time empty saves a draft, which never fires until a time is set.
 */
export function ScheduleBuilder({
  value,
  onChange,
  disabled,
}: {
  value: AnnouncementScheduleInput;
  onChange: (value: AnnouncementScheduleInput) => void;
  disabled?: boolean;
}) {
  const frequency = value.frequency ?? 'ONCE';
  const set = <K extends keyof AnnouncementScheduleInput>(
    key: K,
    next: AnnouncementScheduleInput[K],
  ) => onChange({ ...value, [key]: next });

  const toggleWeekday = (day: number) => {
    const current = value.weekdays ?? [];
    const next = current.includes(day)
      ? current.filter((value_) => value_ !== day)
      : [...current, day].sort((a, b) => a - b);
    set('weekdays', next);
  };

  const weeklyIncomplete = frequency === 'WEEKLY' && (value.weekdays ?? []).length === 0;
  const monthlyIncomplete = frequency === 'MONTHLY' && value.dayOfMonth == null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Repeats">
          {({ id }) => (
            <Select
              id={id}
              disabled={disabled}
              value={frequency}
              onChange={(event) =>
                set('frequency', event.target.value as AnnouncementFrequency)
              }
              options={ANNOUNCEMENT_FREQUENCIES.map((option) => ({
                value: option,
                label: ANNOUNCEMENT_FREQUENCY_LABEL[option],
              }))}
            />
          )}
        </Field>

        <Field
          label="Time of day"
          hint={`Local time in ${PLATFORM_TIMEZONE}. Leave empty to save a draft.`}
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              disabled={disabled}
              type="time"
              value={value.sendAtLocal ?? ''}
              onChange={(event) => set('sendAtLocal', event.target.value || undefined)}
            />
          )}
        </Field>
      </div>

      {frequency === 'WEEKLY' ? (
        <fieldset>
          <legend className="text-sm font-medium text-foreground">On these days</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ISO_WEEKDAYS.map((day) => {
              const selected = (value.weekdays ?? []).includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => toggleWeekday(day.value)}
                  className={
                    selected
                      ? 'rounded-lg border border-primary-border bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
                      : 'rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
                  }
                >
                  {day.short}
                  <span className="sr-only"> {day.label}</span>
                </button>
              );
            })}
          </div>
          {weeklyIncomplete ? (
            <p role="alert" className="mt-2 text-xs font-medium text-danger">
              Pick at least one day, or the schedule can never fire.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {frequency === 'MONTHLY' ? (
        <div className="space-y-2">
          {/*
            The clamp rule sits outside the Field on purpose. `Field` hides its
            hint whenever the control is invalid, and a monthly schedule is
            invalid precisely until a day is chosen — so putting it in `hint`
            meant the explanation vanished at the exact moment the reader
            needed it, and reappeared once it no longer mattered.
          */}
          <p className="text-xs text-muted">
            A month shorter than this fires on its last day — the 31st means the end of
            every month, not eight of them.
          </p>

          <Field
            label="Day of the month"
            required
            error={monthlyIncomplete ? ['Choose a day.'] : null}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                disabled={disabled}
                type="number"
                min="1"
                max="31"
                value={value.dayOfMonth ?? ''}
                onChange={(event) =>
                  set('dayOfMonth', event.target.value ? Number(event.target.value) : undefined)
                }
                className="sm:w-32"
              />
            )}
          </Field>
        </div>
      ) : null}

      {frequency !== 'ONCE' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starts on" hint="Optional.">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                disabled={disabled}
                type="date"
                value={value.startsOn?.slice(0, 10) ?? ''}
                onChange={(event) =>
                  set(
                    'startsOn',
                    event.target.value
                      ? new Date(`${event.target.value}T00:00:00`).toISOString()
                      : undefined,
                  )
                }
              />
            )}
          </Field>

          <Field label="Ends on" hint="Optional.">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                disabled={disabled}
                type="date"
                value={value.endsOn?.slice(0, 10) ?? ''}
                onChange={(event) =>
                  set(
                    'endsOn',
                    event.target.value
                      ? new Date(`${event.target.value}T23:59:59`).toISOString()
                      : undefined,
                  )
                }
              />
            )}
          </Field>

          <Field label="Stop after" hint="Occurrences. Optional.">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                disabled={disabled}
                type="number"
                min="1"
                max="1000"
                value={value.maxOccurrences ?? ''}
                onChange={(event) =>
                  set(
                    'maxOccurrences',
                    event.target.value ? Number(event.target.value) : undefined,
                  )
                }
              />
            )}
          </Field>
        </div>
      ) : null}

      <SchedulePlainEnglish value={value} />
    </div>
  );
}

/**
 * The schedule as a sentence.
 *
 * Built from the same fields that will be submitted, so it cannot describe
 * something other than what was configured. It says what will happen, not what
 * the form contains.
 */
function SchedulePlainEnglish({ value }: { value: AnnouncementScheduleInput }) {
  if (!value.sendAtLocal) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">
        No time set — this saves as a draft and will not be sent until you schedule it.
      </div>
    );
  }

  const frequency = value.frequency ?? 'ONCE';

  let when: string;
  switch (frequency) {
    case 'DAILY':
      when = `every day at ${value.sendAtLocal}`;
      break;
    case 'WEEKLY': {
      const days = (value.weekdays ?? [])
        .map((day) => ISO_WEEKDAYS.find((weekday) => weekday.value === day)?.label ?? '')
        .filter(Boolean);
      when = days.length
        ? `every ${days.join(', ')} at ${value.sendAtLocal}`
        : `weekly at ${value.sendAtLocal} — no day chosen yet`;
      break;
    }
    case 'MONTHLY':
      when = value.dayOfMonth
        ? `on day ${value.dayOfMonth} of every month at ${value.sendAtLocal}`
        : `monthly at ${value.sendAtLocal} — no day chosen yet`;
      break;
    default:
      when = `once at ${value.sendAtLocal}`;
  }

  const bounds: string[] = [];
  if (value.startsOn) bounds.push(`from ${formatDate(value.startsOn)}`);
  if (value.endsOn) bounds.push(`until ${formatDate(value.endsOn)}`);
  if (value.maxOccurrences) bounds.push(`at most ${value.maxOccurrences} times`);

  return (
    <div className="rounded-lg border border-info/30 bg-info-soft px-4 py-3">
      <p className="text-sm text-info">
        Sends {when}
        {bounds.length ? `, ${bounds.join(', ')}` : ''}.
      </p>
      <p className="mt-1 text-xs text-info/80">
        Times are {PLATFORM_TIMEZONE} wall-clock and stay correct across daylight saving.
      </p>
      {frequency !== 'ONCE' ? (
        <Badge tone="info" className="mt-2">
          Audience is re-evaluated at every send
        </Badge>
      ) : null}
    </div>
  );
}
