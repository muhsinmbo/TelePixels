import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Validators, splitMeta } from '../src/middleware/validate';

function mockRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.body = body; return res; };
  return res;
}

describe('splitMeta', () => {
  it('separates known columns from client extras', () => {
    const { cols, meta } = splitMeta<any>(
      { name: 'A', physicianPhone: '+233', lastProcedures: [1] },
      ['name']
    );
    assert.deepEqual(cols, { name: 'A' });
    assert.deepEqual(meta, { physicianPhone: '+233', lastProcedures: [1] });
  });

  it('drops server-managed keys and merges nested meta', () => {
    const { cols, meta } = splitMeta<any>(
      { name: 'A', createdAt: 'x', id: 'KP-1', meta: { a: 1 } },
      ['name', 'id']
    );
    assert.deepEqual(cols, { name: 'A', id: 'KP-1' });
    assert.deepEqual(meta, { a: 1 });
    assert.ok(!('createdAt' in cols) && !('createdAt' in meta));
  });
});

describe('Validators.patientCreate', () => {
  it('rejects missing name with 400', () => {
    const req: any = { body: { age: 30 } };
    const res = mockRes();
    let nexted = false;
    Validators.patientCreate(req, res, () => { nexted = true; });
    assert.equal(res.statusCode, 400);
    assert.equal(nexted, false);
  });

  it('rejects invalid gender and passes valid bodies through', () => {
    const bad: any = { body: { name: 'X', gender: 'Unknown' } };
    const badRes = mockRes();
    Validators.patientCreate(bad, badRes, () => {});
    assert.equal(badRes.statusCode, 400);

    const good: any = { body: { name: 'X', age: 32, gender: 'Female', mrn: 'M1' } };
    const goodRes = mockRes();
    let nexted = false;
    Validators.patientCreate(good, goodRes, () => { nexted = true; });
    assert.equal(nexted, true);
    assert.equal(good.body.name, 'X');
  });
});

describe('Validators.requestUpdate', () => {
  it('rejects unknown statuses', () => {
    const req: any = { body: { status: 'Reported' } };
    const res = mockRes();
    Validators.requestUpdate(req, res, () => {});
    assert.equal(res.statusCode, 400);
  });

  it('accepts the Partially Reported workflow state', () => {
    const req: any = { body: { status: 'Partially Reported' } };
    const res = mockRes();
    let nexted = false;
    Validators.requestUpdate(req, res, () => { nexted = true; });
    assert.equal(nexted, true);
  });
});
