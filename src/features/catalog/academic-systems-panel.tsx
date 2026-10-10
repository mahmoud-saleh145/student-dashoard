'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Modal, ConfirmDialog } from '@/components/ui/overlay';
import { Badge, Card, CardBody, SectionTitle } from '@/components/ui/primitives';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';

import {
  CollegeAcademicSystemBadge,
  CollegeAcademicSystemField,
  academicSystemFullLabel,
} from '@/features/catalog/academic-system-control';
import {
  useAcademicSystemOverview,
  useSetFacultyAcademicSystemOverride,
  useUpdateUniversity,
} from '@/features/catalog/hooks';
import type { AcademicStructureKind, AcademicSystemOverviewFaculty } from '@/types/domain';

/**
 * University defaults and college overrides, on one screen.
 *
 * This is the screen the product requirement is really about: "an administrator
 * must be able to define a university's default academic system, override it for
 * any individual college, and see that the rest of the system respects it". The
 * other Academic Structure screen manages the LADDERS — how many rungs, what they
 * are called — which is a different decision and stays where it is.
 *
 * The layout follows the resolution order top to bottom, because that is the
 * order a value is decided in:
 *
 *     University default
 *            |
 *            v
 *     College override (optional)
 *            |
 *            v
 *     What a student at that college is shown
 *
 * Each college row states BOTH the effective value and whether it is inherited
 * or overridden, because those are different facts and an administrator has to
 * be able to tell them apart to know whether a future university-wide change
 * will reach it.
 */
export function AcademicSystemsPanel() {
  const overview = useAcademicSystemOverview();
  const updateUniversity = useUpdateUniversity();
  const setOverride = useSetFacultyAcademicSystemOverride();
  const toast = useToast();

  /** The college whose override is being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    universityId: string;
    universityName: string;
    from: AcademicStructureKind;
    to: AcademicStructureKind;
    affected: number;
    keepOverride: number;
    /**
     * Colleges that will be configured for the new system while their entries are
     * still written in the old one. Quoted in the confirmation because those are
     * the entries an administrator will have to rename by hand.
     */
    needingAttention: number;
  } | null>(null);

  const collegesByUniversity = useMemo(() => {
    const map = new Map<string, AcademicSystemOverviewFaculty[]>();
    for (const college of overview.data?.faculties ?? []) {
      const list = map.get(college.universityId) ?? [];
      list.push(college);
      map.set(college.universityId, list);
    }
    return map;
  }, [overview.data]);

  if (overview.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (overview.error) {
    return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  }

  const universities = overview.data?.universities ?? [];

  if (universities.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-muted">
            No universities yet. Add one under Academic structure, then set its default academic
            system here.
          </p>
        </CardBody>
      </Card>
    );
  }

  const editingCollege = (overview.data?.faculties ?? []).find((c) => c.id === editing);

  /**
   * Counts what a university-wide change will actually move.
   *
   * Shown in the confirmation rather than after the fact: "changing the default"
   * sounds harmless until you know it is about to move nine colleges, and the
   * colleges with an override are the ones that will NOT move — which is the
   * part that is easy to forget and impossible to undo silently.
   *
   * `needingAttention` is the part that is genuinely not obvious. A college that
   * inherits will follow the new default immediately, but its LADDER does not
   * move with it: the existing entries keep the names they were given, so
   * switching a year-based university to levels leaves every college showing
   * "First Year … Fourth Year" under a levels question until an administrator
   * edits those entries under Years & levels. That is deliberate — renaming
   * students' academic years behind their backs is exactly what must not happen —
   * so it is stated up front rather than discovered afterwards.
   */
  function describeImpact(universityId: string, to: AcademicStructureKind) {
    const colleges = collegesByUniversity.get(universityId) ?? [];
    const current = overview.data?.universities.find((u) => u.id === universityId);
    const from = current?.defaultAcademicSystem;
    if (!from || from === to) return null;
    const inheriting = colleges.filter((c) => c.inherited);
    return {
      from,
      to,
      affected: inheriting.filter((c) => c.effectiveAcademicSystem !== to).length,
      keepOverride: colleges.filter((c) => !c.inherited).length,
      // These colleges will now be configured for the new system while their
      // existing entries are still written in the old one.
      needingAttention: inheriting.filter(
        (c) => c.effectiveAcademicSystem !== to && c.ladderKind !== null && c.ladderKind !== to,
      ).length,
    };
  }

  /** The confirmation payload, carrying the id so the save targets the right row. */
  function impactFor(universityId: string, to: AcademicStructureKind) {
    const impact = describeImpact(universityId, to);
    return impact ? { universityId, ...impact } : null;
  }

  async function commitUniversity(
    universityId: string,
    name: string,
    next: AcademicStructureKind,
  ) {
    const impact = impactFor(universityId, next);
    if (impact) {
      setConfirming({ universityName: name, ...impact });
      return;
    }
    await saveUniversity(universityId, next);
  }

  async function saveUniversity(universityId: string, next: AcademicStructureKind) {
    try {
      await updateUniversity.mutateAsync({ id: universityId, defaultAcademicSystem: next });
      // Says what did NOT happen. A toast that only reports the success leaves an
      // administrator believing the whole platform switched systems, when in fact
      // every existing year and level kept its name and every student kept their
      // placement.
      toast.success(
        'Default academic system updated',
        'Colleges that inherit now follow it; colleges with an override keep their own. Existing years and levels were not renamed — any college whose entries are still in the old wording is flagged on this page.',
      );
    } catch (error) {
      toast.error(error);
    }
  }

  async function saveOverride(collegeId: string, next: AcademicStructureKind | null) {
    try {
      await setOverride.mutateAsync({ id: collegeId, academicSystemOverride: next });
      setEditing(null);
      toast.success(
        next ? 'Override set' : 'Override cleared',
        next
          ? 'This college now keeps its own system whatever the university default becomes.'
          : 'This college follows its university again.',
      );
    } catch (error) {
      toast.error(error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        Explains the two-level model before the first control, because "Default"
        and "Override" mean nothing until the reader knows one inherits from the
        other.
      */}
      <p className="max-w-3xl text-xs text-muted">
        Each university has a default academic system: year-based (نظام الفرق) or level-based
        (نظام الليفلز). Every college follows its university&rsquo;s default unless it overrides
        it. A college can be overridden in either direction regardless of whether the university
        is government or private — ownership and academic system are independent. Departments
        follow their college and cannot override it.
      </p>

      {universities.map((university) => {
        const colleges = collegesByUniversity.get(university.id) ?? [];
        return (
          <Card key={university.id}>
            <CardBody>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{university.name}</span>
                    <span dir="rtl" className="text-sm text-muted">
                      {university.nameAr}
                    </span>
                    {!university.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                    <Badge tone="neutral">
                      {academicSystemFullLabel(university.defaultAcademicSystem)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {colleges.length} college{colleges.length === 1 ? '' : 's'} ·{' '}
                    {colleges.filter((c) => c.inherited).length} inherit ·{' '}
                    {colleges.filter((c) => !c.inherited).length} override
                  </p>
                </div>

                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                    Default academic system
                    <select
                      className="h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm"
                      value={university.defaultAcademicSystem}
                      disabled={updateUniversity.isPending}
                      onChange={(event) => {
                        const next = event.target.value as AcademicStructureKind;
                        void commitUniversity(university.id, university.name, next);
                      }}
                    >
                      <option value="YEAR">Year-based — نظام الفرق</option>
                      <option value="LEVEL">Level-based — نظام الليفلز</option>
                    </select>
                  </label>
                </div>
              </div>

              {colleges.length === 0 ? (
                <p className="mt-3 text-xs text-muted">No colleges in this university yet.</p>
              ) : (
                <ul className="mt-3 flex flex-col divide-y divide-border/60">
                  {colleges.map((college) => (
                    <li
                      key={college.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">{college.name}</span>
                          <span dir="rtl" className="text-xs text-muted">
                            {college.nameAr}
                          </span>
                          <CollegeAcademicSystemBadge
                            system={college.effectiveAcademicSystem}
                            inherited={college.inherited}
                            redundantOverride={college.redundantOverride}
                          />
                        </div>
                        {/*
                          Says the consequence, not the value: whether this
                          college follows the university is the actionable fact.
                        */}
                        <p className="mt-0.5 text-xs text-muted">
                          {college.inherited
                            ? `Follows the university — ${academicSystemFullLabel(
                                university.defaultAcademicSystem,
                              )}`
                            : 'Set on this college — it will not change with the university'}
                        </p>
                        {/*
                          The one state on this screen that needs an
                          administrator's attention: the college is configured for
                          one system while its entries are written in the other.

                          This is the normal, expected result of changing a
                          university's default — the configuration moves, the
                          ladder does not. It is surfaced rather than resolved,
                          because the two fixes are an administrator's to choose
                          (rename the entries, or change the override) and either
                          one rewrites names students already recognise.
                        */}
                        {college.ladderMismatch && college.ladderKind ? (
                          <p className="mt-1 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">
                            Configured as{' '}
                            {academicSystemFullLabel(college.effectiveAcademicSystem)}, but its
                            entries are still {academicSystemFullLabel(college.ladderKind)} (for
                            example &ldquo;First Year&rdquo;). Nothing was renamed — edit the
                            entries under Other data → Years &amp; levels, or change this
                            college&rsquo;s override.
                          </p>
                        ) : null}
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditing(college.id)}
                        disabled={setOverride.isPending}
                      >
                        {college.inherited ? 'Override' : 'Change override'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        );
      })}

      {editingCollege ? (
        <OverrideDialog
          collegeName={editingCollege.name}
          collegeNameAr={editingCollege.nameAr}
          universityName={editingCollege.universityName}
          /*
            Passed through so the "Inherit from university — Levels" option can
            name the value it would inherit. Without it the option reads as a
            bare "Inherit", which is the ambiguity this screen exists to remove.
          */
          universityDefault={
            universities.find((u) => u.id === editingCollege.universityId)
              ?.defaultAcademicSystem ?? null
          }
          value={editingCollege.academicSystemOverride}
          busy={setOverride.isPending}
          onClose={() => setEditing(null)}
          onSave={(next) => void saveOverride(editingCollege.id, next)}
        />
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (!confirming) return;
          // The id is carried through rather than re-derived from the kind: two
          // universities may share a default, and matching on the old value would
          // pick whichever came first in the list — silently changing the wrong
          // university.
          if (confirming.universityId)
            void saveUniversity(confirming.universityId, confirming.to);
          setConfirming(null);
        }}
        title="Change the default academic system?"
        message={
          confirming ? (
            <>
              <strong>{confirming.universityName}</strong> moves from{' '}
              {academicSystemFullLabel(confirming.from)} to{' '}
              {academicSystemFullLabel(confirming.to)}. <strong>{confirming.affected}</strong>{' '}
              college
              {confirming.affected === 1 ? '' : 's'} will follow automatically
              {confirming.affected === 1 ? 's' : ''}.{' '}
              {confirming.keepOverride > 0 ? (
                <>
                  <strong>{confirming.keepOverride}</strong> college
                  {confirming.keepOverride === 1 ? '' : 's'} with an override will keep{' '}
                  {confirming.keepOverride === 1 ? 'its' : 'their'} own system.
                </>
              ) : (
                'No college has an override, so all of them will follow.'
              )}{' '}
              {/*
                The consequence that is not visible from the value alone, and the
                one this screen exists to prevent an administrator discovering the
                hard way.
              */}
              <strong>Existing years and levels are not changed.</strong> Nothing is renamed,
              renumbered or deleted. Any college whose entries are still written in the old
              vocabulary will be flagged on this page, and you rename them yourself under Other
              data → Years &amp; levels.
              {confirming.needingAttention > 0 ? (
                <>
                  {' '}
                  <strong>{confirming.needingAttention}</strong> college
                  {confirming.needingAttention === 1 ? '' : 's'} will need that.
                </>
              ) : null}
            </>
          ) : null
        }
        confirmLabel="Change default"
      />
    </div>
  );
}

/**
 * The college override dialog.
 *
 * A single control with an explicit "Inherit" option rather than a checkbox.
 * The checkbox version reads as "enable an override" without saying what it
 * overrides, which is the ambiguity this screen exists to remove.
 */
function OverrideDialog({
  collegeName,
  collegeNameAr,
  universityName,
  universityDefault,
  value,
  busy,
  onClose,
  onSave,
}: {
  collegeName: string;
  collegeNameAr: string;
  universityName: string;
  universityDefault: AcademicStructureKind | null;
  value: AcademicStructureKind | null;
  busy: boolean;
  onClose: () => void;
  onSave: (next: AcademicStructureKind | null) => void;
}) {
  /*
    Seeded from the row, but the dialog is mounted once per `editing` id — and
    `editing` is set to null on close, so a fresh mount always reflects the
    current value. Keying the modal on the college id would additionally make
    that explicit rather than relying on the unmount.
  */
  const [draft, setDraft] = useState<AcademicStructureKind | null>(value);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Academic system for ${collegeName}`}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)} loading={busy} disabled={draft === value}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border/60 bg-subtle/40 p-3">
          <SectionTitle>{collegeName}</SectionTitle>
          <p dir="rtl" className="mt-0.5 text-sm text-muted">
            {collegeNameAr}
          </p>
          <p className="mt-1 text-xs text-muted">Belongs to {universityName}</p>
        </div>

        <CollegeAcademicSystemField
          value={draft}
          universityDefault={universityDefault}
          onChange={setDraft}
          disabled={busy}
        />

        {/*
          The consequence, spelled out before the save rather than after it.
        */}
        <p className="text-xs text-muted">
          {draft === null ? (
            <>
              This college will follow {universityName}. Changing that university&rsquo;s
              default later will change this college too.
            </>
          ) : (
            <>
              This college will use {academicSystemFullLabel(draft)} whatever {universityName}
              &rsquo;s default becomes. Only this college is affected.
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}
