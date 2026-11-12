// profile.js - everything behind the login: the /profile page and the forms on it.
// Only people with a session (set when they log in) can reach these routes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { statusPage, profilePage } = require('./render');

const NAME_RE = /^\p{L}[\p{L}\p{M} '’.-]{0,49}$/u;
const ZIP_RE = /^\d{5}$/;
const TEXT_RE = /^[^\u0000-\u001f\u007f]{1,60}$/; // 1-60 characters, no control characters
const RADIUS_OPTIONS = [5, 10, 15, 25, 50];
const MAX_BRANDS = 50;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// A browser can claim any file type, so look at the first bytes of the file itself.
function detectImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function cleanName(value) {
  const v = String(value || '').trim().replace(/\s+/g, ' ');
  if (v === '') return { value: null };
  return NAME_RE.test(v) ? { value: v } : { error: 'Names can use letters, spaces, apostrophes, hyphens and periods (up to 50 characters).' };
}

function cleanDob(value) {
  const v = String(value || '').trim();
  if (v === '') return { value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: 'Enter your date of birth as a real date.' };
  const d = new Date(`${v}T00:00:00Z`);
  const real = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  if (!real || Number(v.slice(0, 4)) < 1900 || v > new Date().toISOString().slice(0, 10)) {
    return { error: 'Enter a date of birth that is in the past.' };
  }
  return { value: v };
}

function profileRouter({ users, uploadDir }) {
  const router = express.Router();
  fs.mkdirSync(uploadDir, { recursive: true });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });

  const page = (req, res, status, opts) =>
    res.status(status).type('html').send(statusPage({ ...opts, loggedIn: !!req.session.userId }));

  // Gatekeeper for every route in this file.
  function requireLogin(req, res, next) {
    res.set('Cache-Control', 'no-store'); // keep logged-in pages out of the browser's back/forward cache
    if (req.session.userId) {
      if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
      return next();
    }
    // Google/Apple user whose server session was lost (e.g. server restarted): rebuild it.
    if (req.oidc && req.oidc.isAuthenticated()) return res.redirect('/welcome');
    return page(req, res, 401, {
      title: 'Please log in', heading: 'You are not logged in',
      message: 'Log in to see your profile.', ok: false,
      links: [{ href: '/login.html', label: 'Log in' }, { href: '/register.html', label: 'Sign up' }],
    });
  }

  // Every form on the profile page carries a secret token tied to the session, so another
  // website cannot make your browser submit these forms for you.
  function checkCsrf(req, res, next) {
    const sent = Buffer.from(String((req.body && req.body._csrf) || ''));
    const want = Buffer.from(req.session.csrf || '');
    if (sent.length === want.length && want.length > 0 && crypto.timingSafeEqual(sent, want)) return next();
    return page(req, res, 403, {
      title: 'Try again', heading: 'That form expired',
      message: 'Reload your profile and try again.', ok: false,
      links: [{ href: '/profile', label: 'Back to profile' }],
    });
  }

  // Remember a one-time message, then send the person back to the right part of the page.
  function back(req, res, type, text, hash = '') {
    req.session.flash = { type, text };
    req.session.save(() => res.redirect(`/profile${hash}`));
  }

  const guarded = [requireLogin];
  const guardedPost = [requireLogin, checkCsrf];

  router.get('/', requireLogin, async (req, res) => {
    try {
      const user = await users.findById(req.session.userId);
      if (!user) { // account was deleted while the session was still alive
        return req.session.destroy(() =>
          page(req, res, 401, { title: 'Please log in', heading: 'You are not logged in', message: 'Log in to see your profile.', ok: false, links: [{ href: '/login.html', label: 'Log in' }] }));
      }
      const brands = await users.listBrands(user.user_id);
      const flash = req.session.flash;
      delete req.session.flash;
      res.type('html').send(profilePage({ user, brands, csrf: req.session.csrf, flash }));
    } catch (err) {
      console.error('profile failed:', err);
      page(req, res, 503, { title: 'Try again', heading: 'Something went wrong on our end', message: 'We could not load your profile. Please try again in a moment.', ok: false, links: [{ href: '/profile', label: 'Try again' }] });
    }
  });

  // Wrap async handlers so a database error shows the friendly page instead of crashing.
  const safe = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (err) {
      console.error('profile action failed:', err);
      back(req, res, 'error', 'Something went wrong on our end. Please try again.');
    }
  };

  router.post('/details', guardedPost, safe(async (req, res) => {
    const first = cleanName(req.body.first_name);
    const last = cleanName(req.body.last_name);
    const dob = cleanDob(req.body.date_of_birth);
    const problem = first.error || last.error || dob.error;
    if (problem) return back(req, res, 'error', problem, '#details');
    await users.updateDetails(req.session.userId, { firstName: first.value, lastName: last.value, dateOfBirth: dob.value });
    back(req, res, 'ok', 'Personal details saved.', '#details');
  }));

  router.post('/location', guardedPost, safe(async (req, res) => {
    const zip = String(req.body.zip_code || '').trim();
    const radius = Number(req.body.radius_miles);
    if (zip !== '' && !ZIP_RE.test(zip)) return back(req, res, 'error', 'Enter a 5-digit ZIP code.', '#location');
    if (!RADIUS_OPTIONS.includes(radius)) return back(req, res, 'error', 'Choose a search radius from the list.', '#location');
    await users.updateLocation(req.session.userId, { zipCode: zip === '' ? null : zip, radiusMiles: radius });
    back(req, res, 'ok', 'Location saved.', '#location');
  }));

  router.post('/brands', guardedPost, safe(async (req, res) => {
    const item = String(req.body.item || '').trim().replace(/\s+/g, ' ');
    const brand = String(req.body.brand || '').trim().replace(/\s+/g, ' ');
    if (!TEXT_RE.test(item) || !TEXT_RE.test(brand)) {
      return back(req, res, 'error', 'Enter an item and a brand, each up to 60 characters.', '#brands');
    }
    const existing = await users.listBrands(req.session.userId);
    const isUpdate = existing.some((b) => b.item.toLowerCase() === item.toLowerCase());
    if (!isUpdate && existing.length >= MAX_BRANDS) {
      return back(req, res, 'error', `You can save up to ${MAX_BRANDS} brands. Remove one to add another.`, '#brands');
    }
    await users.saveBrand(req.session.userId, item, brand);
    back(req, res, 'ok', isUpdate ? `Updated the brand for ${item}.` : `Saved ${brand} for ${item}.`, '#brands');
  }));

  router.post('/brands/:id/delete', guardedPost, safe(async (req, res) => {
    await users.deleteBrand(req.session.userId, Number(req.params.id));
    back(req, res, 'ok', 'Brand removed.', '#brands');
  }));

  // ---- Profile photo ----
  router.post('/avatar', requireLogin, (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
      if (err) {
        return back(req, res, 'error', err.code === 'LIMIT_FILE_SIZE' ? 'That photo is over 2 MB.' : 'We could not read that upload.', '#photo');
      }
      next();
    });
  }, checkCsrf, safe(async (req, res) => {
    if (!req.file) return back(req, res, 'error', 'Choose a photo first.', '#photo');
    const ext = detectImage(req.file.buffer);
    if (!ext) return back(req, res, 'error', 'Photos must be JPG, PNG or WebP files.', '#photo');
    const userId = req.session.userId;
    const previous = (await users.findById(userId)).avatar_file;
    const file = `${userId}.${ext}`; // named by us, never by the uploader
    await fs.promises.writeFile(path.join(uploadDir, file), req.file.buffer);
    await users.setAvatar(userId, file);
    if (previous && previous !== file) await fs.promises.rm(path.join(uploadDir, previous), { force: true });
    back(req, res, 'ok', 'Profile photo updated.', '#photo');
  }));

  router.post('/avatar/delete', guardedPost, safe(async (req, res) => {
    const user = await users.findById(req.session.userId);
    if (user && user.avatar_file) {
      await fs.promises.rm(path.join(uploadDir, user.avatar_file), { force: true });
      await users.setAvatar(user.user_id, null);
    }
    back(req, res, 'ok', 'Profile photo removed.', '#photo');
  }));

  // Photos are not in the public folder: only the logged-in owner can fetch their own.
  router.get('/avatar', guarded, safe(async (req, res) => {
    const user = await users.findById(req.session.userId);
    if (!user || !user.avatar_file || !/^\d+\.(jpg|png|webp)$/.test(user.avatar_file)) return res.status(404).end();
    res.set('Cache-Control', 'private, no-cache');
    res.sendFile(path.join(uploadDir, user.avatar_file), (err) => { if (err && !res.headersSent) res.status(404).end(); });
  }));

  return router;
}

module.exports = { profileRouter, cleanName, cleanDob, detectImage };