'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ContentStatusBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/primitives';
import { EmptyState, QueryState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { formatBytes, formatMoney, formatNumber } from '@/lib/format';
import type { LibraryPackageRow, LibraryPartRow } from '@/types/commerce';
import type { ContentStatus } from '@/types/domain';

import { LibraryPartDialog, MaterialDialog, PackageDialog } from './library-dialogs';
import {
  useLibraryMaterial,
  useRemoveLibraryPackage,
  useRemoveLibraryPart,
  useRemoveMaterial,
  useUpdateMaterial,
} from './hooks';

/**
 * Publishing a material.
 *
 * A material is created `DRAFT` (`@default(DRAFT)` on the Prisma model) and the
 * student-facing routes require exactly `PUBLISHED`: `browse` and
 * `materialForStudent` both filter on it, and `assertOnSale` refuses a purchase
 * against a draft. So until an administrator publishes it, a material is
 * complete, paid-for work that no student can see — and this screen had no way
 * to do it.
 *
 * Unpublishing returns it to `DRAFT` rather than `HIDDEN`. That is deliberate:
 * `HIDDEN` hides a material from `browse` while `assertOnSale` still permits
 * buying it by id, which is a state nothing in this interface should be able to
 * create. `DRAFT` is refused by both.
 *
 * Existing purchases are untouched either way. A student who already bought a
 * document keeps it — `issueTicket` only withdraws readability for `ARCHIVED`
 * or deleted material, never for a draft.
 */
interface PublishAction {
  status: ContentStatus;
  label: string;
  variant: 'primary' | 'secondary';
  confirmTitle: string;
  confirmBody: string;
  successTitle: string;
  successBody: string;
}

function publishActionFor(status: ContentStatus, partCount: number): PublishAction | null {
  if (status === 'PUBLISHED') {
    return {
      status: 'DRAFT',
      label: 'Unpublish',
      variant: 'secondary',
      confirmTitle: 'Unpublish this material?',
      confirmBody:
        'It stops appearing in the student library and can no longer be bought. Students who already bought a document from it keep it and can still open it — unpublishing is not the same as withdrawing.',
      successTitle: 'Material unpublished',
      successBody: 'It is back to draft and hidden from students.',
    };
  }

  // Nothing in this interface produces ARCHIVED, but the enum allows it and an
  // archived material must not be publishable straight back from here: that is
  // a lifecycle decision with its own consequences for readers.
  if (status === 'ARCHIVED') return null;

  return {
    status: 'PUBLISHED',
    label: 'Publish',
    variant: 'primary',
    confirmTitle: 'Publish this material?',
    confirmBody:
      partCount === 0
        ? 'It will be listed in the student library — but it has no documents yet, so students will find it empty. Add at least one document first unless you mean to publish a placeholder.'
        : 'It will be listed in the student library, and its documents can be bought with wallet credit.',
    successTitle: 'Material published',
    successBody: 'Students can now find it in the library.',
  };
}

/**
 * One material, with its documents and packages.
 *
 * Documents carry their own absolute price; there is no whole-material price
 * to take a percentage of, which is why this screen has no allocation warning
 * of the kind course parts need. A package is priced independently of what it
 * contains, because a bundle discount is the entire point of a bundle.
 */
export function MaterialDetail({ materialId }: { materialId: string }) {
  const toast = useToast();
  const router = useRouter();
  const material = useLibraryMaterial(materialId);

  const removePart = useRemoveLibraryPart();
  const removePackage = useRemoveLibraryPackage();
  const removeMaterial = useRemoveMaterial();
  const updateMaterial = useUpdateMaterial(materialId);

  const [editingMaterial, setEditingMaterial] = useState(false);
  const [partDialog, setPartDialog] = useState<{ open: boolean; part: LibraryPartRow | null }>(
    { open: false, part: null },
  );
  const [packageDialog, setPackageDialog] = useState<{
    open: boolean;
    pkg: LibraryPackageRow | null;
  }>({ open: false, pkg: null });

  const [deletingPart, setDeletingPart] = useState<LibraryPartRow | null>(null);
  const [deletingPackage, setDeletingPackage] = useState<LibraryPackageRow | null>(null);
  const [pendingPublish, setPendingPublish] = useState<PublishAction | null>(null);
  const [deletingMaterial, setDeletingMaterial] = useState(false);

  const data = material.data;
  const parts = data?.parts ?? [];
  const packages = data?.packages ?? [];

  const priceTotal = parts
    .filter((part) => !part.isPreview)
    .reduce((sum, part) => sum + part.price, 0);

  const publishAction = data ? publishActionFor(data.status, parts.length) : null;

  async function runPublish(action: PublishAction) {
    try {
      // The existing PATCH contract already accepts `status` and the service
      // stamps `publishedAt` the first time it goes live, so this needs no new
      // endpoint. `useUpdateMaterial` invalidates the whole library domain,
      // which is what refreshes the badge here and the row in the list.
      await updateMaterial.mutateAsync({ status: action.status });
      toast.success(action.successTitle, action.successBody);
    } catch (error) {
      toast.error(error, 'The material status was not changed');
    } finally {
      setPendingPublish(null);
    }
  }

  async function runDeleteMaterial() {
    try {
      await removeMaterial.mutateAsync(materialId);
      toast.success('Material removed', 'It is no longer in the catalogue.');
      // Leave before the invalidated detail query can refetch a material that
      // is gone; staying would replace the page with a "not found" state.
      router.replace('/library');
    } catch (error) {
      toast.error(error, 'The material was not removed');
      setDeletingMaterial(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={data?.title ?? 'Material'}
        description={data?.description ?? undefined}
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Library', href: '/library' },
          { label: data?.title ?? 'Material' },
        ]}
        actions={
          data ? (
            <>
              {publishAction ? (
                <Button
                  variant={publishAction.variant}
                  onClick={() => setPendingPublish(publishAction)}
                  disabled={updateMaterial.isPending}
                >
                  {publishAction.label}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setEditingMaterial(true)}>
                Edit material
              </Button>
              {/*
                The endpoint has always existed and nothing called it, so a
                material added by mistake could be unpublished but never
                removed. The backend refuses once any student holds an
                entitlement to one of its documents, which is the rule that
                protects what people spent credit on — the dialog says so, so
                the refusal is expected rather than a surprise.
              */}
              <Button variant="ghost" onClick={() => setDeletingMaterial(true)}>
                Delete material
              </Button>
              <Button onClick={() => setPartDialog({ open: true, part: null })}>
                Add document
              </Button>
            </>
          ) : null
        }
      />

      <QueryState
        isLoading={material.isLoading}
        error={material.error}
        isEmpty={!data}
        onRetry={() => void material.refetch()}
        loadingFallback={<Skeleton className="h-64 w-full" />}
      >
        {data ? (
          <div className="space-y-5">
            <Card>
              <CardBody>
                <div className="flex flex-wrap items-center gap-3">
                  <ContentStatusBadge status={data.status} />
                  {!data.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                  <span className="text-sm text-muted">
                    {parts.length} document{parts.length === 1 ? '' : 's'} ·{' '}
                    {packages.length} package{packages.length === 1 ? '' : 's'}
                  </span>
                  <span className="ms-auto text-sm">
                    <span className="text-muted">Bought document by document: </span>
                    <strong className="font-semibold tabular-nums text-foreground">
                      {formatMoney(priceTotal)}
                    </strong>
                  </span>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Documents"
                description="Each is sold separately for wallet credit. A free preview needs no purchase."
                actions={
                  <Button
                    size="sm"
                    onClick={() => setPartDialog({ open: true, part: null })}
                  >
                    Add document
                  </Button>
                }
              />
              <CardBody className="space-y-3">
                {parts.length === 0 ? (
                  <EmptyState
                    title="No documents yet"
                    description="A material with no documents cannot be bought."
                  />
                ) : (
                  parts.map((part) => (
                    <div
                      key={part.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-sm font-semibold text-foreground">
                            {part.title}
                          </h4>
                          <ContentStatusBadge status={part.status} />
                          {part.isPreview ? <Badge tone="success">Free preview</Badge> : null}
                          {!part.hasDocument ? (
                            <Badge tone="danger">No file</Badge>
                          ) : null}
                        </div>

                        {part.description ? (
                          <p className="mt-1 line-clamp-2 text-sm text-muted">
                            {part.description}
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                          {part.pageCount ? <span>{part.pageCount} pages</span> : null}
                          {part.sizeBytes ? <span>{formatBytes(part.sizeBytes)}</span> : null}
                          <span>
                            {formatNumber(part.entitlementCount)} student
                            {part.entitlementCount === 1 ? '' : 's'} hold this
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <p className="text-lg font-semibold tabular-nums text-primary">
                          {part.isPreview ? 'Free' : formatMoney(part.price)}
                        </p>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setPartDialog({ open: true, part })}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeletingPart(part)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Packages"
                description="A bundle of documents at one price. Buying one grants each document separately, which is what freezes the bundle's contents."
                actions={
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={parts.length === 0}
                    onClick={() => setPackageDialog({ open: true, pkg: null })}
                  >
                    Add package
                  </Button>
                }
              />
              <CardBody className="space-y-3">
                {packages.length === 0 ? (
                  <EmptyState
                    title="No packages"
                    description="Optional. Packages let you sell several documents together below the sum of their prices."
                  />
                ) : (
                  packages.map((pkg) => {
                    const included = parts.filter((part) => pkg.partIds.includes(part.id));
                    const separately = included.reduce((sum, part) => sum + part.price, 0);

                    return (
                      <div
                        key={pkg.id}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-sm font-semibold text-foreground">
                              {pkg.title}
                            </h4>
                            <ContentStatusBadge status={pkg.status} />
                            {!pkg.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1">
                            {included.map((part) => (
                              <Badge key={part.id} tone="neutral">
                                {part.title}
                              </Badge>
                            ))}
                            {pkg.partIds.length > included.length ? (
                              <Badge tone="warning">
                                {pkg.partIds.length - included.length} withdrawn
                              </Badge>
                            ) : null}
                          </div>

                          <p className="mt-2 text-xs text-muted">
                            {formatNumber(pkg.purchaseCount)} purchase
                            {pkg.purchaseCount === 1 ? '' : 's'} · separately{' '}
                            {formatMoney(separately)}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <p className="text-lg font-semibold tabular-nums text-primary">
                            {formatMoney(pkg.price)}
                          </p>
                          {separately > pkg.price ? (
                            <Badge tone="success">
                              saves {formatMoney(separately - pkg.price)}
                            </Badge>
                          ) : null}
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setPackageDialog({ open: true, pkg })}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeletingPackage(pkg)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardBody>
            </Card>
          </div>
        ) : null}
      </QueryState>

      <MaterialDialog
        open={editingMaterial}
        onClose={() => setEditingMaterial(false)}
        material={data ?? null}
      />

      <LibraryPartDialog
        open={partDialog.open}
        onClose={() => setPartDialog({ open: false, part: null })}
        materialId={materialId}
        part={partDialog.part}
      />

      <PackageDialog
        open={packageDialog.open}
        onClose={() => setPackageDialog({ open: false, pkg: null })}
        materialId={materialId}
        parts={parts}
        pkg={packageDialog.pkg}
      />

      <ConfirmDialog
        open={deletingMaterial}
        onCancel={() => setDeletingMaterial(false)}
        onConfirm={() => void runDeleteMaterial()}
        title="Delete this material?"
        confirmLabel="Delete material"
        busy={removeMaterial.isPending}
        message={
          <>
            <strong className="text-foreground">{data?.title}</strong> and its{' '}
            {parts.length} document{parts.length === 1 ? '' : 's'} leave the catalogue.
            Students who have already bought any of them keep what they paid for, and the
            purchase and credit history is retained — so if anyone holds one, the server
            will refuse this and you should unpublish the material instead.
          </>
        }
      />

      <ConfirmDialog
        open={Boolean(deletingPart)}
        onCancel={() => setDeletingPart(null)}
        onConfirm={() => {
          if (!deletingPart) return;
          removePart.mutate(deletingPart.id, {
            onSuccess: () => {
              toast.success('Document removed');
              setDeletingPart(null);
            },
            onError: (error) => toast.error(error, 'The document was not removed'),
          });
        }}
        busy={removePart.isPending}
        title="Remove this document?"
        confirmLabel="Remove document"
        message={
          deletingPart?.entitlementCount ? (
            <>
              {formatNumber(deletingPart.entitlementCount)} student(s) have paid for{' '}
              <strong className="text-foreground">{deletingPart.title}</strong>, so the
              server will refuse to remove it — they would lose what they bought.
              Deactivate it instead to take it off sale.
            </>
          ) : (
            <>
              <strong className="text-foreground">{deletingPart?.title}</strong> will be
              removed. It is also refused while the document sits inside a package.
            </>
          )
        }
      />

      <ConfirmDialog
        open={pendingPublish !== null}
        onCancel={() => setPendingPublish(null)}
        onConfirm={() => {
          if (pendingPublish) void runPublish(pendingPublish);
        }}
        busy={updateMaterial.isPending}
        title={pendingPublish?.confirmTitle ?? ''}
        confirmLabel={pendingPublish?.label ?? 'Confirm'}
        // Same mapping course-detail.tsx uses: only a genuinely destructive
        // action gets the danger button, and unpublishing revokes nothing.
        variant="primary"
        message={pendingPublish?.confirmBody ?? ''}
      />

      <ConfirmDialog
        open={Boolean(deletingPackage)}
        onCancel={() => setDeletingPackage(null)}
        onConfirm={() => {
          if (!deletingPackage) return;
          removePackage.mutate(deletingPackage.id, {
            onSuccess: () => {
              toast.success('Package removed');
              setDeletingPackage(null);
            },
            onError: (error) => toast.error(error, 'The package was not removed'),
          });
        }}
        busy={removePackage.isPending}
        title="Remove this package?"
        confirmLabel="Remove package"
        message={
          deletingPackage?.purchaseCount ? (
            <>
              This package has been bought {formatNumber(deletingPackage.purchaseCount)}{' '}
              time(s), so the server will refuse. Deactivate it instead — the students who
              bought it keep the documents either way, because they hold each one
              individually.
            </>
          ) : (
            <>
              <strong className="text-foreground">{deletingPackage?.title}</strong> will be
              removed. The documents inside it are unaffected.
            </>
          )
        }
      />
    </div>
  );
}
