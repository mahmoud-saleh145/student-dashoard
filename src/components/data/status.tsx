'use client';

import type { ReactNode } from 'react';

import { Badge, type BadgeTone } from '@/components/ui/primitives';
import type {
  AnnouncementStatus,
  WalletTxDirection,
  WalletTxType,
} from '@/types/commerce';
import { ANNOUNCEMENT_STATUS_LABEL, WALLET_TX_TYPE_LABEL } from '@/types/commerce';
import type {
  AccountStatus,
  CodeStatus,
  CodeTargetType,
  ContentStatus,
  CourseStatus,
  EnrollmentState,
  SupportPriority,
  SupportStatus,
  VideoStatus,
} from '@/types/domain';
import { CODE_STATUS_LABEL, CODE_TARGET_TYPE_LABEL } from '@/types/domain';

/**
 * Status badges.
 *
 * Every status the platform has is rendered by exactly one of these, so a
 * course that is HIDDEN looks the same on the course list, in the course
 * header and in the export legend. Tone carries meaning consistently: amber is
 * "needs attention", grey is "inactive", red is "stopped".
 */

const COURSE_TONES: Record<CourseStatus, BadgeTone> = {
  PUBLISHED: 'success',
  // Hidden is deliberately not a warning: it is a normal, intentional state
  // where enrolled students keep their access.
  HIDDEN: 'info',
  DRAFT: 'neutral',
  SUSPENDED: 'warning',
  ARCHIVED: 'neutral',
};

const COURSE_LABELS: Record<CourseStatus, string> = {
  PUBLISHED: 'Visible',
  HIDDEN: 'Hidden',
  DRAFT: 'Draft',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  return (
    <Badge tone={COURSE_TONES[status]} dot>
      {COURSE_LABELS[status]}
    </Badge>
  );
}

const CONTENT_TONES: Record<ContentStatus, BadgeTone> = {
  PUBLISHED: 'success',
  HIDDEN: 'info',
  DRAFT: 'neutral',
  ARCHIVED: 'neutral',
};

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  const labels: Record<ContentStatus, string> = {
    PUBLISHED: 'Published',
    HIDDEN: 'Hidden',
    DRAFT: 'Draft',
    ARCHIVED: 'Archived',
  };
  return <Badge tone={CONTENT_TONES[status]}>{labels[status]}</Badge>;
}

const ACCOUNT_TONES: Record<AccountStatus, BadgeTone> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  SUSPENDED: 'danger',
  DISABLED: 'neutral',
};

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const labels: Record<AccountStatus, string> = {
    ACTIVE: 'Active',
    PENDING: 'Pending',
    SUSPENDED: 'Blocked',
    DISABLED: 'Disabled',
  };
  return (
    <Badge tone={ACCOUNT_TONES[status]} dot>
      {labels[status]}
    </Badge>
  );
}

const CODE_TONES: Record<CodeStatus, BadgeTone> = {
  ACTIVE: 'success',
  EXHAUSTED: 'info',
  EXPIRED: 'warning',
  REVOKED: 'danger',
};

export function CodeStatusBadge({ status }: { status: CodeStatus }) {
  return <Badge tone={CODE_TONES[status]}>{CODE_STATUS_LABEL[status]}</Badge>;
}

const ENROLLMENT_TONES: Record<EnrollmentState, BadgeTone> = {
  ACTIVE: 'success',
  PENDING_APPROVAL: 'warning',
  PENDING_PAYMENT: 'warning',
  EXPIRED: 'neutral',
  REVOKED: 'danger',
  ARCHIVED: 'neutral',
};

export function EnrollmentStateBadge({ state }: { state: EnrollmentState }) {
  const labels: Record<EnrollmentState, string> = {
    ACTIVE: 'Active',
    PENDING_APPROVAL: 'Awaiting approval',
    PENDING_PAYMENT: 'Awaiting payment',
    EXPIRED: 'Expired',
    REVOKED: 'Revoked',
    ARCHIVED: 'Archived',
  };
  return <Badge tone={ENROLLMENT_TONES[state]}>{labels[state]}</Badge>;
}

const VIDEO_TONES: Record<VideoStatus, BadgeTone> = {
  READY: 'success',
  PROCESSING: 'info',
  QUEUED: 'info',
  UPLOADING: 'info',
  FAILED: 'danger',
  ARCHIVED: 'neutral',
};

export function VideoStatusBadge({ status }: { status: VideoStatus }) {
  const labels: Record<VideoStatus, string> = {
    READY: 'Ready',
    PROCESSING: 'Processing',
    QUEUED: 'Queued',
    UPLOADING: 'Uploading',
    FAILED: 'Failed',
    ARCHIVED: 'Archived',
  };
  return <Badge tone={VIDEO_TONES[status]}>{labels[status]}</Badge>;
}

const SUPPORT_TONES: Record<SupportStatus, BadgeTone> = {
  OPEN: 'danger',
  PENDING: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  const labels: Record<SupportStatus, string> = {
    OPEN: 'Open',
    PENDING: 'Awaiting student',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
  };
  return (
    <Badge tone={SUPPORT_TONES[status]} dot>
      {labels[status]}
    </Badge>
  );
}

const PRIORITY_TONES: Record<SupportPriority, BadgeTone> = {
  URGENT: 'danger',
  HIGH: 'warning',
  NORMAL: 'neutral',
  LOW: 'neutral',
};

export function SupportPriorityBadge({ priority }: { priority: SupportPriority }) {
  const labels: Record<SupportPriority, string> = {
    URGENT: 'Urgent',
    HIGH: 'High',
    NORMAL: 'Normal',
    LOW: 'Low',
  };
  return <Badge tone={PRIORITY_TONES[priority]}>{labels[priority]}</Badge>;
}

// ---------------------------------------------------------------------------
// Wallet, library and announcements
// ---------------------------------------------------------------------------

/**
 * Credit in, credit out.
 *
 * Direction is shown as a sign and a colour rather than as a word, because a
 * ledger is read by scanning a column: "−250" is legible at a glance where
 * "DEBIT" has to be parsed.
 */
export function WalletDirectionBadge({
  direction,
  children,
}: {
  direction: WalletTxDirection;
  children?: ReactNode;
}) {
  const credit = direction === 'CREDIT';
  return (
    <Badge tone={credit ? 'success' : 'warning'}>
      <span aria-hidden="true">{credit ? '+' : '−'}</span>
      <span className="sr-only">{credit ? 'Credit' : 'Debit'}</span>
      {children}
    </Badge>
  );
}

const WALLET_TX_TONES: Record<WalletTxType, BadgeTone> = {
  CREDIT_RECHARGE: 'success',
  PURCHASE: 'info',
  REFUND: 'warning',
  ADMIN_ADJUSTMENT: 'warning',
  REVERSAL: 'danger',
};

export function WalletTxTypeBadge({ type }: { type: WalletTxType }) {
  return <Badge tone={WALLET_TX_TONES[type]}>{WALLET_TX_TYPE_LABEL[type]}</Badge>;
}

const ANNOUNCEMENT_TONES: Record<AnnouncementStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  // Amber rather than green: a row stuck in SENDING is the one an
  // administrator needs to look at.
  SENDING: 'warning',
  SENT: 'success',
  CANCELLED: 'neutral',
};

export function AnnouncementStatusBadge({ status }: { status: AnnouncementStatus }) {
  return (
    <Badge tone={ANNOUNCEMENT_TONES[status]} dot>
      {ANNOUNCEMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function CodeTargetBadge({ targetType }: { targetType: CodeTargetType }) {
  return (
    <Badge tone={targetType === 'PART' ? 'info' : 'neutral'}>
      {CODE_TARGET_TYPE_LABEL[targetType]}
    </Badge>
  );
}
