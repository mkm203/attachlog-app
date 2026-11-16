import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PlacementReport } from '../src/api/types.ts';
import { placementReportHtml } from '../src/lib/placementReport.ts';

const report: PlacementReport = {
  school_name: 'University',
  closed_at: '2026-10-10T12:00:00Z',
  placement: {
    id: 'p-1', school_id: 's-1', company_id: 'c-1', student_id: 'u-1',
    student_name: 'A Student', student_avatar: null, company_name: 'Example Co',
    company_city: 'Douala', company_supervisor_id: 'u-2', company_supervisor_name: 'Supervisor',
    company_supervisor_avatar: null, company_supervisor_email: 'supervisor@example.com',
    academic_supervisor_id: 'u-3', academic_supervisor_name: 'Academic',
    academic_supervisor_avatar: null, start_date: '2026-09-01', end_date: '2026-10-10',
    total_weeks: 6, status: 'closed', final_score: 18, final_comment: 'Excellent.',
  },
  entries: [{
    id: 'e-1', placement_id: 'p-1', student_id: 'u-1', week: 1,
    tasks: '<script>alert("x")</script>', hours: 30, reflection: 'Learned a lot.',
    skills: 'testing', status: 'approved', created_at: '2026-09-08T10:00:00Z',
    updated_at: '2026-09-09T10:00:00Z',
    reviews: [{
      id: 'r-1', entry_id: 'e-1', reviewer_id: 'u-2', reviewer_name: 'Supervisor',
      decision: 'approved', comment: 'Good work.', created_at: '2026-09-09T11:00:00Z',
    }],
  }],
};

test('placement report HTML contains dates and all logbook and evaluation content safely escaped', () => {
  const html = placementReportHtml(report);
  assert.match(html, /2026-09-01/);
  assert.match(html, /2026-10-10 12:00:00 UTC/);
  assert.match(html, /supervisor@example\.com/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /Learned a lot\./);
  assert.match(html, /testing/);
  assert.match(html, /Good work\./);
  assert.match(html, /Excellent\./);
  assert.doesNotMatch(html, /<script>/);
});
