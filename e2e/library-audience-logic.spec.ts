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
  sameAudience,
  selectAcademicYear,
  selectFaculty,
  selectScope,
  selectUniversity,
  selectionTrack,
  summarizeDraft,
  summarizeSaved,
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
  academicYearId: 'y1',
};

const CTX = {
  universities: [{ id: 'uni' }],
  faculties: [{ id: 'fac' }],
  departments: DEPARTMENTS,
  ladder: ready(YEARS),
};

test.describe('dependent-field resets', () => {
  test('changing the university clears college, departments and year/level', () => {
    expect(selectUniversity(FULL, 'other')).toEqual({
      universityId: 'other',
      facultyId: '',
      departmentScope: 'DEPARTMENTS',
      departmentIds: [],
      academicYearId: '',
    });
  });

  test('re-selecting the same university changes nothing', () => {
    expect(selectUniversity(FULL, 'uni')).toBe(FULL);
  });

  test('changing the college clears departments and year/level, keeps the university', () => {
    expect(selectFaculty(FULL, 'fac2')).toEqual({
      ...FULL,
      facultyId: 'fac2',
      departmentIds: [],
      academicYearId: '',
    });
  });

  test('switching to FACULTY clears department ids; switching back starts empty', () => {
    const faculty = selectScope(FULL, 'FACULTY');
    expect(faculty.departmentIds).toEqual([]);
    expect(faculty.academicYearId).toBe('y1');
    expect(selectScope(faculty, 'DEPARTMENTS').departmentIds).toEqual([]);
  });

  test('the year/level never alters the college or the departments', () => {
    const next = selectAcademicYear(FULL, 'y2');
    expect(next).toEqual({ ...FULL, academicYearId: 'y2' });
    expect(selectAcademicYear(next, '').facultyId).toBe('fac');
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
      { ...FULL, departmentIds: ['prep', 'cce'], academicYearId: '' },
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
    const { errors } = checkAudience({ ...FULL, academicYearId: 'l0' }, CTX);
    expect(errors.academicYearId).toMatch(/not part of the ladder/);
  });

  test('no year/level is always fine — it is a filter, not eligibility', () => {
    const { errors, pending } = checkAudience({ ...FULL, academicYearId: '' }, CTX);
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
    expect(errors.academicYearId).toMatch(/do not share one ladder/);
  });
});

test.describe('FACULTY and DEPARTMENTS scopes', () => {
  test('university and college are required', () => {
    const { errors } = checkAudience(EMPTY_AUDIENCE, { ladder: IDLE_LADDER });
    expect(errors.universityId).toBeTruthy();
    expect(errors.facultyId).toBeTruthy();
  });

  test('DEPARTMENTS needs at least one department', () => {
    const { errors } = checkAudience({ ...FULL, departmentIds: [], academicYearId: '' }, CTX);
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

test.describe('atomic payloads — the Phase 1 contract', () => {
  test('the audience block always has all five keys', () => {
    expect(Object.keys(audiencePayload(FULL)).sort()).toEqual([
      'academicYearId',
      'departmentIds',
      'departmentScope',
      'facultyId',
      'universityId',
    ]);
  });

  test('FACULTY sends no department ids even if some were left in the draft', () => {
    expect(audiencePayload({ ...FULL, departmentScope: 'FACULTY' }).departmentIds).toEqual([]);
  });

  test('an empty year/level is sent as an explicit null', () => {
    expect(audiencePayload({ ...FULL, academicYearId: '' }).academicYearId).toBeNull();
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
    });
  });

  test('an edit that leaves the audience alone sends no audience key at all', () => {
    const { body, audienceChanged } = updateMaterialBody(
      { title: 'Renamed', titleAr: '', description: '', subjectId: '' },
      { ...FULL, departmentIds: ['civil', 'prep'] }, // same set, other order
      FULL,
    );
    expect(audienceChanged).toBe(false);
    for (const key of [
      'universityId',
      'facultyId',
      'departmentScope',
      'departmentIds',
      'academicYearId',
    ]) {
      expect(body).not.toHaveProperty(key);
    }
    expect(body.title).toBe('Renamed');
  });

  test('an edit that changes any part sends the whole block, clearing the year with null', () => {
    const { body, audienceChanged } = updateMaterialBody(
      { title: 'Mechanica', titleAr: '', description: '', subjectId: '' },
      { ...FULL, departmentScope: 'FACULTY', departmentIds: [], academicYearId: '' },
      FULL,
    );
    expect(audienceChanged).toBe(true);
    expect(body).toMatchObject({
      universityId: 'uni',
      facultyId: 'fac',
      departmentScope: 'FACULTY',
      departmentIds: [],
      academicYearId: null,
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

  test('sameAudience ignores department order, not membership', () => {
    expect(sameAudience(FULL, { ...FULL, departmentIds: ['civil', 'prep'] })).toBe(true);
    expect(sameAudience(FULL, { ...FULL, departmentIds: ['prep'] })).toBe(false);
  });
});

test.describe('loading an existing audience', () => {
  test('a DEPARTMENTS material loads its ids and year', () => {
    expect(
      audienceFromMaterial({
        universityId: 'uni',
        facultyId: 'fac',
        departmentScope: 'DEPARTMENTS',
        departmentIds: ['prep'],
        academicYearId: 'y1',
      }),
    ).toEqual({ ...FULL, departmentIds: ['prep'] });
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
      { ...FULL, departmentScope: 'FACULTY', departmentIds: [], academicYearId: '' },
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
