'use client';

import { useMemo, useState } from 'react';

import { ActionMenu } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  CollegeAcademicSystemBadge,
  UniversityAcademicSystemField,
  academicSystemFullLabel,
} from '@/features/catalog/academic-system-control';
import {
  useAcademicSystemOverview,
  useCatalogDependents,
  useCatalogTree,
  useCreateDepartment,
  useCreateFaculty,
  useCreateUniversity,
  useDeactivateCatalogEntity,
  useReactivateCatalogEntity,
  useUpdateDepartment,
  useUpdateFaculty,
  useUpdateUniversity,
  type CatalogEntity,
} from '@/features/catalog/hooks';
import { formatNumber } from '@/lib/format';
import type { AcademicStructureKind, AcademicSystemOverviewFaculty } from '@/types/domain';

/**
 * The academic structure.
 *
 * The platform's hierarchy is **University → College → Department**, with
 * academic years kept as a single platform-wide list that both courses and
 * students point at (managed under Other data). "College" is the backend's
 * `Faculty`; the name differs, the shape does not.
 *
 * Nothing here is ever hard-deleted. Students, courses and enrolments all
 * reference these rows, so removing one would orphan real records.
 * Deactivating hides it from new selections while every existing reference
 * keeps resolving — and because that is reversible, the menu offers the way
 * back rather than making deactivation a one-way door.
 *
 * The confirmation quotes what else points at the row. "Deactivate this
 * university" is not a self-explanatory action when three colleges and two
 * hundred students are filed under it.
 */
export function StructureManager() {
  const toast = useToast();
  const tree = useCatalogTree();
  /**
   * The system configuration, joined onto the tree by id.
   *
   * The tree endpoint returns names and counts; the system endpoint returns the
   * defaults and overrides. Joining them here keeps one render source of truth
   * per row rather than making the tree endpoint carry academic configuration it
   * has no reason to know about.
   */
  const systems = useAcademicSystemOverview();
  const facultySystems = useMemo(() => {
    const map = new Map<string, AcademicSystemOverviewFaculty>();
    for (const faculty of systems.data?.faculties ?? []) map.set(faculty.id, faculty);
    return map;
  }, [systems.data]);

  const createUniversity = useCreateUniversity();
  const createFaculty = useCreateFaculty();
  const createDepartment = useCreateDepartment();
  const updateUniversity = useUpdateUniversity();
  const updateFaculty = useUpdateFaculty();
  const updateDepartment = useUpdateDepartment();
  const deactivate = useDeactivateCatalogEntity();
  const reactivate = useReactivateCatalogEntity();

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [studyType, setStudyType] = useState<'GENERAL' | 'PROGRAMS'>('GENERAL');
  const [universitySystem, setUniversitySystem] = useState<AcademicStructureKind>('YEAR');

  /**
   * Validation errors, shown on the field rather than only in a toast.
   *
   * A toast disappears after a few seconds and leaves the form looking
   * untouched, which is how a too-short name used to fail with no visible
   * consequence at all: `submit` returned early and nothing said why.
   */
  const [errors, setErrors] = useState<{ name?: string; nameAr?: string }>({});

  // Read only while a confirmation is open, and never cached: a stale count
  // is worse than a brief spinner on a dialog that is about to change things.
  const dependents = useCatalogDependents(
    confirming?.entity ?? 'university',
    confirming?.id ?? null,
  );

  function openCreate(next: Extract<DialogState, { mode: 'create' }>) {
    setName('');
    setNameAr('');
    setErrors({});
    // A new university starts on years, which is also the column default, so the
    // form and the API agree on the initial state rather than the form implying
    // a choice the row has not made.
    setUniversitySystem('YEAR');
    setDialog(next);
  }

  function openEdit(next: Extract<DialogState, { mode: 'edit' }>) {
    // Pre-filled, and freely editable — the point of Edit is to replace what
    // is there, not to append to it.
    setName(next.name);
    setNameAr(next.nameAr);
    setErrors({});
    /*
      Only pre-fill when the row actually carries a system. `catalog/tree` is a
      separate endpoint from the system configuration and may not have it yet;
      falling back to the previous value would then silently save a different
      system than the row holds, so an unknown stays unknown and the control
      keeps whatever it had.
    */
    if (next.kind === 'university' && next.defaultAcademicSystem) {
      setUniversitySystem(next.defaultAcademicSystem);
    }
    setDialog(next);
  }

  async function submit() {
    if (!dialog) return;

    // Surface every problem at once rather than bailing on the first, so a form
    // with two blank names takes one round trip to fix rather than two.
    const nextErrors: { name?: string; nameAr?: string } = {};
    if (name.trim().length < 2) nextErrors.name = 'Enter at least 2 characters.';
    if (nameAr.trim().length < 2) nextErrors.nameAr = 'Enter at least 2 Arabic characters.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload = { name: name.trim(), nameAr: nameAr.trim() };

    try {
      if (dialog.mode === 'edit') {
        if (dialog.kind === 'university') {
          await updateUniversity.mutateAsync({
            id: dialog.id,
            ...payload,
            defaultAcademicSystem: universitySystem,
          });
          toast.success(
            'Saved',
            universitySystemChanged(dialog.defaultAcademicSystem, universitySystem)
              ? 'The default academic system changed. Colleges that inherit now follow it; colleges with an override keep theirs.'
              : `Renamed to ${payload.name}.`,
          );
        } else if (dialog.kind === 'faculty') {
          await updateFaculty.mutateAsync({ id: dialog.id, ...payload });
          toast.success('Saved', `Renamed to ${payload.name}.`);
        } else {
          await updateDepartment.mutateAsync({ id: dialog.id, ...payload });
          toast.success('Saved', `Renamed to ${payload.name}.`);
        }
      } else if (dialog.kind === 'university') {
        await createUniversity.mutateAsync({
          ...payload,
          defaultAcademicSystem: universitySystem,
        });
        toast.success('University added');
      } else if (dialog.kind === 'faculty') {
        await createFaculty.mutateAsync({ universityId: dialog.parentId, ...payload });
        toast.success('College added');
      } else {
        await createDepartment.mutateAsync({
          facultyId: dialog.parentId,
          studyType,
          ...payload,
        });
        toast.success('Department added');
      }

      setDialog(null);
    } catch (error) {
      toast.error(error);
    }
  }

  async function confirmDeactivate() {
    if (!confirming) return;

    try {
      await deactivate.mutateAsync({ entity: confirming.entity, id: confirming.id });
      toast.success(
        `${confirming.label} deactivated`,
        'It is hidden from new selections. Existing students and courses are unaffected.',
      );
    } catch (error) {
      toast.error(error, 'It could not be deactivated');
    } finally {
      setConfirming(null);
    }
  }

  async function restore(entity: CatalogEntity, id: string, label: string) {
    try {
      await reactivate.mutateAsync({ entity, id });
      toast.success(`${label} reactivated`, 'It can be selected again.');
    } catch (error) {
      toast.error(error, 'It could not be reactivated');
    }
  }

  /** The menu every row gets, assembled from what that row supports. */
  function menuFor(
    entity: CatalogEntity,
    row: {
      id: string;
      name: string;
      nameAr: string;
      isActive: boolean;
      defaultAcademicSystem?: AcademicStructureKind;
    },
    addChild?: { label: string; onSelect: () => void },
  ) {
    return [
      ...(addChild ? [addChild] : []),
      {
        label: entity === 'university' ? 'Edit name and system' : 'Edit',
        onSelect: () =>
          openEdit({
            mode: 'edit',
            kind: entity as 'university' | 'faculty' | 'department',
            id: row.id,
            name: row.name,
            nameAr: row.nameAr,
            defaultAcademicSystem: row.defaultAcademicSystem,
          }),
      },
      row.isActive
        ? {
            // "Deactivate", not "Delete". Nothing is removed: the row is
            // flagged inactive so it stops being offered, and every student
            // profile, course and code that references it is untouched. The
            // confirmation dialog has always said "Deactivate"; the menu
            // promising something harsher was the part that was wrong.
            label: 'Deactivate',
            danger: true,
            onSelect: () => setConfirming({ entity, id: row.id, label: row.name }),
          }
        : {
            label: 'Reactivate',
            // Idempotent on the server, but a double click still fires two
            // requests and two toasts.
            disabled: reactivate.isPending,
            onSelect: () => void restore(entity, row.id, row.name),
          },
    ];
  }

  const busy =
    createUniversity.isPending ||
    createFaculty.isPending ||
    createDepartment.isPending ||
    updateUniversity.isPending ||
    updateFaculty.isPending ||
    updateDepartment.isPending;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Courses', href: '/courses' }, { label: 'Academic structure' }]}
        title="Academic structure"
        description="Universities, colleges and departments. Each university has a default academic system that its colleges follow unless one overrides it; the years or levels themselves are managed under Other data."
        actions={
          <Button onClick={() => openCreate({ mode: 'create', kind: 'university' })}>
            Add university
          </Button>
        }
      />

      {tree.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : tree.isError ? (
        <Card>
          <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />
        </Card>
      ) : (tree.data?.universities.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            title="No universities yet"
            description="Add a university, then its colleges and departments. Students choose from this structure when they register."
            action={
              <Button
                size="sm"
                onClick={() => openCreate({ mode: 'create', kind: 'university' })}
              >
                Add university
              </Button>
            }
          />
        </Card>
      ) : (
        tree.data?.universities.map((university) => {
          const universityDefaultSystem = systems.data?.universities.find(
            (u) => u.id === university.id,
          )?.defaultAcademicSystem;

          return (
            <Card key={university.id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {university.name}
                    {!university.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                    {/*
                    The university's own default, stated on the university. A
                    reader scanning the page needs to know what every college below
                    is inheriting without opening anything.
                  */}
                    {universityDefaultSystem ? (
                      <>
                        <Badge tone="neutral">
                          Default: {academicSystemFullLabel(universityDefaultSystem)}
                        </Badge>
                        {/*
                        `Badge` renders a <span> with no title support, so the
                        explanation is an sr-only sibling rather than a tooltip —
                        which also means a screen reader gets it.
                      */}
                        <span className="sr-only">
                          The academic system this university&rsquo;s colleges inherit unless
                          one overrides it.
                        </span>
                      </>
                    ) : null}
                  </span>
                }
                description={university.nameAr}
                actions={
                  <ActionMenu
                    label={`Actions for ${university.name}`}
                    items={menuFor(
                      'university',
                      {
                        ...university,
                        defaultAcademicSystem: universityDefaultSystem,
                      },
                      {
                        label: 'Add college',
                        onSelect: () =>
                          openCreate({
                            mode: 'create',
                            kind: 'faculty',
                            parentId: university.id,
                            parentName: university.name,
                          }),
                      },
                    )}
                  />
                }
              />

              <CardBody>
                {university.faculties.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted">
                    No colleges in this university yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {university.faculties.map((faculty) => {
                      const facultySystem = facultySystems.get(faculty.id);

                      return (
                        <li key={faculty.id} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                                {faculty.name}
                                {!faculty.isActive ? (
                                  <Badge tone="neutral">Inactive</Badge>
                                ) : null}
                                {/*
                              The college's effective system, with its source. This
                              is the row that answers "will changing the
                              university affect this college?", which is the
                              question an administrator actually has when looking
                              at a tree.
                            */}
                                {facultySystem ? (
                                  <CollegeAcademicSystemBadge
                                    system={facultySystem.effectiveAcademicSystem}
                                    inherited={facultySystem.inherited}
                                    redundantOverride={facultySystem.redundantOverride}
                                  />
                                ) : null}
                              </p>
                              <p className="text-xs text-muted">
                                {formatNumber(faculty.departments.length)} department
                                {faculty.departments.length === 1 ? '' : 's'}
                                {facultySystem?.inherited && universityDefaultSystem
                                  ? ` · follows the university's ${academicSystemFullLabel(
                                      universityDefaultSystem,
                                    )}`
                                  : facultySystem
                                    ? ' · set on this college'
                                    : null}
                              </p>
                            </div>

                            <ActionMenu
                              label={`Actions for ${faculty.name}`}
                              items={menuFor('faculty', faculty, {
                                label: 'Add department',
                                onSelect: () =>
                                  openCreate({
                                    mode: 'create',
                                    kind: 'department',
                                    parentId: faculty.id,
                                    parentName: faculty.name,
                                  }),
                              })}
                            />
                          </div>

                          {faculty.departments.length > 0 ? (
                            <ul className="mt-2 flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
                              {faculty.departments.map((department) => (
                                <li
                                  key={department.id}
                                  className="flex items-center justify-between gap-2 px-3 py-1.5"
                                >
                                  <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                                    <span className="truncate">{department.name}</span>
                                    {/*
                                  "General" / "Programs" is descriptive metadata —
                                  what kind of unit this is, used by course
                                  targeting. It is deliberately NOT what decides
                                  whether the department counts in years or levels:
                                  that comes from its college, one level up.
                                */}
                                    <Badge tone="neutral">
                                      {department.studyType === 'PROGRAMS'
                                        ? 'Program'
                                        : 'Department'}
                                    </Badge>
                                    {!department.isActive ? (
                                      <Badge tone="neutral">Inactive</Badge>
                                    ) : null}
                                  </span>

                                  {/*
                                Departments were a bare <Badge> with no actions
                                at all, so a typo in one was uncorrectable.
                              */}
                                  <ActionMenu
                                    label={`Actions for ${department.name}`}
                                    items={menuFor('department', department)}
                                  />
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          );
        })
      )}

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialogTitle(dialog)}
        busy={busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              {dialog?.mode === 'edit' ? 'Save' : 'Add'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {/*
            The university's default system, offered on create and on edit.

            On edit it is the only place an administrator changes it, and the
            hint explains the consequence because it is not obvious: it moves
            every college that has not overridden.
          */}
          {dialog?.kind === 'university' ? (
            <UniversityAcademicSystemField
              value={universitySystem}
              onChange={setUniversitySystem}
              disabled={busy}
            />
          ) : null}

          {dialog?.kind === 'department' && dialog.mode === 'create' ? (
            <Field
              label="Kind"
              hint="Describes what this unit is, and is used when offering courses to it. It does not decide whether the college counts in years or levels — that is set on the college."
            >
              {({ id }) => (
                <Select
                  id={id}
                  value={studyType}
                  onChange={(event) =>
                    setStudyType(event.target.value as 'GENERAL' | 'PROGRAMS')
                  }
                  options={[
                    { value: 'GENERAL', label: 'Department' },
                    { value: 'PROGRAMS', label: 'Program' },
                  ]}
                />
              )}
            </Field>
          ) : null}

          <Field label="English name" required error={errors.name}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            )}
          </Field>

          <Field
            label="Arabic name"
            required
            hint="Both names are stored, so the mobile app can show either language."
            error={errors.nameAr}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                dir="rtl"
                aria-describedby={describedBy}
                invalid={invalid}
                value={nameAr}
                onChange={(event) => setNameAr(event.target.value)}
              />
            )}
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={confirmDeactivate}
        title={`Deactivate ${confirming?.label ?? 'this entry'}?`}
        message={
          <>
            <strong className="text-foreground">{confirming?.label}</strong> will stop being
            offered to students registering and to new courses.{' '}
            {dependents.isLoading ? (
              <>Checking what else points at it…</>
            ) : dependents.data ? (
              <>
                {describeDependents(confirming?.entity, dependents.data)} They keep working
                exactly as they do now.
              </>
            ) : null}{' '}
            This is not a delete, and it can be reversed from the same menu.
          </>
        }
        confirmLabel="Deactivate"
        variant="danger"
        busy={deactivate.isPending}
      />
    </div>
  );
}

function dialogTitle(dialog: DialogState | null): string {
  if (!dialog) return '';

  if (dialog.mode === 'edit') {
    // A university's dialog is not only a rename any more, so it says what it
    // actually does. "Rename university" above a field that also switches the
    // college-wide academic system would be misleading.
    if (dialog.kind === 'university') return 'Edit university';
    const noun = dialog.kind === 'faculty' ? 'college' : 'department';
    return `Rename ${noun}`;
  }

  if (dialog.kind === 'university') return 'Add university';
  if (dialog.kind === 'faculty') return `Add college to ${dialog.parentName}`;
  return `Add department to ${dialog.parentName}`;
}

/** Says what is attached, in words rather than as a pair of raw numbers. */
function describeDependents(
  entity: CatalogEntity | undefined,
  counts: { children: number; students: number },
): string {
  const childNoun =
    entity === 'university' ? 'college' : entity === 'faculty' ? 'department' : '';

  const parts: string[] = [];

  if (childNoun && counts.children > 0) {
    parts.push(`${counts.children} ${childNoun}${counts.children === 1 ? '' : 's'}`);
  }
  if (counts.students > 0) {
    parts.push(`${counts.students} student${counts.students === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) return 'Nothing else points at it.';
  return `${parts.join(' and ')} currently point at it.`;
}

interface Confirming {
  entity: CatalogEntity;
  id: string;
  label: string;
}

type DialogState =
  | { mode: 'create'; kind: 'university' }
  | { mode: 'create'; kind: 'faculty'; parentId: string; parentName: string }
  | { mode: 'create'; kind: 'department'; parentId: string; parentName: string }
  | {
      mode: 'edit';
      kind: 'university' | 'faculty' | 'department';
      id: string;
      name: string;
      nameAr: string;
      /**
       * Only meaningful for a university, and only here so the edit form can
       * pre-fill the control. A college's system is edited on the Academic
       * systems screen, not by renaming the college.
       */
      defaultAcademicSystem?: AcademicStructureKind;
    };

/**
 * Whether the university's default actually moved.
 *
 * Only changes the confirmation copy when the value really differs, so a rename
 * that happens to resubmit the same system does not claim the system changed.
 */
function universitySystemChanged(
  before: AcademicStructureKind | undefined,
  after: AcademicStructureKind,
): boolean {
  return before !== undefined && before !== after;
}
