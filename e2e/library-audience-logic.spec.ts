import { expect, test } from '@playwright/test';

import {
  EMPTY_AUDIENCE,
  IDLE_LADDER,
  addYearGroup,
  audienceServerGroupErrors,
  departmentsForRung,
  discardsSelection,
  perYearRungs,
  removeYearGroup,
  selectYearMode,
  setYearDepartments,
  toggleYearDepartment,
  type DepartmentLadders,
  audienceDiff,
  audienceFromMaterial,
  audiencePayload,
  audienceServerErrors,
  checkAudience,
  createMaterialBody,
  intersectLadders,
  ladderScopes,
  packageMembership,
  packagePartIds,
  packagePartIdsForUpdate,
  packageRemovals,
  clearAcademicYears,
  orderedAcademicYearIds,
  sameAudience,
  savedAcademicYearIds,
  selectFaculty,
  selectScope,
  selectUniversity,
  selectionTrack,
  summarizeDraft,
  summarizeSaved,
  toggleAcademicYear,
  toggleDepartment,
  updateMaterialBody,
  type AudienceDraft,
  type LadderState,
} from '../src/features/library/audience';
import type { AcademicYear } from '../src/types/domain';

/**
 * The Library audience rules, tested directly — no browser, no stub.
 *
 * `src/features/library/audience.ts` is pure, so the transitions, the
 * validation and the exact request bodies are asserted here without driving a
 * form. `library-audience.spec.ts` then checks the form is wired to them.
 */

const year = (id: string, order: number, kind: 'YEAR' | 'LEVEL' = 'YEAR'): AcademicYear => ({
  id,
  name: `${kind === 'YEAR' ? 'Year' : 'Level'} ${order}`,
  nameAr: null,
  order,
  isActive: true,
  kind,
});

const YEARS = [year('y1', 1), year('y2', 2)];
const LEVELS = [year('l0', 0, 'LEVEL'), year('l1', 1, 'LEVEL')];
const ready = (entries: AcademicYear[]): LadderState => ({
  status: 'ready',
  ...intersectLadders([entries]),
});

const DEPARTMENTS = [
  { id: 'prep', studyType: 'GENERAL' as const },
  { id: 'civil', studyType: 'GENERAL' as const },
  { id: 'cce', studyType: 'PROGRAMS' as const },
];

/** Departments chosen per year: First year -> Preparatory + Civil. */
const FULL: AudienceDraft = {
  universityId: 'uni',
  facultyId: 'fac',
  departmentScope: 'DEPARTMENTS',
  departmentIds: ['prep', 'civil'],
  academicYearIds: ['y1'],
  yearMode: 'SELECTED_YEARS',
  yearDepartments: { y1: ['prep', 'civil'] },
};

/** Whole college, filed under First year: the shape the single ladder governs. */
const FAC_YEARS: AudienceDraft = {
  ...FULL,
  departmentScope: 'FACULTY',
  departmentIds: [],
  yearMode: 'ALL_YEARS',
  yearDepartments: {},
};

/** Selected departments, all years: one department list, no years. */
const DEPTS_ALL: AudienceDraft = {
  ...FULL,
  yearMode: 'ALL_YEARS',
  academicYearIds: [],
  yearDepartments: {},
};

/** Every audience key a request body carries, in both year spellings. */
const AUDIENCE_KEYS = [
  'academicYearId',
  'academicYearIds',
  'audienceMappings',
  'departmentIds',
  'departmentScope',
  'facultyId',
  'universityId',
  'yearScope',
];

const CTX = {
  universities: [{ id: 'uni' }],
  faculties: [{ id: 'fac' }],
  departments: DEPARTMENTS,
  ladder: ready(YEARS),
};

test.describe('dependent-field resets', () => {
  test('changing the university clears college, departments and years/levels', () => {
    expect(selectUniversity(FULL, 'other')).toEqual({
      universityId: 'other',
      facultyId: '',
      departmentScope: 'DEPARTMENTS',
      departmentIds: [],
      academicYearIds: [],
      yearMode: 'ALL_YEARS',
      yearDepartments: {},
    });
  });

  test('re-selecting the same university changes nothing', () => {
    expect(selectUniversity(FULL, 'uni')).toBe(FULL);
  });

  test('changing the college clears departments and years/levels, keeps the university', () => {
    expect(selectFaculty(FULL, 'fac2')).toEqual({
      ...FULL,
      facultyId: 'fac2',
      departmentIds: [],
      academicYearIds: [],
      yearMode: 'ALL_YEARS',
      yearDepartments: {},
    });
  });

  test('switching to FACULTY clears department ids; switching back starts empty', () => {
    const faculty = selectScope(FULL, 'FACULTY');
    expect(faculty.departmentIds).toEqual([]);
    expect(faculty.academicYearIds).toEqual(['y1']);
    expect(selectScope(faculty, 'DEPARTMENTS').departmentIds).toEqual([]);
  });

  test('ticking a year/level adds it, unticking removes it, neither alters the rest', () => {
    const both = toggleAcademicYear(FULL, 'y2', true);
    expect(both).toEqual({ ...FULL, academicYearIds: ['y1', 'y2'] });
    expect(toggleAcademicYear(both, 'y1', false).academicYearIds).toEqual(['y2']);
    expect(toggleAcademicYear(FULL, 'y1', true)).toBe(FULL);
    expect(both.facultyId).toBe('fac');
    expect(both.departmentIds).toEqual(['prep', 'civil']);
  });

  test('clearing the years returns to "all years" and is a no-op when already there', () => {
    const cleared = clearAcademicYears(FULL);
    expect(cleared.academicYearIds).toEqual([]);
    expect(clearAcademicYears(cleared)).toBe(cleared);
  });

  test('years are shown in ladder order, unknown ones after', () => {
    expect(orderedAcademicYearIds(['y2', 'gone', 'y1', 'y2'], YEARS)).toEqual(['y1', 'y2', 'gone']);
  });

  test('toggling a department adds and removes it', () => {
    const added = toggleDepartment(FULL, 'cce', true);
    expect(added.departmentIds).toEqual(['prep', 'civil', 'cce']);
    expect(toggleDepartment(added, 'prep', false).departmentIds).toEqual(['civil', 'cce']);
    expect(toggleDepartment(FULL, 'prep', true)).toBe(FULL);
  });
});

test.describe('track — derived from the departments', () => {
  test('one track, none, or mixed', () => {
    expect(selectionTrack(DEPARTMENTS, ['prep', 'civil'])).toBe('GENERAL');
    expect(selectionTrack(DEPARTMENTS, ['cce'])).toBe('PROGRAMS');
    expect(selectionTrack(DEPARTMENTS, [])).toBeNull();
    expect(selectionTrack(DEPARTMENTS, ['prep', 'cce'])).toBe('MIXED');
  });

  test('a mixed selection is refused before it is sent', () => {
    const { errors } = checkAudience(
      { ...FULL, departmentIds: ['prep', 'cce'], academicYearIds: [] },
      CTX,
    );
    expect(errors.departmentIds).toMatch(/General and Programs/);
  });
});

test.describe('year/level ladder', () => {
  test('FACULTY resolves through the college; DEPARTMENTS through each department', () => {
    expect(ladderScopes({ ...FULL, departmentScope: 'FACULTY', departmentIds: [] })).toEqual([
      { facultyId: 'fac' },
    ]);
    expect(ladderScopes(FULL)).toEqual([{ departmentId: 'civil' }, { departmentId: 'prep' }]);
    expect(ladderScopes({ ...FULL, facultyId: '' })).toEqual([]);
  });

  test('YEAR and LEVEL ladders keep their kind', () => {
    expect(intersectLadders([YEARS]).kind).toBe('YEAR');
    expect(intersectLadders([LEVELS]).kind).toBe('LEVEL');
  });

  test('several departments offer only the rungs they all share', () => {
    const shared = intersectLadders([YEARS, [YEARS[0]!]]);
    expect(shared.entries.map((e) => e.id)).toEqual(['y1']);
    expect(shared.conflict).toBe(false);

    const disjoint = intersectLadders([YEARS, LEVELS]);
    expect(disjoint.entries).toEqual([]);
    expect(disjoint.conflict).toBe(true);
  });

  test('a rung outside the audience ladder is refused, not kept', () => {
    const { errors } = checkAudience({ ...FAC_YEARS, academicYearIds: ['l0'] }, CTX);
    expect(errors.academicYearIds).toMatch(/not part of the ladder/);
  });

  test('every ticked rung must be on the ladder, and the count is named', () => {
    const one = checkAudience({ ...FAC_YEARS, academicYearIds: ['y1', 'l0'] }, CTX).errors;
    expect(one.academicYearIds).toMatch(/^One selected year is not part/);
    const two = checkAudience({ ...FAC_YEARS, academicYearIds: ['y1', 'l0', 'l1'] }, CTX).errors;
    expect(two.academicYearIds).toMatch(/^2 selected years are not part/);
    expect(checkAudience({ ...FAC_YEARS, academicYearIds: ['y1', 'y2'] }, CTX).errors).toEqual({});
  });

  test('no year/level is always fine — it is a filter, not eligibility', () => {
    for (const draft of [{ ...FAC_YEARS, academicYearIds: [] }, DEPTS_ALL]) {
      const { errors, pending } = checkAudience(draft, CTX);
      expect(errors).toEqual({});
      expect(pending).toBe(false);
    }
  });

  test('a year/level waits for its ladder to load', () => {
    const { pending } = checkAudience(FAC_YEARS, {
      ...CTX,
      ladder: { ...IDLE_LADDER, status: 'loading' },
    });
    expect(pending).toBe(true);
  });

  test('departments on different ladders each carry their own year, never a shared one', () => {
    // Replaces "no shared ladder, no year": per-year groups check each year
    // against the ladder of the departments listed under it.
    const ladders = {
      status: 'ready' as const,
      byDepartment: { prep: YEARS, civil: LEVELS },
    };
    const ctx = { ...CTX, departmentLadders: ladders };
    const ok = {
      ...FULL,
      academicYearIds: ['y1', 'l0'],
      yearDepartments: { y1: ['prep'], l0: ['civil'] },
    };
    expect(checkAudience(ok, ctx).groupErrors).toEqual({});
    const shared = { ...FULL, yearDepartments: { y1: ['prep', 'civil'] } };
    expect(checkAudience(shared, ctx).groupErrors.y1).toMatch(/cannot be filed under/);
  });
});

test.describe('FACULTY and DEPARTMENTS scopes', () => {
  test('university and college are required', () => {
    const { errors } = checkAudience(EMPTY_AUDIENCE, { ladder: IDLE_LADDER });
    expect(errors.universityId).toBeTruthy();
    expect(errors.facultyId).toBeTruthy();
  });

  test('DEPARTMENTS needs at least one department', () => {
    const { errors } = checkAudience({ ...DEPTS_ALL, departmentIds: [] }, CTX);
    expect(errors.departmentIds).toMatch(/at least one/);
  });

  test('a department the college no longer offers is flagged, never silently kept', () => {
    const { errors } = checkAudience({ ...DEPTS_ALL, departmentIds: ['prep', 'gone'] }, CTX);
    expect(errors.departmentIds).toMatch(/no longer offered/);
    // The same, per year: flagged beside the year it is ticked under.
    const perYearGone = checkAudience(
      { ...FULL, yearDepartments: { y1: ['prep', 'gone'] } },
      { ...CTX, departmentLadders: { status: 'ready', byDepartment: { prep: YEARS, civil: YEARS } } },
    );
    expect(perYearGone.groupErrors.y1).toMatch(/no longer offered/);
  });

  test('an inactive university or college is flagged', () => {
    const { errors } = checkAudience(FULL, { ...CTX, universities: [], faculties: [] });
    expect(errors.universityId).toMatch(/no longer active/);
    expect(errors.facultyId).toMatch(/no longer active/);
  });

  test('a valid FACULTY audience passes', () => {
    const { errors } = checkAudience(
      { ...FULL, departmentScope: 'FACULTY', departmentIds: [] },
      CTX,
    );
    expect(errors).toEqual({});
  });
});

test.describe('atomic payloads — the contract', () => {
  test('the audience block always has every key, the years in both spellings', () => {
    expect(Object.keys(audiencePayload(FULL)).sort()).toEqual(AUDIENCE_KEYS);
  });

  test('FACULTY sends no department ids even if some were left in the draft', () => {
    expect(audiencePayload({ ...FULL, departmentScope: 'FACULTY' }).departmentIds).toEqual([]);
  });

  test('no years is sent as an empty list AND an explicit null legacy id', () => {
    const payload = audiencePayload({ ...FULL, academicYearIds: [] });
    expect(payload.academicYearIds).toEqual([]);
    expect(payload.academicYearId).toBeNull();
  });

  test('several years go as the de-duplicated list, the first one as the legacy id', () => {
    const payload = audiencePayload({
      ...FULL,
      departmentScope: 'FACULTY',
      departmentIds: [],
      yearMode: 'ALL_YEARS',
      yearDepartments: {},
      academicYearIds: ['y2', 'y1', 'y2'],
    });
    expect(payload.academicYearIds).toEqual(['y2', 'y1']);
    expect(payload.academicYearId).toBe('y2');
  });

  test('a create carries the full audience and the scalar fields', () => {
    expect(
      createMaterialBody(
        { title: 'Mechanica', titleAr: '', description: '', subjectId: 's1' },
        FULL,
      ),
    ).toEqual({
      title: 'Mechanica',
      titleAr: undefined,
      description: undefined,
      subjectId: 's1',
      universityId: 'uni',
      facultyId: 'fac',
      departmentScope: 'DEPARTMENTS',
      departmentIds: ['prep', 'civil'],
      academicYearId: 'y1',
      academicYearIds: ['y1'],
      yearScope: 'SELECTED_YEARS',
      audienceMappings: [{ academicYearId: 'y1', departmentIds: ['prep', 'civil'] }],
    });
  });

  test('an edit that leaves the audience alone sends no audience key at all', () => {
    const { body, audienceChanged } = updateMaterialBody(
      { title: 'Renamed', titleAr: '', description: '', subjectId: '' },
      // Same sets, other order.
      { ...FULL, departmentIds: ['civil', 'prep'], academicYearIds: ['y1'] },
      { ...FULL, academicYearIds: ['y1'] },
    );
    expect(audienceChanged).toBe(false);
    for (const key of AUDIENCE_KEYS) expect(body).not.toHaveProperty(key);
    expect(body.title).toBe('Renamed');
  });

  test('a different set of years is an audience change', () => {
    const { audienceChanged } = updateMaterialBody(
      { title: 'Mechanica', titleAr: '', description: '', subjectId: '' },
      { ...FULL, academicYearIds: ['y1', 'y2'] },
      FULL,
    );
    expect(audienceChanged).toBe(true);
  });

  test('an edit that changes any part sends the whole block, clearing the years with [] and null', () => {
    const { body, audienceChanged } = updateMaterialBody(
      { title: 'Mechanica', titleAr: '', description: '', subjectId: '' },
      { ...FULL, departmentScope: 'FACULTY', departmentIds: [], academicYearIds: [] },
      FULL,
    );
    expect(audienceChanged).toBe(true);
    expect(body).toMatchObject({
      universityId: 'uni',
      facultyId: 'fac',
      departmentScope: 'FACULTY',
      departmentIds: [],
      academicYearId: null,
      academicYearIds: [],
    });
  });

  test('an unchanged subject is left out of an edit', () => {
    const { body } = updateMaterialBody(
      { title: 'Mechanica', titleAr: '', description: '', subjectId: 's1' },
      FULL,
      FULL,
      's1',
    );
    expect(body).not.toHaveProperty('subjectId');
  });

  test('clearing the subject sends an explicit null, never undefined', () => {
    const { body } = updateMaterialBody(
      { title: 'Mechanica', titleAr: '', description: '', subjectId: '' },
      FULL,
      FULL,
      's1',
    );
    expect(body).toHaveProperty('subjectId', null);
    expect(JSON.parse(JSON.stringify(body)).subjectId).toBeNull();
  });

  test('changing the subject sends the new id', () => {
    const { body } = updateMaterialBody(
      { title: 'Mechanica', titleAr: '', description: '', subjectId: 's2' },
      FULL,
      FULL,
      's1',
    );
    expect(body.subjectId).toBe('s2');
  });

  test('setting a subject on a material that had none sends the id', () => {
    const { body } = updateMaterialBody(
      { title: 'Mechanica', titleAr: '', description: '', subjectId: 's1' },
      FULL,
      FULL,
      null,
    );
    expect(body.subjectId).toBe('s1');
  });

  test('a create without a subject sends no subject key', () => {
    const body = createMaterialBody(
      { title: 'M', titleAr: '', description: '', subjectId: '' },
      FULL,
    );
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('subjectId');
  });

  test('sameAudience ignores department and year order, not membership', () => {
    expect(sameAudience(FULL, { ...FULL, yearDepartments: { y1: ['civil', 'prep'] } })).toBe(true);
    expect(sameAudience(FULL, { ...FULL, yearDepartments: { y1: ['prep'] } })).toBe(false);
    expect(sameAudience(DEPTS_ALL, { ...DEPTS_ALL, departmentIds: ['civil', 'prep'] })).toBe(true);
    expect(sameAudience(DEPTS_ALL, { ...DEPTS_ALL, departmentIds: ['prep'] })).toBe(false);
    const years = { ...FULL, academicYearIds: ['y1', 'y2'] };
    expect(sameAudience(years, { ...years, academicYearIds: ['y2', 'y1'] })).toBe(true);
    expect(sameAudience(years, FULL)).toBe(false);
  });
});

test.describe('loading an existing audience', () => {
  test('a DEPARTMENTS material loads its ids and years', () => {
    expect(
      audienceFromMaterial({
        universityId: 'uni',
        facultyId: 'fac',
        departmentScope: 'DEPARTMENTS',
        departmentIds: ['prep'],
        academicYearId: 'y1',
        academicYearIds: ['y1', 'y2'],
      }),
    ).toEqual({
      ...FULL,
      departmentIds: ['prep'],
      academicYearIds: ['y1', 'y2'],
      // A backend that predates per-year departments filed the same
      // departments under every year: that is what it is read as.
      yearDepartments: { y1: ['prep'], y2: ['prep'] },
    });
  });

  test('a material with departments per year loads each year with its own departments', () => {
    expect(
      audienceFromMaterial({
        universityId: 'uni',
        facultyId: 'fac',
        departmentScope: 'DEPARTMENTS',
        departmentIds: ['prep', 'civil'],
        academicYearId: 'y1',
        academicYearIds: ['y1', 'y2'],
        audienceMappings: [
          { academicYearId: 'y1', departmentIds: ['prep'] },
          { academicYearId: 'y2', departmentIds: ['civil'] },
        ],
      }),
    ).toEqual({
      ...FULL,
      departmentIds: ['prep', 'civil'],
      academicYearIds: ['y1', 'y2'],
      yearDepartments: { y1: ['prep'], y2: ['civil'] },
    });
  });

  test('a DEPARTMENTS material with no years loads as "all years", one department list', () => {
    expect(
      audienceFromMaterial({
        universityId: 'uni',
        facultyId: 'fac',
        departmentScope: 'DEPARTMENTS',
        departmentIds: ['prep'],
        academicYearId: null,
        academicYearIds: [],
        audienceMappings: [],
      }),
    ).toMatchObject({ yearMode: 'ALL_YEARS', departmentIds: ['prep'], academicYearIds: [], yearDepartments: {} });
  });

  test('a backend that predates the list is read through its single rung', () => {
    expect(savedAcademicYearIds({ academicYearId: 'y1' })).toEqual(['y1']);
    expect(savedAcademicYearIds({ academicYearId: null })).toEqual([]);
    // The list wins when present, even when it disagrees with the legacy id.
    expect(savedAcademicYearIds({ academicYearId: 'y1', academicYearIds: [] })).toEqual([]);
    expect(savedAcademicYearIds({ academicYearId: 'y1', academicYearIds: ['y2', 'y2'] })).toEqual(['y2']);
  });

  test('a legacy row with no audience fields loads as an unset FACULTY audience', () => {
    expect(
      audienceFromMaterial({ universityId: null, facultyId: null, academicYearId: null }),
    ).toEqual(EMPTY_AUDIENCE);
  });
});

test.describe('confirmation and errors', () => {
  test('the diff marks exactly the rows that moved', () => {
    const before = summarizeSaved({
      university: { id: 'uni', name: 'Mansoura University', nameAr: null },
      faculty: { id: 'fac', name: 'Engineering (General)', nameAr: null },
      departmentScope: 'DEPARTMENTS',
      departments: [{ id: 'prep', name: 'Preparatory', nameAr: null, studyType: 'GENERAL' }],
      academicYear: { id: 'y1', name: 'Year 1', nameAr: null, kind: 'YEAR' },
    });
    const after = summarizeDraft(
      { ...FULL, departmentScope: 'FACULTY', departmentIds: [], academicYearIds: [] },
      {
        universities: [{ id: 'uni', name: 'Mansoura University' }],
        faculties: [{ id: 'fac', name: 'Engineering (General)' }],
        departments: [],
        ladder: ready(YEARS),
      },
    );
    const changed = audienceDiff(before, after)
      .filter((row) => row.changed)
      .map((row) => row.label);
    expect(changed).toEqual(['Reaches', 'Departments', 'Year / level']);
  });

  test('backend field errors land on the audience fields, as sentences', () => {
    expect(
      audienceServerErrors({
        departmentIds: ['General and Programs departments cannot be combined'],
        title: ['ignored here'],
      }),
    ).toEqual({ departmentIds: 'General and Programs departments cannot be combined.' });
  });

  test('a refusal of either year spelling lands on the years control', () => {
    expect(audienceServerErrors({ academicYearIds: ['that level is not part of this ladder'] }))
      .toEqual({ academicYearIds: 'That level is not part of this ladder.' });
    expect(audienceServerErrors({ academicYearId: ['that year is not part of this ladder'] }))
      .toEqual({ academicYearIds: 'That year is not part of this ladder.' });
  });

  test('several saved years are described once, with one ladder word', () => {
    const summary = summarizeSaved({
      university: { id: 'uni', name: 'Mansoura University', nameAr: null },
      faculty: { id: 'fac', name: 'Engineering (General)', nameAr: null },
      departmentScope: 'FACULTY',
      departments: [],
      academicYear: { id: 'y1', name: 'Preparatory year', nameAr: null, kind: 'YEAR' },
      academicYears: [
        { id: 'y1', name: 'Preparatory year', nameAr: null, kind: 'YEAR' },
        { id: 'y2', name: 'First year', nameAr: null, kind: 'YEAR' },
      ],
    });
    expect(summary.yearLevel).toBe('Preparatory year, First year (Year)');

    const draft = summarizeDraft(
      { ...FAC_YEARS, academicYearIds: ['y2', 'y1'] },
      {
        universities: [{ id: 'uni', name: 'Mansoura University' }],
        faculties: [{ id: 'fac', name: 'Engineering (General)' }],
        departments: [],
        ladder: ready(YEARS),
      },
    );
    // Ladder order, whatever order they were ticked in.
    expect(draft.yearLevel).toBe('Year 1, Year 2 (Year)');
  });
});

test.describe('packages — one material, its own parts', () => {
  const PARTS = [{ id: 'p1' }, { id: 'p2' }];
  const PARTS_T = [
    { id: 'p1', title: 'Part 1' },
    { id: 'p2', title: 'Part 2' },
  ];

  test('stored membership splits into current and withdrawn', () => {
    expect(packageMembership(['p1', 'gone'], PARTS)).toEqual({
      current: ['p1'],
      withdrawn: ['gone'],
    });
  });

  test('only this material’s parts are ever sent', () => {
    expect(packagePartIds(['p1', 'other-material-part', 'p1'], PARTS)).toEqual(['p1']);
  });

  test('an unchanged selection removes nothing, withdrawn items included', () => {
    expect(packageRemovals(['p1', 'gone'], undefined, PARTS_T)).toEqual({
      current: [],
      withdrawn: [],
    });
  });

  test('a contents change lists every part leaving: unticked and withdrawn', () => {
    expect(packageRemovals(['p1', 'p2', 'gone'], ['p1'], PARTS_T)).toEqual({
      current: [{ id: 'p2', title: 'Part 2' }],
      withdrawn: ['gone'],
    });
  });

  test('adding a part to a package with nothing withdrawn removes nothing', () => {
    expect(packageRemovals(['p1'], ['p1', 'p2'], PARTS_T)).toEqual({
      current: [],
      withdrawn: [],
    });
  });

  test('an unchanged selection sends no partIds; a changed one sends only own parts', () => {
    expect(packagePartIdsForUpdate(['p1'], ['p1'], PARTS)).toBeUndefined();
    expect(packagePartIdsForUpdate(['p1'], ['p1', 'p2'], PARTS)).toEqual(['p1', 'p2']);
    expect(packagePartIdsForUpdate(['p1'], ['p1', 'foreign'], PARTS)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Departments per year/level
// ---------------------------------------------------------------------------

/**
 * Programs college: MTE and Electrical on the LEVEL ladder (000/200),
 * Aerospace on its own ladder (only Level 400), Foundation on General's YEAR
 * ladder.
 */
const L000 = year('l000', 0, 'LEVEL');
const L200 = year('l200', 2, 'LEVEL');
const L400 = year('l400', 4, 'LEVEL');
const PROGRAMS_DEPTS = [
  { id: 'mte', name: 'MTE', studyType: 'PROGRAMS' as const },
  { id: 'elec', name: 'Electrical', studyType: 'PROGRAMS' as const },
  { id: 'aer', name: 'Aerospace', studyType: 'PROGRAMS' as const },
  { id: 'found', name: 'Foundation', studyType: 'GENERAL' as const },
];
const LADDERS: DepartmentLadders = {
  status: 'ready',
  byDepartment: { mte: [L000, L200], elec: [L000, L200], aer: [L400], found: YEARS },
};
const PER_YEAR_CTX = { ...CTX, departments: PROGRAMS_DEPTS, departmentLadders: LADDERS };

const perYear = (groups: Record<string, string[]>): AudienceDraft => ({
  universityId: 'uni',
  facultyId: 'fac',
  departmentScope: 'DEPARTMENTS',
  yearMode: 'SELECTED_YEARS',
  academicYearIds: Object.keys(groups),
  yearDepartments: groups,
  departmentIds: [...new Set(Object.values(groups).flat())],
});

test.describe('departments per year/level — transitions', () => {
  test('each year keeps its own departments: a change in Level 000 never touches Level 200', () => {
    let draft = selectYearMode({ ...perYear({}), yearMode: 'ALL_YEARS' }, 'SELECTED_YEARS');
    draft = addYearGroup(draft, 'l000');
    draft = toggleYearDepartment(draft, 'l000', 'mte', true);
    draft = addYearGroup(draft, 'l200');
    draft = setYearDepartments(draft, 'l200', ['elec', 'mte']);
    expect(draft.yearDepartments).toEqual({ l000: ['mte'], l200: ['elec', 'mte'] });

    const edited = toggleYearDepartment(draft, 'l000', 'elec', true);
    expect(edited.yearDepartments.l000).toEqual(['mte', 'elec']);
    expect(edited.yearDepartments.l200).toEqual(['elec', 'mte']);
    expect([...edited.departmentIds].sort()).toEqual(['elec', 'mte']);

    const untick = toggleYearDepartment(edited, 'l200', 'mte', false);
    expect(untick.yearDepartments.l000).toEqual(['mte', 'elec']);
    expect(untick.yearDepartments.l200).toEqual(['elec']);
  });

  test('removing a year removes only that year and its departments', () => {
    const removed = removeYearGroup(perYear({ l000: ['mte'], l200: ['elec'] }), 'l200');
    expect(removed.academicYearIds).toEqual(['l000']);
    expect(removed.yearDepartments).toEqual({ l000: ['mte'] });
    expect(removed.departmentIds).toEqual(['mte']);
  });

  test('adding a year twice changes nothing; a new year starts with no department', () => {
    const draft = perYear({ l000: ['mte'] });
    expect(addYearGroup(draft, 'l000')).toBe(draft);
    expect(addYearGroup(draft, 'l200').yearDepartments.l200).toEqual([]);
  });

  test('back to all years keeps every department (the union) and drops the years', () => {
    const all = selectYearMode(perYear({ l000: ['mte'], l200: ['elec'] }), 'ALL_YEARS');
    expect(all).toMatchObject({ yearMode: 'ALL_YEARS', academicYearIds: [], yearDepartments: {} });
    expect(all.departmentIds).toEqual(['mte', 'elec']);
  });

  test('whole college -> selected departments keeps the years as empty groups, and back', () => {
    const faculty: AudienceDraft = {
      ...EMPTY_AUDIENCE,
      universityId: 'uni',
      facultyId: 'fac',
      academicYearIds: ['l000'],
    };
    expect(selectScope(faculty, 'DEPARTMENTS')).toMatchObject({
      yearMode: 'SELECTED_YEARS',
      academicYearIds: ['l000'],
      yearDepartments: { l000: [] },
    });
    expect(selectScope(perYear({ l000: ['mte'] }), 'FACULTY')).toMatchObject({
      academicYearIds: ['l000'],
      departmentIds: [],
      yearMode: 'ALL_YEARS',
    });
  });

  test('a change that would throw a choice away is recognised, so the editor can ask first', () => {
    const draft = perYear({ l000: ['mte'], l200: ['elec'] });
    expect(discardsSelection(draft, selectFaculty(draft, 'other'))).toBe(true);
    expect(discardsSelection(draft, selectYearMode(draft, 'ALL_YEARS'))).toBe(true);
    expect(discardsSelection(draft, selectScope(draft, 'FACULTY'))).toBe(true);
    expect(discardsSelection(draft, toggleYearDepartment(draft, 'l000', 'elec', true))).toBe(false);
    const empty = { ...EMPTY_AUDIENCE, universityId: 'uni' };
    expect(discardsSelection(empty, selectUniversity(empty, 'other'))).toBe(false);
  });
});

test.describe('departments per year/level — what is offered', () => {
  test('the years offered are every rung on some department’s ladder, in ladder order', () => {
    expect(perYearRungs(PROGRAMS_DEPTS, LADDERS, null).map((r) => r.id)).toEqual([
      'l000',
      'y1',
      'l200',
      'y2',
      'l400',
    ]);
    // Once Programs is ticked, General's rungs are no longer offered.
    expect(perYearRungs(PROGRAMS_DEPTS, LADDERS, 'PROGRAMS').map((r) => r.id)).toEqual([
      'l000',
      'l200',
      'l400',
    ]);
  });

  test('a department is offered under a year only when that year is on its own ladder', () => {
    expect(departmentsForRung(PROGRAMS_DEPTS, LADDERS, 'l000').map((d) => d.id)).toEqual(['mte', 'elec']);
    expect(departmentsForRung(PROGRAMS_DEPTS, LADDERS, 'l400').map((d) => d.id)).toEqual(['aer']);
  });
});

test.describe('departments per year/level — validation', () => {
  test('a valid per-year audience passes', () => {
    const check = checkAudience(perYear({ l000: ['mte'], l200: ['elec'] }), PER_YEAR_CTX);
    expect(check).toEqual({ errors: {}, groupErrors: {}, pending: false });
  });

  test('a year with no department is flagged beside that year, never read as "everyone"', () => {
    const check = checkAudience(perYear({ l000: ['mte'], l200: [] }), PER_YEAR_CTX);
    expect(Object.keys(check.groupErrors)).toEqual(['l200']);
    expect(check.groupErrors.l200).toContain('Choose at least one department');
    expect(check.errors.yearDepartments).toBeTruthy();
  });

  test('per-year with no year at all is refused: add one, or choose all years', () => {
    expect(checkAudience(perYear({}), PER_YEAR_CTX).errors.academicYearIds).toContain(
      'or choose All years',
    );
  });

  test('a department ticked under a year that is not on its ladder is named', () => {
    const check = checkAudience(perYear({ l400: ['aer', 'mte'] }), PER_YEAR_CTX);
    expect(check.groupErrors.l400).toContain('MTE cannot be filed under');
  });

  test('General and Programs split across two years are refused for the material', () => {
    const check = checkAudience(perYear({ l000: ['mte'], y1: ['found'] }), PER_YEAR_CTX);
    expect(check.errors.departmentIds).toContain('cannot be combined');
  });

  test('while the ladders load, nothing is refused but nothing is ready', () => {
    const check = checkAudience(perYear({ l000: ['mte'] }), {
      ...PER_YEAR_CTX,
      departmentLadders: { status: 'loading', byDepartment: {} },
    });
    expect(check).toMatchObject({ pending: true, groupErrors: {} });
  });
});

test.describe('departments per year/level — the request body', () => {
  test('each year goes with its own departments; the union and the years beside them', () => {
    const payload = audiencePayload(perYear({ l000: ['mte', 'mte'], l200: ['elec', 'aer'] }));
    expect(payload).toMatchObject({
      departmentScope: 'DEPARTMENTS',
      yearScope: 'SELECTED_YEARS',
      academicYearIds: ['l000', 'l200'],
      academicYearId: 'l000',
      departmentIds: ['mte', 'elec', 'aer'],
      audienceMappings: [
        { academicYearId: 'l000', departmentIds: ['mte'] },
        { academicYearId: 'l200', departmentIds: ['elec', 'aer'] },
      ],
    });
  });

  test('all years says so explicitly and carries no year, whatever is left in the draft', () => {
    const payload = audiencePayload({
      ...perYear({}),
      yearMode: 'ALL_YEARS',
      departmentIds: ['mte'],
      academicYearIds: ['l000'],
    });
    expect(payload).toMatchObject({
      yearScope: 'ALL_YEARS',
      academicYearIds: [],
      academicYearId: null,
      audienceMappings: [],
      departmentIds: ['mte'],
    });
  });

  test('whole college keeps its year list and sends no per-year departments', () => {
    const payload = audiencePayload({
      ...EMPTY_AUDIENCE,
      universityId: 'u',
      facultyId: 'f',
      academicYearIds: ['y1'],
    });
    expect(payload).toMatchObject({
      yearScope: 'SELECTED_YEARS',
      academicYearIds: ['y1'],
      audienceMappings: [],
      departmentIds: [],
    });
  });

  test('moving a department from one year to another is an audience change; reordering is not', () => {
    const a = perYear({ l000: ['mte'], l200: ['elec'] });
    expect(sameAudience(a, perYear({ l200: ['elec'], l000: ['mte'] }))).toBe(true);
    expect(sameAudience(a, perYear({ l000: ['elec'], l200: ['mte'] }))).toBe(false);
    const { audienceChanged, body } = updateMaterialBody(
      { title: 'T', titleAr: '', description: '', subjectId: '' },
      toggleYearDepartment(a, 'l000', 'elec', true),
      a,
    );
    expect(audienceChanged).toBe(true);
    expect(body.audienceMappings).toEqual([
      { academicYearId: 'l000', departmentIds: ['mte', 'elec'] },
      { academicYearId: 'l200', departmentIds: ['elec'] },
    ]);
  });

  test('a refusal of one year group lands beside that year', () => {
    const sent = audiencePayload(perYear({ l000: ['mte'], l200: ['elec'] }));
    expect(
      audienceServerGroupErrors(
        {
          'audienceMappings.1.departmentIds': [
            'one or more departments do not belong to the selected college',
          ],
        },
        sent,
      ),
    ).toEqual({ l200: 'One or more departments do not belong to the selected college.' });
    expect(
      audienceServerErrors({
        audienceMappings: ['General and Programs departments cannot be combined'],
      }).yearDepartments,
    ).toBe('General and Programs departments cannot be combined.');
  });

  test('the review lists departments per year, and marks the row when one year changed', () => {
    const lookup = { departments: PROGRAMS_DEPTS, ladder: IDLE_LADDER, rungs: [L000, L200] };
    const before = summarizeDraft(perYear({ l000: ['mte'], l200: ['elec'] }), lookup);
    const after = summarizeDraft(perYear({ l000: ['mte', 'elec'], l200: ['elec'] }), lookup);
    expect(before.perYear).toEqual(['Level 0: MTE', 'Level 2: Electrical']);
    const row = audienceDiff(before, after).find((r) => r.label === 'Departments per year / level');
    expect(row).toMatchObject({
      changed: true,
      after: 'Level 0: MTE, Electrical; Level 2: Electrical',
    });
  });
});
