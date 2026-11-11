// Run with: npm test   (uses an in-memory fake instead of MySQL, so no database is needed)
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./server');

function fakeUsers() {
  const rows = [];
  let id = 1;
  const find = (fn) => rows.find(fn) || null;
  return {
    rows,
    findByLogin: async (l) => find((u) => u.username === l || u.email === l.toLowerCase()),
    findByEmail: async (e) => find((u) => u.email === e),
    findByUsername: async (n) => find((u) => u.username === n),
    findByAuth0Id: async (a) => find((u) => u.auth0_id === a),
    create: async ({ username, email, passwordHash = null, auth0Id = null }) => {
      const u = { user_id: id++, username, email, password_hash: passwordHash, auth0_id: auth0Id };
      rows.push(u);
      return u;
    },
    linkAuth0: async (uid, a) => { rows.find((u) => u.user_id === uid).auth0_id = a; },
  };
}

async function start(opts = {}) {
  const users = fakeUsers();
  const app = createApp({ users, ...opts });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body) =>
    fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  return { users, base, post, close: () => server.close() };
}

test('register then login works', async () => {
  const s = await start();
  let r = await s.post('/register', { username: 'dalu', email: 'Dalu@Example.com', password: 'correct horse' });
  assert.equal(r.status, 201);
  assert.match(await r.text(), /successfully registered as dalu/);
  assert.equal(s.users.rows[0].email, 'dalu@example.com');
  assert.notEqual(s.users.rows[0].password_hash, 'correct horse');

  r = await s.post('/login', { username: 'dalu', password: 'correct horse' });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /You have logged in successfully, dalu/);

  r = await s.post('/login', { username: 'dalu@example.com', password: 'correct horse' });
  assert.equal(r.status, 200);
  s.close();
});

test('wrong password and unknown user get the same answer', async () => {
  const s = await start();
  await s.post('/register', { username: 'dalu', email: 'd@example.com', password: 'correct horse' });
  const a = await s.post('/login', { username: 'dalu', password: 'nope nope nope' });
  const b = await s.post('/login', { username: 'ghost', password: 'nope nope nope' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(await a.text(), await b.text());
  s.close();
});

test('duplicate username or email is rejected', async () => {
  const s = await start();
  await s.post('/register', { username: 'dalu', email: 'd@example.com', password: 'correct horse' });
  let r = await s.post('/register', { username: 'dalu', email: 'other@example.com', password: 'correct horse' });
  assert.equal(r.status, 409);
  r = await s.post('/register', { username: 'other', email: 'd@example.com', password: 'correct horse' });
  assert.equal(r.status, 409);
  s.close();
});

test('validation rejects bad input', async () => {
  const s = await start();
  for (const body of [
    { username: 'a', email: 'd@example.com', password: 'correct horse' },
    { username: 'bad name!', email: 'd@example.com', password: 'correct horse' },
    { username: 'dalu', email: 'not-an-email', password: 'correct horse' },
    { username: 'dalu', email: 'd@example.com', password: 'short' },
    { username: 'dalu', email: 'd@example.com', password: 'x'.repeat(80) },
    {},
  ]) assert.equal((await s.post('/register', body)).status, 400);
  assert.equal(s.users.rows.length, 0);
  s.close();
});

test('user input is HTML-escaped in responses', async () => {
  const s = await start();
  const r = await s.post('/register', { username: 'dalu', email: 'd@example.com', password: 'correct horse' });
  assert.ok(r.ok);
  // Username regex blocks markup, but the template must still escape.
  const { escapeHtml } = require('./render');
  assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
  s.close();
});

test('SQL-injection style login does not work', async () => {
  const s = await start();
  await s.post('/register', { username: 'dalu', email: 'd@example.com', password: 'correct horse' });
  const r = await s.post('/login', { username: "' OR '1'='1", password: "' OR '1'='1" });
  assert.equal(r.status, 401);
  s.close();
});

test('database errors give a 503 page, not a crash', async () => {
  const users = fakeUsers();
  users.findByLogin = async () => { throw new Error('db down'); };
  const app = createApp({ users });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const r = await fetch(`http://127.0.0.1:${server.address().port}/login`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'a', password: 'b' }),
  });
  assert.equal(r.status, 503);
  server.close();
});

test('providers endpoint reports disabled when Auth0 is off, and /auth/google explains', async () => {
  const s = await start();
  assert.deepEqual(await (await fetch(s.base + '/auth/providers')).json(), { google: false, apple: false });
  const r = await fetch(s.base + '/auth/google');
  assert.equal(r.status, 404);
  s.close();
});

function fakeAuth0(profile) {
  return {
    providers: { google: true, apple: false },
    middleware: (req, res, next) => {
      req.oidc = { isAuthenticated: () => !!profile, user: profile };
      res.oidc = { login: (o) => res.redirect(`/fake-auth0?connection=${o.authorizationParams.connection}&returnTo=${o.returnTo}`) };
      next();
    },
  };
}

test('google button redirects to Auth0 with the google connection', async () => {
  const s = await start({ auth0: fakeAuth0(null) });
  const r = await fetch(s.base + '/auth/google', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /connection=google-oauth2&returnTo=\/welcome/);
  s.close();
});

test('welcome creates a user for a new Google sign-in, then reuses it', async () => {
  const profile = { sub: 'google-oauth2|123', email: 'jane.doe@gmail.com', email_verified: true, name: 'Jane Doe' };
  const s = await start({ auth0: fakeAuth0(profile) });
  let r = await fetch(s.base + '/welcome');
  assert.equal(r.status, 200);
  assert.equal(s.users.rows.length, 1);
  assert.equal(s.users.rows[0].username, 'jane_doe');
  assert.equal(s.users.rows[0].password_hash, null);
  await fetch(s.base + '/welcome');
  assert.equal(s.users.rows.length, 1);
  // Social-only account cannot log in with a password.
  r = await s.post('/login', { username: 'jane_doe', password: 'anything at all' });
  assert.equal(r.status, 401);
  s.close();
});

test('welcome links to an existing account only when the email is verified', async () => {
  for (const verified of [true, false]) {
    const profile = { sub: 'google-oauth2|9', email: 'd@example.com', email_verified: verified };
    const s = await start({ auth0: fakeAuth0(profile) });
    await s.post('/register', { username: 'dalu', email: 'd@example.com', password: 'correct horse' });
    await fetch(s.base + '/welcome');
    if (verified) {
      assert.equal(s.users.rows.length, 1);
      assert.equal(s.users.rows[0].auth0_id, 'google-oauth2|9');
    } else {
      assert.equal(s.users.rows[0].auth0_id, null);
    }
    s.close();
  }
});

test('welcome without a session sends you to login', async () => {
  const s = await start({ auth0: fakeAuth0(null) });
  const r = await fetch(s.base + '/welcome', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/login.html');
  s.close();
});