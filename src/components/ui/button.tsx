'use client';

import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'outline'
  | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-fg hover:bg-primary/90 active:bg-primary/95 shadow-sm disabled:bg-primary/50',
  secondary:
    'bg-surface-alt text-foreground border border-border hover:bg-border/40 active:bg-border/60',
  outline:
    'bg-transparent text-foreground border border-border-strong hover:bg-surface-alt active:bg-border/40',
  ghost: 'bg-transparent text-muted hover:bg-surface-alt hover:text-foreground',
  danger:
    'bg-danger text-white hover:bg-danger/90 active:bg-danger/95 shadow-sm disabled:bg-danger/50',
  link: 'bg-transparent text-primary underline-offset-4 hover:underline p-0 h-auto',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
  // 40px square: comfortably above the 24px minimum target size in WCAG 2.2
  // and large enough to hit on a tablet, which is where these toolbars are
  // most often used.
  icon: 'h-10 w-10 p-0 rounded-lg',
};

const BASE =
  'inline-flex items-center justify-center font-medium transition-colors select-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * The one button.
 *
 * `loading` disables the control and swaps the leading icon for a spinner
 * rather than replacing the label — a button whose text disappears mid-submit
 * loses its accessible name exactly when a screen reader user needs it, and
 * makes the layout jump.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leadingIcon,
    trailingIcon,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});

export interface ButtonLinkProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  leadingIcon?: ReactNode;
  prefetch?: boolean;
  'aria-label'?: string;
}

/** A link styled as a button. Still a link — it navigates, so it must be one. */
export function ButtonLink({
  href,
  variant = 'secondary',
  size = 'md',
  className,
  children,
  leadingIcon,
  prefetch,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    >
      {leadingIcon}
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 shrink-0 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
