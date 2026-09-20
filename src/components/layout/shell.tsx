'use client';

import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { NavGlyph } from '@/components/layout/icons';
import {
  ADMIN_NAV,
  TEACHER_NAV,
  isActivePath,
  type NavSection,
} from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, Badge } from '@/components/ui/primitives';
import { api, authApi } from '@/lib/api-client';
import { ROLE_LABEL } from '@/lib/permissions';
import { queryKeys } from '@/lib/query-keys';
import { useSession } from '@/lib/session-context';
import { cn } from '@/lib/utils';

/**
 * The dashboard chrome.
 *
 * Layout: a fixed sidebar from `lg` up, and an off-canvas drawer below it.
 * The drawer is a real overlay with a backdrop rather than a squeezed column,
 * because at tablet width the tables need every pixel they can get.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, can, isTeacher } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sections: NavSection[] = isTeacher ? TEACHER_NAV : ADMIN_NAV;

  const visible = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => can(item.capability)),
    }))
    .filter((section) => section.items.length > 0);

  // Close the drawer on navigation — leaving it open over the page you just
  // asked for is the classic mobile-nav bug.
  useEffect(() => setDrawerOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-border bg-surface lg:flex">
        <SidebarContent sections={visible} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col border-e border-border bg-surface shadow-2xl"
            aria-label="Main navigation"
          >
            <SidebarContent
              sections={visible}
              pathname={pathname}
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="lg:ps-64">
        <Header onOpenNav={() => setDrawerOpen(true)} />

        <main id="main" className="mx-auto w-full max-w-[95rem] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-[95rem] px-4 pb-8 sm:px-6 lg:px-8">
          <p className="border-t border-border pt-4 text-xs text-subtle">
            Signed in as {user.fullName} · {ROLE_LABEL[user.role]}
          </p>
        </footer>
      </div>
    </div>
  );
}

function SidebarContent({
  sections,
  pathname,
  onClose,
}: {
  sections: NavSection[];
  pathname: string;
  onClose?: () => void;
}) {
  const { can } = useSession();

  // Only fetched when the support entry is actually shown, so a teacher's
  // session never calls an endpoint their role cannot use.
  const { data: supportCounters } = useQuery({
    queryKey: queryKeys.support.counters,
    queryFn: () => api.get<{ open: number; pending: number; unread: number }>('admin/support/counters'),
    enabled: can('manageSupport'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const badges = { support: supportCounters?.open ?? 0 };

  return (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          {/* The plate behind the mark is the logo's own ground, so the cog
              keeps the contrast it was drawn with in either theme. */}
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-orange"
            aria-hidden="true"
          >
            <Image src="/logo-mark.png" alt="" width={20} height={22} priority />
          </span>
          <span className="truncate text-sm font-semibold text-foreground">EduPlatform</span>
        </Link>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-2 text-muted hover:bg-surface-alt hover:text-foreground lg:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.id} className="mb-5 last:mb-0">
            {section.label ? (
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-subtle uppercase">
                {section.label}
              </p>
            ) : null}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActivePath(pathname, item);
                const badge = item.badgeKey ? badges[item.badgeKey] : 0;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-primary-soft text-primary'
                          : 'text-muted hover:bg-surface-alt hover:text-foreground',
                      )}
                    >
                      <NavGlyph name={item.icon} className="shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge > 0 ? (
                        <Badge tone="danger" className="px-1.5 py-0 text-[10px]">
                          {badge > 99 ? '99+' : badge}
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}

function Header({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="-ms-2 rounded-lg p-2 text-muted transition-colors hover:bg-surface-alt hover:text-foreground lg:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      <div className="ms-auto flex items-center gap-1.5">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('edu-theme', next);
    } catch {
      // Private browsing with storage blocked — the theme still applies for
      // this page load, it just will not be remembered.
    }
    setTheme(next);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </Button>
  );
}

function UserMenu() {
  const { user } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    await authApi.logout();
    // Replace, not push: the dashboard must not be reachable with Back after
    // signing out.
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg py-1 ps-1 pe-2 transition-colors hover:bg-surface-alt"
      >
        <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
        <span className="hidden max-w-[10rem] truncate text-sm font-medium text-foreground sm:block">
          {user.fullName}
        </span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-subtle">
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute end-0 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium text-foreground">{user.fullName}</p>
            <p className="mt-0.5 truncate text-xs text-muted" dir="ltr">
              {user.phone}
            </p>
            <Badge tone="primary" className="mt-2">
              {ROLE_LABEL[user.role]}
            </Badge>
          </div>

          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
