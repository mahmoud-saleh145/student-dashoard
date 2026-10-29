'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { useResetPassword } from '@/features/teachers/hooks';
import { fieldErrors, messageFor } from '@/lib/errors';
import { formatPhone } from '@/lib/format';
import { PASSWORD_POLICY_HINT, newPasswordProblem } from '@/lib/password-policy';
import { queryKeys } from '@/lib/query-keys';

/**
 * Resetting a student's password — the only way a student's password changes.
 *
 * Students cannot change or recover their own password (product decision);
 * they contact the administration, and a MASTER or ADMIN sets a new one here.
 * Two steps, deliberately: enter and confirm the password, then confirm the
 * action itself, because it signs the student out of every device.
 *
 * The confirmation field is compared here and never sent. The request is
 * `PUT /admin/users/:id/password` with `{ newPassword, note? }`; the backend
 * enforces who may call it, applies the same password policy, revokes the
 * sessions and writes the audit row (with the note).
 */
export function ResetStudentPasswordDialog({
  student,
  onClose,
}: {
  student: { id: string; fullName: string; phone: string } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const resetPassword = useResetPassword();

  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const problem = password.length > 0 ? newPasswordProblem(password) : null;
  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = password.length > 0 && problem === null && password === confirm;

  const serverFieldErrors = fieldErrors(failure).newPassword ?? null;

  function close() {
    if (resetPassword.isPending) return;
    setStep('enter');
    setPassword('');
    setConfirm('');
    setNote('');
    setTouched(false);
    setFailure(null);
    onClose();
  }

  function proceed() {
    setTouched(true);
    if (!valid) return;
    setFailure(null);
    setStep('confirm');
  }

  async function submit() {
    if (!student || !valid) return;
    setFailure(null);

    try {
      await resetPassword.mutateAsync({
        userId: student.id,
        newPassword: password,
        note: note.trim() || undefined,
      });
    } catch (error) {
      // A field-level rejection belongs next to the field; anything else is
      // shown in the dialog. Either way nothing was changed.
      setFailure(error);
      setStep('enter');
      return;
    }

    // Only now, after the API confirmed it.
    toast.success(
      'Password reset',
      `${student.fullName} was signed out of every device and must sign in with the new password.`,
    );
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.students.history(student.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.students.sessions(student.id) }),
    ]);
    close();
  }

  const failureSummary =
    failure && !serverFieldErrors ? messageFor(failure) : null;

  return (
    <Modal
      open={student !== null}
      onClose={close}
      title={step === 'enter' ? 'Reset password' : 'Reset this student’s password?'}
      description={
        student ? `${student.fullName} · ${formatPhone(student.phone)}` : undefined
      }
      busy={resetPassword.isPending}
      footer={
        step === 'enter' ? (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={proceed} disabled={touched && !valid}>
              Continue
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => setStep('enter')}
              disabled={resetPassword.isPending}
            >
              Back
            </Button>
            <Button variant="danger" onClick={submit} loading={resetPassword.isPending}>
              Reset password
            </Button>
          </>
        )
      }
    >
      {step === 'enter' ? (
        <div className="flex flex-col gap-4">
          {failureSummary ? (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger"
            >
              The password was not changed. {failureSummary}
            </p>
          ) : null}

          <Field
            label="New password"
            required
            hint={PASSWORD_POLICY_HINT}
            error={(touched || password.length > 0 ? problem : null) ?? serverFieldErrors}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                type="password"
                autoComplete="new-password"
                aria-describedby={describedBy}
                invalid={invalid}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFailure(null);
                }}
                maxLength={128}
                autoFocus
              />
            )}
          </Field>

          <Field
            label="Confirm new password"
            required
            error={
              mismatch
                ? 'The passwords do not match.'
                : touched && confirm.length === 0
                  ? 'Enter the new password again.'
                  : null
            }
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                type="password"
                autoComplete="new-password"
                aria-describedby={describedBy}
                invalid={invalid}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                maxLength={128}
              />
            )}
          </Field>

          <Field
            label="Note for the audit log"
            hint="Optional. For example, how you verified the student’s identity."
          >
            {({ id, describedBy }) => (
              <TextArea
                id={id}
                rows={2}
                aria-describedby={describedBy}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
              />
            )}
          </Field>

          <p className="rounded-lg border border-border bg-surface-alt p-3 text-xs text-muted">
            Verify the student’s identity before resetting. The current password is never shown —
            it is stored only as a one-way hash. Give the new password to the student yourself;
            they are not notified automatically.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm text-foreground">
          <p>
            The password for <strong>{student?.fullName}</strong> will be replaced. They are signed
            out of every device immediately and must sign in with the new password.
          </p>
          <p className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
            This cannot be undone. The reset is recorded in the audit log under your name
            {note.trim() ? ', with your note' : ''}.
          </p>
        </div>
      )}
    </Modal>
  );
}
