'use client';

import type { Workbook, Worksheet } from 'exceljs';

import { PLATFORM_TIMEZONE } from '@/lib/format';

/**
 * Excel export.
 *
 * Two decisions worth stating:
 *
 *  1. **The workbook is built in the browser from data already fetched from
 *     the API.** There is no separate export endpoint returning a different
 *     query, so an export can never disagree with the table above it, and a
 *     filter the user applied is necessarily reflected in the file.
 *
 *  2. **ExcelJS is loaded on demand.** It is a large dependency and most
 *     sessions never export anything; a static import would put it in the
 *     first-load bundle of every page that has an export button.
 */

export interface ExportColumn<T> {
  header: string;
  key: string;
  width?: number;
  value: (row: T) => string | number | Date | null;
  /** Excel number format, e.g. '#,##0.00' or 'dd/mm/yyyy hh:mm'. */
  format?: string;
}

export interface ExportOptions<T> {
  filename: string;
  sheetName?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Rendered above the table, for the filters the data was pulled with. */
  subtitle?: string;
  title?: string;
}

const HEADER_FILL = 'FFC94A0A';

export async function exportToExcel<T>(options: ExportOptions<T>): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook: Workbook = new ExcelJS.Workbook();

  workbook.creator = 'EduPlatform Dashboard';
  workbook.created = new Date();

  const sheet: Worksheet = workbook.addWorksheet(
    sanitizeSheetName(options.sheetName ?? 'Export'),
    { views: [{ state: 'frozen', ySplit: headerRowIndex(options) }] },
  );

  let cursor = 1;

  if (options.title) {
    const cell = sheet.getCell(cursor, 1);
    cell.value = options.title;
    cell.font = { bold: true, size: 14 };
    sheet.mergeCells(cursor, 1, cursor, Math.max(1, options.columns.length));
    cursor += 1;
  }

  if (options.subtitle) {
    const cell = sheet.getCell(cursor, 1);
    cell.value = options.subtitle;
    cell.font = { size: 10, color: { argb: 'FF6E6E7A' } };
    sheet.mergeCells(cursor, 1, cursor, Math.max(1, options.columns.length));
    cursor += 1;
  }

  // Generated-at line, in the platform's timezone. Without it a spreadsheet
  // emailed around has no way to say how old it is.
  const stampCell = sheet.getCell(cursor, 1);
  stampCell.value = `Generated ${new Intl.DateTimeFormat('en-GB', {
    timeZone: PLATFORM_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date())} (${PLATFORM_TIMEZONE}) · ${options.rows.length} row${
    options.rows.length === 1 ? '' : 's'
  }`;
  stampCell.font = { size: 10, color: { argb: 'FF9A9AA5' } };
  sheet.mergeCells(cursor, 1, cursor, Math.max(1, options.columns.length));
  cursor += 2;

  const headerRow = sheet.getRow(cursor);
  options.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getColumn(index + 1).width = column.width ?? 20;
  });
  headerRow.height = 22;
  headerRow.commit();

  cursor += 1;

  for (const row of options.rows) {
    const sheetRow = sheet.getRow(cursor);

    options.columns.forEach((column, index) => {
      const cell = sheetRow.getCell(index + 1);
      const value = column.value(row);

      // null becomes an empty cell rather than the string "null" — the
      // difference between a spreadsheet you can sum and one you cannot.
      cell.value = value === null ? null : value;
      if (column.format) cell.numFmt = column.format;
    });

    sheetRow.commit();
    cursor += 1;
  }

  const lastColumn = Math.max(1, options.columns.length);
  sheet.autoFilter = {
    from: { row: headerRowIndex(options), column: 1 },
    to: { row: cursor - 1, column: lastColumn },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  download(buffer, `${options.filename}.xlsx`);
}

function headerRowIndex<T>(options: ExportOptions<T>): number {
  // title? + subtitle? + stamp + blank
  return 1 + (options.title ? 1 : 0) + (options.subtitle ? 1 : 0) + 1;
}

function download(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoked on the next tick: revoking synchronously can cancel the download
  // in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Excel forbids these characters in a sheet name, and caps it at 31 chars. */
function sanitizeSheetName(name: string): string {
  return name.replace(/[*?:/\\[\]]/g, '-').slice(0, 31) || 'Export';
}

/** A filename-safe slug with a date suffix, so repeated exports do not collide. */
export function exportFilename(base: string): string {
  const stamp = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return `${slug || 'export'}-${stamp}`;
}

/** ISO string → a real Date so Excel sorts and filters it as a date. */
export function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const EXCEL_DATE_FORMAT = 'dd/mm/yyyy hh:mm';
export const EXCEL_DAY_FORMAT = 'dd/mm/yyyy';
export const EXCEL_MONEY_FORMAT = '#,##0.00';
