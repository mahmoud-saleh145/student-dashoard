'use client';

import { useState } from 'react';

import { CourseStatusBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Badge, Card, DescriptionList, PageHeader } from '@/components/ui/primitives';
import { CardsSkeleton, ErrorState } from '@/components/ui/states';
import { Tabs, TabPanel, useTabParam } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { CoursePartsTab } from '@/features/course-parts/course-parts-tab';
import { CourseContentTab } from '@/features/courses/course-content-tab';
import { CourseNotifyTab } from '@/features/courses/course-notify-tab';
import { CoursePricingTab } from '@/features/courses/course-pricing-tab';
import { CourseStudentsTab } from '@/features/courses/course-students-tab';
import { useCourse, useCourseVisibility } from '@/features/courses/hooks';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { useSession } from '@/lib/session-context';

/**
 * One course.
 *
 * Visibility is the part worth reading carefully. The platform has three
 * distinct states and they are not interchangeable:
 *
 *   Visible (PUBLISHED) — listed, and open to whoever the enrolment rules allow.
 *   Hidden (HIDDEN)     — not listed, but every student who already has access
 *                         keeps it. This is the state for a course that is off
 *                         the shelf but still owed to the people who bought it.
 *   Archived            — retired. Content stops being served; purchases,
 *                         revenue and watch history are all retained.
 *
 * "Hide" therefore does not mean "revoke", and the dialog says so, because an
 * admin who believes it does will use it to cut off paying students.
 */
export function CourseDetail({ courseId }: { courseId: string }) {
  const toast = useToast();
  const { isAdmin, can } = useSession();
  const [tab, setTab] = useTabParam('content');
  const [pendingAction, setPendingAction] = useState<VisibilityAction | null>(null);

  const course = useCourse(courseId);
  const visibility = useCourseVisibility(courseId);

  if (course.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="skeleton h-10 w-72 rounded" />
        <CardsSkeleton count={4} />
      </div>
    );
  }

  if (course.isError || !course.data) {
    return (
      <Card>
        <ErrorState
          error={course.error}
          onRetry={() => void course.refetch()}
          title="This course could not be loaded"
        />
      </Card>
    );
  }

  const data = course.data;

  async function runVisibility(action: VisibilityAction) {
    try {
      await visibility.mutateAsync(action.endpoint);
      toast.success(action.successTitle, action.successBody);
    } catch (error) {
      toast.error(error);
    } finally {
      setPendingAction(null);
    }
  }

  const actions = visibilityActionsFor(data.status);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Courses', href: '/courses' },
          { label: data.title },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {data.title}
            <CourseStatusBadge status={data.status} />
          </span>
        }
        description={data.shortDescription || undefined}
        actions={
          isAdmin ? (
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.endpoint}
                  variant={action.variant}
                  onClick={() => setPendingAction(action)}
                  disabled={visibility.isPending}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null
        }
      />

      <Card>
        <div className="px-5 py-4">
          <DescriptionList
            columns={3}
            items={[
              {
                label: 'Teacher',
                value:
                  data.teachers.map((teacher) => teacher.fullName).join(', ') || '—',
              },
              {
                label: 'Price',
                value: data.isFree ? (
                  <Badge tone="info">Free</Badge>
                ) : (
                  formatMoney(data.price?.amount, data.price?.currency)
                ),
              },
              { label: 'Students', value: formatNumber(data.studentCount) },
              { label: 'Sections', value: formatNumber(data.counts.sections) },
              { label: 'Lectures', value: formatNumber(data.counts.lessons) },
              { label: 'Created', value: formatDate(data.createdAt) },
              { label: 'University', value: data.university?.name ?? '—' },
              { label: 'College', value: data.faculty?.name ?? '—' },
              { label: 'Academic year', value: data.academicYear?.name ?? '—' },
              { label: 'Subject', value: data.subject?.name ?? '—' },
              {
                label: 'Published',
                value: data.publishedAt ? formatDate(data.publishedAt) : 'Not published',
              },
              {
                label: 'Archived',
                value: data.archivedAt ? formatDate(data.archivedAt) : '—',
              },
            ]}
          />
        </div>
      </Card>

      <div>
        <Tabs
          tabs={[
            { id: 'content', label: 'Content' },
            { id: 'students', label: 'Students' },
            { id: 'notify', label: 'Notifications' },
            { id: 'pricing', label: 'Pricing' },
            // Parts sit beside Pricing rather than inside it: they change how
            // the course is *bought*, not what it costs.
            { id: 'parts', label: 'Parts' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div className="pt-5">
          <TabPanel id="content" active={tab}>
            <CourseContentTab courseId={courseId} />
          </TabPanel>

          <TabPanel id="students" active={tab}>
            <CourseStudentsTab courseId={courseId} courseTitle={data.title} />
          </TabPanel>

          <TabPanel id="notify" active={tab}>
            <CourseNotifyTab courseId={courseId} courseTitle={data.title} />
          </TabPanel>

          <TabPanel id="pricing" active={tab}>
            <CoursePricingTab
              courseId={courseId}
              currentPrice={data.price?.amount ?? 0}
              currency={data.price?.currency ?? 'EGP'}
              isFree={data.isFree}
            />
          </TabPanel>

          <TabPanel id="parts" active={tab}>
            {/*
              A teacher reaches this tab because the part routes are
              @StaffOnly(), but the backend still checks their assignment to
              this course before allowing a change. `canManage` only decides
              whether the buttons are offered — the refusal is the server's.
            */}
            <CoursePartsTab
              courseId={courseId}
              courseTitle={data.title}
              canManage={can('manageCourseParts')}
            />
          </TabPanel>
        </div>
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => pendingAction && void runVisibility(pendingAction)}
        title={pendingAction?.confirmTitle ?? ''}
        message={pendingAction?.confirmBody ?? ''}
        confirmLabel={pendingAction?.label ?? 'Confirm'}
        variant={pendingAction?.variant === 'danger' ? 'danger' : 'primary'}
        busy={visibility.isPending}
      />
    </div>
  );
}

interface VisibilityAction {
  endpoint: 'publish' | 'unpublish' | 'archive' | 'restore';
  label: string;
  variant: 'primary' | 'secondary' | 'danger';
  confirmTitle: string;
  confirmBody: string;
  successTitle: string;
  successBody: string;
}

function visibilityActionsFor(status: string): VisibilityAction[] {
  if (status === 'ARCHIVED') {
    return [
      {
        endpoint: 'restore',
        label: 'Restore course',
        variant: 'primary',
        confirmTitle: 'Restore this course?',
        confirmBody:
          'The course returns as a draft. Nothing about its purchases, revenue or watch history changed while it was archived.',
        successTitle: 'Course restored',
        successBody: 'It is back as a draft.',
      },
    ];
  }

  const actions: VisibilityAction[] = [];

  if (status === 'PUBLISHED') {
    actions.push({
      endpoint: 'unpublish',
      label: 'Hide course',
      variant: 'secondary',
      confirmTitle: 'Hide this course?',
      confirmBody:
        'It stops appearing in the catalogue and no new student can join it. Students who already have access keep it and can carry on watching — hiding is not the same as revoking.',
      successTitle: 'Course hidden',
      successBody: 'Existing students keep their access.',
    });
  } else {
    actions.push({
      endpoint: 'publish',
      label: status === 'HIDDEN' ? 'Make visible' : 'Publish course',
      variant: 'primary',
      confirmTitle: status === 'HIDDEN' ? 'Make this course visible?' : 'Publish this course?',
      confirmBody:
        'It will be listed in the catalogue and students matching its academic year will be able to join it.',
      successTitle: 'Course is visible',
      successBody: 'Students can now find it.',
    });
  }

  actions.push({
    endpoint: 'archive',
    label: 'Archive',
    variant: 'danger',
    confirmTitle: 'Archive this course?',
    confirmBody:
      'Content stops being served to everyone, including students who bought it. Purchases, revenue, code redemptions and watch history are all kept — archiving never deletes business records — and the course can be restored later.',
    successTitle: 'Course archived',
    successBody: 'All historical records were retained.',
  });

  return actions;
}
