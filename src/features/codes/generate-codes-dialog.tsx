'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useGenerateCodes,
  type GenerateCodesResult,
} from '@/features/codes/hooks';
import { useCourseParts } from '@/features/course-parts/hooks';
import { useTeacherOptions } from '@/features/teachers/hooks';
import { api } from '@/lib/api-client';
import {
  EXCEL_DAY_FORMAT,
  asDate,
  exportFilename,
  exportToExcel,
} from '@/lib/export-excel';
import { queryKeys } from '@/lib/query-keys';
import type { CodeTargetType, CourseSummary, SectionRow } from '@/types/domain';

/**
 * Generate a batch of cards.
 *
 * The three target types are not variations on a theme — they grant different
 * things, and the wording here says so plainly, because choosing the wrong one
 * either gives away more than was sold or leaves a student unable to open what
 * they paid for:
 *
 *   Course  — the sections that exist **right now**. Sections added later are
 *             not unlocked by these cards.
 *   Section — exactly one section.
 *   Part    — the sections that belong to one part of a course. This is how a
 *             course sold in pieces is actually sold: the card unlocks the
 *             part's sections and nothing else.
 *   Teacher — the courses assigned to that teacher **right now**. Courses they
 *             publish later are not unlocked by these cards.
 *
 * The scope is frozen server-side at generation, so the promise made on this
 * screen is the promise the redemption honours.
 *
 * **None of these touch the wallet.** A card is bought offline and redeemed
 * here; wallet credit buys library material and nothing else.
 */
export function GenerateCodesDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const generate = useGenerateCodes();

  const [targetType, setTargetType] = useState<CodeTargetType>('COURSE');
  const [courseId, setCourseId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [coursePartId, setCoursePartId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [batchName, setBatchName] = useState('');
  const [count, setCount] = useState('1');
  const [price, setPrice] = useState('');
  const [prefix, setPrefix] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [result, setResult] = useState<GenerateCodesResult | null>(null);

  const teachers = useTeacherOptions();

  const courses = useQuery({
    queryKey: queryKeys.courses.list({ picker: true }),
    queryFn: () =>
      api.page<CourseSummary>('admin/courses', { query: { page: 1, pageSize: 100 } }),
    enabled: open && targetType !== 'TEACHER',
    staleTime: 60_000,
  });

  const sections = useQuery({
    queryKey: queryKeys.courses.sections(courseId || 'none'),
    queryFn: () => api.get<SectionRow[]>(`admin/courses/${courseId}/sections`),
    enabled: open && targetType === 'SECTION' && Boolean(courseId),
  });

  // The same hook the course's Parts tab uses, so a part's price and section
  // count are read from one place rather than fetched a second way here.
  const parts = useCourseParts(
    open && targetType === 'PART' && courseId ? courseId : '',
  );

  // A card for a part with no sections would unlock nothing, and the backend
  // refuses it. Offering it here and letting the server say no would be a
  // worse way to learn that.
  const sellableParts = (parts.data?.parts ?? []).filter(
    (part) => part.isActive && part.sectionCount > 0,
  );

  const quantity = Number(count);
  const quantityValid = Number.isInteger(quantity) && quantity >= 1 && quantity <= 5000;

  const targetChosen =
    targetType === 'TEACHER'
      ? Boolean(teacherId)
      : targetType === 'SECTION'
        ? Boolean(sectionId)
        : targetType === 'PART'
          ? Boolean(coursePartId)
          : Boolean(courseId);

  const canSubmit = quantityValid && targetChosen && !generate.isPending;

  function reset() {
    setResult(null);
    setBatchName('');
    setCount('50');
    setPrice('');
    setPrefix('');
    setExpiresAt('');
    setSectionId('');
    setCoursePartId('');
  }

  async function submit() {
    if (!canSubmit) return;

    try {
      const created = await generate.mutateAsync({
        targetType,
        courseId: targetType === 'TEACHER' ? undefined : courseId || undefined,
        sectionId: targetType === 'SECTION' ? sectionId : undefined,
        coursePartId: targetType === 'PART' ? coursePartId : undefined,
        teacherId: targetType === 'TEACHER' ? teacherId : undefined,
        batchName: batchName.trim() || undefined,
        count: quantity,
        priceAmount: price ? Number(price) : undefined,
        prefix: prefix.trim() || undefined,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
      });

      setResult(created);
      toast.success(
        'Codes generated',
        `${created.created} card${created.created === 1 ? '' : 's'} created.`,
      );
    } catch (error) {
      toast.error(error, 'The codes were not generated');
    }
  }

  async function downloadResult() {
    if (!result) return;

    await exportToExcel({
      filename: exportFilename(result.batchName ?? `${result.targetName}-codes`),
      sheetName: 'Codes',
      title: `${result.targetName} — access codes`,
      subtitle: `${result.created} cards · ${result.targetType.toLowerCase()} scope${expiresAt ? ` · expires ${expiresAt}` : ''
        }`,
      columns: [
        { header: 'Code', key: 'code', width: 24, value: (row) => row.code },
        {
          header: 'Expires',
          key: 'expires',
          width: 16,
          value: () => asDate(expiresAt ? `${expiresAt}T23:59:59` : null),
          format: EXCEL_DAY_FORMAT,
        },
      ],
      rows: result.codes.map((code) => ({ code })),
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={result ? 'Codes generated' : 'Generate codes'}
      description={
        result
          ? 'Download them now — the full values are shown only once, at creation.'
          : 'Cards are single-use by default and their scope is frozen the moment they are created.'
      }
      size="lg"
      busy={generate.isPending}
      footer={
        result ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Done
            </Button>
            <Button onClick={downloadResult}>Download Excel</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={generate.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={generate.isPending} disabled={!canSubmit}>
              Generate {quantityValid ? quantity : ''} codes
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-success/30 bg-success-soft p-4">
            <p className="text-sm font-medium text-success">
              {result.created} of {result.requested} cards created
            </p>
            <p className="mt-1 text-xs text-success/80">
              Batch “{result.batchName ?? result.batchId.slice(0, 8)}” · {result.targetName}
            </p>
          </div>

          <p className="text-sm text-muted">
            The codes below are stored in the clear so an administrator can read one out over the
            phone, but this is the only screen that lists a whole batch at once. Download the
            spreadsheet and keep it somewhere appropriate.
          </p>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-surface-alt p-3">
            <ul className="grid grid-cols-1 gap-1 font-mono text-xs sm:grid-cols-2">
              {result.codes.slice(0, 200).map((code) => (
                <li key={code} className="text-foreground">
                  {code}
                </li>
              ))}
            </ul>
            {result.codes.length > 200 ? (
              <p className="mt-2 text-xs text-muted">
                Showing the first 200. The download contains all {result.codes.length}.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="What do these cards unlock?" required>
            {({ id }) => (
              <Select
                id={id}
                value={targetType}
                onChange={(event) => {
                  setTargetType(event.target.value as CodeTargetType);
                  setSectionId('');
                  setCoursePartId('');
                }}
                options={[
                  { value: 'COURSE', label: 'A whole course' },
                  { value: 'PART', label: 'One part of a course' },
                  { value: 'SECTION', label: 'One section of a course' },
                  { value: 'TEACHER', label: 'Everything by one teacher' },
                ]}
              />
            )}
          </Field>

          <p className="rounded-lg border border-info/30 bg-info-soft p-3 text-xs text-info">
            {targetType === 'COURSE'
              ? 'Unlocks the sections that exist right now. A section added after today will not be unlocked by these cards.'
              : targetType === 'PART'
                ? 'Unlocks the sections that belong to this part right now. Paid for the same way as a whole course — never with wallet credit.'
                : targetType === 'SECTION'
                  ? 'Unlocks exactly this section and nothing else in the course.'
                  : 'Unlocks the courses assigned to this teacher right now. Courses they publish later will not be unlocked by these cards.'}
          </p>

          {targetType === 'TEACHER' ? (
            <Field label="Teacher" required>
              {({ id }) => (
                <Select
                  id={id}
                  value={teacherId}
                  onChange={(event) => setTeacherId(event.target.value)}
                  placeholder={teachers.isLoading ? 'Loading…' : 'Choose a teacher'}
                  options={teachers.options}
                />
              )}
            </Field>
          ) : (
            <>
              <Field label="Course" required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={courseId}
                    onChange={(event) => {
                      setCourseId(event.target.value);
                      setSectionId('');
                    }}
                    placeholder={courses.isLoading ? 'Loading…' : 'Choose a course'}
                    options={(courses.data?.items ?? []).map((course) => ({
                      value: course.id,
                      label: course.title,
                    }))}
                  />
                )}
              </Field>

              {targetType === 'PART' ? (
                <Field
                  label="Part"
                  required
                  hint={
                    courseId && !parts.isLoading && sellableParts.length === 0
                      ? 'This course has no part that unlocks anything yet. Add sections to a part first.'
                      : undefined
                  }
                >
                  {({ id, describedBy }) => (
                    <Select
                      id={id}
                      aria-describedby={describedBy}
                      value={coursePartId}
                      onChange={(event) => setCoursePartId(event.target.value)}
                      placeholder={
                        !courseId
                          ? 'Choose a course first'
                          : parts.isLoading
                            ? 'Loading…'
                            : sellableParts.length === 0
                              ? 'No sellable parts'
                              : 'Choose a part'
                      }
                      disabled={!courseId || sellableParts.length === 0}
                      options={sellableParts.map((part) => ({
                        value: part.id,
                        label: `${part.title} — ${part.sectionCount} section${part.sectionCount === 1 ? '' : 's'
                          }`,
                      }))}
                    />
                  )}
                </Field>
              ) : null}

              {targetType === 'SECTION' ? (
                <Field label="Section" required>
                  {({ id }) => (
                    <Select
                      id={id}
                      value={sectionId}
                      onChange={(event) => setSectionId(event.target.value)}
                      placeholder={
                        !courseId
                          ? 'Choose a course first'
                          : sections.isLoading
                            ? 'Loading…'
                            : 'Choose a section'
                      }
                      disabled={!courseId}
                      options={(sections.data ?? []).map((section) => ({
                        value: section.id,
                        label: section.title,
                      }))}
                    />
                  )}
                </Field>
              ) : null}
            </>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Batch name" hint="Optional, e.g. “Term 2 — Pharmacy”.">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={batchName}
                  onChange={(event) => setBatchName(event.target.value)}
                  maxLength={120}
                />
              )}
            </Field>

            <Field
              label="How many cards"
              required
              error={
                count && !quantityValid ? 'Enter a whole number between 1 and 5000' : null
              }
            >
              {({ id, invalid }) => (
                <TextInput
                  id={id}
                  type="number"
                  min={1}
                  max={5000}
                  inputMode="numeric"
                  invalid={invalid}
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              )}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Price on the card" hint="For reporting only.">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              )}
            </Field>

            <Field label="Prefix" hint="Optional, up to 6 characters.">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={prefix}
                  maxLength={6}
                  onChange={(event) =>
                    setPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
                />
              )}
            </Field>

            <Field label="Expiry date" hint="Unredeemed cards stop working after this.">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              )}
            </Field>
          </div>

          <p className="text-xs text-muted">
            <Badge tone="neutral" className="me-2">
              Note
            </Badge>
            Expiry applies to redemption, not to access. A card redeemed before it expires grants
            access under the course’s own duration rules — for a lifetime course, that access
            stays lifetime.
          </p>
        </div>
      )}
    </Modal>
  );
}
