'use client';

import { useMemo, useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { ActionMenu } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Badge, StatTile } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

import { useChangeWatchLimit, useStudentWatchLimits } from './hooks';
import { useWatchLimitStrings, type Lang, type Strings } from './strings';
import type { WatchLimitAction, WatchLimitStatus, WatchLimitVideo } from './types';

const MAX_AMOUNT = 100;
const ACTIONS: WatchLimitAction[] = [
  'ADD_PLAYS',
  'SET_REMAINING',
  'RESET_USED',
  'RESTORE_DEFAULT',
];
const needsAmount = (action: WatchLimitAction) =>
  action === 'ADD_PLAYS' || action === 'SET_REMAINING';

const STATUS_TONE: Record<
  WatchLimitStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  AVAILABLE: 'success',
  NEARLY_EXHAUSTED: 'warning',
  EXHAUSTED: 'danger',
  UNLIMITED: 'info',
  NO_ACCESS: 'neutral',
};

export function WatchStatusBadge({ status, t }: { status: WatchLimitStatus; t: Strings }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {t.statusLabel[status]}
    </Badge>
  );
}

export function LanguageSwitch({
  lang,
  setLang,
  t,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Strings;
}) {
  return (
    <div
      role="group"
      aria-label={t.language}
      className="inline-flex rounded-lg border border-border p-0.5 text-xs"
    >
      {(['en', 'ar'] as const).map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={lang === option}
          onClick={() => setLang(option)}
          className={cn(
            'min-h-8 min-w-10 rounded-md px-2 font-medium transition-colors',
            lang === option
              ? 'bg-primary-soft text-primary'
              : 'text-muted hover:text-foreground',
          )}
        >
          {option === 'en' ? 'EN' : 'ع'}
        </button>
      ))}
    </div>
  );
}

/** What the student will have after an action, computed exactly as the API does. */
function preview(
  video: Pick<WatchLimitVideo, 'allowedPlays' | 'usedPlays' | 'defaultLimit' | 'customLimit'>,
  action: WatchLimitAction,
  amount: number,
) {
  let allowed = video.allowedPlays;
  let used = video.usedPlays;
  if (action === 'ADD_PLAYS') allowed = Math.max(video.allowedPlays, video.usedPlays) + amount;
  if (action === 'SET_REMAINING') allowed = video.usedPlays + amount;
  if (action === 'RESET_USED') used = 0;
  if (action === 'RESTORE_DEFAULT') allowed = video.defaultLimit;
  return { allowed, used, remaining: Math.max(0, allowed - used) };
}

type Pending = { action: WatchLimitAction; video: WatchLimitVideo | null };

/**
 * One student's watch limits in one course. Opens from the course Students
 * tab ("Manage Views"). Every change is made by the API under a lock and
 * audited; nothing here edits play history.
 */
export function ManageViewsModal({
  courseId,
  student,
  onClose,
}: {
  courseId: string;
  student: { id: string; fullName: string } | null;
  onClose: () => void;
}) {
  const { t, lang, setLang, dir, pick, number } = useWatchLimitStrings();
  const toast = useToast();
  const query = useStudentWatchLimits(courseId, student?.id ?? null);
  const change = useChangeWatchLimit(courseId, student?.id ?? '');

  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [bulkAction, setBulkAction] = useState<WatchLimitAction>('RESET_USED');
  const [amountText, setAmountText] = useState('1');

  const data = query.data;
  const busy = change.isPending;
  const accessible = (data?.videos ?? []).filter(
    (video) => video.accessible && !video.isPreview && video.sharedCourses === 0,
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const videos = data?.videos ?? [];
    if (!needle) return videos;
    return videos.filter((video) =>
      [video.title, video.titleAr, video.sectionTitle, video.sectionTitleAr]
        .filter(Boolean)
        .some((text) => text!.toLowerCase().includes(needle)),
    );
  }, [data?.videos, search]);

  function close() {
    if (busy) return;
    setPending(null);
    setSearch('');
    onClose();
  }

  function begin(action: WatchLimitAction, video: WatchLimitVideo | null) {
    setAmountText(action === 'SET_REMAINING' && video ? String(video.remainingPlays) : '1');
    setPending({ action, video });
  }

  const amount = Number(amountText);
  const minAmount = pending?.action === 'ADD_PLAYS' ? 1 : 0;
  const amountValid =
    !pending ||
    !needsAmount(pending.action) ||
    (Number.isInteger(amount) &&
      amount >= minAmount &&
      amount <= MAX_AMOUNT &&
      amountText.trim() !== '');

  async function submit() {
    if (!pending || busy || !amountValid) return;
    try {
      const result = await change.mutateAsync({
        action: pending.action,
        amount: needsAmount(pending.action) ? amount : undefined,
        videoId: pending.video?.videoId,
      });
      if ('targetVideos' in result) {
        toast.success(t.doneOne, t.doneBulk(result.affectedVideos, result.targetVideos));
      } else {
        const v = result.video;
        toast.success(
          t.doneOne,
          `${pick(v.title, v.titleAr)}: ${t.allowed} ${number(v.allowedPlays)} · ${t.used} ${number(v.usedPlays)} · ${t.remaining} ${number(v.remainingPlays)}`,
        );
      }
      setPending(null);
    } catch (error) {
      toast.error(error, t.failed);
    }
  }

  const columns: Column<WatchLimitVideo>[] = [
    {
      key: 'video',
      header: t.video,
      className: 'min-w-[12rem]',
      render: (video) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">
            {pick(video.title, video.titleAr)}
          </span>
          <span className="truncate text-xs text-muted sm:hidden">
            {pick(video.sectionTitle, video.sectionTitleAr)}
          </span>
          {/* Phones: the counts columns are hidden, so the essentials go here. */}
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:hidden">
            {video.isPreview ? null : (
              <span className="text-muted tabular-nums">
                {t.used} {number(video.usedPlays)}/{number(video.allowedPlays)} · {t.remaining}{' '}
                <strong className="text-foreground">{number(video.remainingPlays)}</strong>
              </span>
            )}
            <WatchStatusBadge status={video.status} t={t} />
          </span>
        </div>
      ),
    },
    {
      key: 'section',
      header: t.section,
      secondary: true,
      render: (video) => (
        <span className="text-xs text-muted">
          {pick(video.sectionTitle, video.sectionTitleAr)}
        </span>
      ),
    },
    {
      key: 'allowed',
      secondary: true,
      header: t.allowed,
      align: 'center',
      render: (video) =>
        video.isPreview ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="inline-flex items-center gap-1 tabular-nums">
            {number(video.allowedPlays)}
            {video.customLimit ? (
              <span
                title={t.customHint}
                className="text-[10px] font-medium text-primary uppercase"
              >
                {t.custom}
              </span>
            ) : null}
          </span>
        ),
    },
    {
      key: 'used',
      secondary: true,
      header: t.used,
      align: 'center',
      render: (video) => (
        <span className="tabular-nums">{video.isPreview ? '—' : number(video.usedPlays)}</span>
      ),
    },
    {
      key: 'remaining',
      secondary: true,
      header: t.remaining,
      align: 'center',
      render: (video) => (
        <span className="font-semibold tabular-nums">
          {video.isPreview ? '—' : number(video.remainingPlays)}
        </span>
      ),
    },
    {
      key: 'status',
      secondary: true,
      header: t.status,
      render: (video) => (
        <div className="flex flex-col items-start gap-1">
          <WatchStatusBadge status={video.status} t={t} />
          {video.sharedCourses > 0 ? (
            <span title={t.sharedHint}>
              <Badge tone="info">{t.shared(video.sharedCourses)}</Badge>
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t.actions}</span>,
      align: 'end',
      render: (video) =>
        video.accessible && !video.isPreview && video.sharedCourses === 0 ? (
          <ActionMenu
            label={t.actionsFor(pick(video.title, video.titleAr))}
            items={ACTIONS.map((action) => ({
              label: t.actionLabel[action],
              disabled:
                busy ||
                (action === 'RESTORE_DEFAULT' && !video.customLimit) ||
                (action === 'RESET_USED' && video.usedPlays === 0),
              onSelect: () => begin(action, video),
            }))}
          />
        ) : null,
    },
  ];

  const title = student ? t.manageViewsFor(student.fullName) : t.manageViews;
  const courseName = data ? pick(data.course.title, data.course.titleAr) : undefined;

  // --- the confirmation step, shown in place of the list -------------------
  const confirmStep = pending ? (
    <ActionStep
      t={t}
      number={number}
      pending={pending}
      targets={pending.video ? [pending.video] : accessible}
      amountText={amountText}
      setAmountText={setAmountText}
      amountValid={amountValid}
      minAmount={minAmount}
      title={pending.video ? pick(pending.video.title, pending.video.titleAr) : t.bulkTitle}
    />
  ) : null;

  return (
    <Modal
      open={student !== null}
      onClose={close}
      title={<span dir={dir}>{title}</span>}
      description={courseName}
      size="xl"
      busy={busy}
      footer={
        pending ? (
          <div dir={dir} className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
              {t.back}
            </Button>
            <Button
              variant={pending.action === 'RESET_USED' && !pending.video ? 'danger' : 'primary'}
              onClick={() => void submit()}
              loading={busy}
              disabled={!amountValid}
            >
              {pending.video ? t.apply : t.bulkApply}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={close}>
            {t.close}
          </Button>
        )
      }
    >
      <div dir={dir} lang={lang} className="flex flex-col gap-4">
        <div className="flex items-center justify-end">
          <LanguageSwitch lang={lang} setLang={setLang} t={t} />
        </div>

        {query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : confirmStep ? (
          confirmStep
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                label={t.accessibleVideos}
                value={number(data?.summary.accessibleVideos ?? 0)}
                loading={query.isLoading}
              />
              <StatTile
                label={t.watchedVideos}
                value={number(data?.summary.watchedVideos ?? 0)}
                loading={query.isLoading}
              />
              <StatTile
                label={t.exhaustedVideos}
                value={number(data?.summary.exhaustedVideos ?? 0)}
                tone={(data?.summary.exhaustedVideos ?? 0) > 0 ? 'danger' : 'neutral'}
                loading={query.isLoading}
              />
              <StatTile
                label={t.defaultLimit}
                value={number(data?.defaultLimit ?? 3)}
                hint={t.playsPerVideo(data?.defaultLimit ?? 3)}
                loading={query.isLoading}
              />
            </div>

            <p className="rounded-lg bg-surface-alt px-3 py-2 text-xs text-muted">{t.terms}</p>

            {/* Whole-course actions for this student */}
            <section aria-labelledby="wl-bulk" className="card flex flex-col gap-3 p-4">
              <div>
                <h3 id="wl-bulk" className="text-sm font-semibold text-foreground">
                  {t.bulkTitle}
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  {accessible.length > 0 ? t.bulkHint(accessible.length) : t.noAccessible}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label={t.actions} className="min-w-[14rem] flex-1">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={bulkAction}
                      onChange={(event) =>
                        setBulkAction(event.target.value as WatchLimitAction)
                      }
                      disabled={busy || accessible.length === 0}
                      options={ACTIONS.map((action) => ({
                        value: action,
                        label: t.actionLabel[action],
                      }))}
                    />
                  )}
                </Field>
                <Button
                  variant="secondary"
                  onClick={() => begin(bulkAction, null)}
                  disabled={busy || accessible.length === 0 || query.isLoading}
                >
                  {t.bulkApply}…
                </Button>
              </div>
            </section>

            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(video) => video.videoId}
              isLoading={query.isLoading}
              caption={title}
              emptyTitle={search ? t.noMatch : t.noVideos}
              emptyDescription={search ? t.noMatchHint : t.noVideosHint}
              toolbar={
                <div className="w-full sm:max-w-xs">
                  <TextInput
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t.search}
                    aria-label={t.searchLabel}
                  />
                </div>
              }
            />
          </>
        )}
      </div>
    </Modal>
  );
}

function ActionStep({
  t,
  number,
  pending,
  targets,
  amountText,
  setAmountText,
  amountValid,
  minAmount,
  title,
}: {
  t: Strings;
  number: (value: number) => string;
  pending: Pending;
  targets: WatchLimitVideo[];
  amountText: string;
  setAmountText: (value: string) => void;
  amountValid: boolean;
  minAmount: number;
  title: string;
}) {
  const amount = amountValid ? Number(amountText) : 0;
  const one = pending.video;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium text-muted uppercase">
          {t.actionLabel[pending.action]}
        </p>
        <h3 className="mt-1 text-base font-semibold text-foreground">
          {one ? title : t.bulkConfirm(t.actionLabel[pending.action], targets.length)}
        </h3>
        <p className="mt-1 text-sm text-muted">{t.actionHelp[pending.action]}</p>
        {!one ? <p className="mt-1 text-sm text-muted">{t.bulkHint(targets.length)}</p> : null}
      </div>

      {needsAmount(pending.action) ? (
        <Field
          label={pending.action === 'ADD_PLAYS' ? t.amountAdd : t.amountSet}
          hint={t.amountRange(minAmount, MAX_AMOUNT)}
          error={amountValid ? null : t.amountRange(minAmount, MAX_AMOUNT)}
          className="max-w-xs"
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type="number"
              inputMode="numeric"
              min={minAmount}
              max={MAX_AMOUNT}
              step={1}
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              autoFocus
            />
          )}
        </Field>
      ) : null}

      {one ? (
        <BeforeAfter
          t={t}
          number={number}
          video={one}
          action={pending.action}
          amount={amount}
        />
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          {targets.map((video) => (
            <div
              key={video.videoId}
              className="border-b border-border px-3 py-2 last:border-b-0"
            >
              <BeforeAfter
                t={t}
                number={number}
                video={video}
                action={pending.action}
                amount={amount}
                compact
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BeforeAfter({
  t,
  number,
  video,
  action,
  amount,
  compact,
}: {
  t: Strings;
  number: (value: number) => string;
  video: WatchLimitVideo;
  action: WatchLimitAction;
  amount: number;
  compact?: boolean;
}) {
  const next = preview(video, action, amount);
  const cell = (label: string, before: number, after: number) => (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="tabular-nums">
        {number(before)}
        <span aria-hidden="true" className="mx-1 text-subtle rtl:rotate-180 inline-block">
          →
        </span>
        <span className="sr-only"> {t.after} </span>
        <strong className={cn(before !== after && 'text-primary')}>{number(after)}</strong>
      </span>
    </div>
  );
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-1',
        compact ? 'text-xs' : 'text-sm',
      )}
    >
      {compact ? (
        <span className="min-w-[10rem] flex-1 truncate text-foreground">{video.title}</span>
      ) : null}
      {cell(t.allowed, video.allowedPlays, next.allowed)}
      {cell(t.used, video.usedPlays, next.used)}
      {cell(t.remaining, video.remainingPlays, next.remaining)}
    </div>
  );
}
