import type {
  CreateMaterialInput,
  LibraryAudienceInput,
  LibraryDepartmentScope,
  LibraryMaterialAudience,
  LibraryMaterialDetail,
  LibraryPartRow,
  UpdateMaterialInput,
} from '@/types/commerce';
import type {
  AcademicStructureKind,
  AcademicYear,
  Department,
  Faculty,
  University,
} from '@/types/domain';

/**
 * The Library audience, as a value the material form edits.
 *
 * Pure functions only — no React, no requests — so every rule here is tested
 * directly (`e2e/library-audience-logic.spec.ts`) and the form is a thin layer
 * over it.
 *
 * The backend is the authority (`LibraryService.assertAudience`): it re-checks
 * every relationship, because a filtered dropdown stops nobody posting whatever
 * they like. What this module adds is that the form never *offers* a
 * combination the backend will refuse, and never quietly keeps an id that has
 * stopped being valid:
 *
 *   - university and college are required (no platform-wide materials);
 *   - FACULTY reaches the whole college and carries no departments;
 *   - DEPARTMENTS carries at least one department, all of that college;
 *   - General and Programs departments are never combined; the track is read
 *     from the departments' own `studyType`, never chosen separately;
 *   - the year/level is optional, a browse filter only, and must be a rung of
 *     the ladder that governs the audience — for several departments, a rung
 *     every one of their ladders shares.
 */

export type StudyTrack = 'GENERAL' | 'PROGRAMS';

/** What the form holds. Empty string / empty list means "not chosen". */
export interface AudienceDraft {
  universityId: string;
  facultyId: string;
  departmentScope: LibraryDepartmentScope;
  departmentIds: string[];
  /** Every year/level ticked; empty means "all years". */
  academicYearIds: string[];
}

export const EMPTY_AUDIENCE: AudienceDraft = Object.freeze({
  universityId: '',
  facultyId: '',
  departmentScope: 'FACULTY',
  departmentIds: [],
  academicYearIds: [],
}) as AudienceDraft;

/** More rungs than any ladder has; the backend refuses a longer list. */
export const MAX_ACADEMIC_YEARS = 20;

/**
 * The saved years of a material, whichever generation of backend answered:
 * the list when it is there, else the single legacy rung.
 */
export function savedAcademicYearIds(
  material: Pick<LibraryMaterialDetail, 'academicYearId' | 'academicYearIds'>,
): string[] {
  if (material.academicYearIds) return [...new Set(material.academicYearIds)];
  return material.academicYearId ? [material.academicYearId] : [];
}

/** The saved audience of a material, as the form starts from it. */
export function audienceFromMaterial(
  material: Pick<
    LibraryMaterialDetail,
    | 'universityId'
    | 'facultyId'
    | 'academicYearId'
    | 'academicYearIds'
    | 'departmentScope'
    | 'departmentIds'
  > | null,
): AudienceDraft {
  if (!material) return { ...EMPTY_AUDIENCE, departmentIds: [], academicYearIds: [] };
  const departmentScope = material.departmentScope ?? 'FACULTY';
  return {
    universityId: material.universityId ?? '',
    facultyId: material.facultyId ?? '',
    departmentScope,
    // A FACULTY material has no links; anything else would be a stored
    // inconsistency the backend itself refuses to write.
    departmentIds: departmentScope === 'DEPARTMENTS' ? [...(material.departmentIds ?? [])] : [],
    academicYearIds: savedAcademicYearIds(material),
  };
}

// ---------------------------------------------------------------------------
// Transitions — each upstream change clears what it invalidates
// ---------------------------------------------------------------------------

/** A college belongs to one university: everything below it goes. */
export function selectUniversity(draft: AudienceDraft, universityId: string): AudienceDraft {
  if (universityId === draft.universityId) return draft;
  return {
    universityId,
    facultyId: '',
    departmentScope: draft.departmentScope,
    departmentIds: [],
    academicYearIds: [],
  };
}

/**
 * Departments belong to one college, and the years/levels belong to the
 * college's ladder — a different college can count in different rungs.
 */
export function selectFaculty(draft: AudienceDraft, facultyId: string): AudienceDraft {
  if (facultyId === draft.facultyId) return draft;
  return { ...draft, facultyId, departmentIds: [], academicYearIds: [] };
}

/**
 * Switching scope never carries department ids across: FACULTY must send none,
 * and a fresh DEPARTMENTS selection starts empty. The years/levels are kept
 * and re-checked against the ladder the new scope resolves to.
 */
export function selectScope(
  draft: AudienceDraft,
  scope: LibraryDepartmentScope,
): AudienceDraft {
  if (scope === draft.departmentScope) return draft;
  return { ...draft, departmentScope: scope, departmentIds: [] };
}

export function toggleDepartment(
  draft: AudienceDraft,
  departmentId: string,
  checked: boolean,
): AudienceDraft {
  const has = draft.departmentIds.includes(departmentId);
  if (checked === has) return draft;
  return {
    ...draft,
    departmentIds: checked
      ? [...draft.departmentIds, departmentId]
      : draft.departmentIds.filter((id) => id !== departmentId),
  };
}

/** A year/level never changes the college or the departments. */
export function toggleAcademicYear(
  draft: AudienceDraft,
  academicYearId: string,
  checked: boolean,
): AudienceDraft {
  const has = draft.academicYearIds.includes(academicYearId);
  if (checked === has) return draft;
  return {
    ...draft,
    academicYearIds: checked
      ? [...draft.academicYearIds, academicYearId]
      : draft.academicYearIds.filter((id) => id !== academicYearId),
  };
}

/** Back to "all years". */
export function clearAcademicYears(draft: AudienceDraft): AudienceDraft {
  return draft.academicYearIds.length === 0 ? draft : { ...draft, academicYearIds: [] };
}

/**
 * The years in ladder order, for display and for the legacy single id. Ids
 * the ladder does not list keep their ticked order after the known ones.
 */
export function orderedAcademicYearIds(
  ids: string[],
  ladder: Pick<AcademicYear, 'id'>[],
): string[] {
  const unique = [...new Set(ids)];
  const known = ladder.map((entry) => entry.id).filter((id) => unique.includes(id));
  return [...known, ...unique.filter((id) => !known.includes(id))];
}

// ---------------------------------------------------------------------------
// Track — derived from the departments, never chosen on its own
// ---------------------------------------------------------------------------

/** Same default the course picker uses for a row that predates the column. */
export function trackOfDepartment(department: Pick<Department, 'studyType'>): StudyTrack {
  return department.studyType ?? 'GENERAL';
}

/**
 * The track of a selection: null when nothing (known) is selected, MIXED when
 * the selection combines both — which the backend refuses.
 */
export function selectionTrack(
  departments: Pick<Department, 'id' | 'studyType'>[],
  selectedIds: string[],
): StudyTrack | 'MIXED' | null {
  const tracks = new Set(
    departments.filter((d) => selectedIds.includes(d.id)).map((d) => trackOfDepartment(d)),
  );
  if (tracks.size === 0) return null;
  if (tracks.size > 1) return 'MIXED';
  return [...tracks][0] ?? null;
}

/** Which tracks a college's departments cover. */
export function collegeTracks(departments: Pick<Department, 'studyType'>[]): StudyTrack[] {
  const tracks = new Set(departments.map((d) => trackOfDepartment(d)));
  return (['GENERAL', 'PROGRAMS'] as const).filter((t) => tracks.has(t));
}

// ---------------------------------------------------------------------------
// The year/level ladder for an audience
// ---------------------------------------------------------------------------

export interface LadderState {
  /** idle: nothing to resolve yet (no college, or no departments chosen). */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Rungs valid for the whole audience, in ladder order. */
  entries: AcademicYear[];
  kind: AcademicStructureKind | null;
  /** Several departments whose ladders share no rung. */
  conflict: boolean;
  /**
   * Re-requests only the scopes that failed. Present while `status` is
   * 'error'; the draft is never touched by a failure or a retry.
   */
  retry?: () => void;
}

export const IDLE_LADDER: LadderState = Object.freeze({
  status: 'idle',
  entries: [],
  kind: null,
  conflict: false,
}) as LadderState;

/**
 * Which `catalog/academic-years` scopes the audience resolves through — the
 * same scopes the backend's `checkYearInLadder` resolves: the college for a
 * whole-college material, each department for a department selection.
 */
export function ladderScopes(
  draft: AudienceDraft,
): ({ facultyId: string } | { departmentId: string })[] {
  if (!draft.facultyId) return [];
  if (draft.departmentScope === 'FACULTY') return [{ facultyId: draft.facultyId }];
  return [...new Set(draft.departmentIds)].sort().map((departmentId) => ({ departmentId }));
}

/** The rungs every list shares, in the first list's order. */
export function intersectLadders(lists: AcademicYear[][]): Omit<LadderState, 'status'> {
  if (lists.length === 0) return { entries: [], kind: null, conflict: false };
  const [first, ...rest] = lists;
  const entries = (first ?? []).filter((entry) =>
    rest.every((list) => list.some((other) => other.id === entry.id)),
  );
  const nonEmpty = lists.filter((list) => list.length > 0);
  return {
    entries,
    kind: entries[0]?.kind ?? nonEmpty[0]?.[0]?.kind ?? null,
    conflict: lists.length > 1 && entries.length === 0 && nonEmpty.length > 0,
  };
}

export function ladderLabel(kind: AcademicStructureKind | null): string {
  if (kind === 'LEVEL') return 'Level';
  if (kind === 'YEAR') return 'Year';
  return 'Year / level';
}

// ---------------------------------------------------------------------------
// Validation — what the form refuses before the backend has to
// ---------------------------------------------------------------------------

export interface AudienceContext {
  /** Active universities, once loaded. */
  universities?: Pick<University, 'id'>[];
  /** Active colleges of the chosen university, once loaded. */
  faculties?: Pick<Faculty, 'id'>[];
  /** Active departments of the chosen college, once loaded. */
  departments?: Pick<Department, 'id' | 'studyType'>[];
  ladder: LadderState;
}

export type AudienceField = keyof AudienceDraft;

export interface AudienceCheck {
  errors: Partial<Record<AudienceField, string>>;
  /** Something needed to validate is still loading; not an error, but not ready. */
  pending: boolean;
}

export function checkAudience(draft: AudienceDraft, ctx: AudienceContext): AudienceCheck {
  const errors: Partial<Record<AudienceField, string>> = {};
  let pending = false;

  if (!draft.universityId) errors.universityId = 'Choose a university.';
  else if (ctx.universities && !ctx.universities.some((u) => u.id === draft.universityId)) {
    errors.universityId = 'This university is no longer active. Choose another.';
  } else if (!ctx.universities) pending = true;

  if (!draft.facultyId) errors.facultyId = 'Choose a college.';
  else if (ctx.faculties && !ctx.faculties.some((f) => f.id === draft.facultyId)) {
    errors.facultyId = 'This college is no longer active in this university. Choose another.';
  } else if (!ctx.faculties) pending = true;

  if (draft.departmentScope === 'FACULTY' && draft.departmentIds.length > 0) {
    errors.departmentIds = 'A whole-college material has no department selection.';
  }

  if (draft.departmentScope === 'DEPARTMENTS' && draft.facultyId) {
    if (draft.departmentIds.length === 0) {
      errors.departmentIds = 'Choose at least one department.';
    } else if (!ctx.departments) {
      pending = true;
    } else {
      const known = new Set(ctx.departments.map((d) => d.id));
      const unavailable = draft.departmentIds.filter((id) => !known.has(id));
      if (unavailable.length > 0) {
        errors.departmentIds =
          unavailable.length === 1
            ? 'One selected department is no longer offered by this college. Remove it.'
            : `${unavailable.length} selected departments are no longer offered by this college. Remove them.`;
      } else if (selectionTrack(ctx.departments, draft.departmentIds) === 'MIXED') {
        errors.departmentIds =
          'General and Programs departments cannot be combined in one material.';
      }
    }
  }

  const years = [...new Set(draft.academicYearIds)];
  if (years.length > 0 && !errors.facultyId && !errors.departmentIds) {
    const { ladder } = ctx;
    const label = ladderLabel(ladder.kind).toLowerCase();
    if (years.length > MAX_ACADEMIC_YEARS) {
      errors.academicYearIds = `Choose at most ${MAX_ACADEMIC_YEARS} ${label}s, or clear them for all.`;
    } else if (ladder.status === 'loading' || ladder.status === 'idle') {
      pending = true;
    } else if (ladder.status === 'error') {
      errors.academicYearIds =
        'Cannot be checked until the years/levels load. Retry below, or clear them.';
    } else if (ladder.conflict) {
      errors.academicYearIds =
        'The selected departments do not share one ladder, so no year/level fits all of them. Clear them.';
    } else {
      const foreign = years.filter((id) => !ladder.entries.some((entry) => entry.id === id));
      if (foreign.length === 1) {
        errors.academicYearIds = `One selected ${label} is not part of the ladder for this audience. Remove it.`;
      } else if (foreign.length > 1) {
        errors.academicYearIds = `${foreign.length} selected ${label}s are not part of the ladder for this audience. Remove them.`;
      }
    }
  }

  return { errors, pending };
}

// ---------------------------------------------------------------------------
// Payloads — the exact contract
// ---------------------------------------------------------------------------

/**
 * Every audience key, always. The years go as the list and, for a backend
 * that predates it, as the single legacy id — the first ticked rung, or an
 * explicit `null` for "all years" (the backend re-derives the legacy column
 * in ladder order whatever is sent here).
 */
export function audiencePayload(draft: AudienceDraft): LibraryAudienceInput {
  const academicYearIds = [...new Set(draft.academicYearIds)];
  return {
    universityId: draft.universityId,
    facultyId: draft.facultyId,
    departmentScope: draft.departmentScope,
    departmentIds:
      draft.departmentScope === 'DEPARTMENTS' ? [...new Set(draft.departmentIds)] : [],
    academicYearId: academicYearIds[0] ?? null,
    academicYearIds,
  };
}

/** Same audience, whatever order the departments or years were ticked in. */
export function sameAudience(a: AudienceDraft, b: AudienceDraft): boolean {
  const pa = audiencePayload(a);
  const pb = audiencePayload(b);
  const sameSet = (x: string[], y: string[]) =>
    x.length === y.length && x.every((id) => y.includes(id));
  return (
    pa.universityId === pb.universityId &&
    pa.facultyId === pb.facultyId &&
    pa.departmentScope === pb.departmentScope &&
    sameSet(pa.academicYearIds, pb.academicYearIds) &&
    sameSet(pa.departmentIds, pb.departmentIds)
  );
}

/** The non-audience fields the material form edits. */
export interface MaterialScalars {
  title: string;
  titleAr: string;
  description: string;
  subjectId: string;
}

export function createMaterialBody(
  scalars: MaterialScalars,
  draft: AudienceDraft,
): CreateMaterialInput {
  return {
    title: scalars.title,
    titleAr: scalars.titleAr || undefined,
    description: scalars.description || undefined,
    subjectId: scalars.subjectId || undefined,
    ...audiencePayload(draft),
  };
}

/**
 * An edit. Title, Arabic title and description go as the form has always sent
 * them; the audience goes as one complete block, and only when it actually
 * changed — so editing a title can never move who sees the material, and the
 * backend's all-or-nothing rule is never tripped by a partial block.
 *
 * The subject is sent only when it changed: a new id to set it, and an
 * explicit `null` to clear it (`UpdateMaterialDto.subjectId` is nullable and
 * the service writes it through). An unchanged subject is left out, so a
 * subject that has since been deactivated — and so is missing from the
 * dropdown — is never cleared or rewritten by an unrelated edit.
 */
export function updateMaterialBody(
  scalars: MaterialScalars,
  draft: AudienceDraft,
  saved: AudienceDraft,
  savedSubjectId: string | null = null,
): { body: UpdateMaterialInput; audienceChanged: boolean } {
  const audienceChanged = !sameAudience(draft, saved);
  const subjectChanged = scalars.subjectId !== (savedSubjectId ?? '');
  return {
    audienceChanged,
    body: {
      title: scalars.title,
      titleAr: scalars.titleAr || undefined,
      description: scalars.description || undefined,
      ...(subjectChanged ? { subjectId: scalars.subjectId || null } : {}),
      ...(audienceChanged ? audiencePayload(draft) : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Describing an audience — the detail card and the old-versus-new confirmation
// ---------------------------------------------------------------------------

export interface AudienceSummary {
  university: string;
  college: string;
  reach: string;
  departments: string[];
  yearLevel: string;
}

const NOT_SET = 'Not set';
const ANY_YEAR = 'Any — no year/level filter';

export function reachLabel(scope: LibraryDepartmentScope): string {
  return scope === 'DEPARTMENTS'
    ? 'Selected departments only'
    : 'Entire college — every department';
}

/** The saved years, whichever generation of backend answered. */
export function savedAcademicYears(
  audience: LibraryMaterialAudience | undefined | null,
): { id: string; name: string; kind: AcademicStructureKind }[] {
  if (audience?.academicYears) return audience.academicYears;
  return audience?.academicYear ? [audience.academicYear] : [];
}

/** "Preparatory year, First year (Year)" — one ladder word, not one per rung. */
export function describeYears(
  years: { name: string; kind: AcademicStructureKind | null }[],
): string {
  if (years.length === 0) return ANY_YEAR;
  const kind = years[0]?.kind ?? null;
  return `${years.map((y) => y.name).join(', ')} (${ladderLabel(kind)})`;
}

export function summarizeSaved(
  audience: LibraryMaterialAudience | undefined | null,
): AudienceSummary {
  const scope = audience?.departmentScope ?? 'FACULTY';
  return {
    university: audience?.university?.name ?? NOT_SET,
    college: audience?.faculty?.name ?? NOT_SET,
    reach: reachLabel(scope),
    departments:
      scope === 'DEPARTMENTS'
        ? (audience?.departments ?? []).map((d) => `${d.name} (${trackName(d.studyType)})`)
        : [],
    yearLevel: describeYears(savedAcademicYears(audience)),
  };
}

export function summarizeDraft(
  draft: AudienceDraft,
  lookup: {
    universities?: Pick<University, 'id' | 'name'>[];
    faculties?: Pick<Faculty, 'id' | 'name'>[];
    departments?: Pick<Department, 'id' | 'name' | 'studyType'>[];
    ladder: LadderState;
  },
): AudienceSummary {
  const nameOf = (list: { id: string; name: string }[] | undefined, id: string) =>
    id ? (list?.find((item) => item.id === id)?.name ?? 'Unavailable') : NOT_SET;
  const years = orderedAcademicYearIds(draft.academicYearIds, lookup.ladder.entries).map(
    (id) => {
      const entry = lookup.ladder.entries.find((rung) => rung.id === id);
      return { name: entry?.name ?? 'Unavailable', kind: lookup.ladder.kind };
    },
  );
  return {
    university: nameOf(lookup.universities, draft.universityId),
    college: nameOf(lookup.faculties, draft.facultyId),
    reach: reachLabel(draft.departmentScope),
    departments:
      draft.departmentScope === 'DEPARTMENTS'
        ? draft.departmentIds.map((id) => {
            const department = lookup.departments?.find((d) => d.id === id);
            return department
              ? `${department.name} (${trackName(trackOfDepartment(department))})`
              : 'Unavailable department';
          })
        : [],
    yearLevel: describeYears(years),
  };
}

export function trackName(track: StudyTrack): string {
  return track === 'PROGRAMS' ? 'Programs' : 'General';
}

/** The rows of the old-versus-new table: every row, flagged when it moved. */
export function audienceDiff(
  before: AudienceSummary,
  after: AudienceSummary,
): { label: string; before: string; after: string; changed: boolean }[] {
  const join = (items: string[]) => (items.length > 0 ? items.join(', ') : '—');
  const rows = [
    { label: 'University', before: before.university, after: after.university },
    { label: 'College', before: before.college, after: after.college },
    { label: 'Reaches', before: before.reach, after: after.reach },
    { label: 'Departments', before: join(before.departments), after: join(after.departments) },
    { label: 'Year / level', before: before.yearLevel, after: after.yearLevel },
  ];
  return rows.map((row) => ({ ...row, changed: row.before !== row.after }));
}

/**
 * Backend field errors for the audience keys, ready for the editor. A refusal
 * of the legacy single `academicYearId` lands on the years control too.
 */
export function audienceServerErrors(
  fields: Record<string, string[]>,
): Partial<Record<AudienceField, string>> {
  const out: Partial<Record<AudienceField, string>> = {};
  for (const key of ['universityId', 'facultyId', 'departmentScope', 'departmentIds'] as const) {
    const messages = fields[key];
    if (messages && messages.length > 0) out[key] = sentence(messages.join('; '));
  }
  const years = [...(fields.academicYearIds ?? []), ...(fields.academicYearId ?? [])];
  if (years.length > 0) out.academicYearIds = sentence(years.join('; '));
  return out;
}

/** The backend's messages are lower-case fragments ("choose a college"). */
function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const capitalised = trimmed[0]!.toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

/** Every field message as one readable line, for a toast. */
export function describeFieldErrors(fields: Record<string, string[]>): string {
  const label: Record<string, string> = {
    universityId: 'University',
    facultyId: 'College',
    departmentScope: 'Audience',
    departmentIds: 'Departments',
    academicYearId: 'Year / level',
    academicYearIds: 'Years / levels',
    coverKey: 'Cover image',
    partIds: 'Documents',
  };
  return Object.entries(fields)
    .map(([key, messages]) => `${label[key] ?? key}: ${messages.join('; ')}`)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Packages — one material, its own parts only
// ---------------------------------------------------------------------------

/**
 * Splits a package's stored membership into parts this material still has and
 * parts that were withdrawn (deleted) since. The admin read lists items by id
 * even after their part is gone; sending those ids back is refused whole.
 */
export function packageMembership(
  storedPartIds: string[],
  parts: Pick<LibraryPartRow, 'id'>[],
): { current: string[]; withdrawn: string[] } {
  const own = new Set(parts.map((p) => p.id));
  return {
    current: storedPartIds.filter((id) => own.has(id)),
    withdrawn: storedPartIds.filter((id) => !own.has(id)),
  };
}

/** Only this material's parts, de-duplicated, in the order chosen. */
export function packagePartIds(
  selected: string[],
  parts: Pick<LibraryPartRow, 'id'>[],
): string[] {
  const own = new Set(parts.map((p) => p.id));
  return [...new Set(selected)].filter((id) => own.has(id));
}

/**
 * What a contents change would take OUT of a package, before it is sent.
 *
 * `stored` is the membership the admin read reports — which still lists items
 * whose document was withdrawn (soft-deleted) since. The backend's
 * `updatePackage` replaces membership and refuses any id that is not a live
 * part of the material, so a withdrawn item can never be kept through a
 * contents change: it is removed, and the form must say so and ask first.
 * `next` undefined means the contents are not being changed: nothing leaves.
 */
export function packageRemovals(
  stored: string[],
  next: string[] | undefined,
  parts: Pick<LibraryPartRow, 'id' | 'title'>[],
): { current: { id: string; title: string }[]; withdrawn: string[] } {
  if (!next) return { current: [], withdrawn: [] };
  const leaving = stored.filter((id) => !next.includes(id));
  return {
    current: parts
      .filter((part) => leaving.includes(part.id))
      .map((part) => ({ id: part.id, title: part.title })),
    withdrawn: leaving.filter((id) => !parts.some((part) => part.id === id)),
  };
}

/**
 * What an edit sends as `partIds`: nothing when the selection is unchanged —
 * so a price-only edit leaves the stored contents exactly as they are — and
 * otherwise the new selection, restricted to this material's parts.
 */
export function packagePartIdsForUpdate(
  original: string[],
  selected: string[],
  parts: Pick<LibraryPartRow, 'id'>[],
): string[] | undefined {
  const next = packagePartIds(selected, parts);
  const unchanged =
    next.length === original.length && next.every((id, index) => original[index] === id);
  return unchanged ? undefined : next;
}
