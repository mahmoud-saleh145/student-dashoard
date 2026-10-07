'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/primitives';
import { CardsSkeleton, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useAcademicStructures,
  useCreateAcademicStructure,
  useDepartments,
  useFaculties,
  useReplaceStructureEntries,
  useUniversities,
  useUpdateAcademicStructure,
} from '@/features/catalog/hooks';
import type { AcademicStructure, AcademicStructureKind } from '@/types/domain';

/**
 * Academic structures.
 *
 * A structure is one ladder of years or levels, owned by one unit of the
 * catalogue. A unit without its own inherits its parent's, up to the
 * platform-wide ladder — so most installations need exactly one, and the
 * screen leads with that rather than demanding a structure per department.
 *
 * Two things the interface has to be honest about, because both are surprising
 * if discovered by accident:
 *
 *   * The COUNT is the administrator's choice. Nothing assumes four. The
 *     editor starts from whatever the ladder already has and adds or removes
 *     rows freely.
 *   * Removing a rung DEACTIVATES it. Students and courses point at these
 *     rows, so deleting one would either fail or strip their placement. The
 *     editor says so at the point of removal, not in a footnote.
 */

const KIND_OPTIONS: { value: AcademicStructureKind; label: string }[] = [
  { value: 'YEAR', label: 'Years — “First Year”, “Second Year”' },
  { value: 'LEVEL', label: 'Levels — “Level 1”, “Level 2”' },
];

/** Names a structure's owner for a reader, rather than showing its scopeKey. */
function ownerLabel(structure: AcademicStructure): string {
  if (structure.department) return `Department · ${structure.department.name}`;
  if (structure.faculty) return `College · ${structure.faculty.name}`;
  if (structure.university) return `University · ${structure.university.name}`;
  return 'Platform-wide (inherited by every unit without its own)';
}

function kindBadge(kind: AcademicStructureKind) {
  return <Badge tone={kind === 'LEVEL' ? 'info' : 'neutral'}>{kind === 'LEVEL' ? 'Levels' : 'Years'}</Badge>;
}

type DraftEntry = { order: number; name: string; nameAr: string };

export function AcademicStructures() {
  const structures = useAcademicStructures();
  const toast = useToast();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AcademicStructure | null>(null);

  if (structures.isLoading) return <CardsSkeleton count={2} />;
  if (structures.error) {
    return (
      <ErrorState
        error={structures.error}
        onRetry={() => void structures.refetch()}
      />
    );
  }

  const rows = structures.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-xs text-muted">
          Each structure is one ladder of years or levels. A university, college or department
          without its own uses the one above it, and each of those can have only one. You may
          keep several platform-wide structures side by side. The number of entries and their
          names are yours to set — there is no fixed four.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          Add structure
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-6 text-center">
          <p className="text-sm font-medium">No academic structures yet</p>
          <p className="mt-1 text-xs text-muted">
            Add a platform-wide structure first. Every unit will inherit it.
          </p>
          <Button size="sm" className="mt-3" onClick={() => setCreating(true)}>
            Add structure
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((structure) => {
            const active = structure.entries.filter((e) => e.isActive);
            const retired = structure.entries.filter((e) => !e.isActive);

            return (
              <li
                key={structure.id}
                className="rounded-lg border border-line bg-surface p-4"
                data-testid={`structure-${structure.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {kindBadge(structure.kind)}
                    <span className="text-sm font-medium">{ownerLabel(structure)}</span>
                    {structure.isActive ? null : <Badge tone="warning">Inactive</Badge>}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(structure)}>
                    Edit entries
                  </Button>
                </div>

                <p className="mt-2 text-xs text-muted">
                  {active.length} {structure.kind === 'LEVEL' ? 'level' : 'year'}
                  {active.length === 1 ? '' : 's'}
                  {retired.length > 0 ? ` · ${retired.length} retired` : ''}
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {active.map((entry) => (
                    <span
                      key={entry.id}
                      className="rounded-md border border-line px-2 py-0.5 text-xs tabular-nums"
                    >
                      {entry.order}. {entry.name}
                    </span>
                  ))}
                  {retired.map((entry) => (
                    <span
                      key={entry.id}
                      className="rounded-md border border-dashed border-line px-2 py-0.5 text-xs text-subtle line-through"
                      title="Retired — still referenced by existing students and courses"
                    >
                      {entry.order}. {entry.name}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {creating ? (
        <CreateStructureDialog
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            toast.success('Academic structure added');
          }}
        />
      ) : null}

      {editing ? (
        <EditEntriesDialog
          structure={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            toast.success('Entries saved');
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Creating a structure.
 *
 * Scope is one choice, not three: picking a college clears the department, so
 * the request can never name two owners — which the server rejects and the
 * database has a CHECK constraint against.
 */
function CreateStructureDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const create = useCreateAcademicStructure();
  const toast = useToast();

  const [kind, setKind] = useState<AcademicStructureKind>('YEAR');
  const [universityId, setUniversityId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  const universities = useUniversities();
  const faculties = useFaculties(universityId || null);
  const departments = useDepartments(facultyId || null);

  async function submit() {
    try {
      await create.mutateAsync({
        kind,
        // Most specific wins, and only one is ever sent.
        ...(departmentId
          ? { departmentId }
          : facultyId
            ? { facultyId }
            : universityId
              ? { universityId }
              : {}),
      });
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the structure');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add academic structure"
      busy={create.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={create.isPending}>
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="System"
          required
          hint="This only changes how the entries are labelled. You name each entry yourself in the next step."
        >
          {({ id }) => (
            <Select
              id={id}
              value={kind}
              options={KIND_OPTIONS}
              onChange={(event) => setKind(event.target.value as AcademicStructureKind)}
            />
          )}
        </Field>

        <Field
          label="Applies to"
          hint="Leave all three empty for a platform-wide structure that every unit inherits. Set one to give that unit its own."
        >
          {() => (
            <div className="flex flex-col gap-2">
              <Select
                aria-label="University"
                value={universityId}
                placeholder="Platform-wide"
                options={(universities.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
                onChange={(event) => {
                  setUniversityId(event.target.value);
                  setFacultyId('');
                  setDepartmentId('');
                }}
              />
              {universityId ? (
                <Select
                  aria-label="College"
                  value={facultyId}
                  placeholder="Whole university"
                  options={(faculties.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
                  onChange={(event) => {
                    setFacultyId(event.target.value);
                    setDepartmentId('');
                  }}
                />
              ) : null}
              {facultyId ? (
                <Select
                  aria-label="Department"
                  value={departmentId}
                  placeholder="Whole college"
                  options={(departments.data ?? []).map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                  onChange={(event) => setDepartmentId(event.target.value)}
                />
              ) : null}
            </div>
          )}
        </Field>
      </div>
    </Modal>
  );
}

/**
 * The entry editor: the screen that makes count and names configurable.
 *
 * Rows are matched by `order` on save, so renaming an entry keeps the students
 * and courses filed under it. Removing a row retires the entry rather than
 * deleting it, and the dialog says so before the administrator commits.
 */
function EditEntriesDialog({
  structure,
  onClose,
  onDone,
}: {
  structure: AcademicStructure;
  onClose: () => void;
  onDone: () => void;
}) {
  const save = useReplaceStructureEntries();
  const updateStructure = useUpdateAcademicStructure();
  const toast = useToast();

  const [kind, setKind] = useState<AcademicStructureKind>(structure.kind);
  const [rows, setRows] = useState<DraftEntry[]>(() =>
    structure.entries
      .filter((e) => e.isActive)
      .map((e) => ({ order: e.order, name: e.name, nameAr: e.nameAr })),
  );

  const noun = kind === 'LEVEL' ? 'Level' : 'Year';

  const removedCount = useMemo(() => {
    const keep = new Set(rows.map((r) => r.order));
    return structure.entries.filter((e) => e.isActive && !keep.has(e.order)).length;
  }, [rows, structure.entries]);

  function addRow() {
    const nextOrder = rows.reduce((max, r) => Math.max(max, r.order), 0) + 1;
    setRows([...rows, { order: nextOrder, name: `${noun} ${nextOrder}`, nameAr: '' }]);
  }

  function update(index: number, patch: Partial<DraftEntry>) {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submit() {
    if (rows.length === 0) {
      toast.error('A structure needs at least one entry');
      return;
    }
    const orders = rows.map((r) => r.order);
    if (new Set(orders).size !== orders.length) {
      toast.error('Two entries share the same order');
      return;
    }
    if (rows.some((r) => !r.name.trim() || !r.nameAr.trim())) {
      toast.error('Every entry needs an English and an Arabic name');
      return;
    }

    try {
      if (kind !== structure.kind) {
        await updateStructure.mutateAsync({ id: structure.id, kind });
      }
      await save.mutateAsync({
        id: structure.id,
        entries: rows.map((r) => ({
          order: r.order,
          name: r.name.trim(),
          nameAr: r.nameAr.trim(),
        })),
      });
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the entries');
    }
  }

  const busy = save.isPending || updateStructure.isPending;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Entries — ${ownerLabel(structure)}`}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="System" hint="Changing this relabels the entries; it moves no students.">
          {({ id }) => (
            <Select
              id={id}
              value={kind}
              options={KIND_OPTIONS}
              onChange={(event) => setKind(event.target.value as AcademicStructureKind)}
            />
          )}
        </Field>

        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={row.order} className="flex items-end gap-2">
              <div className="w-16">
                <Field label={index === 0 ? 'Order' : undefined}>
                  {({ id }) => (
                    <TextInput
                      id={id}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={String(row.order)}
                      aria-label={`Order of entry ${index + 1}`}
                      onChange={(event) =>
                        update(index, { order: Number(event.target.value) || 1 })
                      }
                    />
                  )}
                </Field>
              </div>
              <div className="flex-1">
                <Field label={index === 0 ? 'English name' : undefined}>
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={row.name}
                      aria-label={`English name of entry ${index + 1}`}
                      onChange={(event) => update(index, { name: event.target.value })}
                    />
                  )}
                </Field>
              </div>
              <div className="flex-1">
                <Field label={index === 0 ? 'Arabic name' : undefined}>
                  {({ id }) => (
                    <TextInput
                      id={id}
                      dir="rtl"
                      value={row.nameAr}
                      aria-label={`Arabic name of entry ${index + 1}`}
                      onChange={(event) => update(index, { nameAr: event.target.value })}
                    />
                  )}
                </Field>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove entry ${index + 1}`}
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))}

          <Button size="sm" variant="secondary" onClick={addRow} className="self-start">
            Add {noun.toLowerCase()}
          </Button>
        </div>

        {removedCount > 0 ? (
          <p
            className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs"
            role="status"
          >
            {removedCount} {removedCount === 1 ? 'entry' : 'entries'} will be retired, not
            deleted. Students and courses already filed under {removedCount === 1 ? 'it' : 'them'}{' '}
            keep their placement, and {removedCount === 1 ? 'it' : 'they'} will stop appearing in
            the picker. Adding the same order back restores it.
          </p>
        ) : null}

        <p className="text-xs text-muted">
          Renaming an entry keeps every student and course already filed under it — entries are
          matched by order, not by name.
        </p>
      </div>
    </Modal>
  );
}
