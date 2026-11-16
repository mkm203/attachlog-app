/**
 * A small stand-in for the AttachLog API. It speaks the same wire format as the real one
 * (snake_case bodies and the {"error": {...}} envelope) so the client can be tested over real HTTP.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const PLACEMENT = {
  id: 'p-1', school_id: 's-1', company_id: 'c-1', student_id: 'stu-1', student_name: 'Clarisse Ngo',
  company_name: 'Douala Tech SARL', company_city: 'Douala', company_supervisor_id: 'cs-1',
  company_supervisor_name: 'Paul Mbarga', company_supervisor_email: 'paul@example.com',
  academic_supervisor_id: 'as-1', academic_supervisor_name: 'Elise Ngono',
  start_date: '2026-09-07', end_date: '2026-11-29', total_weeks: 12, status: 'open',
  final_score: null, final_comment: null,
};
const ME = {
  id: 'stu-1', name: 'Clarisse Ngo', email: 'clarisse@example.com', is_admin: false, email_verified: false,
  memberships: [{ id: 'm-1', role: 'student', school_id: 's-1', school_name: 'Univ One', company_id: null, company_name: null }],
};
const ENTRY = { id: 'e-1', placement_id: 'p-1', student_id: 'stu-1', week: 1, tasks: 'Fixed bugs', hours: 38,
  status: 'pending', created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z' };
const PLACEMENT_REPORT = {
  placement: { ...PLACEMENT, status: 'closed', final_score: 16, final_comment: 'Reliable.' },
  school_name: 'Univ One',
  closed_at: '2026-11-29T10:00:00Z',
  entries: [{ ...ENTRY, status: 'approved', reviews: [] }],
};

export interface StubOptions {
  /** Largest page size the stub honours, to force the client to walk several pages. */
  pageCap?: number;
}

export interface Stub {
  url: string;
  requests: { method: string; path: string; auth: string | undefined; body: any }[];
  entryStatus: string;
  close(): Promise<void>;
}

const error = (code: string, message: string, details: unknown = null) => ({ error: { code, message, details } });

export async function startStub(options: StubOptions = {}): Promise<Stub> {
  const stub: Stub = { url: '', requests: [], entryStatus: 'pending', close: async () => {} };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const raw = Buffer.concat(chunks).toString();
      const body = raw ? JSON.parse(raw) : null;
      const auth = req.headers.authorization;
      stub.requests.push({ method: req.method ?? 'GET', path: url.pathname + url.search, auth, body });

      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      const pageOf = (items: unknown[]) => {
        const size = Math.min(Number(url.searchParams.get('page_size') ?? 10), options.pageCap ?? 100);
        const page = Number(url.searchParams.get('page') ?? 1);
        return { items: items.slice((page - 1) * size, page * size), page, page_size: size, total: items.length };
      };

      if (url.pathname === '/health') return send(200, { status: 'ok' });
      if (url.pathname === '/slow') return void setTimeout(() => send(200, {}), 500);
      if (url.pathname === '/v1/auth/login') {
        if (body?.email === 'clarisse@example.com' && body?.password === 'Good-pass-2026') {
          return send(200, { access_token: 'tok-stu-1', token_type: 'bearer', expires_in: 28800, user: ME });
        }
        return send(401, error('invalid_credentials', 'Invalid email or password'));
      }
      if (url.pathname === '/v1/auth/register') {
        if (body?.code !== 'JOINONE1') return send(422, error('invalid_code', 'This code is not valid'));
        return send(201, { access_token: 'tok-stu-1', token_type: 'bearer', expires_in: 28800, user: ME });
      }

      if (auth !== 'Bearer tok-stu-1') {
        return send(401, error(auth ? 'invalid_token' : 'not_authenticated', 'Missing bearer token'));
      }

      if (url.pathname === '/v1/placements' && req.method === 'GET') {
        return send(200, pageOf([PLACEMENT, { ...PLACEMENT, id: 'p-2' }, { ...PLACEMENT, id: 'p-3' }]));
      }
      if (url.pathname === '/v1/placements' && req.method === 'POST') {
        return send(422, error('validation_error', 'Request validation failed',
          [{ loc: ['body', 'student_id'], msg: 'Field required', type: 'missing' }]));
      }
      if (url.pathname === '/v1/me/redeem') return send(200, ME);
      if (url.pathname === '/v1/me/email-change' && req.method === 'POST') {
        return send(202, { status: 'verification_sent' });
      }
      if (url.pathname === '/v1/me/email-change/confirm' && req.method === 'POST') {
        return send(200, { ...ME, email: 'new@example.com', email_verified: true });
      }
      if (url.pathname === '/v1/schools/s-1/members') {
        return send(200, [{ user_id: 'stu-1', name: 'Clarisse Ngo', email: 'clarisse@example.com', role: 'student' }]);
      }
      if (url.pathname === '/v1/schools/s-1/staff' && req.method === 'POST') {
        return send(201, { status: 'invited', email: body.email, email_sent: false,
          invite: { code: 'ABCDE12345', email: body.email, role: 'academic_supervisor', expires_at: '2026-12-01T00:00:00Z', accepted_at: null } });
      }
      if (url.pathname === '/v1/placements/p-1') return send(200, PLACEMENT);
      if (url.pathname === '/v1/placements/p-1/report') return send(200, PLACEMENT_REPORT);
      if (url.pathname === '/v1/entries' && req.method === 'GET') {
        return send(200, pageOf([ENTRY, { ...ENTRY, id: 'e-2', week: 2 }, { ...ENTRY, id: 'e-3', week: 3 }]));
      }
      if (url.pathname === '/v1/entries/e-1/reviews' && req.method === 'POST') {
        if (stub.entryStatus !== 'pending') {
          return send(409, error('entry_not_pending', 'Only a pending entry can be reviewed'));
        }
        return send(201, { id: 'r-1', entry_id: 'e-1', reviewer_id: 'cs-1', decision: body.decision,
          comment: body.comment, created_at: '2026-09-15T09:30:00Z' });
      }
      if (url.pathname.startsWith('/v1/placements/')) return send(404, error('placement_not_found', 'Placement x not found'));
      return send(404, error('not_found', 'Not Found'));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  stub.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  stub.close = () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
  return stub;
}

/** A URL on which nothing is listening, for the "server is down" cases. */
export async function deadUrl(): Promise<string> {
  const s = await startStub();
  const url = s.url;
  await s.close();
  return url;
}
