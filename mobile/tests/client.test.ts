import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { AttachLogClient, toSession } from '../src/api/client.ts';
import { ApiError, friendlyMessage, isAuthError } from '../src/api/errors.ts';
import { deadUrl, startStub } from './stub.ts';
import type { Stub } from './stub.ts';

let stub: Stub;
let dead: string;

const clientFor = (url: string, extra: Record<string, unknown> = {}) =>
  new AttachLogClient({ server: url, ...extra });

before(async () => {
  stub = await startStub();
  dead = await deadUrl();
});
after(() => stub.close());

describe('accounts', () => {
  test('login returns the profile and builds a session with the first role active', async () => {
    const result = await clientFor(stub.url).login('clarisse@example.com', 'Good-pass-2026');
    const session = toSession(result, 1_000);
    assert.equal(session.token, 'tok-stu-1');
    assert.equal(session.user.memberships[0]!.role, 'student');
    assert.equal(session.activeId, 'm-1');
    assert.equal(session.expiresAt, 1_000 + 28800 * 1000);
    assert.deepEqual(stub.requests.at(-1)!.body, { email: 'clarisse@example.com', password: 'Good-pass-2026' });
  });

  test('a wrong password is invalid_credentials and does not look like an expired session', async () => {
    let signedOut = 0;
    const client = clientFor(stub.url, { token: 'whatever', onUnauthorized: () => signedOut++ });
    await assert.rejects(client.login('clarisse@example.com', 'nope'), (e: unknown) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.status, 401);
      assert.equal(e.code, 'invalid_credentials');
      assert.equal(friendlyMessage(e), 'Wrong email or password.');
      return true;
    });
    assert.equal(signedOut, 0);
  });

  test('sign-up sends the code and keeps invalid_code as a readable message', async () => {
    const ok = await clientFor(stub.url).register({ name: 'Clarisse Ngo', email: 'clarisse@example.com', password: 'Good-pass-2026', code: 'JOINONE1' });
    assert.equal(ok.user.name, 'Clarisse Ngo');
    await assert.rejects(
      clientFor(stub.url).register({ name: 'X Y', email: 'x@y.zz', password: 'Good-pass-2026', code: 'WRONG' }),
      (e: unknown) => {
        assert.ok(e instanceof ApiError);
        assert.equal(e.code, 'invalid_code');
        assert.match(friendlyMessage(e), /not valid, was already used, or has expired/);
        return true;
      },
    );
  });

  test('joining with a code, the school pick-list and staff invitations', async () => {
    const client = clientFor(stub.url, { token: 'tok-stu-1' });
    assert.equal((await client.redeem('JOINTWO2')).id, 'stu-1');
    assert.deepEqual(stub.requests.at(-1)!.body, { code: 'JOINTWO2' });
    const members = await client.members('s-1', 'student');
    assert.equal(members[0]!.name, 'Clarisse Ngo');
    assert.match(stub.requests.at(-1)!.path, /role=student/);
    const grant = await client.inviteAcademicSupervisor('s-1', 'teacher@school.example');
    assert.equal(grant.invite!.code, 'ABCDE12345');
    assert.deepEqual(stub.requests.at(-1)!.body, { email: 'teacher@school.example', role: 'academic_supervisor' });
  });

  test('changing an email sends a reauthentication request and confirms its code', async () => {
    const client = clientFor(stub.url, { token: 'tok-stu-1' });
    assert.equal((await client.requestEmailChange('current-pass', 'new@example.com')).status, 'verification_sent');
    assert.deepEqual(stub.requests.at(-1)!.body, { current_password: 'current-pass', new_email: 'new@example.com' });
    const me = await client.confirmEmailChange('123456');
    assert.equal(me.email, 'new@example.com');
    assert.deepEqual(stub.requests.at(-1)!.body, { code: '123456' });
  });

  test('listing placements can be limited to one school', async () => {
    await clientFor(stub.url, { token: 'tok-stu-1' }).listPlacements({ schoolId: 's-1' });
    assert.match(stub.requests.at(-1)!.path, /school_id=s-1/);
  });
});

describe('REST', () => {
  test('sends the bearer token and the filters', async () => {
    const client = clientFor(stub.url, { token: 'tok-stu-1' });
    const page = await client.listPlacements({ studentId: 'stu-1', status: 'open', page: 1, pageSize: 5 });
    assert.equal(page.items[0]!.student_name, 'Clarisse Ngo');
    const sent = stub.requests.at(-1)!;
    assert.equal(sent.auth, 'Bearer tok-stu-1');
    assert.match(sent.path, /student_id=stu-1/);
    assert.match(sent.path, /status=open/);
    assert.match(sent.path, /page_size=5/);
  });

  test('allPlacements walks every page', async () => {
    const capped = await startStub({ pageCap: 2 });
    try {
      const all = await clientFor(capped.url, { token: 'tok-stu-1' }).allPlacements();
      assert.deepEqual(all.map((p) => p.id), ['p-1', 'p-2', 'p-3']);
    } finally {
      await capped.close();
    }
  });

  test('a 401 with a token signs the user out once', async () => {
    let signedOut = 0;
    const client = clientFor(stub.url, { token: 'expired', onUnauthorized: () => signedOut++ });
    await assert.rejects(client.getPlacement('p-1'), (e: unknown) => isAuthError(e));
    assert.equal(signedOut, 1);
  });

  test('keeps the stable error code of a 404', async () => {
    const client = clientFor(stub.url, { token: 'tok-stu-1' });
    await assert.rejects(client.getPlacement('nope'), (e: unknown) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.status, 404);
      assert.equal(e.code, 'placement_not_found');
      return true;
    });
  });

  test('a 422 keeps its validation details', async () => {
    const client = clientFor(stub.url, { token: 'tok-stu-1' });
    await assert.rejects(
      client.createPlacement({} as never),
      (e: unknown) => e instanceof ApiError && e.code === 'validation_error' && Array.isArray(e.details),
    );
  });

  test('a server that is down is network_error', async () => {
    await assert.rejects(clientFor(dead, { token: 't' }).getPlacement('p-1'), (e: unknown) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.code, 'network_error');
      assert.match(friendlyMessage(e), /Cannot reach the server/);
      return true;
    });
  });

  test('a slow server is timeout', async () => {
    const client = clientFor(stub.url, { token: 'tok-stu-1', timeoutMs: 50 });
    await assert.rejects(
      (client as any).call('/slow'),
      (e: unknown) => e instanceof ApiError && e.code === 'timeout',
    );
  });
});

describe('health', () => {
  test('is true when the API answers and false when it does not', async () => {
    assert.equal(await clientFor(stub.url).health(), true);
    assert.equal(await clientFor(dead).health(), false);
  });
});

describe('entries and reviews', () => {
  const client = () => clientFor(stub.url, { token: 'tok-stu-1' });

  test('pending entries are asked for by status, one page at a time', async () => {
    const page = await client().listEntries({ status: 'pending', pageSize: 2 });
    assert.equal(page.total, 3);
    assert.equal(page.items.length, 2);
    assert.match(stub.requests.at(-1)!.path, /status=pending/);
    assert.match(stub.requests.at(-1)!.path, /page_size=2/);
  });

  test('allEntries walks every page and sends placementId', async () => {
    const capped = await startStub({ pageCap: 2 });
    try {
      const all = await clientFor(capped.url, { token: 'tok-stu-1' }).allEntries({ placementId: 'p-1' });
      assert.deepEqual(all.map((e) => e.week), [1, 2, 3]);
      assert.match(capped.requests[0]!.path, /placementId=p-1/);
    } finally {
      await capped.close();
    }
  });

  test('reviewEntry posts the decision, and a blank comment becomes null', async () => {
    stub.entryStatus = 'pending';
    const review = await client().reviewEntry('e-1', 'approved', '   ');
    assert.equal(review.decision, 'approved');
    assert.deepEqual(stub.requests.at(-1)!.body, { decision: 'approved', comment: null });
    await client().reviewEntry('e-1', 'rejected', '  Add detail  ');
    assert.deepEqual(stub.requests.at(-1)!.body, { decision: 'rejected', comment: 'Add detail' });
  });

  test('a business-rule failure keeps its error code', async () => {
    stub.entryStatus = 'approved';
    await assert.rejects(client().reviewEntry('e-1', 'rejected', 'No'), (e: unknown) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.status, 409);
      assert.equal(e.code, 'entry_not_pending');
      assert.equal(friendlyMessage(e), 'This entry has already been reviewed.');
      return true;
    });
    stub.entryStatus = 'pending';
  });

  test('a 401 on a list signs the user out', async () => {
    let signedOut = 0;
    const bad = clientFor(stub.url, { token: 'expired', onUnauthorized: () => signedOut++ });
    await assert.rejects(bad.listEntries(), (e: unknown) => isAuthError(e));
    assert.equal(signedOut, 1);
  });
});
