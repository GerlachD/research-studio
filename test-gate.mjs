import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openAudit, audit, auditRows, sessionToken, sessionUser, checkPassword, tooManyAttempts, recordFailure } from './gate.mjs';
import { createServer } from './server.mjs';

const withPassword = async fn => { process.env.APP_PASSWORD = 'tajne-heslo'; try { await fn(); } finally { delete process.env.APP_PASSWORD; } };
const request = cookie => ({headers:{cookie}});

test('session nese jméno, podvržený nebo prošlý token neprojde', () => withPassword(() => {
  const token = sessionToken('Eva');
  assert.equal(sessionUser(request(`session=${token}`)), 'Eva');
  assert.equal(sessionUser(request(`session=${token.replace(/^./, 'x')}`)), null);
  assert.equal(sessionUser(request(`session=${sessionToken('Eva', Date.now() - 13 * 3600e3)}`)), null);
  assert.equal(checkPassword('tajne-heslo'), true);
  assert.equal(checkPassword('spatne'), false);
}));

test('bez hesla je brána vypnutá', () => { assert.equal(sessionUser(request('')), 'lokální'); assert.equal(checkPassword(''), false); });

test('po 10 neúspěšných pokusech se IP dočasně zablokuje', () => {
  for (let i = 0; i < 10; i++) recordFailure('10.0.0.9', 1000);
  assert.equal(tooManyAttempts('10.0.0.9', 2000), true);
  assert.equal(tooManyAttempts('10.0.0.9', 1000 + 15 * 60e3), false);
});

test('audit ukládá kdo, odkud a co udělal', () => {
  openAudit(':memory:');
  { audit({ip:'1.2.3.4', user:'Eva'}, 'job_start', {topic:'Téma'});
    const [row] = auditRows(1); assert.equal(row.user, 'Eva'); assert.equal(row.ip, '1.2.3.4'); assert.equal(JSON.parse(row.detail).topic, 'Téma'); }
});

test('brána přesměruje na přihlášení, chybné heslo odmítne a správné zaloguje', () => withPassword(async () => {
  openAudit(':memory:');
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`, form = body => ({method:'POST', redirect:'manual', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body});
    assert.equal((await fetch(base, {redirect:'manual'})).headers.get('location'), '/login');
    assert.equal((await fetch(`${base}/api/jobs`)).status, 401);
    assert.equal((await fetch(`${base}/logo.png`)).status, 200);
    assert.equal((await fetch(`${base}/login`, form('name=Eva&password=x'))).status, 401);
    const ok = await fetch(`${base}/login`, form('name=Eva&password=tajne-heslo'));
    assert.equal(ok.status, 303); assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
    const cookie = ok.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${base}/api/jobs`, {headers:{cookie}})).status, 200);
    assert.deepEqual(auditRows(2).map(row => row.action), ['login_ok', 'login_fail']);
  } finally { await new Promise(resolve => server.close(resolve)); }
}));
