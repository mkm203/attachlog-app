import assert from 'node:assert/strict';
import { parseSession, toAccount } from '../src/state/account.ts';
import { describe, test } from 'node:test';

import { LOCAL_DEFAULT, normalizeServer } from '../src/api/config.ts';
import type { Entry } from '../src/api/types.ts';
import {
  countByStatus, formatDate, formatPercent, formatRange, initials, nextFreeWeek,
} from '../src/lib/format.ts';
import {
  hasErrors, isIsoDate, validateEntry, validateEvaluation, validateLogin, validatePlacement,
  validateNewPassword, validateRegister, validateReview, validateSupervisors, weeksBetween,
} from '../src/lib/validation.ts';

describe('server address', () => {
  test('a public host name is https, with no port or path', () => {
    assert.equal(normalizeServer('https://attachlog-api.onrender.com/'), 'https://attachlog-api.onrender.com');
    assert.equal(normalizeServer('attachlog-api.onrender.com'), 'https://attachlog-api.onrender.com');
    assert.equal(normalizeServer('  ATTACHLOG-API.onrender.com/docs '), 'https://attachlog-api.onrender.com');
  });

  test('a computer on the Wi-Fi is http on port 8000 unless a port is typed', () => {
    assert.equal(normalizeServer('192.168.1.20'), 'http://192.168.1.20:8000');
    assert.equal(normalizeServer('192.168.1.20:9000'), 'http://192.168.1.20:9000');
    assert.equal(normalizeServer('my-pc.local'), 'http://my-pc.local:8000');
    assert.equal(normalizeServer('localhost'), 'http://localhost:8000');
  });

  test('an explicit scheme is respected, and junk gives an empty string', () => {
    assert.equal(normalizeServer('http://192.168.1.20'), 'http://192.168.1.20');
    assert.equal(normalizeServer('not a host!'), '');
    assert.equal(normalizeServer('   '), '');
  });

  test('the emulator default points at the host computer', () => {
    assert.equal(LOCAL_DEFAULT, 'http://10.0.2.2:8000');
  });
});

describe('entry rules (mirror the logbook service)', () => {
  test('accepts a good entry', () => {
    assert.deepEqual(validateEntry({ week: '3', tasks: 'Tests', hours: '40' }, 12), {});
  });

  test('week must be inside the placement', () => {
    assert.match(validateEntry({ week: '13', tasks: 'x', hours: '40' }, 12).week!, /only 12 weeks/);
    assert.ok(validateEntry({ week: '0', tasks: 'x', hours: '40' }, 12).week);
    assert.ok(validateEntry({ week: 'a', tasks: 'x', hours: '40' }, 12).week);
  });

  test('hours 1..60 and tasks required', () => {
    assert.ok(validateEntry({ week: '1', tasks: '  ', hours: '40' }, 12).tasks);
    assert.ok(validateEntry({ week: '1', tasks: 'x', hours: '0' }, 12).hours);
    assert.ok(validateEntry({ week: '1', tasks: 'x', hours: '61' }, 12).hours);
    assert.ok(validateEntry({ week: '1', tasks: 'x'.repeat(2001), hours: '5' }, 12).tasks);
  });

  test('week is not checked when revising', () => {
    assert.deepEqual(validateEntry({ week: '', tasks: 'x', hours: '5' }, 12, false), {});
  });
});

describe('review, placement and evaluation rules', () => {
  test('a rejection needs a comment, an approval does not', () => {
    assert.ok(validateReview('rejected', '  ').comment);
    assert.deepEqual(validateReview('approved', ''), {});
    assert.deepEqual(validateReview('rejected', 'Detail the tasks'), {});
  });

  test('evaluation score is a whole number from 0 to 20', () => {
    assert.deepEqual(validateEvaluation('20', 'Good'), {});
    assert.deepEqual(validateEvaluation('0', 'Weak'), {});
    assert.ok(validateEvaluation('21', 'x').score);
    assert.ok(validateEvaluation('-1', 'x').score);
    assert.ok(validateEvaluation('15.5', 'x').score);
    assert.ok(validateEvaluation('15', ' ').comment);
  });

  const good = {
    student_id: 'stu-1', academic_supervisor_id: 'as-1', company_name: 'Douala Tech SARL', company_city: 'Douala',
    company_supervisor_email: 'paul@example.com', start_date: '2026-09-07', end_date: '2026-11-29',
  };

  test('placement form', () => {
    assert.deepEqual(validatePlacement(good), {});
    assert.ok(validatePlacement({ ...good, student_id: '' }).student_id);
    assert.ok(validatePlacement({ ...good, company_supervisor_email: 'not-an-email' }).company_supervisor_email);
    assert.ok(validatePlacement({ ...good, start_date: '07/09/2026' }).start_date);
    assert.ok(validatePlacement({ ...good, end_date: '2026-09-07' }).end_date);
    assert.ok(validatePlacement({ ...good, end_date: '2026-02-30' }).end_date);
  });

  test('week count matches the placement service formula', () => {
    assert.equal(weeksBetween('2026-09-07', '2026-11-29'), 12);
    assert.equal(weeksBetween('2026-09-07', '2026-09-07'), 1);
    assert.equal(weeksBetween('2026-09-07', '2026-09-14'), 2);
  });

  test('dates, supervisors and login', () => {
    assert.ok(isIsoDate('2026-02-28'));
    assert.ok(!isIsoDate('2026-13-01'));
    assert.ok(hasErrors(validateSupervisors('', 'cs@example.com')));
    assert.ok(hasErrors(validateSupervisors('as-1', 'nope')));
    assert.ok(!hasErrors(validateSupervisors('as-1', 'cs@example.com')));
    assert.ok(hasErrors(validateLogin('', 'x')));
    assert.ok(hasErrors(validateLogin('stu-1', 'x')));
    assert.ok(!hasErrors(validateLogin('stu@example.com', 'x')));
  });

  test('sign-up and new password rules', () => {
    const ok = { name: 'Clarisse Ngo', email: 'c@example.com', password: 'longenough', code: 'JOIN-ONE1' };
    assert.deepEqual(validateRegister(ok), {});
    assert.ok(validateRegister({ ...ok, name: 'C' }).name);
    assert.ok(validateRegister({ ...ok, email: 'c@' }).email);
    assert.ok(validateRegister({ ...ok, password: 'short' }).password);
    assert.ok(validateRegister({ ...ok, code: ' - ' }).code);
    assert.deepEqual(validateNewPassword('longenough', 'longenough'), {});
    assert.ok(validateNewPassword('longenough', 'different1').repeat);
    assert.ok(validateNewPassword('short', 'short').password);
  });

  test('stored sessions: valid ones come back, broken or expired ones do not', () => {
    const me = { id: 'u', name: 'N', email: 'n@x.co', is_admin: false, email_verified: true, memberships: [
      { id: 'm1', role: 'coordinator', school_id: 's1', school_name: 'Univ One', company_id: null, company_name: null },
      { id: 'm2', role: 'company_supervisor', school_id: null, school_name: null, company_id: 'c1', company_name: 'Acme' }] };
    const saved = JSON.stringify({ token: 't', user: me, activeId: 'm2', expiresAt: Date.now() + 60_000 });
    const session = parseSession(saved)!;
    assert.ok(session);
    const acct = toAccount(session);
    assert.equal(acct.role, 'company_supervisor');
    assert.equal(acct.contextLabel, 'Company supervisor · Acme');
    assert.equal(acct.schoolId, null);
    assert.equal(toAccount({ ...session, activeId: 'gone' }).role, 'coordinator');   // falls back to the first role
    assert.equal(toAccount({ ...session, user: { ...me, memberships: [] }, activeId: null }).role, null);
    assert.equal(parseSession(JSON.stringify({ token: 't', user: me, activeId: null, expiresAt: 1 })), null);
    assert.equal(parseSession('{"token":"t","sub":"old-format"}'), null);          // sessions from the old demo app
    assert.equal(parseSession('not json'), null);
    assert.equal(parseSession(null), null);
  });
});

describe('formatting', () => {
  const entry = (week: number, status: Entry['status']): Entry => ({
    id: `e${week}`, placement_id: 'p', student_id: 's', week, tasks: 't', hours: 1, status,
  });

  test('dates and percentages', () => {
    assert.equal(formatDate('2026-09-07'), '7 Sep 2026');
    assert.equal(formatRange('2026-09-07', '2026-11-29'), '7 Sep 2026 – 29 Nov 2026');
    assert.equal(formatPercent(8.3), '8.3%');
    assert.equal(formatPercent(100), '100%');
    assert.equal(initials('Clarisse Ngo'), 'CN');
  });

  test('counts and the next free week', () => {
    const entries = [entry(1, 'approved'), entry(2, 'rejected'), entry(4, 'pending')];
    assert.deepEqual(countByStatus(entries), { pending: 1, approved: 1, rejected: 1 });
    assert.equal(nextFreeWeek(entries, 12), 3);
    assert.equal(nextFreeWeek([entry(1, 'approved'), entry(2, 'approved')], 2), null);
  });
});
