import { expect, test } from '@playwright/test';

import {
  EMPTY_AUDIENCE,
  IDLE_LADDER,
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

const FULL: AudienceDraft = {
  universityId: 'uni',
  facultyId: 'fac',
  departmentScope: 'DEPARTMENTS',
  departmentIds: ['prep', 'civil'],
  academicYearIds: ['y1'],
};

/** Every audience key a request body carries, in both year spellings. */
const AUDIENCE_KEYS = [
  'academicYearId',
  'academicYearIds',
  'departmentIds',
  'departmentScope',
  'facultyId',
  'universityId',
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
    const { errors } = checkAudience({ ...FULL, academicYearIds: ['l0'] }, CTX);
    expect(errors.academicYearIds).toMatch(/not part of the ladder/);
  });

  test('every ticked rung must be on the ladder, and the count is named', () => {
    const one = checkAudience({ ...FULL, academicYearIds: ['y1', 'l0'] }, CTX).errors;
    expect(one.academicYearIds).toMatch(/^One selected year is not part/);
    const two = checkAudience({ ...FULL, academicYearIds: ['y1', 'l0', 'l1'] }, CTX).errors;
    expect(two.academicYearIds).toMatch(/^2 selected years are not part/);
    expect(checkAudience({ ...FULL, academicYearIds: ['y1', 'y2'] }, CTX).errors).toEqual({});
  });

  test('no year/level is always fine — it is a filter, not eligibility', () => {
    const { errors, pending } = checkAudience({ ...FULL, academicYearIds: [] }, CTX);
    expect(errors).toEqual({});
    expect(pending).toBe(false);
  });

  test('a year/level waits for its ladder to load', () => {
    const { pending } = checkAudience(FULL, {
      ...CTX,
      ladder: { ...IDLE_LADDER, status: 'loading' },
    });
    expect(pending).toBe(true);
  });

  test('departments with no shared ladder cannot carry a year/level', () => {
    const ladder: LadderState = { status: 'ready', ...intersectLadders([YEARS, LEVELS]) };
    const { errors } = checkAudience(FULL, { ...CTX, ladder });
    expect(errors.academicYearIds).toMatch(/do not share one ladder/);
  });
});

test.describe('FACULTY and DEPARTMENTS scopes', () => {
  test('university and college are required', () => {
    const { errors } = checkAudience(EMPTY_AUDIENCE, { ladder: IDLE_LADDER });
    expect(errors.universityId).toBeTruthy();
    expect(errors.facultyId).toBeTruthy();
  });

  test('DEPARTMENTS needs at least one department', () => {
    const { errors } = checkAudience({ ...FULL, departmentIds: [], academicYearIds: [] }, CTX);
    expect(errors.departmentIds).toMatch(/at least one/);
  });

  test('a department the college no longer offers is flagged, never silently kept', () => {
    const { errors } = checkAudience({ ...FULL, departmentIds: ['prep', 'gone'] }, CTX);
    expect(errors.departmentIds).toMatch(/no longer offered/);
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
    const payload = audiencePayload({ ...FULL, academicYearIds: ['y2', 'y1', 'y2'] });
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
    expect(sameAudience(FULL, { ...FULL, departmentIds: ['civil', 'prep'] })).toBe(true);
    expect(sameAudience(FULL, { ...FULL, departmentIds: ['prep'] })).toBe(false);
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
    ).toEqual({ ...FULL, departmentIds: ['prep'], academicYearIds: ['y1', 'y2'] });
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
      { ...FULL, academicYearIds: ['y2', 'y1'] },
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
