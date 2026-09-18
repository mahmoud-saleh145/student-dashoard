'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { exportToExcel, type ExportColumn } from '@/lib/export-excel';
import { isAbortError } from '@/lib/utils';

/**
 * Export to Excel.
 *
 * `loadRows` is what makes the file honest: it re-fetches the *whole* result
 * set for the filters currently applied, rather than exporting the twenty rows
 * on screen. A spreadsheet that silently contains one page is the kind of
 * thing someone discovers a month later when the numbers do not add up.
 *
 * Row count is reported while it loads, because a 4 000-row export takes long
 * enough that a silent button reads as broken.
 */
export function ExportButton<T>({
  filename,
  sheetName,
  title,
  subtitle,
  columns,
  loadRows,
  disabled,
  label = 'Export Excel',
  variant = 'secondary',
  size = 'sm',
}: {
  filename: string;
  sheetName?: string;
  title?: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  loadRows: (onProgress: (loaded: number, total: number) => void) => Promise<T[]>;
  disabled?: boolean;
  label?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);

  async function run() {
    setBusy(true);
    setProgress(null);

    try {
      const rows = await loadRows((loaded, total) => setProgress({ loaded, total }));

      if (rows.length === 0) {
        toast.push({
          tone: 'info',
          title: 'Nothing to export',
          description: 'No rows match the current filters.',
        });
        return;
      }

      await exportToExcel({ filename, sheetName, title, subtitle, columns, rows });

      toast.success(
        'Export ready',
        `${rows.length} row${rows.length === 1 ? '' : 's'} downloaded.`,
      );
    } catch (error) {
      if (isAbortError(error)) return;
      toast.error(error, 'Export failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={run}
      loading={busy}
      disabled={disabled}
      leadingIcon={
        busy ? undefined : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )
      }
    >
      {busy && progress
        ? `Preparing ${progress.loaded}${progress.total ? `/${progress.total}` : ''}…`
        : busy
          ? 'Preparing…'
          : label}
    </Button>
  );
}
