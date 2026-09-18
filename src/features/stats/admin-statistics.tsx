'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { DateRangeFilter } from '@/components/data/filters';
import { Card, CardBody, CardHeader, PageHeader, StatTile } from '@/components/ui/primitives';
import { CardsSkeleton, ErrorState, Skeleton } from '@/components/ui/states';
import { api } from '@/lib/api-client';
import { endOfDayIso, formatDate, formatMoney, formatNumber, startOfDayIso } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import type { DashboardStats, RevenuePoint } from '@/types/domain';

/**
 * The Statistics screen.
 *
 * Every figure here comes from `GET /analytics/dashboard` and
 * `GET /analytics/revenue`, both of which read the immutable revenue ledger
 * rather than any course's current price. Nothing on this page is computed in
 * the browser from a sample, and nothing is placeholder data.
 */

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86_400_000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export function AdminStatistics() {
  const [range, setRange] = useState(defaultRange);

  const params = useMemo(
    () => ({ from: startOfDayIso(range.from), to: endOfDayIso(range.to) }),
    [range],
  );

  const stats = useQuery({
    queryKey: queryKeys.stats.dashboard(params),
    queryFn: () => api.get<DashboardStats>('analytics/dashboard', { query: params }),
  });

  const revenue = useQuery({
    queryKey: queryKeys.stats.revenue(params),
    queryFn: () => api.get<RevenueSeriesResponse>('analytics/revenue', { query: params }),
  });

  const data = stats.data;
  const currency = data?.revenue.currency ?? 'EGP';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Statistics"
        description="Platform activity, course catalogue and revenue. Money figures come from the revenue ledger, so they never change when a course is repriced."
        actions={
          <DateRangeFilter
            from={range.from}
            to={range.to}
            onChange={(next) => setRange(next)}
          />
        }
      />

      {stats.isError ? (
        <Card>
          <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
        </Card>
      ) : null}

      {stats.isLoading ? (
        <CardsSkeleton count={4} />
      ) : data ? (
        <>
          <section aria-label="Headline figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Total students"
              value={formatNumber(data.users.students)}
              hint={`${formatNumber(data.users.blockedStudents)} blocked`}
              tone="primary"
            />
            <StatTile
              label="Total teachers"
              value={formatNumber(data.users.teachers)}
              hint={`${formatNumber(data.users.admins)} admin accounts`}
            />
            <StatTile
              label="Total courses"
              value={formatNumber(data.courses.total)}
              hint={`${formatNumber(data.courses.published)} visible`}
            />
            <StatTile
              label="Total revenue"
              value={formatMoney(data.revenue.netAllTime, currency)}
              hint={
                data.revenue.refundedAllTime > 0
                  ? `after ${formatMoney(data.revenue.refundedAllTime, currency)} refunded`
                  : 'all time, net of refunds'
              }
              tone="success"
            />
          </section>

          <section
            aria-label="Purchases and access"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <StatTile
              label="Paid purchases"
              value={formatNumber(data.purchases.paidPayments)}
              hint="payments captured, all time"
            />
            <StatTile
              label="Active enrolments"
              value={formatNumber(data.purchases.activeEnrollments)}
              hint="students with live access"
            />
            <StatTile
              label="Revenue in period"
              value={formatMoney(data.revenue.grossInPeriod, currency)}
              hint={`${formatNumber(data.purchases.transactionsInPeriod)} transactions`}
              tone="success"
            />
            <StatTile
              label="New enrolments in period"
              value={formatNumber(data.purchases.enrollmentsInPeriod)}
              hint={`${formatDate(data.period.from)} – ${formatDate(data.period.to)}`}
            />
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Revenue"
                description="Daily gross, from the revenue ledger."
              />
              <CardBody>
                {revenue.isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : revenue.isError ? (
                  <ErrorState error={revenue.error} onRetry={() => void revenue.refetch()} />
                ) : (
                  <RevenueChart points={normalizeSeries(revenue.data)} currency={currency} />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Access codes"
                description="Every card ever generated, by state."
              />
              <CardBody className="flex flex-col gap-4">
                <CodeBreakdown codes={data.codes} />
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Course catalogue" description="Courses by visibility." />
              <CardBody>
                <CourseStatusChart courses={data.courses} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Needs attention" description="Queues waiting on an admin." />
              <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatTile
                  label="Open support tickets"
                  value={formatNumber(data.queues.supportOpen)}
                  tone={data.queues.supportOpen > 0 ? 'warning' : 'neutral'}
                />
                <StatTile
                  label="Device change requests"
                  value={formatNumber(data.queues.pendingDeviceRequests)}
                  tone={data.queues.pendingDeviceRequests > 0 ? 'warning' : 'neutral'}
                />
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

interface RevenueSeriesResponse {
  points?: { day: string; amount: number; transactions?: number }[];
  series?: { day: string; amount: number }[];
  items?: { day: string; amount: number }[];
}

/**
 * The revenue endpoint predates this dashboard and returns its rows under one
 * of a few keys depending on the shape it was built for. Reading all of them
 * is cheaper and safer than changing an endpoint the mobile app also uses.
 */
function normalizeSeries(response: RevenueSeriesResponse | undefined): RevenuePoint[] {
  const rows = response?.points ?? response?.series ?? response?.items ?? [];
  return rows.map((row) => ({
    day: row.day,
    amount: Number(row.amount) || 0,
    transactions: 'transactions' in row ? Number(row.transactions) || 0 : undefined,
  }));
}

function RevenueChart({ points, currency }: { points: RevenuePoint[]; currency: string }) {
  if (points.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted">
        No revenue recorded in this period.
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(value: string) => formatDate(value).slice(0, 6)}
            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(value: number) => formatNumber(value)}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              fontSize: 12,
              color: 'var(--color-foreground)',
            }}
            labelFormatter={(value) => formatDate(String(value ?? ''))}
            formatter={(value) => [formatMoney(Number(value ?? 0), currency), 'Revenue']}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#revenueFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CodeBreakdown({ codes }: { codes: DashboardStats['codes'] }) {
  const rows = [
    { label: 'Active', value: codes.active, color: 'var(--color-success)' },
    { label: 'Used', value: codes.used, color: 'var(--color-info)' },
    { label: 'Expired', value: codes.expired, color: 'var(--color-warning)' },
    { label: 'Cancelled', value: codes.cancelled, color: 'var(--color-danger)' },
  ];

  const total = codes.total || 1;

  return (
    <>
      <p className="text-2xl font-semibold tabular-nums text-foreground">
        {formatNumber(codes.total)}
        <span className="ms-2 text-sm font-normal text-muted">cards generated</span>
      </p>

      {/* A stacked bar rather than a pie: four proportions of one total are
          much easier to compare as lengths than as angles. */}
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-alt" aria-hidden="true">
        {rows.map((row) =>
          row.value > 0 ? (
            <span
              key={row.label}
              style={{ width: `${(row.value / total) * 100}%`, background: row.color }}
            />
          ) : null,
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: row.color }}
              aria-hidden="true"
            />
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="ms-auto text-sm font-medium tabular-nums text-foreground">
              {formatNumber(row.value)}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function CourseStatusChart({ courses }: { courses: DashboardStats['courses'] }) {
  const data = [
    { name: 'Visible', value: courses.published, color: 'var(--color-success)' },
    { name: 'Hidden', value: courses.hidden, color: 'var(--color-info)' },
    { name: 'Draft', value: courses.draft, color: 'var(--color-subtle)' },
    { name: 'Suspended', value: courses.suspended, color: 'var(--color-warning)' },
    { name: 'Archived', value: courses.archived, color: 'var(--color-border-strong)' },
  ];

  if (courses.total === 0) {
    return <p className="py-16 text-center text-sm text-muted">No courses yet.</p>;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-alt)' }}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              fontSize: 12,
              color: 'var(--color-foreground)',
            }}
            formatter={(value) => [formatNumber(Number(value ?? 0)), 'Courses']}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
