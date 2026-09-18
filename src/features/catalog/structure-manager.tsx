'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useCatalogTree,
  useCreateDepartment,
  useCreateFaculty,
  useCreateUniversity,
  useDeactivateCatalogEntity,
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
 * Nothing here can be deleted. Students, courses and enrolments all reference
 * these rows, so removing one would orphan real records; deactivating hides it
 * from new selections while every existing reference keeps resolving.
 */
export function StructureManager() {
  const toast = useToast();
  const tree = useCatalogTree();

  const createUniversity = useCreateUniversity();
  const createFaculty = useCreateFaculty();
  const createDepartment = useCreateDepartment();
  const deactivate = useDeactivateCatalogEntity();

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [confirming, setConfirming] = useState<{
    entity: 'universities' | 'faculties' | 'departments';
    id: string;
    label: string;
  } | null>(null);

  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');

  function openDialog(next: DialogState) {
    setName('');
    setNameAr('');
    setDialog(next);
  }

  async function submit() {
    if (!dialog || name.trim().length < 2 || nameAr.trim().length < 2) return;

    try {
      if (dialog.kind === 'university') {
        await createUniversity.mutateAsync({ name: name.trim(), nameAr: nameAr.trim() });
        toast.success('University added');
      } else if (dialog.kind === 'faculty') {
        await createFaculty.mutateAsync({
          universityId: dialog.parentId,
          name: name.trim(),
          nameAr: nameAr.trim(),
        });
        toast.success('College added');
      } else {
        await createDepartment.mutateAsync({
          facultyId: dialog.parentId,
          name: name.trim(),
          nameAr: nameAr.trim(),
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
      toast.success('Deactivated', 'Existing students and courses are unaffected.');
    } catch (error) {
      toast.error(error);
    } finally {
      setConfirming(null);
    }
  }

  const busy =
    createUniversity.isPending || createFaculty.isPending || createDepartment.isPending;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Courses', href: '/courses' }, { label: 'Academic structure' }]}
        title="Academic structure"
        description="Universities, colleges and departments. Academic years are shared across the whole platform and live under Other data."
        actions={
          <Button onClick={() => openDialog({ kind: 'university' })}>Add university</Button>
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
              <Button size="sm" onClick={() => openDialog({ kind: 'university' })}>
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
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      openDialog({ kind: 'faculty', parentId: university.id, parentName: university.name })
                    }
                  >
                    Add college
                  </Button>
                  {university.isActive ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setConfirming({
                          entity: 'universities',
                          id: university.id,
                          label: university.name,
                        })
                      }
                    >
                      Deactivate
                    </Button>
                  ) : null}
                </>
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

                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              openDialog({
                                kind: 'department',
                                parentId: faculty.id,
                                parentName: faculty.name,
                              })
                            }
                          >
                            Add department
                          </Button>
                          {faculty.isActive ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setConfirming({
                                  entity: 'faculties',
                                  id: faculty.id,
                                  label: faculty.name,
                                })
                              }
                            >
                              Deactivate
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {faculty.departments.length > 0 ? (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {faculty.departments.map((department) => (
                            <li key={department.id}>
                              <Badge tone={department.isActive ? 'neutral' : 'warning'}>
                                {department.name}
                              </Badge>
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
        title={
          dialog?.kind === 'university'
            ? 'Add university'
            : dialog?.kind === 'faculty'
              ? `Add college to ${dialog.parentName}`
              : dialog
                ? `Add department to ${dialog.parentName}`
                : ''
        }
        busy={busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Add
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
        title="Deactivate this entry?"
        message={
          <>
            <strong className="text-foreground">{confirming?.label}</strong> will stop being
            offered to students registering and to new courses. Students and courses already
            assigned to it keep working exactly as they do now — this is not a delete, and it can
            be reversed.
          </>
        }
        confirmLabel="Deactivate"
        variant="danger"
        busy={deactivate.isPending}
      />
    </div>
  );
}

type DialogState =
  | { kind: 'university' }
  | { kind: 'faculty'; parentId: string; parentName: string }
  | { kind: 'department'; parentId: string; parentName: string };
