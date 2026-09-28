import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicRoute, PUBLIC_ROUTES } from '../src/middleware/publicRoutes';
import { getPage, pageClause, DEFAULT_LIMIT, MAX_LIMIT } from '../src/middleware/paginate';
import { withMeta } from '../src/routes/patients';

describe('auth gate (public routes)', () => {
  it('allows exactly the public set', () => {
    assert.equal(isPublicRoute('POST', '/auth/login'), true);
    assert.equal(isPublicRoute('POST', '/auth/refresh'), true);
    assert.equal(isPublicRoute('POST', '/portal/verify'), true);
    assert.equal(isPublicRoute('GET', '/settings/global'), true);
    assert.equal(isPublicRoute('GET', '/docs'), true);
  });

  it('locks everything else behind JWT', () => {
    assert.equal(isPublicRoute('GET', '/patients'), false);
    assert.equal(isPublicRoute('POST', '/patients'), false);
    assert.equal(isPublicRoute('GET', '/auth/me'), false);
    assert.equal(isPublicRoute('POST', '/auth/revoke'), false);
    assert.equal(isPublicRoute('POST', '/ai/polish'), false);
    assert.equal(isPublicRoute('DELETE', '/api/patients/1'), false);
    assert.ok(PUBLIC_ROUTES.size === 5);
  });
});

describe('pagination', () => {
  it('defaults generously so existing clients keep working', () => {
    assert.deepEqual(getPage({}), { limit: DEFAULT_LIMIT, offset: 0 });
    assert.equal(DEFAULT_LIMIT, 200);
  });

  it('caps abuse and sanitizes input', () => {
    assert.deepEqual(getPage({ limit: '99999', offset: '-5' }), { limit: MAX_LIMIT, offset: 0 });
    assert.deepEqual(getPage({ limit: 'abc' }), { limit: DEFAULT_LIMIT, offset: 0 });
    assert.deepEqual(getPage({ limit: '10', offset: '20' }), { limit: 10, offset: 20 });
  });

  it('appends correct placeholders', () => {
    const vals: any[] = ['a'];
    const clause = pageClause(vals, 10, 20);
    assert.equal(clause, 'LIMIT $2 OFFSET $3');
    assert.deepEqual(vals, ['a', 10, 20]);
  });
});

describe('withMeta', () => {
  it('merges extras under columns (columns win)', () => {
    const out = withMeta({ id: 'KP-1', name: 'A', meta: { physicianPhone: '1', name: 'HACK' } });
    assert.equal(out.physicianPhone, '1');
    assert.equal(out.name, 'A');
    assert.ok(!('meta' in out));
  });

  it('passes through rows without meta', () => {
    assert.deepEqual(withMeta({ id: '1' }), { id: '1' });
  });
});
