import type { PlacementReport } from '../api/types';
import { t } from '../i18n';

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dateTime(value: string | null | undefined): string {
  return value ? value.replace('T', ' ').replace(/Z$/, ' UTC') : '—';
}

function textBlock(label: string, value: string | null | undefined): string {
  return `<p><strong>${escapeHtml(label)}</strong></p><div class="preserve">${escapeHtml(value)}</div>`;
}

/** Build a self-contained, escaped HTML document for the native print-to-PDF flow. */
export function placementReportHtml(report: PlacementReport): string {
  const { placement } = report;
  const companySupervisor = placement.company_supervisor_name
    ? `${placement.company_supervisor_name} (${placement.company_supervisor_email})`
    : placement.company_supervisor_email;
  const entries = report.entries.map((entry) => {
    const status = entry.status === 'approved' ? t('Approved')
      : entry.status === 'rejected' ? t('Rejected') : t('Pending');
    const reviews = entry.reviews.length
      ? entry.reviews.map((review) => `
        <div class="review">
          <strong>${escapeHtml(review.reviewer_name ?? review.reviewer_id)}</strong>
          <span>${escapeHtml(review.decision === 'rejected' ? t('Rejected') : t('Approved'))}</span>
          <span>${escapeHtml(dateTime(review.created_at))}</span>
          ${textBlock(t('Comment'), review.comment)}
        </div>`).join('')
      : `<p>${escapeHtml(t('No review yet.'))}</p>`;
    return `
      <section class="entry">
        <h2>${escapeHtml(t('Week {n}', { n: entry.week }))} · ${escapeHtml(status)}</h2>
        <p>${escapeHtml(t('Submitted'))}: ${escapeHtml(dateTime(entry.created_at))}</p>
        <p>${escapeHtml(t('Last updated'))}: ${escapeHtml(dateTime(entry.updated_at))}</p>
        <p>${escapeHtml(t('{n} hours', { n: entry.hours }))}</p>
        ${textBlock(t('Tasks'), entry.tasks)}
        ${entry.reflection ? textBlock(t('Reflection'), entry.reflection) : ''}
        ${entry.skills ? textBlock(t('Skills'), entry.skills) : ''}
        <h3>${escapeHtml(t('Review history'))}</h3>
        ${reviews}
      </section>`;
  }).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(t('Placement report'))}</title>
<style>
  body { font-family: Arial, sans-serif; color: #17231f; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 22pt; margin-bottom: 4px; }
  h2 { font-size: 15pt; border-bottom: 1px solid #cbd5d0; padding-bottom: 5px; }
  h3 { font-size: 12pt; margin-bottom: 4px; }
  p { margin: 5px 0; }
  .muted { color: #52635b; }
  .section { margin-top: 20px; }
  .preserve { white-space: pre-wrap; overflow-wrap: anywhere; }
  .entry { page-break-inside: avoid; border-top: 1px solid #dce4df; padding-top: 8px; margin-top: 16px; }
  .review { margin: 8px 0 12px 12px; padding-left: 10px; border-left: 2px solid #91b9a2; }
  @media print { .entry { page-break-inside: auto; } }
</style></head><body>
  <h1>${escapeHtml(t('Placement report'))}</h1>
  <p class="muted">${escapeHtml(report.school_name)}</p>
  <section class="section">
    <h2>${escapeHtml(t('Placement'))}</h2>
    <p><strong>${escapeHtml(t('Student'))}:</strong> ${escapeHtml(placement.student_name)}</p>
    <p><strong>${escapeHtml(t('Company'))}:</strong> ${escapeHtml(placement.company_name)} · ${escapeHtml(placement.company_city)}</p>
    <p><strong>${escapeHtml(t('Dates'))}:</strong> ${escapeHtml(placement.start_date)} – ${escapeHtml(placement.end_date)} (${escapeHtml(t('{n} weeks', { n: placement.total_weeks }))})</p>
    <p><strong>${escapeHtml(t('Academic supervisor'))}:</strong> ${escapeHtml(placement.academic_supervisor_name)}</p>
    <p><strong>${escapeHtml(t('Company supervisor'))}:</strong> ${escapeHtml(companySupervisor)}</p>
    <p><strong>${escapeHtml(t('Closed'))}:</strong> ${escapeHtml(dateTime(report.closed_at))}</p>
  </section>
  <section class="section">
    <h2>${escapeHtml(t('Final evaluation'))}</h2>
    <p><strong>${escapeHtml(t('Final score (out of 20)'))}:</strong> ${escapeHtml(placement.final_score)}</p>
    ${textBlock(t('Evaluation comment'), placement.final_comment)}
  </section>
  <section class="section">
    <h2>${escapeHtml(t('Logbook entries ({n})', { n: report.entries.length }))}</h2>
    ${entries || `<p>${escapeHtml(t('No logbook entries.'))}</p>`}
  </section>
</body></html>`;
}
