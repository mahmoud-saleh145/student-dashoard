'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { authApi } from '@/lib/api-client';
import { ApiError, messageFor } from '@/lib/errors';

/**
 * Sign-in form.
 *
 * The password is never held anywhere but this form's own state, and it goes
 * to this application's `/api/auth/login` route — not to the backend directly
 * — so the tokens that come back can be written as HTTP-only cookies.
 */

const schema = z.object({
  phone: z
    .string()
    .min(1, 'Enter your phone number')
    .refine((value) => /^(?:\+?20|0020|0)?1[0125]\d{8}$/.test(value.replace(/[\s()-]/g, '')), {
      message: 'Enter a valid Egyptian mobile number',
    }),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '', password: '' },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);

    try {
      await authApi.login(values.phone, values.password);

      // A full navigation rather than a client push: the dashboard shell is a
      // server component that reads the session cookie, and it must be
      // rendered again now that the cookie exists.
      router.replace(nextPath ?? '/');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        for (const [field, messages] of Object.entries(error.fields)) {
          if (field === 'phone' || field === 'password') {
            setError(field, { message: messages[0] });
          }
        }
        if (!error.fields.phone && !error.fields.password) {
          setFormError(messageFor(error));
        }
        return;
      }

      setFormError(messageFor(error));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      ) : null}

      <Field label="Phone number" error={errors.phone?.message} required>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="01XXXXXXXXX"
            dir="ltr"
            autoFocus
            {...register('phone')}
          />
        )}
      </Field>

      <Field label="Password" error={errors.password?.message} required>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
        )}
      </Field>

      <Button type="submit" loading={isSubmitting} fullWidth size="lg">
        Sign in
      </Button>
    </form>
  );
}
