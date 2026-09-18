'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/lib/utils';

/**
 * Form controls.
 *
 * Every control here is wired for accessibility by construction rather than by
 * remembering: `Field` generates the id, points the `<label>` at it, and links
 * the hint and the error through `aria-describedby`. A form built from these
 * is announced correctly without any caller doing anything.
 */

const CONTROL =
  'w-full rounded-lg border bg-surface px-3 text-sm text-foreground transition-colors ' +
  'placeholder:text-subtle ' +
  'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ' +
  'disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted';

const CONTROL_OK = 'border-border hover:border-border-strong';
const CONTROL_BAD = 'border-danger hover:border-danger';

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | string[] | null;
  required?: boolean;
  className?: string;
  children: (ids: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const messages = Array.isArray(error) ? error.filter(Boolean) : error ? [error] : [];
  const invalid = messages.length > 0;

  const describedBy =
    [hint ? hintId : null, invalid ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
          {required ? (
            <span className="text-danger" aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
          {required ? <span className="sr-only"> (required)</span> : null}
        </label>
      ) : null}

      {children({ id, describedBy, invalid })}

      {hint && !invalid ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}

      {invalid ? (
        // `role="alert"` so a validation failure arriving after submit is
        // announced, not silently painted red.
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {messages.join(' ')}
        </p>
      ) : null}
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, invalid, leading, trailing, ...props },
  ref,
) {
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL,
        'h-10',
        invalid ? CONTROL_BAD : CONTROL_OK,
        leading && 'ps-9',
        trailing && 'pe-9',
        className,
      )}
      {...props}
    />
  );

  if (!leading && !trailing) return input;

  return (
    <div className="relative">
      {leading ? (
        <span className="pointer-events-none absolute inset-y-0 start-0 flex w-9 items-center justify-center text-subtle">
          {leading}
        </span>
      ) : null}
      {input}
      {trailing ? (
        <span className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-subtle">
          {trailing}
        </span>
      ) : null}
    </div>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, invalid, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, 'py-2 leading-6', invalid ? CONTROL_BAD : CONTROL_OK, className)}
      {...props}
    />
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, options, placeholder, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL,
          'h-10 appearance-none pe-9',
          invalid ? CONTROL_BAD : CONTROL_OK,
          className,
        )}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 end-0 flex w-9 items-center justify-center text-subtle">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 7.5 10 12.5 15 7.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
});

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: ReactNode;
  id?: string;
  /** Shown in place of the description when the control is disabled. */
  disabledReason?: string;
}

/**
 * A labelled switch.
 *
 * Implemented as a real `<button role="switch">` rather than a styled
 * checkbox: `aria-checked` on a switch is announced as on/off, which is what
 * these settings are, and it keeps keyboard activation on Space and Enter.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  description,
  id,
  disabledReason,
}: SwitchProps) {
  const generated = useId();
  const controlId = id ?? generated;
  const labelId = `${controlId}-label`;
  const descriptionId = `${controlId}-description`;
  const shownDescription = disabled && disabledReason ? disabledReason : description;

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        {/*
          A <label for> gives an accessible name to a form control, but NOT to a
          <button>. Without the aria-labelledby below, this switch is announced
          as an unnamed button and cannot be found by its label at all.
        */}
        <label id={labelId} htmlFor={controlId} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        {shownDescription ? (
          <p id={descriptionId} className="mt-0.5 text-xs text-muted">
            {shownDescription}
          </p>
        ) : null}
      </div>

      <button
        id={controlId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={shownDescription ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          checked ? 'bg-primary' : 'bg-border-strong',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
            // Translation is mirrored in RTL by using a logical margin instead
            // of a directional translate.
            checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, ...props },
  ref,
) {
  const id = useId();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="h-4 w-4 shrink-0 rounded border-border-strong text-primary accent-[var(--color-primary)]"
        {...props}
      />
      <label htmlFor={id} className="cursor-pointer text-sm text-foreground select-none">
        {label}
      </label>
    </div>
  );
});
