// server.js - ShopSmart web server: static pages, /register, /login, optional Auth0 (Google / Apple).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { statusPage } = require('./render');
const { profileRouter, cleanName } = require('./profile');

const BCRYPT_COST = 12;
const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // bcrypt ignores everything past 72 bytes
const SESSION_NAME = 'shopsmart.sid';
const SESSION_HOURS = 1; // how long a login lasts (same as the course example: 1 hour)

// Compared against when the username doesn't exist, so "no such user" and
// "wrong password" take about the same time and look the same to an attacker.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

// Builds the Auth0 pieces from environment variables. Returns null if Auth0 isn't configured,
// in which case the site still works with email + password.
function auth0FromEnv(env = process.env) {
  const need = ['AUTH0_ISSUER_BASE_URL', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET', 'AUTH0_BASE_URL'];
  if (need.some((k) => !env[k])) return null;
  const { auth } = require('express-openid-connect');
  return {
    middleware: auth({
      issuerBaseURL: env.AUTH0_ISSUER_BASE_URL,
      baseURL: env.AUTH0_BASE_URL,
      clientID: env.AUTH0_CLIENT_ID,
      clientSecret: env.AUTH0_CLIENT_SECRET,
      secret: env.AUTH0_SECRET,
      authRequired: false,
      auth0Logout: true,
      authorizationParams: { response_type: 'code', scope: 'openid profile email' },
      // login:false keeps /login free for our own username + password form.
      routes: { login: false, callback: '/callback', logout: '/auth/logout' },
    }),
    providers: { google: true, apple: env.AUTH0_APPLE_ENABLED === 'true' },
  };
}

// Turns an email or name into a valid, unused username (jane.doe@x.com -> jane_doe, jane_doe2, ...).
async function uniqueUsername(users, seed) {
  let base = String(seed || 'shopper').split('@')[0].replace(/[^A-Za-z0-9_]/g, '_').slice(0, 24);
  if (base.length < 3) base = (base + 'shopper').slice(0, 24);
  let candidate = base;
  for (let n = 2; await users.findByUsername(candidate); n++) candidate = `${base}${n}`;
  return candidate;
}

function createApp({ users, auth0 = null, sessionSecret, uploadDir = path.join(__dirname, 'uploads', 'avatars') }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  if (auth0) app.use(auth0.middleware);

  app.use(express.static(path.join(__dirname, 'public')));

  // ---- Sessions ----
  // After a successful login the server remembers who you are in a session. The browser only
  // holds a random session id in a cookie; the details stay on the server.
  const secret = sessionSecret || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  if (!sessionSecret && !process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET is not set in .env, so everyone is logged out whenever the server restarts.');
  }
  app.use(session({
    name: SESSION_NAME,
    secret,                     // signs the session id cookie
    resave: false,              // don't re-save sessions that didn't change
    saveUninitialized: false,   // don't create sessions for visitors who never log in
    cookie: {
      maxAge: SESSION_HOURS * 60 * 60 * 1000,
      httpOnly: true,           // JavaScript on the page can't read the cookie
      sameSite: 'lax',          // not sent on cross-site form posts
      secure: process.env.NODE_ENV === 'production', // true when the site is served over HTTPS
    },
  }));
  // Lets the navbar show Profile / Log out instead of Log in / Sign up.
  app.use((req, res, next) => { res.locals.loggedIn = !!req.session.userId; next(); });

  // Log someone in: swap to a brand-new session id (stops session fixation) and store who they are.
  const startSession = (req, user) =>
    new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        req.session.userId = user.user_id;
        req.session.username = user.username;
        req.session.csrf = crypto.randomBytes(24).toString('hex');
        req.session.save((e) => (e ? reject(e) : resolve()));
      });
    });

  app.get('/login', (req, res) => res.redirect('/login.html'));
  app.get('/register', (req, res) => res.redirect('/register.html'));

  const page = (res, status, opts) =>
    res.status(status).type('html').send(statusPage({ ...opts, loggedIn: res.locals.loggedIn }));
  const serverError = (res) =>
    page(res, 503, {
      title: 'Try again',
      heading: 'Something went wrong on our end',
      message: 'We could not reach the database. Please try again in a moment.',
      ok: false,
      links: [{ href: '/index.html', label: 'Back to home' }],
    });

  // ---- Register ----
  app.post('/register', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    let problem = null;
    if (!USERNAME_RE.test(username)) problem = 'Usernames are 3 to 30 characters: letters, numbers and underscores.';
    else if (!EMAIL_RE.test(email) || email.length > 255) problem = 'Enter a valid email address.';
    else if (password.length < PASSWORD_MIN || Buffer.byteLength(password) > PASSWORD_MAX)
      problem = `Passwords must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
    if (problem) {
      return page(res, 400, {
        title: 'Check your details', heading: 'We could not create your account', message: problem, ok: false,
        links: [{ href: '/register.html', label: 'Back to sign up' }],
      });
    }

    try {
      if ((await users.findByUsername(username)) || (await users.findByEmail(email))) throw { code: 'ER_DUP_ENTRY' };
      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
      await users.create({ username, email, passwordHash });
      return page(res, 201, {
        title: 'Registered', heading: "You're registered",
        message: `You have successfully registered as ${username}.`, ok: true,
        links: [{ href: '/login.html', label: 'Log in' }],
      });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return page(res, 409, {
          title: 'Already registered', heading: 'We could not create your account',
          message: 'That username or email is already in use.', ok: false,
          links: [{ href: '/register.html', label: 'Back to sign up' }, { href: '/login.html', label: 'Log in' }],
        });
      }
      console.error('register failed:', err);
      return serverError(res);
    }
  });

  // ---- Log in ----
  app.post('/login', async (req, res) => {
    const login = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const fail = () =>
      page(res, 401, {
        title: 'Login failed', heading: 'Login failed',
        message: 'Your login credentials were incorrect.', ok: false,
        links: [{ href: '/login.html', label: 'Back to login' }],
      });
    if (!login || !password || password.length > 1024) return fail();

    try {
      const user = await users.findByLogin(login);
      // Social-only accounts have no password_hash, so they can never match here.
      const ok = await bcrypt.compare(password, (user && user.password_hash) || DUMMY_HASH);
      if (!user || !user.password_hash || !ok) return fail();
      await startSession(req, user);
      res.locals.loggedIn = true;
      return page(res, 200, {
        title: 'Logged in', heading: 'Welcome back',
        message: `You have logged in successfully, ${user.username}.`, ok: true,
        links: [{ href: '/profile', label: 'Go to your profile' }, { href: '/index.html', label: 'Go to home' }],
      });
    } catch (err) {
      console.error('login failed:', err);
      return serverError(res);
    }
  });

  // ---- Profile (only for logged-in people) ----
  app.use('/profile', profileRouter({ users, uploadDir }));

  // ---- Log out ----
  // Destroys the server session. Google/Apple users also get logged out of Auth0.
  app.get('/logout', (req, res) => {
    const viaAuth0 = !!(auth0 && req.oidc && req.oidc.isAuthenticated());
    req.session.destroy((err) => {
      res.clearCookie(SESSION_NAME);
      if (err) {
        console.error('logout failed:', err);
        return page(res, 500, { title: 'Try again', heading: 'We could not log you out', message: 'Please try again.', ok: false, links: [{ href: '/profile', label: 'Back to profile' }] });
      }
      if (viaAuth0) return res.redirect('/auth/logout');
      res.locals.loggedIn = false;
      return page(res, 200, {
        title: 'Logged out', heading: 'You have been logged out',
        message: 'Come back any time.', ok: true,
        links: [{ href: '/login.html', label: 'Log in' }, { href: '/index.html', label: 'Go to home' }],
      });
    });
  });

  // The static pages ask this so their navbar can match the login state.
  app.get('/api/me', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(req.session.userId ? { loggedIn: true, username: req.session.username } : { loggedIn: false });
  });

  // ---- Auth0 (Google / Apple) ----
  app.get('/auth/providers', (req, res) => {
    res.json(auth0 ? auth0.providers : { google: false, apple: false });
  });

  const social = (name, connection) =>
    app.get(`/auth/${name}`, (req, res) => {
      if (!auth0 || !auth0.providers[name]) {
        return page(res, 404, {
          title: 'Not available', heading: `${name[0].toUpperCase()}${name.slice(1)} sign-in is not set up`,
          message: 'Use your email and password for now.', ok: false,
          links: [{ href: '/login.html', label: 'Back to login' }],
        });
      }
      return res.oidc.login({ returnTo: '/welcome', authorizationParams: { connection } });
    });
  social('google', 'google-oauth2');
  social('apple', 'apple');

  // After Auth0 sends the person back, make sure they exist in our own users table.
  app.get('/welcome', async (req, res) => {
    if (!auth0 || !req.oidc || !req.oidc.isAuthenticated()) return res.redirect('/login.html');
    const profile = req.oidc.user;
    try {
      let user = await users.findByAuth0Id(profile.sub);
      if (!user && profile.email && profile.email_verified) {
        const existing = await users.findByEmail(profile.email.toLowerCase());
        if (existing) {
          await users.linkAuth0(existing.user_id, profile.sub);
          user = existing;
        }
      }
      if (!user) {
        const email = (profile.email || `${profile.sub.replace(/[^A-Za-z0-9]/g, '')}@users.noreply.shopsmart`).toLowerCase();
        const username = await uniqueUsername(users, profile.email || profile.name || profile.nickname);
        user = await users.create({
          username, email, auth0Id: profile.sub,
          firstName: cleanName(profile.given_name).value || null,
          lastName: cleanName(profile.family_name).value || null,
        });
      }
      await startSession(req, user);
      return res.redirect('/profile');
    } catch (err) {
      console.error('welcome failed:', err);
      return serverError(res);
    }
  });

  return app;
}

module.exports = { createApp, auth0FromEnv, uniqueUsername };

if (require.main === module) {
  const { users } = require('./db');
  const port = Number(process.env.PORT) || 3000;
  const auth0 = auth0FromEnv();
  users.ping()
    .then(() => console.log('Database connection established'))
    .catch((e) => console.error('Could not connect to MySQL. Check your .env file:', e.message));
  console.log(auth0 ? 'Auth0 enabled' : 'Auth0 not configured (email + password only)');
  createApp({ users, auth0 }).listen(port, () => console.log(`ShopSmart running at http://localhost:${port}`));
}