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
import { cn } from '@/lib/utils';
import type { DashboardStats, RevenuePoint } from '@/types/domain';

/**
 * The Statistics screen.
 *
 * Every figure here comes from `GET /analytics/dashboard` and
 * `GET /analytics/revenue`. Nothing on this page is computed in the browser
 * from a sample, and nothing is placeholder data.
 *
 * Revenue is money actually collected, from three sources, each counted once:
 * paid access cards (the amount recorded when the card was issued, counted
 * when it is first redeemed), wallet top-ups (cash paid for recharge cards),
 * and online payments net of refunds. Profit equals revenue — no expenses are
 * recorded. Free cards and cards whose amount was never recorded are shown as
 * activations beside it, never valued from a course or card price.
 *
 * Every new revenue field is optional in the type: against an API deployed
 * before them, the tiles fall back to the ledger figures they showed before.
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
  const money = (amount: number | undefined) => formatMoney(amount ?? 0, currency);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Statistics"
        description="Platform activity, course catalogue and revenue. Revenue is money actually collected — paid cards when redeemed, wallet top-ups and online payments — never a course's listed price."
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
              value={money(data.revenue.totalAllTime ?? data.revenue.netAllTime)}
              hint={
                data.revenue.totalAllTime === undefined
                  ? 'all time, net of refunds'
                  : sourcesHint(
                      data.revenue.codeSalesAllTime,
                      data.revenue.walletTopUpsAllTime,
                      data.revenue.onlinePaymentsAllTime,
                      money,
                    )
              }
              tone="success"
            />
          </section>

          <section
            aria-label="Revenue in period"
            className={cn(
              'grid grid-cols-1 gap-4 sm:grid-cols-2',
              showOnline(data) ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
            )}
          >
            <StatTile
              label="Revenue in period"
              value={money(
                data.revenue.totalInPeriod ??
                  data.revenue.netInPeriod ??
                  data.revenue.grossInPeriod,
              )}
              hint={`${formatDate(data.period.from)} – ${formatDate(data.period.to)}`}
              tone="success"
            />
            <StatTile
              label="Code sales"
              value={money(data.revenue.codeSalesInPeriod)}
              hint={countHint(data.purchases.paidCodeSalesInPeriod, 'paid card redeemed', 'paid cards redeemed')}
            />
            <StatTile
              label="Wallet top-ups"
              value={money(data.revenue.walletTopUpsInPeriod)}
              hint={countHint(data.revenue.walletTopUpCountInPeriod, 'recharge card redeemed', 'recharge cards redeemed')}
            />
            {showOnline(data) ? (
              // Net of completed refunds; pending refunds are not deducted
              // until they are completed.
              <StatTile
                label="Online payments"
                value={money(data.revenue.onlinePaymentsInPeriod ?? data.revenue.netInPeriod)}
                hint={
                  data.revenue.refundedInPeriod
                    ? `${money(data.revenue.grossInPeriod)} sales − ${money(data.revenue.refundedInPeriod)} refunded`
                    : `${formatNumber(data.purchases.transactionsInPeriod)} transactions`
                }
              />
            ) : null}
            <StatTile
              label="Profit"
              value={money(
                data.revenue.profitInPeriod ??
                  data.revenue.totalInPeriod ??
                  data.revenue.netInPeriod ??
                  data.revenue.grossInPeriod,
              )}
              hint="equal to revenue — no expenses are recorded"
              tone="success"
            />
          </section>

          <section
            aria-label="Purchases and access"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"
          >
            <StatTile
              label="Paid purchases"
              value={formatNumber(
                data.purchases.paidCodeSalesInPeriod ?? data.purchases.paidPayments,
              )}
              hint={
                data.purchases.paidCodeSalesAllTime === undefined
                  ? 'payments captured, all time'
                  : `paid cards redeemed in period · ${formatNumber(data.purchases.paidCodeSalesAllTime)} all time`
              }
            />
            <StatTile
              label="Free activations"
              value={formatNumber(data.activations?.freeInPeriod ?? 0)}
              hint={`free cards redeemed · ${formatNumber(data.activations?.freeAllTime ?? 0)} all time · not revenue`}
            />
            <StatTile
              label="Amount not recorded"
              value={formatNumber(data.activations?.unrecordedInPeriod ?? 0)}
              hint={`older cards redeemed with no amount on record · ${formatNumber(data.activations?.unrecordedAllTime ?? 0)} all time · not in revenue`}
              tone={(data.activations?.unrecordedInPeriod ?? 0) > 0 ? 'warning' : 'neutral'}
            />
            <StatTile
              label="Active enrolments"
              value={formatNumber(data.purchases.activeEnrollments)}
              hint="students with live access"
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
                description="Money collected each day: code sales, wallet top-ups and online payments."
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

/** "Codes EGP 1,200 · Wallet top-ups EGP 300", plus online payments when there are any. */
function sourcesHint(
  codeSales: number | undefined,
  walletTopUps: number | undefined,
  online: number | undefined,
  money: (amount: number | undefined) => string,
): string {
  const parts = [`Codes ${money(codeSales)}`, `Wallet top-ups ${money(walletTopUps)}`];
  if (online) parts.push(`Online ${money(online)}`);
  return parts.join(' · ');
}

function countHint(count: number | undefined, one: string, many: string): string | undefined {
  if (count === undefined) return undefined;
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

/**
 * The online channel is switched off in production, so its tile is shown only
 * once it has ever recorded something — an always-zero tile would only invite
 * the question of where the money went.
 */
function showOnline(data: DashboardStats): boolean {
  return (
    data.revenue.grossAllTime > 0 ||
    data.revenue.refundedAllTime > 0 ||
    Boolean(data.revenue.onlinePaymentsAllTime)
  );
}

interface SeriesRow {
  day: string;
  total?: number;
  codeSales?: number;
  walletTopUps?: number;
  net?: number;
  amount?: number;
}

type RevenueSeriesResponse =
  | SeriesRow[]
  | { points?: SeriesRow[]; series?: SeriesRow[]; items?: SeriesRow[] };

/**
 * `GET /analytics/revenue` returns a bare array of days. This screen used to
 * read it as `{ points }`, which a bare array never has, so the chart always
 * said "No revenue recorded" whatever the ledger held. The array is read
 * first; the keyed shapes are still accepted.
 */
function normalizeSeries(response: RevenueSeriesResponse | undefined): RevenuePoint[] {
  const rows = Array.isArray(response)
    ? response
    : (response?.points ?? response?.series ?? response?.items ?? []);
  const num = (value: unknown) => Number(value) || 0;

  return rows.map((row) => {
    const codeSales = num(row.codeSales);
    const walletTopUps = num(row.walletTopUps);
    const online = num(row.net ?? row.amount);
    return {
      day: row.day,
      codeSales,
      walletTopUps,
      online,
      total:
        row.total !== undefined
          ? num(row.total)
          : Math.round((codeSales + walletTopUps + online) * 100) / 100,
    };
  });
}

const SERIES = [
  { key: 'codeSales', name: 'Code sales', color: 'var(--color-primary)' },
  { key: 'walletTopUps', name: 'Wallet top-ups', color: 'var(--color-info)' },
  { key: 'online', name: 'Online payments', color: 'var(--color-success)' },
] as const;

function RevenueChart({ points, currency }: { points: RevenuePoint[]; currency: string }) {
  if (points.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted">
        No revenue recorded in this period.
      </p>
    );
  }

  // Only the sources that have money in this range; online payments are off
  // in production and would otherwise add an empty legend entry.
  const shown = SERIES.filter((s) => points.some((p) => p[s.key] !== 0));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
            formatter={(value, name) => [formatMoney(Number(value ?? 0), currency), String(name)]}
          />
          {shown.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stackId="revenue"
              stroke={s.color}
              strokeWidth={2}
              fill={s.color}
              fillOpacity={0.15}
            />
          ))}
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
