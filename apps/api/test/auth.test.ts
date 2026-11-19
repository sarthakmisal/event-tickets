import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { client, GATE, ORGANISER, OWNER, PASSWORD, setup } from './helpers';
import type { TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(() => ctx.close());

describe('auth', () => {
  it('signs in by phone or email and returns the role', async () => {
    const byPhone = await client(ctx.app).post('/api/auth/login', {
      login: '+91 74986 05559',
      password: PASSWORD,
    });
    expect(byPhone.status).toBe(200);
    expect(byPhone.body.user.role).toBe('OWNER');
    const byEmail = await client(ctx.app).post('/api/auth/login', {
      login: 'Organiser@Example.com',
      password: PASSWORD,
    });
    expect(byEmail.body.user.role).toBe('ORGANISER');
    expect(byEmail.body.user.organiserName).toBe('Demo Organiser');
  });

  it('rejects wrong credentials without saying which part was wrong', async () => {
    const wrongPassword = await client(ctx.app).post('/api/auth/login', {
      login: OWNER,
      password: 'nope-nope',
    });
    const unknownUser = await client(ctx.app).post('/api/auth/login', {
      login: '9111111111',
      password: 'nope-nope',
    });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(unknownUser.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('requires a session and the CSRF header', async () => {
    expect((await request(ctx.app).get('/api/dashboard')).status).toBe(401);
    const noHeader = await request(ctx.app)
      .post('/api/auth/login')
      .send({ login: OWNER, password: PASSWORD });
    expect(noHeader.status).toBe(403);
  });

  it('enforces roles', async () => {
    const gate = await client(ctx.app).login(GATE);
    expect((await gate.get('/api/organisers')).status).toBe(403);
    expect((await gate.get('/api/dashboard')).status).toBe(403);
    const organiser = await client(ctx.app).login(ORGANISER);
    expect((await organiser.get('/api/organisers')).status).toBe(403);
    const owner = await client(ctx.app).login(OWNER);
    expect((await owner.get('/api/organisers')).status).toBe(200);
  });

  it('owner appoints an organiser who can sign in; duplicates are rejected', async () => {
    const owner = await client(ctx.app).login(OWNER);
    const body = {
      name: 'New Org',
      phone: '9111111111',
      email: 'new@example.com',
      password: PASSWORD,
      commissionBps: 1500,
    };
    const created = await owner.post('/api/organisers', body);
    expect(created.status).toBe(201);
    expect(created.body.organiser.commissionBps).toBe(1500);
    expect((await owner.post('/api/organisers', body)).status).toBe(409);
    await client(ctx.app).login('9111111111');
  });

  it('disabling an organiser locks out their users immediately', async () => {
    const owner = await client(ctx.app).login(OWNER);
    const org = await client(ctx.app).login(ORGANISER);
    const list = await owner.get('/api/organisers');
    const demo = list.body.organisers.find((o: { phone: string }) => o.phone === ORGANISER);
    await owner.patch(`/api/organisers/${demo.id}`, { active: false });
    expect((await org.get('/api/events')).status).toBe(401);
    expect(
      (await client(ctx.app).post('/api/auth/login', { login: ORGANISER, password: PASSWORD }))
        .status,
    ).toBe(403);
    await owner.patch(`/api/organisers/${demo.id}`, { active: true });
  });

  it('changing the password ends old sessions', async () => {
    const gate = await client(ctx.app).login(GATE);
    const other = await client(ctx.app).login(GATE);
    const changed = await gate.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'Another-Pass-1',
    });
    expect(changed.status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(401);
    expect(
      (await client(ctx.app).post('/api/auth/login', { login: GATE, password: 'Another-Pass-1' }))
        .status,
    ).toBe(200);
  });
});
