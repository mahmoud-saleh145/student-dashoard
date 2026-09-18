'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { can, isAdminRole, isMaster, isTeacher, type Capability } from '@/lib/permissions';
import type { SessionUser } from '@/types/domain';

/**
 * The signed-in user, made available to client components.
 *
 * Populated on the server by the dashboard layout, so there is no loading
 * state and no flash of an empty shell — the user is known before the first
 * byte of the page is sent.
 */

interface SessionValue {
  user: SessionUser;
  can: (capability: Capability) => boolean;
  isAdmin: boolean;
  isMaster: boolean;
  isTeacher: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  const value: SessionValue = {
    user,
    can: (capability) => can(user.role, capability),
    isAdmin: isAdminRole(user.role),
    isMaster: isMaster(user.role),
    isTeacher: isTeacher(user.role),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return context;
}
