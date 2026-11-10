'use client';

import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, type SelectOption } from '@/components/ui/field';
import { Badge } from '@/components/ui/primitives';
import type { LibraryDepartmentScope, LibraryMaterialAudience } from '@/types/commerce';
import type { Department } from '@/types/domain';

import {
  clearAcademicYears,
  collegeTracks,
  ladderLabel,
  savedAcademicYears,
  selectFaculty,
  selectScope,
  selectUniversity,
  selectionTrack,
  toggleAcademicYear,
  toggleDepartment,
  trackName,
  trackOfDepartment,
  type AudienceDraft,
  type AudienceField,
  type StudyTrack,
} from './audience';
import type { useLibraryAudienceData } from './hooks';

/**
 * Who a Library material is for: University → College → whole college or
 * selected departments → optional year/level.
 *
 * Deliberately NOT the course `AcademicStructurePicker`. A course and a
 * material are targeted by different rules — a material must have a college,
 * reaches every department unless told otherwise, and has no separate
 * General/Programs control: the track is read from the departments ticked.
 * Sharing one component would make every Library rule a course change too.
 *
 * Controlled and stateless: the form owns the draft, `./audience` owns the
 * rules, and this renders them. Every upstream change goes through a
 * transition in `./audience` that clears what it invalidates, so the form can
 * never hold a department of another college or a rung of another ladder
 * without saying so.
 */

type AudienceData = ReturnType<typeof useLibraryAudienceData>;

export function LibraryAudienceEditor({
  value,
  onChange,
  data,
  errors,
  saved,
  disabled,
}: {
  value: AudienceDraft;
  onChange: (next: AudienceDraft) => void;
  data: AudienceData;
  errors: Partial<Record<AudienceField, string>>;
  /** The saved audience, for naming ids that are no longer listed. */
  saved?: LibraryMaterialAudience | null;
  disabled?: boolean;
}) {
  const scopeName = useId();
  const universities = data.universities.data;
  const faculties = data.faculties.data;
  const departments = data.departments.data;
  const { ladder } = data;

  // Names of every rung seen so far, so a chosen year/level stays readable
  // while its ladder is reloading or failed — a transient error must not make
  // the selection look cleared or replaced.
  const [rungNames, setRungNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (ladder.entries.length === 0) return;
    setRungNames((known) => {
      const missing = ladder.entries.filter((entry) => known[entry.id] !== entry.name);
      if (missing.length === 0) return known;
      return { ...known, ...Object.fromEntries(missing.map((e) => [e.id, e.name])) };
    });
  }, [ladder.entries]);

  const universityOptions = withUnavailable(
    (universities ?? []).map((u) => ({ value: u.id, label: u.name })),
    value.universityId,
    listState(data.universities),
    saved?.university?.id === value.universityId ? saved?.university?.name : undefined,
    'no longer active',
  );

  const facultyOptions = withUnavailable(
    (faculties ?? []).map((f) => ({ value: f.id, label: f.name })),
    value.facultyId,
    listState(data.faculties),
    saved?.faculty?.id === value.facultyId ? saved?.faculty?.name : undefined,
    'no longer active',
  );

  // Ticked rungs the current ladder does not list: saved under another
  // audience, or a ladder that is still loading. Named from what was seen
  // before, then from the saved material, so they never read as bare ids.
  const unavailableYears = value.academicYearIds
    .filter((id) => !ladder.entries.some((entry) => entry.id === id))
    .map((id) => ({
      id,
      name:
        rungNames[id] ??
        savedAcademicYears(saved).find((year) => year.id === id)?.name ??
        'Unavailable',
    }));
  const yearsReady = ladder.status === 'ready';

  const list = departments ?? [];
  const track = selectionTrack(list, value.departmentIds);
  const tracks = collegeTracks(list);
  const unavailableDepartments = departments
    ? value.departmentIds.filter((id) => !list.some((d) => d.id === id))
    : [];

  const universityName = universities?.find((u) => u.id === value.universityId)?.name;
  const facultyName = faculties?.find((f) => f.id === value.facultyId)?.name;
  const chosen = list.filter((d) => value.departmentIds.includes(d.id));

  return (
    <fieldset
      className="space-y-4 rounded-lg border border-border p-4"
      data-testid="library-audience-editor"
    >
      <legend className="px-1 text-sm font-semibold text-foreground">Audience</legend>
      <p className="-mt-2 text-xs text-muted">
        Who can find and buy this material. Students outside it never see it in the library.
        Anyone who already bought one of its documents keeps it whatever this says.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="University" required error={errors.universityId}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={value.universityId}
              disabled={disabled}
              placeholder={data.universities.isLoading ? 'Loading…' : 'Choose a university'}
              options={universityOptions}
              onChange={(event) => onChange(selectUniversity(value, event.target.value))}
            />
          )}
        </Field>

        <Field label="College" required error={errors.facultyId}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={value.facultyId}
              disabled={disabled || !value.universityId}
              placeholder={
                !value.universityId
                  ? 'Choose a university first'
                  : data.faculties.isLoading
                    ? 'Loading…'
                    : (faculties ?? []).length === 0
                      ? 'This university has no colleges yet'
                      : 'Choose a college'
              }
              options={facultyOptions}
              onChange={(event) => onChange(selectFaculty(value, event.target.value))}
            />
          )}
        </Field>
      </div>

      <div role="radiogroup" aria-label="Who in the college" className="space-y-2">
        <p className="text-sm font-medium text-foreground">Who in the college</p>
        <ScopeOption
          name={scopeName}
          scope="FACULTY"
          current={value.departmentScope}
          disabled={disabled || !value.facultyId}
          label="Entire college"
          description="Every student of the college, in every department."
          onSelect={(scope) => onChange(selectScope(value, scope))}
        />
        <ScopeOption
          name={scopeName}
          scope="DEPARTMENTS"
          current={value.departmentScope}
          disabled={disabled || !value.facultyId}
          label="Selected departments"
          description="Only students of the departments you tick — all General or all Programs."
          onSelect={(scope) => onChange(selectScope(value, scope))}
        />
      </div>

      {value.facultyId && value.departmentScope === 'FACULTY' && departments ? (
        tracks.length > 1 ? (
          <p role="note" className="rounded-lg bg-surface-alt px-3 py-2 text-xs text-muted">
            This college has both General and Programs departments, and Entire college reaches
            both. To target one track, choose Selected departments.
          </p>
        ) : (
          <p className="text-xs text-muted">
            Reaches all {list.length} department{list.length === 1 ? '' : 's'} of this college.
          </p>
        )
      ) : null}

      {value.facultyId && value.departmentScope === 'DEPARTMENTS' ? (
        <Field label="Departments" required error={errors.departmentIds}>
          {() =>
            data.departments.isLoading ? (
              <p className="text-sm text-muted">Loading departments…</p>
            ) : data.departments.isError && !departments ? (
              <LoadError
                message="The departments of this college could not be loaded. Your selections are kept."
                retrying={data.departments.isFetching}
                onRetry={() => void data.departments.refetch()}
                testId="departments-error"
              />
            ) : list.length === 0 && unavailableDepartments.length === 0 ? (
              <p className="text-sm text-muted">This college has no active departments.</p>
            ) : (
              <div className="space-y-3">
                {tracks.map((groupTrack) => (
                  <DepartmentGroup
                    key={groupTrack}
                    track={groupTrack}
                    departments={list.filter((d) => trackOfDepartment(d) === groupTrack)}
                    selected={value.departmentIds}
                    lockedBy={track && track !== 'MIXED' && track !== groupTrack ? track : null}
                    disabled={disabled}
                    onToggle={(id, checked) => onChange(toggleDepartment(value, id, checked))}
                  />
                ))}

                {unavailableDepartments.length > 0 ? (
                  <div
                    className="space-y-1 rounded-lg border border-warning/40 px-3 py-2"
                    data-testid="unavailable-departments"
                  >
                    <p className="text-xs font-medium text-warning">
                      Saved, but no longer offered by this college:
                    </p>
                    {unavailableDepartments.map((id) => (
                      <div key={id} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          {saved?.departments.find((d) => d.id === id)?.name ??
                            'Unavailable department'}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={disabled}
                          onClick={() => onChange(toggleDepartment(value, id, false))}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          }
        </Field>
      ) : null}

      <Field
        label={`${ladderLabel(ladder.kind)}s (optional)`}
        hint="A browse filter students can use to narrow the list. Tick every year/level this material is for; none ticked means all years. It never decides who can see or buy the material."
        error={errors.academicYearIds}
      >
        {({ id, describedBy, invalid }) => (
          <div
            id={id}
            role="group"
            aria-label={`${ladderLabel(ladder.kind)}s`}
            aria-describedby={describedBy}
            data-testid="academic-years"
            className={
              invalid
                ? 'space-y-3 rounded-lg border border-danger p-3'
                : 'space-y-3 rounded-lg border border-border p-3'
            }
          >
            {!yearsReady || (ladder.entries.length === 0 && unavailableYears.length === 0) ? (
              <p className="text-sm text-muted">{yearPlaceholder(value, ladder)}</p>
            ) : (
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {ladder.entries.map((entry) => (
                  <Checkbox
                    key={entry.id}
                    label={entry.name}
                    checked={value.academicYearIds.includes(entry.id)}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(toggleAcademicYear(value, entry.id, event.target.checked))
                    }
                  />
                ))}
              </div>
            )}

            {unavailableYears.length > 0 ? (
              <div
                className="space-y-1 rounded-lg border border-warning/40 px-3 py-2"
                data-testid="unavailable-years"
              >
                <p className="text-xs font-medium text-warning">
                  {yearsReady
                    ? 'Chosen, but not part of the ladder for this audience:'
                    : 'Chosen, not verified until the years/levels load:'}
                </p>
                {unavailableYears.map((year) => (
                  <div key={year.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{year.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => onChange(toggleAcademicYear(value, year.id, false))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted" data-testid="academic-years-summary">
                {value.academicYearIds.length === 0
                  ? 'Any — no year/level filter'
                  : `${value.academicYearIds.length} selected`}
              </p>
              {value.academicYearIds.length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onChange(clearAcademicYears(value))}
                >
                  Clear years
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Field>

      {ladder.status === 'error' ? (
        <LoadError
          message="The years/levels for this audience could not be loaded. Your selections are kept."
          retrying={false}
          onRetry={() => ladder.retry?.()}
          testId="ladder-error"
        />
      ) : null}

      <p className="text-sm text-muted" aria-live="polite" data-testid="audience-path">
        {universityName ? (
          <>
            <span className="font-medium text-foreground">{universityName}</span>
            {facultyName ? (
              <>
                {' → '}
                <span className="font-medium text-foreground">{facultyName}</span>
                {' → '}
                {value.departmentScope === 'FACULTY' ? (
                  <>every department</>
                ) : chosen.length > 0 ? (
                  <span className="font-medium text-foreground">
                    {chosen.map((d) => d.name).join(', ')}
                  </span>
                ) : (
                  <>no departments selected</>
                )}
              </>
            ) : (
              <> → no college selected</>
            )}
          </>
        ) : (
          'No audience yet. A material must name its university and college.'
        )}
      </p>
    </fieldset>
  );
}

function ScopeOption({
  name,
  scope,
  current,
  disabled,
  label,
  description,
  onSelect,
}: {
  name: string;
  scope: LibraryDepartmentScope;
  current: LibraryDepartmentScope;
  disabled?: boolean;
  label: string;
  description: string;
  onSelect: (scope: LibraryDepartmentScope) => void;
}) {
  const id = `${name}-${scope}`;
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="radio"
        name={name}
        value={scope}
        className="mt-1 accent-[var(--color-primary)]"
        checked={current === scope}
        disabled={disabled}
        onChange={() => onSelect(scope)}
      />
      <label htmlFor={id} className="cursor-pointer text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted">{description}</span>
      </label>
    </div>
  );
}

function DepartmentGroup({
  track,
  departments,
  selected,
  lockedBy,
  disabled,
  onToggle,
}: {
  track: StudyTrack;
  departments: Department[];
  selected: string[];
  /** The other track, when the current selection already belongs to it. */
  lockedBy: StudyTrack | null;
  disabled?: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div
      className="rounded-lg border border-border p-3"
      data-testid={`department-group-${track}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <Badge tone={track === 'PROGRAMS' ? 'primary' : 'info'}>{trackName(track)}</Badge>
        {lockedBy ? (
          <span className="text-xs text-muted">
            Unavailable while {trackName(lockedBy)} departments are ticked — a material is
            either General or Programs.
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {departments.map((department) => {
          const checked = selected.includes(department.id);
          return (
            <Checkbox
              key={department.id}
              label={
                <span>
                  {department.name}
                  {department.nameAr ? (
                    <span className="ms-2 text-xs text-muted">
                      <bdi dir="rtl">{department.nameAr}</bdi>
                    </span>
                  ) : null}
                </span>
              }
              checked={checked}
              disabled={disabled || (Boolean(lockedBy) && !checked)}
              onChange={(event) => onToggle(department.id, event.target.checked)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Keeps a saved id visible (and refused) when its option is no longer offered. */
type ListState = 'loaded' | 'loading' | 'error';

function listState(query: { data?: unknown; isError: boolean }): ListState {
  if (query.data) return 'loaded';
  return query.isError ? 'error' : 'loading';
}

/**
 * Keeps a chosen id visible when its option is not (or not yet) offered.
 *
 * Once the list has loaded, a missing id really is unavailable and is shown
 * as refused. While it is loading or has failed, the id is shown as chosen
 * but unverified — never dropped, and never swapped for the placeholder.
 */
function withUnavailable(
  options: SelectOption[],
  value: string,
  state: ListState,
  name: string | undefined,
  reasonWhenLoaded: string,
): SelectOption[] {
  if (!value || options.some((option) => option.value === value)) return options;
  const label =
    state === 'loaded'
      ? `${name ?? 'Unavailable'} (${reasonWhenLoaded})`
      : `${name ?? 'Selected'} (${state === 'error' ? 'not verified' : 'checking…'})`;
  return [...options, { value, label, disabled: true }];
}

function LoadError({
  message,
  retrying,
  onRetry,
  testId,
}: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
  testId: string;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/40 bg-surface px-3 py-2"
    >
      <span className="text-sm text-danger">{message}</span>
      <Button size="sm" variant="secondary" loading={retrying} onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function yearPlaceholder(value: AudienceDraft, ladder: AudienceData['ladder']): string {
  if (!value.facultyId) return 'Choose a college first';
  if (value.departmentScope === 'DEPARTMENTS' && value.departmentIds.length === 0) {
    return 'Choose departments first';
  }
  if (ladder.status === 'loading') return 'Loading…';
  if (ladder.status === 'error') return 'Could not load the years/levels';
  if (ladder.conflict) return 'These departments share no ladder';
  if (ladder.entries.length === 0) return 'None configured for this audience';
  return 'Any — no year/level filter';
}
