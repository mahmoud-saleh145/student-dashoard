import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError } from '@/lib/errors';
import { signIn } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Sign-in.
 *
 * The credentials arrive here, the tokens are set as HTTP-only cookies here,
 * and neither is ever visible to the page. The response body is the display
 * profile only.
 */

const schema = z.object({
  // Matches the backend's own Egyptian-mobile rule. Normalising client-side
  // is a convenience; the backend normalises again and is the authority.
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s()-]/g, ''))
    .refine((value) => /^(?:\+?20|0020|0)?1[0125]\d{8}$/.test(value), {
      message: 'Enter a valid Egyptian mobile number',
    }),
  password: z.string().min(1, 'Enter your password').max(128),
});

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(400, 'VALIDATION_ERROR', 'Invalid request body.');
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      fields[key] = [...(fields[key] ?? []), issue.message];
    }
    return fail(422, 'VALIDATION_ERROR', 'Please check the highlighted fields.', fields);
  }

  try {
    const user = await signIn({
      phone: parsed.data.phone,
      password: parsed.data.password,
      forwardedFor: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true, data: { user } });
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(
        error.status,
        error.code,
        error.message,
        error.fields ?? undefined,
        error.userFacing,
      );
    }
    return fail(500, 'SERVER_ERROR', 'Sign-in could not be completed.');
  }
}

function fail(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[]>,
  userFacing = false,
) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, ...(fields ? { fields } : {}), ...(userFacing ? { userFacing } : {}) },
      statusCode: status,
      code,
      message,
      ...(fields ? { errors: fields } : {}),
      ...(userFacing ? { userFacing } : {}),
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}
