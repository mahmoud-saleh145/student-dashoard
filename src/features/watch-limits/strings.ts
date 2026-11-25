'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * English and Arabic copy for the watch-limit screens.
 *
 * The dashboard has no app-wide translation layer yet (the root layout is
 * `lang="en" dir="ltr"`). These screens follow `<html lang>` when it is Arabic,
 * and also offer their own EN / ع switch, remembered per browser, so Arabic is
 * usable today without changing the rest of the dashboard. Layout uses logical
 * properties only (`ms-`, `me-`, `text-start`), so `dir="rtl"` mirrors it.
 */

export type Lang = 'en' | 'ar';

const en = {
  manageViews: 'Manage Views',
  manageViewsFor: (name: string) => `Manage views — ${name}`,
  resetAll: "Reset All Students' Views",
  language: 'Language',

  // summary
  accessibleVideos: 'Accessible',
  watchedVideos: 'Watched',
  exhaustedVideos: 'Limit reached',
  defaultLimit: 'Default limit',
  playsPerVideo: (n: number) => `${n} plays per video`,
  terms:
    'Allowed = plays this student may use on a video. Used = plays counted since the last reset. Remaining = allowed − used. A play counts once at least 30 seconds were watched; resets never delete watch history.',

  // table
  search: 'Search by video or section…',
  searchLabel: 'Search videos',
  video: 'Video',
  section: 'Section',
  allowed: 'Allowed',
  used: 'Used',
  remaining: 'Remaining',
  status: 'Status',
  actions: 'Actions',
  actionsFor: (title: string) => `Watch-limit actions for ${title}`,
  custom: 'custom',
  customHint: 'Custom limit for this student',
  noVideos: 'This course has no videos yet',
  noVideosHint: 'Videos appear here once lectures with video are added to the course.',
  noMatch: 'No videos match this search',
  noMatchHint: 'Try another video or section name.',
  free: 'Free preview',

  statusLabel: {
    AVAILABLE: 'Available',
    NEARLY_EXHAUSTED: 'Nearly exhausted',
    EXHAUSTED: 'Exhausted',
    UNLIMITED: 'Not limited',
    NO_ACCESS: 'No access',
  },

  // actions
  actionLabel: {
    ADD_PLAYS: 'Add plays',
    SET_REMAINING: 'Set remaining plays',
    RESET_USED: 'Reset used plays to 0',
    RESTORE_DEFAULT: 'Restore default limit',
  },
  actionHelp: {
    ADD_PLAYS: 'Gives this many more plays on top of what is left now.',
    SET_REMAINING: 'Leaves exactly this many plays available, whatever was used.',
    RESET_USED: 'Counts plays from now on. Any custom limit is kept. Watch history is kept.',
    RESTORE_DEFAULT:
      'Removes the custom limit and goes back to the default. Used plays stay as they are.',
  },
  amountAdd: 'Plays to add',
  amountSet: 'Plays remaining afterwards',
  amountRange: (min: number, max: number) => `A whole number from ${min} to ${max}.`,
  before: 'Now',
  after: 'After',
  apply: 'Apply',
  back: 'Back',
  close: 'Close',
  cancel: 'Cancel',

  bulkTitle: 'All videos in this course',
  bulkHint: (n: number) =>
    `Applies to the ${n} video${n === 1 ? '' : 's'} this student can open in this course. Other courses are not affected.`,
  bulkApply: 'Apply to all',
  bulkConfirm: (label: string, n: number) => `${label} — ${n} video${n === 1 ? '' : 's'}`,
  noAccessible:
    'This student cannot open any video in this course, so there is nothing to change.',

  doneOne: 'Watch limit updated',
  doneBulk: (changed: number, total: number) =>
    changed === 0
      ? `Nothing needed changing (${total} videos checked)`
      : `${changed} of ${total} videos updated`,
  failed: 'The watch limit was not changed',

  // course reset
  resetTitle: "Reset all students' views",
  resetIntro: (course: string) => `Course: ${course}`,
  enrolledStudents: 'Enrolled students',
  affectedStudents: 'Students affected',
  affectedVideos: 'Videos affected',
  affectedRecords: 'Play records reset',
  resetWarning:
    'Used plays go back to 0 for every student with an enrolment on this course, on this course’s videos only. Videos and students of other courses are not touched. Play history, progress, completion, enrolments and payments are kept. This cannot be undone from the dashboard.',
  sharedWarning: (n: number) =>
    `${n} video${n === 1 ? ' is' : 's are'} also used in another course and ${n === 1 ? 'is' : 'are'} left out of this reset, because a student's play count belongs to the video, not the course.`,
  shared: (n: number) => `Shared · ${n} other course${n === 1 ? '' : 's'}`,
  sharedHint:
    'This video is also used in another course. Its play count is shared, so it cannot be changed from here.',
  restoreDefaultToo: 'Also remove custom limits and restore the default for every student',
  keepCustom: 'Custom limits set in Manage Views are kept.',
  dropCustom: (n: number) =>
    `${n} custom limit${n === 1 ? '' : 's'} will go back to the default.`,
  confirmCheck: 'I understand this applies to every student of this course',
  resetConfirm: 'Reset views',
  nothingToReset:
    'Nobody in this course has used any plays since the last reset. There is nothing to reset.',
  resetDone: 'Views reset',
  resetDoneDetail: (students: number, videos: number, records: number) =>
    `${students} student${students === 1 ? '' : 's'}, ${videos} video${videos === 1 ? '' : 's'}, ${records} play record${records === 1 ? '' : 's'} reset.`,
  resetFailed: 'The views were not reset',
};

export type Strings = typeof en;

const ar: Strings = {
  manageViews: 'إدارة المشاهدات',
  manageViewsFor: (name) => `إدارة المشاهدات — ${name}`,
  resetAll: 'إعادة ضبط مشاهدات جميع الطلاب',
  language: 'اللغة',

  accessibleVideos: 'متاحة',
  watchedVideos: 'تمت مشاهدتها',
  exhaustedVideos: 'استُنفد الحد',
  defaultLimit: 'الحد الافتراضي',
  playsPerVideo: (n) => `${n} مشاهدات لكل فيديو`,
  terms:
    'المسموح = عدد المشاهدات المتاحة للطالب على الفيديو. المستخدم = المشاهدات المحسوبة منذ آخر إعادة ضبط. المتبقي = المسموح − المستخدم. تُحسب المشاهدة بعد ٣٠ ثانية على الأقل، وإعادة الضبط لا تحذف سجل المشاهدة.',

  search: 'ابحث باسم الفيديو أو القسم…',
  searchLabel: 'البحث في الفيديوهات',
  video: 'الفيديو',
  section: 'القسم',
  allowed: 'المسموح',
  used: 'المستخدم',
  remaining: 'المتبقي',
  status: 'الحالة',
  actions: 'الإجراءات',
  actionsFor: (title) => `إجراءات حد المشاهدة لـ ${title}`,
  custom: 'مخصص',
  customHint: 'حد مخصص لهذا الطالب',
  noVideos: 'لا توجد فيديوهات في هذا الكورس بعد',
  noVideosHint: 'تظهر الفيديوهات هنا بعد إضافة محاضرات بها فيديو إلى الكورس.',
  noMatch: 'لا توجد فيديوهات مطابقة للبحث',
  noMatchHint: 'جرّب اسم فيديو أو قسم آخر.',
  free: 'معاينة مجانية',

  statusLabel: {
    AVAILABLE: 'متاح',
    NEARLY_EXHAUSTED: 'قارب على الانتهاء',
    EXHAUSTED: 'مستنفد',
    UNLIMITED: 'غير محدود',
    NO_ACCESS: 'غير متاح',
  },

  actionLabel: {
    ADD_PLAYS: 'إضافة مشاهدات',
    SET_REMAINING: 'تحديد المشاهدات المتبقية',
    RESET_USED: 'تصفير المشاهدات المستخدمة',
    RESTORE_DEFAULT: 'استعادة الحد الافتراضي',
  },
  actionHelp: {
    ADD_PLAYS: 'يضيف هذا العدد من المشاهدات فوق المتبقي حاليًا.',
    SET_REMAINING: 'يجعل المتبقي هذا العدد بالضبط مهما كان المستخدم.',
    RESET_USED: 'تبدأ الحسبة من الآن. يبقى الحد المخصص كما هو، ويبقى سجل المشاهدة.',
    RESTORE_DEFAULT: 'يلغي الحد المخصص ويعود إلى الافتراضي. تبقى المشاهدات المستخدمة كما هي.',
  },
  amountAdd: 'عدد المشاهدات المضافة',
  amountSet: 'المشاهدات المتبقية بعد التطبيق',
  amountRange: (min, max) => `رقم صحيح من ${min} إلى ${max}.`,
  before: 'الآن',
  after: 'بعد',
  apply: 'تطبيق',
  back: 'رجوع',
  close: 'إغلاق',
  cancel: 'إلغاء',

  bulkTitle: 'كل فيديوهات هذا الكورس',
  bulkHint: (n) =>
    `يُطبَّق على ${n} فيديو متاح لهذا الطالب في هذا الكورس. لا يتأثر أي كورس آخر.`,
  bulkApply: 'تطبيق على الكل',
  bulkConfirm: (label, n) => `${label} — ${n} فيديو`,
  noAccessible: 'لا يستطيع هذا الطالب فتح أي فيديو في هذا الكورس، فلا يوجد ما يمكن تغييره.',

  doneOne: 'تم تحديث حد المشاهدة',
  doneBulk: (changed, total) =>
    changed === 0
      ? `لم يحتج أي فيديو إلى تغيير (تم فحص ${total})`
      : `تم تحديث ${changed} من ${total} فيديو`,
  failed: 'لم يتم تغيير حد المشاهدة',

  resetTitle: 'إعادة ضبط مشاهدات جميع الطلاب',
  resetIntro: (course) => `الكورس: ${course}`,
  enrolledStudents: 'الطلاب المشتركون',
  affectedStudents: 'الطلاب المتأثرون',
  affectedVideos: 'الفيديوهات المتأثرة',
  affectedRecords: 'سجلات المشاهدة المُصفّرة',
  resetWarning:
    'تعود المشاهدات المستخدمة إلى ٠ لكل طالب مشترك في هذا الكورس، على فيديوهات هذا الكورس فقط. لا تتأثر فيديوهات أو طلاب الكورسات الأخرى. يبقى سجل المشاهدة والتقدم والإكمال والاشتراكات والمدفوعات كما هي. لا يمكن التراجع عن ذلك من لوحة التحكم.',
  sharedWarning: (n) =>
    `${n} فيديو مستخدم أيضًا في كورس آخر ولن تشمله إعادة الضبط، لأن عدد المشاهدات يتبع الفيديو وليس الكورس.`,
  shared: (n) => `مشترك · ${n} كورس آخر`,
  sharedHint:
    'هذا الفيديو مستخدم أيضًا في كورس آخر. عدد مشاهداته مشترك، لذلك لا يمكن تغييره من هنا.',
  restoreDefaultToo: 'إلغاء الحدود المخصصة أيضًا واستعادة الحد الافتراضي لكل الطلاب',
  keepCustom: 'تبقى الحدود المخصصة التي حُددت من إدارة المشاهدات.',
  dropCustom: (n) => `سيعود ${n} حد مخصص إلى الافتراضي.`,
  confirmCheck: 'أفهم أن هذا يُطبَّق على كل طلاب هذا الكورس',
  resetConfirm: 'إعادة ضبط المشاهدات',
  nothingToReset:
    'لم يستخدم أي طالب في هذا الكورس مشاهدات منذ آخر إعادة ضبط. لا يوجد ما يُعاد ضبطه.',
  resetDone: 'تمت إعادة ضبط المشاهدات',
  resetDoneDetail: (students, videos, records) =>
    `${students} طالب، ${videos} فيديو، ${records} سجل مشاهدة.`,
  resetFailed: 'لم تتم إعادة ضبط المشاهدات',
};

const STORAGE_KEY = 'dashboard.watchLimits.lang';

// One language for every watch-limit surface on the page: the Students tab's
// buttons, the Manage Views modal and the reset dialog switch together.
const listeners = new Set<() => void>();
let current: Lang | null = null;

function readLang(): Lang {
  if (current) return current;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  current =
    stored === 'ar' || stored === 'en'
      ? stored
      : document.documentElement.lang?.startsWith('ar')
        ? 'ar'
        : 'en';
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function writeLang(next: Lang) {
  current = next;
  window.localStorage.setItem(STORAGE_KEY, next);
  listeners.forEach((listener) => listener());
}

export function useWatchLimitStrings() {
  // English on the server and in the first client render, so hydration agrees.
  const lang = useSyncExternalStore<Lang>(subscribe, readLang, () => 'en');
  const setLang = useCallback((next: Lang) => writeLang(next), []);

  return {
    lang,
    setLang,
    dir: (lang === 'ar' ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
    t: lang === 'ar' ? ar : en,
    /** Picks the Arabic title when the screen is Arabic and one exists. */
    pick: (english: string, arabic: string | null | undefined) =>
      lang === 'ar' && arabic ? arabic : english,
    number: (value: number) => value.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US'),
  };
}
