/**
 * Stub routes for the student drawer and its "Reset password" action.
 *
 * Kept in its own module so the main stub only gains two hook lines. Mirrors
 * the real backend where it matters to the dashboard:
 *
 *   - `PUT /admin/users/:id/password` is @AdminOnly(): a TEACHER gets 403
 *     INSUFFICIENT_ROLE whatever the UI shows;
 *   - the body is `{ newPassword, note? }` and nothing else — the real API
 *     rejects unknown fields, so a stray `confirmPassword` is a 422 here too;
 *   - a successful reset writes a PASSWORD_RESET row to the student's audit
 *     history, naming the administrator and the note.
 *
 * Test controls, under `/__test__/student-password/*`:
 *   reset            — forget recorded resets and failure switches
 *   last             — the last reset request received (userId, body, actor)
 *   fail-server      — the next reset answers 500
 *   reject-policy    — the next reset answers 422 with a newPassword field error
 */

const STUDENT = {
  id: 'stu-1',
  fullName: 'Sara Student',
  phone: '01000000004',
  email: null,
  gender: 'FEMALE',
  role: 'STUDENT',
  status: 'ACTIVE',
  avatarUrl: null,
  lastLoginAt: null,
  createdAt: '2026-01-05T00:00:00.000Z',
  university: null,
  faculty: null,
  department: null,
  academicYear: null,
};

const state = {
  resets: [],
  history: [],
  failServer: false,
  rejectPolicy: false,
};

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const ok = (res, data) => send(res, 200, { success: true, data });

function fail(res, status, code, message, fields) {
  send(res, status, {
    success: false,
    error: { code, message, ...(fields ? { fields } : {}) },
    statusCode: status,
    code,
    message,
    timestamp: new Date().toISOString(),
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

/** `/__test__/student-password/*`. Returns true when it answered. */
export function handleStudentPasswordControl(path, res) {
  if (!path.startsWith('/__test__/student-password/')) return false;
  const action = path.slice('/__test__/student-password/'.length);

  if (action === 'reset') {
    state.resets.length = 0;
    state.history.length = 0;
    state.failServer = false;
    state.rejectPolicy = false;
    ok(res, { reset: true });
  } else if (action === 'last') {
    ok(res, state.resets.at(-1) ?? null);
  } else if (action === 'fail-server') {
    state.failServer = true;
    ok(res, { armed: true });
  } else if (action === 'reject-policy') {
    state.rejectPolicy = true;
    ok(res, { armed: true });
  } else {
    fail(res, 404, 'NOT_FOUND', 'Unknown student-password control.');
  }
  return true;
}

/** Authenticated routes. Returns true when it answered. */
export async function handleStudentPasswordRoutes({ req, res, path, method, user }) {
  const isAdmin = user.role === 'ADMIN' || user.role === 'MASTER';

  const reset = /^\/admin\/users\/([^/]+)\/password$/.exec(path);
  if (reset && method === 'PUT') {
    if (!isAdmin) {
      fail(res, 403, 'INSUFFICIENT_ROLE', 'Requires one of: MASTER, ADMIN');
      return true;
    }
    const body = await readBody(req);
    state.resets.push({ userId: reset[1], body, actorId: user.id });

    const unknown = Object.keys(body).filter((key) => key !== 'newPassword' && key !== 'note');
    if (unknown.length > 0) {
      fail(res, 422, 'VALIDATION_ERROR', 'Request validation failed', {
        [unknown[0]]: [`property ${unknown[0]} should not exist`],
      });
      return true;
    }
    if (state.failServer) {
      state.failServer = false;
      fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong.');
      return true;
    }
    if (state.rejectPolicy) {
      state.rejectPolicy = false;
      fail(res, 422, 'VALIDATION_ERROR', 'Request validation failed', {
        newPassword: ['newPassword is too easy to guess; choose a less common password'],
      });
      return true;
    }

    state.history.unshift({
      id: `audit-${state.history.length + 1}`,
      action: 'PASSWORD_RESET',
      entity: 'user',
      entityId: reset[1],
      note: body.note ?? 'Administrative reset',
      createdAt: new Date().toISOString(),
      actor: { id: user.id, fullName: user.fullName },
    });
    ok(res, { ok: true });
    return true;
  }

  if (method !== 'GET') return false;

  const detail = /^\/admin\/users\/(stu-1)$/.exec(path);
  const history = /^\/audit\/user\/(stu-1)$/.exec(path);
  const sessions = /^\/sessions\/users\/(stu-1)$/.exec(path);
  if (!detail && !history && !sessions) return false;

  if (!isAdmin) {
    fail(res, 403, 'INSUFFICIENT_ROLE', 'Requires one of: MASTER, ADMIN');
    return true;
  }
  if (detail) ok(res, STUDENT);
  else if (history) ok(res, state.history);
  else {
    ok(res, {
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
    });
  }
  return true;
}
