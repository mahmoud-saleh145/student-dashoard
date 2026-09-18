'use client';

import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { Tabs, TabPanel, useTabParam } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import {
  useAcademicYears,
  useCreateAcademicYear,
  useCreateSubject,
  useDeactivateSubject,
  useSubjects,
  useUpdateSubject,
} from '@/features/catalog/hooks';
import { formatNumber } from '@/lib/format';
import type { AcademicYear, Subject } from '@/types/domain';

/**
 * Other data.
 *
 * Two small reference lists that the rest of the platform points at: subjects
 * (a grouping over courses) and academic years (which drive both a student's
 * profile and a course's audience).
 *
 * Neither can be deleted. Academic years in particular are referenced by every
 * student profile and many courses, so the platform has no delete path for
 * them at all — a year that is no longer taught is simply not selected.
 */
export function OtherData() {
  const [tab, setTab] = useTabParam('subjects');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Other data"
        description="Subjects and academic years. Universities, colleges and departments are managed under Courses → Academic structure."
      />

      <Tabs
        tabs={[
          { id: 'subjects', label: 'Subjects' },
          { id: 'years', label: 'Academic years' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <TabPanel id="subjects" active={tab}>
        <SubjectsPanel />
      </TabPanel>

      <TabPanel id="years" active={tab}>
        <AcademicYearsPanel />
      </TabPanel>
    </div>
  );
}

function SubjectsPanel() {
  const toast = useToast();
  const subjects = useSubjects(true);
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deactivateSubject = useDeactivateSubject();

  const [editing, setEditing] = useState<Subject | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<Subject | null>(null);
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');

  function openCreate() {
    setName('');
    setNameAr('');
    setCreating(true);
  }

  function openEdit(subject: Subject) {
    setName(subject.name);
    setNameAr(subject.nameAr);
    setEditing(subject);
  }

  async function submit() {
    if (name.trim().length < 2 || nameAr.trim().length < 2) return;

    try {
      if (editing) {
        await updateSubject.mutateAsync({
          id: editing.id,
          name: name.trim(),
          nameAr: nameAr.trim(),
        });
        toast.success('Subject updated');
        setEditing(null);
      } else {
        await createSubject.mutateAsync({ name: name.trim(), nameAr: nameAr.trim() });
        toast.success('Subject added');
        setCreating(false);
      }
    } catch (error) {
      toast.error(error);
    }
  }

  async function confirmDeactivate() {
    if (!confirming) return;

    try {
      await deactivateSubject.mutateAsync({ id: confirming.id });
      toast.success('Subject deactivated', 'Courses keep their subject and can be regrouped.');
    } catch (error) {
      toast.error(error);
    } finally {
      setConfirming(null);
    }
  }

  const columns: Column<Subject>[] = [
    {
      key: 'name',
      header: 'Subject',
      render: (subject) => (
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 font-medium text-foreground">
            {subject.name}
            {!subject.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
          </span>
          <span className="truncate text-xs text-muted" dir="rtl">
            {subject.nameAr}
          </span>
        </div>
      ),
    },
    {
      key: 'courseCount',
      header: 'Courses',
      align: 'end',
      render: (subject) => (
        <span className="tabular-nums">{formatNumber(subject.courseCount)}</span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      render: (subject) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => openEdit(subject)}>
            Edit
          </Button>
          {subject.isActive ? (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(subject)}>
              Deactivate
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const busy = createSubject.isPending || updateSubject.isPending;

  return (
    <>
      <DataTable
        columns={columns}
        rows={subjects.data ?? []}
        rowKey={(subject) => subject.id}
        isLoading={subjects.isLoading}
        error={subjects.error}
        onRetry={() => void subjects.refetch()}
        caption="Subjects"
        emptyTitle="No subjects yet"
        emptyDescription="Subjects group courses in the catalogue. They grant nothing and gate nothing."
        emptyAction={
          <Button size="sm" onClick={openCreate}>
            Add subject
          </Button>
        }
        toolbar={
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreate}>
              Add subject
            </Button>
          </div>
        }
      />

      <Modal
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? 'Edit subject' : 'Add subject'}
        busy={busy}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              {editing ? 'Save' : 'Add'}
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

          <Field label="Arabic name" required>
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
        title="Deactivate this subject?"
        message={
          <>
            <strong className="text-foreground">{confirming?.name}</strong> stops being offered
            when categorising a course. The{' '}
            {formatNumber(confirming?.courseCount ?? 0)} course
            {confirming?.courseCount === 1 ? '' : 's'} already using it keep it, and reactivating
            restores the grouping exactly.
          </>
        }
        confirmLabel="Deactivate"
        busy={deactivateSubject.isPending}
      />
    </>
  );
}

function AcademicYearsPanel() {
  const toast = useToast();
  const years = useAcademicYears();
  const createYear = useCreateAcademicYear();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [order, setOrder] = useState('');

  async function submit() {
    const parsedOrder = Number(order);
    if (name.trim().length < 2 || nameAr.trim().length < 2 || !Number.isInteger(parsedOrder)) {
      return;
    }

    try {
      await createYear.mutateAsync({
        order: parsedOrder,
        name: name.trim(),
        nameAr: nameAr.trim(),
      });
      toast.success('Academic year added');
      setName('');
      setNameAr('');
      setOrder('');
      setCreating(false);
    } catch (error) {
      toast.error(error);
    }
  }

  const columns: Column<AcademicYear>[] = [
    {
      key: 'order',
      header: 'Order',
      align: 'end',
      className: 'w-20',
      render: (year) => <span className="tabular-nums text-muted">{year.order}</span>,
    },
    {
      key: 'name',
      header: 'Academic year',
      render: (year) => (
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 font-medium text-foreground">
            {year.name}
            {!year.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
          </span>
          <span className="truncate text-xs text-muted" dir="rtl">
            {year.nameAr}
          </span>
        </div>
      ),
    },
    {
      key: 'students',
      header: 'Students',
      align: 'end',
      render: (year) => (
        <span className="tabular-nums text-muted">
          {year.studentCount === undefined ? '—' : formatNumber(year.studentCount)}
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={years.data ?? []}
        rowKey={(year) => year.id}
        isLoading={years.isLoading}
        error={years.error}
        onRetry={() => void years.refetch()}
        caption="Academic years"
        emptyTitle="No academic years yet"
        emptyDescription="Students choose a year when they register, and courses are targeted at one."
        emptyAction={
          <Button size="sm" onClick={() => setCreating(true)}>
            Add academic year
          </Button>
        }
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Academic years are shared platform-wide and are never deleted — every student
              profile and many courses reference them.
            </p>
            <Button size="sm" onClick={() => setCreating(true)}>
              Add academic year
            </Button>
          </div>
        }
      />

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Add academic year"
        busy={createYear.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={createYear.isPending}>
              Add
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field
            label="Order"
            required
            hint="1 is the first year. The order decides how years are sorted everywhere."
          >
            {({ id }) => (
              <TextInput
                id={id}
                type="number"
                min={1}
                inputMode="numeric"
                value={order}
                onChange={(event) => setOrder(event.target.value)}
                autoFocus
              />
            )}
          </Field>

          <Field label="English name" required>
            {({ id }) => (
              <TextInput
                id={id}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Second year"
              />
            )}
          </Field>

          <Field label="Arabic name" required>
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
    </>
  );
}
