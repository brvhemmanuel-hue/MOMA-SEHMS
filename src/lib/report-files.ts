import 'server-only';
import { runReport, type ReportFilters } from './reports';
import { toCsv, toPdf, toXlsx, MIME } from './exporters';
import type { Session } from './auth';

export type Format = 'pdf' | 'xlsx' | 'csv';

export async function buildReportFile(key: string, filters: ReportFilters, format: Format, s: Session) {
  const { meta, result } = await runReport(key, filters, s);
  const body = format === 'csv' ? toCsv(meta, result) : format === 'xlsx' ? await toXlsx(meta, result) : await toPdf(meta, result);
  const stamp = new Date().toISOString().slice(0, 10);
  return { body, contentType: MIME[format], fileName: `MOMA-${key}-${stamp}.${format}`, rows: result.rows.length };
}
