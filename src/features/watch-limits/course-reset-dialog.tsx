'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { StatTile } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';

import { useCourseResetPreview, useResetCourseViews } from './hooks';
import { LanguageSwitch } from './manage-views-modal';
import { useWatchLimitStrings } from './strings';
import type { CourseResetSummary } from './types';

/**
 * "Reset All Students' Views" for one course.
 *
 * The figures come from the API's read-only preview of the exact statement the
 * reset runs, fetched fresh when the dialog opens and again when the
 * restore-default option changes. The button stays disabled until the
 * administrator ticks the confirmation.
 */
export function CourseResetDialog({
  courseId,
  courseTitle,
  open,
  onClose,
}: {
  courseId: string;
  courseTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t, lang, setLang, dir, number, pick } = useWatchLimitStrings();
  const toast = useToast();
  const [restoreDefault, setRestoreDefault] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [result, setResult] = useState<CourseResetSummary | null>(null);

  const preview = useCourseResetPreview(courseId, restoreDefault, open && result === null);
  const reset = useResetCourseViews(courseId);
  const figures = result ?? preview.data;

  const nothingToDo =
    !!preview.data &&
    preview.data.affectedPlayRecords === 0 &&
    preview.data.customLimitsRestored === 0;

  function close() {
    if (reset.isPending) return;
    setRestoreDefault(false);
    setUnderstood(false);
    setResult(null);
    onClose();
  }

  async function confirm() {
    if (!understood || reset.isPending || nothingToDo) return;
    try {
      const done = await reset.mutateAsync(restoreDefault);
      setResult(done);
      toast.success(
        t.resetDone,
        t.resetDoneDetail(done.affectedStudents, done.affectedVideos, done.affectedPlayRecords),
      );
    } catch (error) {
      toast.error(error, t.resetFailed);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={<span dir={dir}>{t.resetTitle}</span>}
      description={t.resetIntro(
        figures ? pick(figures.course.title, figures.course.titleAr) : courseTitle,
      )}
      size="lg"
      busy={reset.isPending}
      footer={
        result ? (
          <Button onClick={close}>{t.close}</Button>
        ) : (
          <div dir={dir} className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={reset.isPending}>
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirm()}
              loading={reset.isPending}
              disabled={!understood || nothingToDo || preview.isFetching || !preview.data}
            >
              {t.resetConfirm}
            </Button>
          </div>
        )
      }
    >
      <div dir={dir} lang={lang} className="flex flex-col gap-4">
        <div className="flex items-center justify-end">
          <LanguageSwitch lang={lang} setLang={setLang} t={t} />
        </div>

        {preview.error && !result ? (
          <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
        ) : (
          <>
            {result ? (
              <p
                role="status"
                className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success"
              >
                {t.resetDone}:{' '}
                {t.resetDoneDetail(
                  result.affectedStudents,
                  result.affectedVideos,
                  result.affectedPlayRecords,
                )}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label={t.enrolledStudents}
                value={number(figures?.enrolledStudents ?? 0)}
                loading={!figures}
              />
              <StatTile
                label={t.affectedStudents}
                value={number(figures?.affectedStudents ?? 0)}
                tone={(figures?.affectedStudents ?? 0) > 0 ? 'warning' : 'neutral'}
                loading={!figures}
              />
              <StatTile
                label={t.affectedVideos}
                value={number(figures?.affectedVideos ?? 0)}
                loading={!figures}
              />
              <StatTile
                label={t.affectedRecords}
                value={number(figures?.affectedPlayRecords ?? 0)}
                loading={!figures}
              />
            </div>

            {!result ? (
              <>
                <div
                  role="alert"
                  className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-foreground"
                >
                  {t.resetWarning}
                  {(figures?.sharedVideos ?? 0) > 0 ? (
                    <p className="mt-2">{t.sharedWarning(figures!.sharedVideos)}</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1">
                  <Checkbox
                    label={t.restoreDefaultToo}
                    checked={restoreDefault}
                    onChange={(event) => setRestoreDefault(event.target.checked)}
                    disabled={reset.isPending}
                  />
                  <p className="ms-6 text-xs text-muted">
                    {restoreDefault
                      ? t.dropCustom(figures?.customLimitsRestored ?? 0)
                      : t.keepCustom}
                  </p>
                </div>

                {nothingToDo ? (
                  <p className="text-sm text-muted">{t.nothingToReset}</p>
                ) : (
                  <Checkbox
                    label={t.confirmCheck}
                    checked={understood}
                    onChange={(event) => setUnderstood(event.target.checked)}
                    disabled={reset.isPending}
                  />
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
