'use client';

import { useMemo } from 'react';

import { Checkbox, Field, Select, Switch } from '@/components/ui/field';
import { Badge } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/states';
import {
  useAcademicYears,
  useDepartments,
  useFaculties,
  useSubjects,
  useUniversities,
} from '@/features/catalog/hooks';
import { useCourses } from '@/features/courses/hooks';
import { formatNumber } from '@/lib/format';
import { ENROLLMENT_STATES } from '@/types/domain';
import type { EnrollmentState } from '@/types/domain';
import {
  AUDIENCE_DIMENSION_LABEL,
  AUDIENCE_ID_DIMENSIONS,
  MAX_IDS_PER_DIMENSION,
} from '@/types/commerce';
import type { AudienceIdDimension, AudiencePreview, AudienceRule } from '@/types/commerce';

import { useAudiencePreview } from './hooks';

/** The shape every dimension list is reduced to before rendering. */
interface PickerOption {
  id: string;
  name: string;
}

/**
 * Choosing who receives an announcement.
 *
 * The rule it produces is exactly the structure the backend compiles:
 *
 *     within a dimension  →  OR    (year 2 OR year 3)
 *     across dimensions   →  AND   (year 2-or-3 AND pharmacy)
 *     exclusions          →  removed last
 *
 * The screen says that in words above the controls, because the difference
 * between "or" and "and" here is the difference between reaching four hundred
 * students and reaching none, and it is not guessable from a column of
 * checkboxes.
 *
 * **No raw JSON is ever shown.** An administrator picks from lists of the
 * things they already know — universities, faculties, courses — and the rule is
 * assembled underneath.
 *
 * Two safety properties, both deliberate:
 *
 *  - An **empty selection is impossible to submit**. A dimension with no values
 *    is removed from the rule rather than sent empty, because an empty list
 *    compiles to "matches nobody" and a send that reaches nobody looks exactly
 *    like a send that worked.
 *  - The **count comes from the server**. Nothing here counts recipients.
 */
export function AudienceBuilder({
  rule,
  onChange,
  previewEnabled = true,
}: {
  rule: AudienceRule;
  onChange: (rule: AudienceRule) => void;
  previewEnabled?: boolean;
}) {
  const universities = useUniversities();
  const academicYears = useAcademicYears();
  const subjects = useSubjects();

  // Faculties and departments narrow to the current selection, so the lists
  // stay the size of a decision rather than the size of the platform.
  const firstUniversity = rule.universityIds?.[0] ?? null;
  const faculties = useFaculties(firstUniversity);
  const firstFaculty = rule.facultyIds?.[0] ?? null;
  const departments = useDepartments(firstFaculty);

  const courses = useCourses({ page: 1, pageSize: 100 });

  // Only what a checkbox needs. Widening this to the catalogue's own
  // `NamedRef` would force every source to carry fields the picker never
  // reads, and a course has a `title` rather than a `name`.
  const options: Record<AudienceIdDimension, PickerOption[]> = {
    universityIds: universities.data ?? [],
    facultyIds: faculties.data ?? [],
    departmentIds: departments.data ?? [],
    academicYearIds: academicYears.data ?? [],
    subjectIds: subjects.data ?? [],
    courseIds: (courses.data?.items ?? []).map((course) => ({
      id: course.id,
      name: course.title,
    })),
  };

  /**
   * Adds or removes one value, deleting the key entirely when the last value
   * goes. That deletion is the whole point: `{ facultyIds: [] }` would match
   * nobody, while an absent `facultyIds` means "any faculty".
   */
  const toggle = (dimension: AudienceIdDimension, id: string) => {
    const current = rule[dimension] ?? [];
    const next = current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id];

    const updated = { ...rule };
    if (next.length === 0) delete updated[dimension];
    else updated[dimension] = next.slice(0, MAX_IDS_PER_DIMENSION);

    onChange(updated);
  };

  const setEnrollmentStates = (states: EnrollmentState[]) => {
    const updated = { ...rule };
    if (states.length === 0) delete updated.enrollmentStates;
    else updated.enrollmentStates = states;
    onChange(updated);
  };

  const activeDimensions = AUDIENCE_ID_DIMENSIONS.filter(
    (dimension) => (rule[dimension] ?? []).length > 0,
  );

  const needsEnrollmentTarget =
    Boolean(rule.enrollmentStates?.length) &&
    !rule.courseIds?.length &&
    !rule.subjectIds?.length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-sm">
        <p className="font-medium text-foreground">How these combine</p>
        <p className="mt-0.5 text-muted">
          Several choices <strong className="text-foreground">within</strong> one box mean{' '}
          <strong className="text-foreground">any of them</strong>. Choices{' '}
          <strong className="text-foreground">across</strong> boxes must{' '}
          <strong className="text-foreground">all</strong> apply. Leave a box empty to
          ignore it.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {AUDIENCE_ID_DIMENSIONS.map((dimension) => (
          <DimensionPicker
            key={dimension}
            label={AUDIENCE_DIMENSION_LABEL[dimension]}
            options={options[dimension]}
            selected={rule[dimension] ?? []}
            onToggle={(id) => toggle(dimension, id)}
            loading={
              (dimension === 'universityIds' && universities.isLoading) ||
              (dimension === 'facultyIds' && faculties.isLoading) ||
              (dimension === 'departmentIds' && departments.isLoading) ||
              (dimension === 'academicYearIds' && academicYears.isLoading) ||
              (dimension === 'subjectIds' && subjects.isLoading) ||
              (dimension === 'courseIds' && courses.isLoading)
            }
            hint={
              dimension === 'facultyIds' && !firstUniversity
                ? 'Pick a university to narrow this list.'
                : dimension === 'departmentIds' && !firstFaculty
                  ? 'Pick a faculty to narrow this list.'
                  : undefined
            }
          />
        ))}
      </div>

      <Field
        label="Enrollment state"
        hint="Only meaningful alongside a course or subject — a state alone does not say enrolled in what."
        error={
          needsEnrollmentTarget
            ? ['Choose a course or a subject as well, or clear this.']
            : null
        }
      >
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={rule.enrollmentStates?.[0] ?? ''}
            onChange={(event) =>
              setEnrollmentStates(
                event.target.value ? [event.target.value as EnrollmentState] : [],
              )
            }
            placeholder="Any enrollment state"
            options={ENROLLMENT_STATES.map((state) => ({ value: state, label: state }))}
          />
        )}
      </Field>

      <div className="rounded-lg border border-border px-4 py-1">
        <Switch
          checked={rule.includeInactiveAccounts ?? false}
          onChange={(checked) => {
            const updated = { ...rule };
            if (checked) updated.includeInactiveAccounts = true;
            else delete updated.includeInactiveAccounts;
            onChange(updated);
          }}
          label="Include suspended accounts"
          description="Off by default. A suspended student should not normally be receiving announcements."
        />
      </div>

      <AudienceSummary
        rule={rule}
        activeDimensions={activeDimensions}
        options={options}
        enabled={previewEnabled && !needsEnrollmentTarget}
      />
    </div>
  );
}

function DimensionPicker({
  label,
  options,
  selected,
  onToggle,
  loading,
  hint,
}: {
  label: string;
  options: PickerOption[];
  selected: string[];
  onToggle: (id: string) => void;
  loading?: boolean;
  hint?: string;
}) {
  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium text-foreground">
        {label}
        {selected.length > 0 ? (
          <span className="ms-2 text-xs font-normal text-primary">
            any of {selected.length}
          </span>
        ) : (
          <span className="ms-2 text-xs font-normal text-muted">any</span>
        )}
      </legend>

      {hint ? <p className="mb-2 px-1 text-xs text-muted">{hint}</p> : null}

      {loading ? (
        <div className="space-y-2 p-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : options.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted">Nothing to choose from.</p>
      ) : (
        <div className="max-h-44 space-y-1 overflow-y-auto px-1">
          {options.map((option) => (
            <Checkbox
              key={option.id}
              label={option.name}
              checked={selected.includes(option.id)}
              onChange={() => onToggle(option.id)}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}

/**
 * The rule in words, and the count from the server.
 *
 * The sentence is generated from the same rule the backend receives, so what
 * the admin reads and what will be compiled cannot drift apart. The number
 * beneath it is the server's, always.
 */
function AudienceSummary({
  rule,
  activeDimensions,
  options,
  enabled,
}: {
  rule: AudienceRule;
  activeDimensions: readonly AudienceIdDimension[];
  options: Record<AudienceIdDimension, PickerOption[]>;
  enabled: boolean;
}) {
  const preview = useAudiencePreview(rule, enabled);

  const sentence = useMemo(() => {
    if (activeDimensions.length === 0 && !rule.enrollmentStates?.length) {
      return 'Every active student on the platform.';
    }

    const clauses = activeDimensions.map((dimension) => {
      const names = (rule[dimension] ?? [])
        .map(
          (id) => options[dimension].find((option) => option.id === id)?.name ?? id,
        )
        .filter(Boolean);

      const joined =
        names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;

      return `${AUDIENCE_DIMENSION_LABEL[dimension].toLowerCase()} is ${joined}`;
    });

    if (rule.enrollmentStates?.length) {
      clauses.push(`enrollment is ${rule.enrollmentStates.join(' or ')}`);
    }

    return `Students where ${clauses.join(', and ')}.`;
  }, [activeDimensions, rule, options]);

  return (
    <div className="rounded-lg border border-primary-border bg-primary-soft px-4 py-3">
      <p className="text-sm text-foreground">{sentence}</p>

      {rule.excludeUserIds?.length ? (
        <p className="mt-1 text-xs text-muted">
          Minus {rule.excludeUserIds.length} excluded student
          {rule.excludeUserIds.length === 1 ? '' : 's'}.
        </p>
      ) : null}

      <div className="mt-3 border-t border-primary-border pt-3">
        <RecipientCount preview={preview.data} loading={preview.isFetching} enabled={enabled} />
      </div>
    </div>
  );
}

function RecipientCount({
  preview,
  loading,
  enabled,
}: {
  preview: AudiencePreview | undefined;
  loading: boolean;
  enabled: boolean;
}) {
  if (!enabled) {
    return <p className="text-sm text-muted">Fix the audience above to see the count.</p>;
  }

  if (loading && !preview) {
    return <Skeleton className="h-6 w-40" />;
  }

  if (!preview) {
    return <p className="text-sm text-muted">The count will appear here.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm">
        <strong className="text-lg font-semibold tabular-nums text-foreground">
          {formatNumber(preview.total)}
        </strong>{' '}
        <span className="text-muted">
          recipient{preview.total === 1 ? '' : 's'}, counted by the server
        </span>
      </p>

      {preview.targetsEveryone ? (
        <Badge tone="warning">This reaches everyone</Badge>
      ) : null}

      {preview.exceedsLimit ? (
        <p role="alert" className="text-sm font-medium text-danger">
          Over the {formatNumber(preview.limit)} limit for a single send — the server will
          refuse this. Narrow the audience.
        </p>
      ) : null}

      {preview.total === 0 ? (
        <p role="alert" className="text-sm font-medium text-warning">
          This reaches nobody. Sending it would look like success and deliver nothing.
        </p>
      ) : null}

      {preview.sample.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted hover:text-foreground">
            Sample of who this reaches
          </summary>
          <ul className="mt-2 space-y-0.5 text-muted">
            {preview.sample.map((person) => (
              <li key={person.id}>{person.fullName}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** Small read-only rendering of a stored rule, for the list and the drawer. */
export function AudienceChips({ rule }: { rule: AudienceRule | null }) {
  if (!rule || Object.keys(rule).length === 0) {
    return <Badge tone="warning">Everyone</Badge>;
  }

  const chips = AUDIENCE_ID_DIMENSIONS.filter(
    (dimension) => (rule[dimension] ?? []).length > 0,
  ).map((dimension) => (
    <Badge key={dimension} tone="neutral">
      {AUDIENCE_DIMENSION_LABEL[dimension]} ×{rule[dimension]!.length}
    </Badge>
  ));

  if (rule.enrollmentStates?.length) {
    chips.push(
      <Badge key="enrollment" tone="neutral">
        {rule.enrollmentStates.join(', ')}
      </Badge>,
    );
  }

  if (rule.excludeUserIds?.length) {
    chips.push(
      <Badge key="excluded" tone="warning">
        −{rule.excludeUserIds.length} excluded
      </Badge>,
    );
  }

  if (chips.length === 0) return <Badge tone="warning">Everyone</Badge>;

  return <div className="flex flex-wrap gap-1">{chips}</div>;
}

