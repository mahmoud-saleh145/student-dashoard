'use client';

import { Checkbox, Field, Select } from '@/components/ui/field';
import { useDepartments, useFaculties, useUniversities } from '@/features/catalog/hooks';

/**
 * University → College → Department(s).
 *
 * One component, used by both the create and the edit form, so the two cannot
 * drift into disagreeing about what a valid structure looks like.
 *
 * The cascade resets downwards: changing the university clears the college and
 * the departments, changing the college clears the departments. That is a
 * convenience, not the enforcement — `CoursesAdminService.assertAcademicStructure`
 * re-checks every relationship server-side, because a filtered dropdown stops
 * nobody from posting whatever they like.
 *
 * Departments are checkboxes rather than a multi-select: a course is commonly
 * offered to two or three departments of the same college, and a `<select
 * multiple>` hides both the options and the current answer behind a scroll box.
 */

export interface AcademicStructureValue {
  universityId: string;
  facultyId: string;
  departmentIds: string[];
}

export function AcademicStructurePicker({
  value,
  onChange,
  disabled,
}: {
  value: AcademicStructureValue;
  onChange: (next: AcademicStructureValue) => void;
  disabled?: boolean;
}) {
  const universities = useUniversities();
  const faculties = useFaculties(value.universityId || null);
  const departments = useDepartments(value.facultyId || null);

  const university = (universities.data ?? []).find((u) => u.id === value.universityId);
  const faculty = (faculties.data ?? []).find((f) => f.id === value.facultyId);
  const chosen = (departments.data ?? []).filter((d) => value.departmentIds.includes(d.id));

  function selectUniversity(universityId: string) {
    // A college belongs to exactly one university, so keeping the old one
    // would leave a pairing the server will refuse.
    onChange({ universityId, facultyId: '', departmentIds: [] });
  }

  function selectFaculty(facultyId: string) {
    onChange({ ...value, facultyId, departmentIds: [] });
  }

  function toggleDepartment(departmentId: string, checked: boolean) {
    onChange({
      ...value,
      departmentIds: checked
        ? [...value.departmentIds, departmentId]
        : value.departmentIds.filter((id) => id !== departmentId),
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="University">
          {({ id }) => (
            <Select
              id={id}
              value={value.universityId}
              disabled={disabled}
              placeholder={universities.isLoading ? 'Loading…' : 'Not set'}
              options={(universities.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
              onChange={(event) => selectUniversity(event.target.value)}
            />
          )}
        </Field>

        <Field
          label="College"
          hint={!value.universityId ? 'Choose a university first.' : undefined}
        >
          {({ id }) => (
            <Select
              id={id}
              value={value.facultyId}
              // Not merely empty: an enabled select with no options reads as a
              // loading failure rather than as a step that is not ready.
              disabled={disabled || !value.universityId}
              placeholder={
                !value.universityId
                  ? 'Choose a university first'
                  : faculties.isLoading
                    ? 'Loading…'
                    : (faculties.data ?? []).length === 0
                      ? 'This university has no colleges yet'
                      : 'Not set'
              }
              options={(faculties.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
              onChange={(event) => selectFaculty(event.target.value)}
            />
          )}
        </Field>
      </div>

      {value.facultyId ? (
        <Field
          label="Departments"
          hint="A course can be offered to more than one department of the same college."
        >
          {() =>
            departments.isLoading ? (
              <p className="text-sm text-muted">Loading departments…</p>
            ) : (departments.data ?? []).length === 0 ? (
              <p className="text-sm text-muted">This college has no departments yet.</p>
            ) : (
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {(departments.data ?? []).map((department) => (
                  <Checkbox
                    key={department.id}
                    label={department.name}
                    checked={value.departmentIds.includes(department.id)}
                    disabled={disabled}
                    onChange={(event) => toggleDepartment(department.id, event.target.checked)}
                  />
                ))}
              </div>
            )
          }
        </Field>
      ) : null}

      {/*
        The path, written out. The three inputs above are separate controls
        and it is easy to lose track of what they add up to — particularly
        after a cascade reset has silently emptied the two below the one that
        changed.
      */}
      <p className="text-sm text-muted" aria-live="polite">
        {university ? (
          <>
            <span className="font-medium text-foreground">{university.name}</span>
            {faculty ? (
              <>
                {' → '}
                <span className="font-medium text-foreground">{faculty.name}</span>
                {chosen.length > 0 ? (
                  <>
                    {' → '}
                    <span className="font-medium text-foreground">
                      {chosen.map((d) => d.name).join(', ')}
                    </span>
                  </>
                ) : (
                  <> → no departments selected</>
                )}
              </>
            ) : (
              <> → no college selected</>
            )}
          </>
        ) : (
          'No academic structure selected. The course will not be filtered by university.'
        )}
      </p>
    </div>
  );
}
