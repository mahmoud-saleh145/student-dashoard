'use client';

import { useState } from 'react';

import { ActionMenu } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
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

  // Read only while a confirmation is open, and never cached: a stale count
  // is worse than a brief spinner on a dialog that is about to change things.
  const dependents = useCatalogDependents(
    confirming?.entity ?? 'university',
    confirming?.id ?? null,
  );

  function openCreate(next: Extract<DialogState, { mode: 'create' }>) {
    setName('');
    setNameAr('');
    setDialog(next);
  }

  function openEdit(next: Extract<DialogState, { mode: 'edit' }>) {
    // Pre-filled, and freely editable — the point of Edit is to replace what
    // is there, not to append to it.
    setName(next.name);
    setNameAr(next.nameAr);
    setDialog(next);
  }

  async function submit() {
    if (!dialog || name.trim().length < 2 || nameAr.trim().length < 2) return;

    const payload = { name: name.trim(), nameAr: nameAr.trim() };

    try {
      if (dialog.mode === 'edit') {
        if (dialog.kind === 'university') {
          await updateUniversity.mutateAsync({ id: dialog.id, ...payload });
        } else if (dialog.kind === 'faculty') {
          await updateFaculty.mutateAsync({ id: dialog.id, ...payload });
        } else {
          await updateDepartment.mutateAsync({ id: dialog.id, ...payload });
        }
        toast.success('Saved', `Renamed to ${payload.name}.`);
      } else if (dialog.kind === 'university') {
        await createUniversity.mutateAsync(payload);
        toast.success('University added');
      } else if (dialog.kind === 'faculty') {
        await createFaculty.mutateAsync({ universityId: dialog.parentId, ...payload });
        toast.success('College added');
      } else {
        await createDepartment.mutateAsync({ facultyId: dialog.parentId, ...payload });
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
    row: { id: string; name: string; nameAr: string; isActive: boolean },
    addChild?: { label: string; onSelect: () => void },
  ) {
    return [
      ...(addChild ? [addChild] : []),
      {
        label: 'Edit',
        onSelect: () =>
          openEdit({
            mode: 'edit',
            kind: entity as 'university' | 'faculty' | 'department',
            id: row.id,
            name: row.name,
            nameAr: row.nameAr,
          }),
      },
      row.isActive
        ? {
            label: 'Delete',
            danger: true,
            onSelect: () =>
              setConfirming({ entity, id: row.id, label: row.name }),
          }
        : {
            label: 'Reactivate',
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
        description="Universities, colleges and departments. Academic years are shared across the whole platform and live under Other data."
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
              <Button size="sm" onClick={() => openCreate({ mode: 'create', kind: 'university' })}>
                Add university
              </Button>
            }
          />
        </Card>
      ) : (
        tree.data?.universities.map((university) => (
          <Card key={university.id}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {university.name}
                  {!university.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                </span>
              }
              description={university.nameAr}
              actions={
                <ActionMenu
                  label={`Actions for ${university.name}`}
                  items={menuFor('university', university, {
                    label: 'Add college',
                    onSelect: () =>
                      openCreate({
                        mode: 'create',
                        kind: 'faculty',
                        parentId: university.id,
                        parentName: university.name,
                      }),
                  })}
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
                  {university.faculties.map((faculty) => (
                    <li key={faculty.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                            {faculty.name}
                            {!faculty.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                          </p>
                          <p className="text-xs text-muted">
                            {formatNumber(faculty.departments.length)} department
                            {faculty.departments.length === 1 ? '' : 's'}
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
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        ))
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
          <Field label="English name" required>
            {({ id }) => (
              <TextInput
                id={id}
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
          >
            {({ id }) => (
              <TextInput
                id={id}
                dir="rtl"
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
    const noun =
      dialog.kind === 'university' ? 'university' : dialog.kind === 'faculty' ? 'college' : 'department';
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
    };
