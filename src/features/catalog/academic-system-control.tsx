'use client';

import { useMemo } from 'react';

import { Field, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/primitives';

import type { AcademicStructureKind } from '@/types/domain';

/**
 * Choosing the academic progression system.
 *
 * Two screens consume this: a university's default and a college's override.
 * They are the same decision at two levels, so they share one vocabulary, one
 * option list and one set of labels. Keeping two copies of "Year-based /
 * Level-based" is how a dashboard ends up offering "System: Year" on one screen
 * and "Type: Levels" on another for the same value.
 *
 * The words are deliberate. "Type" is what made this look like a
 * government/private flag, which it is not: ownership and academic progression
 * are independent, and neither is ever derived from the other anywhere in this
 * app.
 */

export const ACADEMIC_SYSTEM_OPTIONS: ReadonlyArray<{
  value: AcademicStructureKind;
  label: string;
  hint: string;
}> = [
  {
    value: 'YEAR',
    label: 'Year-based — نظام الفرق',
    hint: 'First Year, Second Year, Third Year, Fourth Year. The number is which year of study.',
  },
  {
    value: 'LEVEL',
    label: 'Level-based — نظام الليفلز',
    hint: 'Level 000, Level 100, Level 200. The number is a credit/course-level code.',
  },
];

export function academicSystemLabelOf(system: AcademicStructureKind): string {
  return system === 'LEVEL' ? 'Levels' : 'Years';
}

export function academicSystemFullLabel(system: AcademicStructureKind): string {
  return system === 'LEVEL' ? 'Level-based (نظام الليفلز)' : 'Year-based (نظام الفرق)';
}

/**
 * The university form's control.
 *
 * `value` is always a real system, because a university always has one: the
 * column is NOT NULL with a default. The hint says what changing it will do,
 * which is the part an administrator cannot infer — it moves every college that
 * does not override.
 */
export function UniversityAcademicSystemField({
  value,
  onChange,
  disabled,
}: {
  value: AcademicStructureKind;
  onChange: (next: AcademicStructureKind) => void;
  disabled?: boolean;
}) {
  return (
    <Field
      label="Default academic system"
      required
      hint="The system this university's colleges use. A college can override it for itself; changing it here moves every college that has not overridden, and leaves the ones that have."
    >
      {({ id, describedBy, invalid }) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          value={value}
          disabled={disabled}
          invalid={invalid}
          onChange={(event) => onChange(event.target.value as AcademicStructureKind)}
          options={ACADEMIC_SYSTEM_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      )}
    </Field>
  );
}

/**
 * The college form's control, including the inheritance option.
 *
 * The "inherit" entry is a real option rather than an implied default, because
 * the difference is what an administrator is actually deciding:
 *
 *   - Inherit  → follows the university; a later change to the university moves
 *                this college too.
 *   - Override → this college keeps its system whatever the university does.
 *
 * Without that distinction on screen, an administrator who once ticked "Levels"
 * has no way to know whether the college is pinned or merely following, and the
 * next university-wide change silently does or does not apply to them.
 */
export function CollegeAcademicSystemField({
  value,
  universityDefault,
  onChange,
  disabled,
}: {
  /** null means "inherit". */
  value: AcademicStructureKind | null;
  universityDefault: AcademicStructureKind | null;
  onChange: (next: AcademicStructureKind | null) => void;
  disabled?: boolean;
}) {
  const options = useMemo(() => {
    const inheritLabel = universityDefault
      ? `Inherit from university — ${academicSystemFullLabel(universityDefault)}`
      : 'Inherit from university';
    return [
      { value: 'INHERIT', label: inheritLabel },
      ...ACADEMIC_SYSTEM_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    ];
  }, [universityDefault]);

  return (
    <Field
      label="Academic system"
      required
      hint="Only this college's system. Leave on Inherit to follow the university; choose an override and this college keeps its own system whatever the university's default becomes."
    >
      {({ id, describedBy, invalid }) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          value={value ?? 'INHERIT'}
          disabled={disabled}
          invalid={invalid}
          onChange={(event) =>
            onChange(
              event.target.value === 'INHERIT'
                ? null
                : (event.target.value as AcademicStructureKind),
            )
          }
          options={options}
        />
      )}
    </Field>
  );
}

/**
 * The read-only badge shown on a college row.
 *
 * Says "Inherited" or "Override" as well as the value. A plain "Levels" badge
 * cannot be distinguished from a pinned one, and that is the single most
 * important thing to know about a college when deciding whether a
 * university-wide change will affect it.
 */
export function CollegeAcademicSystemBadge({
  system,
  inherited,
  redundantOverride = false,
}: {
  system: AcademicStructureKind;
  inherited: boolean;
  /** A stored override that currently equals the university default. */
  redundantOverride?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={system === 'LEVEL' ? 'info' : 'neutral'}>
        {academicSystemLabelOf(system)}
      </Badge>
      <Badge tone={inherited ? 'neutral' : 'warning'}>
        {inherited ? 'Inherited' : 'Override'}
      </Badge>
      {/*
        Not an error: the row is valid and the college resolves correctly. It is
        stale, and clearing it is what restores the college to inheritance.

        `Badge` has no `title`, so the explanation lives in a sibling
        `sr-only` span instead of a tooltip — a screen reader gets the reason
        too, which a `title` would not give.
      */}
      {redundantOverride ? (
        <>
          <Badge tone="warning">Matches default</Badge>
          <span className="sr-only">
            This override now matches the university default. Clear it so the college follows
            the university again.
          </span>
        </>
      ) : null}
    </span>
  );
}
