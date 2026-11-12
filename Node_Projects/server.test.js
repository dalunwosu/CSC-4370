// Run with: npm test   (uses an in-memory fake instead of MySQL, so no database is needed)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
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
    findById: async (i) => find((u) => u.user_id === i),
    create: async ({ username, email, passwordHash = null, auth0Id = null, firstName = null, lastName = null }) => {
      const u = {
        user_id: id++, username, email, password_hash: passwordHash, auth0_id: auth0Id,
        first_name: firstName, last_name: lastName, date_of_birth: null, zip_code: null, radius_miles: 10, avatar_file: null,
      };
      rows.push(u);
      return u;
    },
    linkAuth0: async (uid, a) => { rows.find((u) => u.user_id === uid).auth0_id = a; },
    updateDetails: async (uid, d) => {
      Object.assign(rows.find((u) => u.user_id === uid), { first_name: d.firstName, last_name: d.lastName, date_of_birth: d.dateOfBirth });
    },
    updateLocation: async (uid, d) => {
      Object.assign(rows.find((u) => u.user_id === uid), { zip_code: d.zipCode, radius_miles: d.radiusMiles });
    },
    setAvatar: async (uid, f) => { rows.find((u) => u.user_id === uid).avatar_file = f; },
    brands: [],
    listBrands: async function (uid) { return this.brands.filter((b) => b.user_id === uid).sort((a, b) => a.item.localeCompare(b.item)); },
    saveBrand: async function (uid, item, brand) {
      const hit = this.brands.find((b) => b.user_id === uid && b.item.toLowerCase() === item.toLowerCase());
      if (hit) hit.brand = brand; else this.brands.push({ pref_id: this.brands.length + 1, user_id: uid, item, brand });
    },
    deleteBrand: async function (uid, pid) { this.brands = this.brands.filter((b) => !(b.user_id === uid && b.pref_id === pid)); },
  };
}

async function start(opts = {}) {
  const users = fakeUsers();
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopsmart-test-'));
  const app = createApp({ users, sessionSecret: 'test-secret', uploadDir, ...opts });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body) =>
    fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });

  // A tiny browser stand-in: remembers cookies between requests, never follows redirects on its own.
  const client = () => {
    const jar = new Map();
    const send = async (p, { method = 'GET', form, multipart } = {}) => {
      const headers = {};
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      let body;
      if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form); }
      if (multipart) body = multipart;
      const res = await fetch(base + p, { method, headers, body, redirect: 'manual' });
      for (const c of res.headers.getSetCookie()) {
        const [kv] = c.split(';');
        const i = kv.indexOf('=');
        const k = kv.slice(0, i), v = kv.slice(i + 1);
        if (v === '' || /expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(k); else jar.set(k, v);
      }
      return res;
    };
    return {
      jar, send,
      csrf: async () => (await (await send('/profile')).text()).match(/name="_csrf" value="([^"]+)"/)?.[1],
      login: (username, password) => send('/login', { method: 'POST', form: { username, password } }),
    };
  };
  return { users, base, post, client, uploadDir, close: () => { server.closeAllConnections?.(); server.close(); } };
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
  const profile = { sub: 'google-oauth2|123', email: 'jane.doe@gmail.com', email_verified: true, name: 'Jane Doe', given_name: 'Jane', family_name: 'Doe' };
  const s = await start({ auth0: fakeAuth0(profile) });
  let r = await fetch(s.base + '/welcome', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/profile');
  assert.equal(s.users.rows.length, 1);
  assert.equal(s.users.rows[0].username, 'jane_doe');
  assert.equal(s.users.rows[0].first_name, 'Jane');
  assert.equal(s.users.rows[0].last_name, 'Doe');
  assert.equal(s.users.rows[0].password_hash, null);
  await fetch(s.base + '/welcome', { redirect: 'manual' });
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
    await fetch(s.base + '/welcome', { redirect: 'manual' });
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

// ---------------------------------------------------------------- sessions and profile

async function loggedInClient(s, username = 'dalu', email = 'd@example.com') {
  await s.post('/register', { username, email, password: 'correct horse' });
  const c = s.client();
  const r = await c.login(username, 'correct horse');
  assert.equal(r.status, 200);
  return c;
}

test('profile and its forms need a login', async () => {
  const s = await start();
  const c = s.client();
  let r = await c.send('/profile');
  assert.equal(r.status, 401);
  assert.match(await r.text(), /You are not logged in/);
  r = await c.send('/profile/details', { method: 'POST', form: { first_name: 'A' } });
  assert.equal(r.status, 401);
  r = await c.send('/profile/avatar');
  assert.equal(r.status, 401);
  s.close();
});

test('login starts a session, logout destroys it (and the old cookie stops working)', async () => {
  const s = await start();
  const c = await loggedInClient(s);
  assert.deepEqual(await (await c.send('/api/me')).json(), { loggedIn: true, username: 'dalu' });
  let r = await c.send('/profile');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /@dalu/);

  const oldCookie = c.jar.get('shopsmart.sid');
  r = await c.send('/logout');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /logged out/i);
  assert.equal((await c.send('/profile')).status, 401);

  // someone replaying the cookie from before logout gets nowhere
  const thief = s.client();
  thief.jar.set('shopsmart.sid', oldCookie);
  assert.equal((await thief.send('/profile')).status, 401);
  s.close();
});

test('a failed login does not create a session', async () => {
  const s = await start();
  await s.post('/register', { username: 'dalu', email: 'd@example.com', password: 'correct horse' });
  const c = s.client();
  await c.login('dalu', 'wrong password');
  assert.equal(c.jar.size, 0);
  assert.equal((await c.send('/profile')).status, 401);
  s.close();
});

test('saving details, location and brands', async () => {
  const s = await start();
  const c = await loggedInClient(s);
  const csrf = await c.csrf();
  assert.ok(csrf);

  let r = await c.send('/profile/details', { method: 'POST', form: { _csrf: csrf, first_name: "  Dalu  ", last_name: "O'Neil-Nwosu", date_of_birth: '2000-05-17' } });
  assert.equal(r.status, 302);
  assert.equal(s.users.rows[0].first_name, 'Dalu');
  assert.equal(s.users.rows[0].last_name, "O'Neil-Nwosu");
  assert.equal(s.users.rows[0].date_of_birth, '2000-05-17');

  r = await c.send('/profile/location', { method: 'POST', form: { _csrf: csrf, zip_code: '30303', radius_miles: '25' } });
  assert.equal(r.status, 302);
  assert.equal(s.users.rows[0].zip_code, '30303');
  assert.equal(s.users.rows[0].radius_miles, 25);

  await c.send('/profile/brands', { method: 'POST', form: { _csrf: csrf, item: 'Milk', brand: 'Kroger' } });
  await c.send('/profile/brands', { method: 'POST', form: { _csrf: csrf, item: 'milk', brand: 'Horizon' } }); // same item: updates
  await c.send('/profile/brands', { method: 'POST', form: { _csrf: csrf, item: 'Eggs', brand: 'Great Value' } });
  assert.equal(s.users.brands.length, 2);
  assert.equal(s.users.brands.find((b) => b.item === 'Milk').brand, 'Horizon');

  const html = await (await c.send('/profile')).text();
  assert.match(html, /Great Value/);
  assert.match(html, /value="2000-05-17"/);
  assert.match(html, /<option value="25" selected>/);
  assert.match(html, /Dalu O&#39;Neil-Nwosu/);

  const pid = s.users.brands.find((b) => b.item === 'Eggs').pref_id;
  await c.send(`/profile/brands/${pid}/delete`, { method: 'POST', form: { _csrf: csrf } });
  assert.equal(s.users.brands.length, 1);
  s.close();
});

test('profile forms reject bad input', async () => {
  const s = await start();
  const c = await loggedInClient(s);
  const csrf = await c.csrf();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  for (const [path_, form] of [
    ['/profile/details', { first_name: '<script>', last_name: '', date_of_birth: '' }],
    ['/profile/details', { first_name: 'Dalu', last_name: '', date_of_birth: tomorrow }],
    ['/profile/details', { first_name: 'Dalu', last_name: '', date_of_birth: '2000-02-31' }],
    ['/profile/location', { zip_code: '1234', radius_miles: '10' }],
    ['/profile/location', { zip_code: '30303', radius_miles: '999' }],
    ['/profile/brands', { item: '', brand: 'Kroger' }],
    ['/profile/brands', { item: 'x'.repeat(61), brand: 'Kroger' }],
  ]) {
    await c.send(path_, { method: 'POST', form: { _csrf: csrf, ...form } });
  }
  const u = s.users.rows[0];
  assert.equal(u.first_name, null);
  assert.equal(u.date_of_birth, null);
  assert.equal(u.zip_code, null);
  assert.equal(s.users.brands.length, 0);
  // the error shows once, then is gone
  assert.match(await (await c.send('/profile')).text(), /class="flash is-error"/);
  assert.doesNotMatch(await (await c.send('/profile')).text(), /class="flash/);
  s.close();
});

test('forms without the right CSRF token are refused', async () => {
  const s = await start();
  const c = await loggedInClient(s);
  for (const token of [undefined, 'nope']) {
    const r = await c.send('/profile/details', { method: 'POST', form: { first_name: 'Evil', ...(token ? { _csrf: token } : {}) } });
    assert.equal(r.status, 403);
  }
  assert.equal(s.users.rows[0].first_name, null);
  s.close();
});

test('user text is escaped on the profile page', async () => {
  const s = await start();
  const c = await loggedInClient(s);
  const csrf = await c.csrf();
  await c.send('/profile/brands', { method: 'POST', form: { _csrf: csrf, item: '<img src=x onerror=alert(1)>', brand: '"><script>alert(2)</script>' } });
  const html = await (await c.send('/profile')).text();
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;img src=x/);
  s.close();
});

test("nobody can delete or see another person's data", async () => {
  const s = await start();
  const a = await loggedInClient(s, 'alice', 'a@example.com');
  const b = await loggedInClient(s, 'bob', 'b@example.com');
  const ca = await a.csrf();
  await a.send('/profile/brands', { method: 'POST', form: { _csrf: ca, item: 'Milk', brand: 'Kroger' } });
  const pid = s.users.brands[0].pref_id;
  const cb = await b.csrf();
  await b.send(`/profile/brands/${pid}/delete`, { method: 'POST', form: { _csrf: cb } });
  assert.equal(s.users.brands.length, 1);
  assert.doesNotMatch(await (await b.send('/profile')).text(), /brand-name-text">Kroger/);
  assert.match(await (await a.send('/profile')).text(), /brand-name-text">Kroger/);
  s.close();
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const upload = (csrf, bytes, name = 'me.png', type = 'image/png') => {
  const fd = new FormData();
  fd.append('_csrf', csrf);
  fd.append('avatar', new Blob([bytes], { type }), name);
  return fd;
};

test('profile photo: upload, view, replace and remove', async () => {
  const s = await start();
  const c = await loggedInClient(s);
  const csrf = await c.csrf();

  let r = await c.send('/profile/avatar', { method: 'POST', multipart: upload(csrf, PNG) });
  assert.equal(r.status, 302);
  assert.equal(s.users.rows[0].avatar_file, '1.png');
  assert.ok(fs.existsSync(path.join(s.uploadDir, '1.png')));

  r = await c.send('/profile/avatar');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await r.arrayBuffer()).length, PNG.length);
  assert.equal((await s.client().send('/profile/avatar')).status, 401); // logged-out visitors cannot fetch it

  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
  await c.send('/profile/avatar', { method: 'POST', multipart: upload(csrf, JPG, 'me.jpg', 'image/jpeg') });
  assert.equal(s.users.rows[0].avatar_file, '1.jpg');
  assert.ok(!fs.existsSync(path.join(s.uploadDir, '1.png'))); // old one cleaned up

  await c.send('/profile/avatar/delete', { method: 'POST', form: { _csrf: csrf } });
  assert.equal(s.users.rows[0].avatar_file, null);
  assert.deepEqual(fs.readdirSync(s.uploadDir), []);
  s.close();
});

test('profile photo: wrong type, fake extension, too big and missing CSRF are all refused', async () => {
  const s = await start();
  const c = await loggedInClient(s);
  const csrf = await c.csrf();

  await c.send('/profile/avatar', { method: 'POST', multipart: upload(csrf, Buffer.from('<script>alert(1)</script>'.repeat(10)), 'x.png', 'image/png') });
  assert.equal(s.users.rows[0].avatar_file, null);

  await c.send('/profile/avatar', { method: 'POST', multipart: upload(csrf, Buffer.concat([PNG, Buffer.alloc(2.5 * 1024 * 1024)])) });
  assert.equal(s.users.rows[0].avatar_file, null);

  const r = await c.send('/profile/avatar', { method: 'POST', multipart: upload('bad-token', PNG) });
  assert.equal(r.status, 403);
  assert.equal(s.users.rows[0].avatar_file, null);
  assert.deepEqual(fs.readdirSync(s.uploadDir), []);
  s.close();
});

test('a logged-in Google user with a lost server session is sent back through /welcome', async () => {
  const profile = { sub: 'google-oauth2|7', email: 'g@example.com', email_verified: true, given_name: 'Gia' };
  const s = await start({ auth0: fakeAuth0(profile) });
  const c = s.client();
  const r = await c.send('/profile');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/welcome');
  await c.send('/welcome');
  assert.equal((await c.send('/profile')).status, 200);
  s.close();
});