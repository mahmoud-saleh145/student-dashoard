'use client';

import { useState } from 'react';

import { ContentStatusBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { EmptyState, QueryState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useCourseSections } from '@/features/courses/hooks';
import { formatMoney, formatNumber } from '@/lib/format';
import type { CoursePartRow } from '@/types/commerce';
import { PART_PRICING_MODEL_LABEL } from '@/types/commerce';

import { PartDialog } from './part-dialog';
import {
  useCourseParts,
  useCreateDefaultParts,
  useDeleteCoursePart,
  useReorderCourseParts,
} from './hooks';

/**
 * Managing a course's parts.
 *
 * A course is sold whole until it has parts; adding one changes how it is
 * bought. The screen therefore leads with what the parts add up to, because
 * the failure that matters is arithmetic: if the active parts no longer total
 * the course price, the backend refuses to sell any of them and says so here
 * rather than at the point of sale.
 *
 * **Nothing here touches the wallet.** A part is unlocked by redeeming a
 * part-scoped access card, exactly as a whole course is. The Generate codes
 * screen issues those cards.
 */
export function CoursePartsTab({
  courseId,
  courseTitle,
  canManage,
}: {
  courseId: string;
  courseTitle: string;
  /** False for a teacher without pricing rights on this course. */
  canManage: boolean;
}) {
  const toast = useToast();
  const parts = useCourseParts(courseId);
  const sections = useCourseSections(courseId);

  const createDefault = useCreateDefaultParts(courseId);
  const reorder = useReorderCourseParts(courseId);
  const remove = useDeleteCoursePart(courseId);

  const [editing, setEditing] = useState<CoursePartRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CoursePartRow | null>(null);

  const view = parts.data;
  const rows = view?.parts ?? [];
  const activeParts = rows.filter((part) => part.isActive);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;

    const moved = next[index]!;
    next[index] = next[target]!;
    next[target] = moved;

    reorder.mutate(
      next.map((part) => part.id),
      {
        onSuccess: () => toast.success('Order updated'),
        onError: (error) => toast.error(error, 'The order was not changed'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-sm text-muted">
        <p>
          Parts are sold through the course&rsquo;s own payment route — cash or transfer,
          then an access code. <strong className="text-foreground">Wallet credit is
          never used</strong>; that is the Library&rsquo;s payment path.
        </p>
      </div>

      <QueryState
        isLoading={parts.isLoading}
        error={parts.error}
        isEmpty={rows.length === 0}
        onRetry={() => void parts.refetch()}
        loadingFallback={
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        }
        emptyState={
          <Card>
            <EmptyState
              title="This course is sold whole"
              description="Add parts to sell it in pieces — for example before and after the midterm. Students who already hold the whole course are unaffected."
              action={
                canManage ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      onClick={() =>
                        createDefault.mutate(undefined, {
                          onSuccess: () => toast.success('Created Part 1 and Part 2'),
                          onError: (error) =>
                            toast.error(error, 'The default structure was not created'),
                        })
                      }
                      loading={createDefault.isPending}
                    >
                      Use the 60 / 40 split
                    </Button>
                    <Button variant="secondary" onClick={() => setCreating(true)}>
                      Add a part manually
                    </Button>
                  </div>
                ) : null
              }
            />
          </Card>
        }
      >
        <>
          <AllocationSummary
            coursePrice={view?.coursePrice ?? null}
            allocationError={view?.allocationError ?? null}
            parts={activeParts}
          />

          <Card>
            <CardHeader
              title={`${rows.length} part${rows.length === 1 ? '' : 's'}`}
              description="Order is what the student sees. Price is what the server allocated."
              actions={
                canManage ? (
                  <Button size="sm" onClick={() => setCreating(true)}>
                    Add part
                  </Button>
                ) : null
              }
            />
            <CardBody className="space-y-3">
              {rows.map((part, index) => (
                <PartCard
                  key={part.id}
                  part={part}
                  index={index}
                  total={rows.length}
                  canManage={canManage}
                  busy={reorder.isPending}
                  onEdit={() => setEditing(part)}
                  onDelete={() => setDeleting(part)}
                  onMove={(direction) => move(index, direction)}
                />
              ))}
            </CardBody>
          </Card>
        </>
      </QueryState>

      <PartDialog
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        courseId={courseId}
        coursePrice={view?.coursePrice ?? null}
        part={editing}
        sections={sections.data ?? []}
        otherPartsPercent={activeParts
          .filter((part) => part.id !== editing?.id && part.pricingModel === 'PERCENTAGE')
          .reduce((sum, part) => sum + (part.pricePercent ?? 0), 0)}
        otherPartsAmount={activeParts
          .filter((part) => part.id !== editing?.id && part.pricingModel === 'FIXED')
          .reduce((sum, part) => sum + (part.priceAmount ?? 0), 0)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Part removed');
              setDeleting(null);
            },
            onError: (error) => toast.error(error, 'The part was not removed'),
          });
        }}
        busy={remove.isPending}
        title="Remove this part?"
        confirmLabel="Remove part"
        message={
          deleting?.purchaseCount ? (
            <>
              <strong className="text-foreground">{deleting.title}</strong> has been bought{' '}
              {formatNumber(deleting.purchaseCount)} time(s), so the server will refuse to
              remove it — taking it away would orphan access somebody paid for. Deactivate
              it instead to stop selling it while keeping existing holders whole.
            </>
          ) : (
            <>
              <strong className="text-foreground">{deleting?.title}</strong> will be removed
              from {courseTitle}. The remaining parts must still add up to the course price
              afterwards, or the server will refuse.
            </>
          )
        }
      />
    </div>
  );
}

/**
 * What the parts add up to.
 *
 * The server computes the allocation and reports a single human-readable error
 * when it does not balance; this renders that verbatim rather than re-deriving
 * it, so the browser can never disagree with the thing that will refuse the
 * sale.
 */
function AllocationSummary({
  coursePrice,
  allocationError,
  parts,
}: {
  coursePrice: number | null;
  allocationError: string | null;
  parts: CoursePartRow[];
}) {
  const allocated = parts.reduce((sum, part) => sum + (part.effectivePrice ?? 0), 0);

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              Course price
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">
              {coursePrice != null ? formatMoney(coursePrice) : 'Not priced'}
            </p>
          </div>

          <div className="text-end">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              Allocated to parts
            </p>
            <p
              className={`mt-0.5 text-xl font-semibold tabular-nums ${
                allocationError ? 'text-danger' : 'text-success'
              }`}
            >
              {formatMoney(allocated)}
            </p>
          </div>
        </div>

        {allocationError ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            <p className="font-medium">The parts do not add up.</p>
            <p className="mt-0.5">{allocationError}</p>
            <p className="mt-1 text-xs">
              While this is unresolved the server refuses to sell any part of this course.
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function PartCard({
  part,
  index,
  total,
  canManage,
  busy,
  onEdit,
  onDelete,
  onMove,
}: {
  part: CoursePartRow;
  index: number;
  total: number;
  canManage: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted tabular-nums">
              #{part.sortOrder}
            </span>
            <h4 className="truncate text-sm font-semibold text-foreground">{part.title}</h4>
            <ContentStatusBadge status={part.status} />
            {!part.isActive ? <Badge tone="neutral">Off sale</Badge> : null}
          </div>

          {part.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted">{part.description}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              {PART_PRICING_MODEL_LABEL[part.pricingModel]}
              {part.pricingModel === 'PERCENTAGE' && part.pricePercent != null
                ? ` · ${part.pricePercent}%`
                : ''}
            </span>
            <span>
              {part.sectionCount} section{part.sectionCount === 1 ? '' : 's'}
            </span>
            <span>{formatNumber(part.entitlementCount)} entitlements</span>
            <span>{formatNumber(part.purchaseCount)} unlocks</span>
          </div>

          {part.sections.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {part.sections.map((section) => (
                <Badge key={section.id} tone="neutral">
                  {section.title}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-warning">
              No sections assigned — this part unlocks nothing yet.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className="text-lg font-semibold tabular-nums text-primary">
            {part.effectivePrice != null ? formatMoney(part.effectivePrice) : '—'}
          </p>

          {canManage ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onMove(-1)}
                disabled={busy || index === 0}
                aria-label={`Move ${part.title} earlier`}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onMove(1)}
                disabled={busy || index === total - 1}
                aria-label={`Move ${part.title} later`}
              >
                ↓
              </Button>
              <Button size="sm" variant="secondary" onClick={onEdit}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete}>
                Remove
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

