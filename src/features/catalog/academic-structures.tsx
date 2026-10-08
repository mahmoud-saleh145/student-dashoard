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
  useCatalogTree,
  useCreateAcademicStructure,
  useReplaceStructureEntries,
  useSetStructureFaculties,
  useUniversities,
  useUpdateAcademicStructure,
} from '@/features/catalog/hooks';
import type {
  AcademicStructure,
  AcademicStructureFacultyOverride,
  AcademicStructureKind,
} from '@/types/domain';

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

/**
 * Names a structure's DEFAULT owner for a reader, rather than showing its
 * scopeKey.
 *
 * "Default" is the operative word: ownership decides who inherits this ladder,
 * and an explicit college pin (see `overrideSummary`) overrides that. Keeping
 * the two phrased differently is what stops an administrator reading the owner
 * line as the complete answer.
 */
function ownerLabel(structure: AcademicStructure): string {
  if (structure.department) return `Department · ${structure.department.name}`;
  if (structure.faculty) return `College · ${structure.faculty.name}`;
  if (structure.university) return `University · ${structure.university.name}`;
  return 'All universities (platform-wide)';
}

/** The owner in one word, for the chip beside the title. */
function scopeBadge(structure: AcademicStructure) {
  const global = !structure.university && !structure.faculty && !structure.department;
  return (
    <Badge tone={global ? 'success' : 'neutral'}>{global ? 'Global' : 'Scoped'}</Badge>
  );
}

/**
 * The pinned colleges, never undefined.
 *
 * The API may predate the field — the dashboard and the API deploy
 * independently — so every read goes through here rather than risking
 * `undefined.length` on a page an administrator cannot then open at all.
 */
function overridesOf(structure: AcademicStructure): AcademicStructureFacultyOverride[] {
  return structure.facultyOverrides ?? [];
}

/** "Faculty of Science · Cairo University", disambiguating same-named colleges. */
function facultyLabel(entry: AcademicStructureFacultyOverride): string {
  const university = entry.faculty.university?.name;
  return university ? `${entry.faculty.name} · ${university}` : entry.faculty.name;
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
  const [assigning, setAssigning] = useState<AcademicStructure | null>(null);

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
          Each structure is one ladder of years or levels. A structure is either global (every
          university inherits it) or scoped to one university. Colleges follow their own
          university&rsquo;s structure by default — unless you pin them to a different one, which
          then wins. A pinned college may belong to any university. The number of entries and
          their names are yours to set; there is no fixed four.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          Add structure
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
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
                className="rounded-lg border border-border bg-surface p-4"
                data-testid={`structure-${structure.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {scopeBadge(structure)}
                    {kindBadge(structure.kind)}
                    <span className="text-sm font-medium">{ownerLabel(structure)}</span>
                    {structure.isActive ? null : <Badge tone="warning">Inactive</Badge>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setAssigning(structure)}>
                      Assign colleges
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(structure)}>
                      Edit entries
                    </Button>
                  </div>
                </div>

                <p className="mt-2 text-xs text-muted">
                  <span className="font-medium">Used by default by:</span>{' '}
                  {structure.university || structure.faculty || structure.department
                    ? `${ownerLabel(structure)} and anything under it without its own`
                    : 'every university without its own structure'}
                </p>

                <p className="mt-1 text-xs text-muted">
                  {active.length} {structure.kind === 'LEVEL' ? 'level' : 'year'}
                  {active.length === 1 ? '' : 's'}
                  {retired.length > 0 ? ` · ${retired.length} retired` : ''}
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {active.map((entry) => (
                    <span
                      key={entry.id}
                      className="rounded-md border border-border px-2 py-0.5 text-xs tabular-nums"
                    >
                      {entry.order}. {entry.name}
                    </span>
                  ))}
                  {retired.map((entry) => (
                    <span
                      key={entry.id}
                      className="rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-subtle line-through"
                      title="Retired — still referenced by existing students and courses"
                    >
                      {entry.order}. {entry.name}
                    </span>
                  ))}
                </div>

                {/* The second half of the answer: who has been pulled OFF their
                    own university's ladder and onto this one. Shown on the card
                    rather than behind the dialog, because an override is
                    invisible from the owning university's side. */}
                <div className="mt-3 border-t border-border pt-2">
                  <p className="text-xs font-medium text-muted">
                    Colleges pinned to this structure{' '}
                    <span className="font-normal">(overrides their university&rsquo;s)</span>
                  </p>
                  {overridesOf(structure).length === 0 ? (
                    <p className="mt-1 text-xs text-subtle">
                      None — no college overrides its university for this structure.
                    </p>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {overridesOf(structure).map((entry) => {
                        // A pin reaching into another university is the case
                        // most worth flagging, because it is the one an admin
                        // would otherwise have to deduce.
                        const foreign =
                          structure.universityId != null &&
                          entry.faculty.universityId !== structure.universityId;
                        return (
                          <span
                            key={entry.facultyId}
                            className="rounded-md border border-border bg-surface-alt px-2 py-0.5 text-xs"
                            title={
                              foreign
                                ? 'This college belongs to a different university than the one that owns this structure'
                                : undefined
                            }
                          >
                            {facultyLabel(entry)}
                            {foreign ? ' ·  other university' : ''}
                          </span>
                        );
                      })}
                    </div>
                  )}
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

      {assigning ? (
        <AssignFacultiesDialog
          structure={assigning}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null);
            toast.success('Colleges updated');
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Creating a structure.
 *
 * The level is a two-way choice — global, or one university — rather than the
 * three cascading selects this dialog used to carry. Narrowing it is the point:
 * a per-college or per-department ladder is now expressed by PINNING colleges
 * to a structure (see `AssignFacultiesDialog`), which is strictly more capable
 * because the pin can reach across universities and cover many colleges at
 * once. The server still accepts a faculty- or department-owned structure, so
 * any that already exist keep working and keep rendering in the list above;
 * this dialog simply stops creating new ones.
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
  const [level, setLevel] = useState<'platform' | 'university'>('platform');
  const [universityId, setUniversityId] = useState('');

  const universities = useUniversities();

  async function submit() {
    if (level === 'university' && !universityId) {
      toast.error('Choose a university, or make the structure global');
      return;
    }
    try {
      await create.mutateAsync({
        kind,
        ...(level === 'university' ? { universityId } : {}),
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
          label="Level"
          required
          hint="You can pin individual colleges to this structure afterwards, including colleges from other universities."
        >
          {() => (
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-2 rounded-md border border-border p-2.5 text-xs">
                <input
                  type="radio"
                  name="structure-level"
                  className="mt-0.5"
                  checked={level === 'platform'}
                  onChange={() => {
                    setLevel('platform');
                    setUniversityId('');
                  }}
                />
                <span>
                  <span className="block text-sm font-medium">All universities</span>
                  <span className="text-muted">
                    Global. Every university without its own structure uses this one.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2 rounded-md border border-border p-2.5 text-xs">
                <input
                  type="radio"
                  name="structure-level"
                  className="mt-0.5"
                  checked={level === 'university'}
                  onChange={() => setLevel('university')}
                />
                <span>
                  <span className="block text-sm font-medium">One university</span>
                  <span className="text-muted">
                    Only that university and its colleges use it.
                  </span>
                </span>
              </label>

              {level === 'university' ? (
                <Select
                  aria-label="University"
                  value={universityId}
                  placeholder="Choose a university…"
                  options={(universities.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
                  onChange={(event) => setUniversityId(event.target.value)}
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
 * Pinning colleges to a structure.
 *
 * The list is grouped by university and covers EVERY university, not just the
 * one that owns the structure — pinning University A's college to University
 * B's ladder is the reason this dialog exists, so restricting the list would
 * quietly remove the feature.
 *
 * A college already pinned to another ladder is shown as such and can be taken
 * from it in one click. The server moves the row rather than refusing, because
 * a college can only have one ladder and refusing would just mean a detour via
 * the other structure's dialog.
 */
function AssignFacultiesDialog({
  structure,
  onClose,
  onDone,
}: {
  structure: AcademicStructure;
  onClose: () => void;
  onDone: () => void;
}) {
  const tree = useCatalogTree();
  const structures = useAcademicStructures();
  const save = useSetStructureFaculties();
  const toast = useToast();

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(overridesOf(structure).map((o) => o.facultyId)),
  );
  const [search, setSearch] = useState('');

  /**
   * Which OTHER structure currently holds each college, so the dialog can warn
   * before a pin is taken away from somewhere else.
   */
  const heldElsewhere = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of structures.data ?? []) {
      if (row.id === structure.id) continue;
      for (const override of overridesOf(row)) {
        map.set(override.facultyId, ownerLabel(row));
      }
    }
    return map;
  }, [structures.data, structure.id]);

  const universities = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (tree.data?.universities ?? [])
      .map((university) => ({
        id: university.id,
        name: university.name,
        faculties: (university.faculties ?? []).filter(
          (faculty) =>
            needle === '' ||
            faculty.name.toLowerCase().includes(needle) ||
            university.name.toLowerCase().includes(needle),
        ),
      }))
      .filter((university) => university.faculties.length > 0);
  }, [tree.data, search]);

  function toggle(facultyId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(facultyId)) next.delete(facultyId);
      else next.add(facultyId);
      return next;
    });
  }

  async function submit() {
    try {
      await save.mutateAsync({ id: structure.id, facultyIds: [...selected] });
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the colleges');
    }
  }

  const movedCount = [...selected].filter((id) => heldElsewhere.has(id)).length;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Colleges — ${ownerLabel(structure)}`}
      busy={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          A college ticked here uses this structure instead of the one it would inherit from its
          own university, and so do its departments. Leave a college unticked and it keeps
          following its university.
        </p>

        <Field label="Find a college">
          {({ id }) => (
            <TextInput
              id={id}
              value={search}
              placeholder="Search colleges or universities…"
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
        </Field>

        {tree.isLoading ? (
          <CardsSkeleton count={2} />
        ) : universities.length === 0 ? (
          <p className="text-xs text-muted">No colleges match.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            {universities.map((university) => (
              <div key={university.id} className="border-b border-border last:border-0">
                <p className="bg-surface-alt px-3 py-1.5 text-xs font-semibold">
                  {university.name}
                  {structure.universityId === university.id ? (
                    <span className="ml-1.5 font-normal text-muted">· owns this structure</span>
                  ) : null}
                </p>
                <ul>
                  {university.faculties.map((faculty) => {
                    const held = heldElsewhere.get(faculty.id);
                    const checked = selected.has(faculty.id);
                    return (
                      <li key={faculty.id}>
                        <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-xs hover:bg-surface-alt">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={() => toggle(faculty.id)}
                          />
                          <span className="min-w-0">
                            <span className="block">{faculty.name}</span>
                            {held ? (
                              <span className="text-warning">
                                Currently pinned to {held}
                                {checked ? ' — will move here' : ''}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted">
          {selected.size} college{selected.size === 1 ? '' : 's'} pinned
          {movedCount > 0
            ? ` · ${movedCount} will be moved off another structure`
            : ''}
        </p>
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
