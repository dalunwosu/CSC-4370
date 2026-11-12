// render.js - the HTML the server builds itself (form results and the profile page).
// It reuses the site's stylesheet so these pages look like the rest of ShopSmart.

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

// Navbar: shows Log in / Sign up for visitors, Profile / Log out once someone is logged in.
function nav(loggedIn, active = '') {
  const link = (href, label, cls = '') => {
    const c = (cls + (active === href ? ' active' : '')).trim();
    return `<a href="${href}"${c ? ` class="${c}"` : ''}>${label}</a>`;
  };
  const links = loggedIn
    ? [link('/index.html', 'Home'), link('/about.html', 'About'), link('/profile', 'Profile'), link('/logout', 'Log out', 'nav-cta')]
    : [link('/index.html', 'Home'), link('/about.html', 'About'), link('/login.html', 'Log in'), link('/register.html', 'Sign up', 'nav-cta')];
  return `
  <header class="top-nav">
    <a class="brand-name" href="/index.html">ShopSmart</a>
    <div class="nav-actions">
      <nav class="main-nav" aria-label="Main">
        ${links.join('\n        ')}
      </nav>
      <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch to dark mode" aria-pressed="false">
        <span class="theme-icon" aria-hidden="true">🌙</span>
      </button>
    </div>
  </header>`;
}

function head(title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${e(title)} | ShopSmart</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500;600&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/site.css">
  <script src="/js/theme.js"></script>
</head>`;
}

// ok = true shows the confirmation mark, false shows the warning mark.
function statusPage({ title, heading, message, ok, links = [], loggedIn = false }) {
  const buttons = links
    .map((l, i) => `<a class="btn ${i === 0 ? 'btn-primary' : 'btn-ghost'}" href="${e(l.href)}">${e(l.label)}</a>`)
    .join('');
  return `${head(title)}
<body>${nav(loggedIn)}
  <main class="status-wrap">
    <section class="status-card" role="status">
      <span class="status-mark ${ok ? 'is-ok' : 'is-bad'}" aria-hidden="true">${ok ? '✓' : '!'}</span>
      <h1>${e(heading)}</h1>
      <p>${e(message)}</p>
      <div class="status-actions">${buttons}</div>
    </section>
  </main>
</body>
</html>`;
}

function initials(user) {
  const a = (user.first_name || user.username || '?')[0];
  const b = user.last_name ? user.last_name[0] : '';
  return (a + b).toUpperCase();
}

const RADIUS_OPTIONS = [5, 10, 15, 25, 50];

// The logged-in profile page. Everything that comes from the database or the user goes through e().
function profilePage({ user, brands, csrf, flash }) {
  const today = new Date().toISOString().slice(0, 10);
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const avatar = user.avatar_file
    ? `<img src="/profile/avatar?v=${encodeURIComponent(user.avatar_file)}" alt="Your profile photo" class="profile-img avatar-img">`
    : `<span class="avatar-initials" aria-hidden="true">${e(initials(user))}</span>`;
  const token = `<input type="hidden" name="_csrf" value="${e(csrf)}">`;

  const flashHtml = flash
    ? `<div class="flash ${flash.type === 'error' ? 'is-error' : 'is-ok'}" role="status">${e(flash.text)}</div>`
    : '';

  const brandRows = brands.length
    ? brands
        .map(
          (b) => `
          <li class="brand-row">
            <span class="brand-item">${e(b.item)}</span>
            <span class="brand-name-text">${e(b.brand)}</span>
            <form action="/profile/brands/${Number(b.pref_id)}/delete" method="POST">
              ${token}
              <button class="link-btn" type="submit" aria-label="Remove ${e(b.item)}">Remove</button>
            </form>
          </li>`
        )
        .join('')
    : `<li class="brand-empty">No brands saved yet. Add your first one below.</li>`;

  return `${head('Your profile')}
<body>${nav(true, '/profile')}
  <div class="layout">
    <aside class="contents-sidebar">
      <h3>On This Page</h3>
      <nav class="contents-nav">
        <a href="#details"><span class="nav-dot"></span>Personal details</a>
        <a href="#location"><span class="nav-dot"></span>Location</a>
        <a href="#brands"><span class="nav-dot"></span>Preferred brands</a>
        <a href="#photo"><span class="nav-dot"></span>Photo</a>
      </nav>
    </aside>

    <main class="content">
      <section class="profile-head">
        <div class="avatar">${avatar}</div>
        <div>
          <h1>${displayName ? e(displayName) : `Hi, ${e(user.username)}`}</h1>
          <p class="profile-meta">@${e(user.username)}</p>
          <p class="profile-meta">${e(user.email)}</p>
        </div>
      </section>
      ${flashHtml}

      <section id="details" class="story-block">
        <h2>Personal details</h2>
        <form action="/profile/details" method="POST" class="form-grid">
          ${token}
          <div class="field">
            <label for="first_name">First name</label>
            <input type="text" id="first_name" name="first_name" maxlength="50" autocomplete="given-name" value="${e(user.first_name || '')}">
          </div>
          <div class="field">
            <label for="last_name">Last name</label>
            <input type="text" id="last_name" name="last_name" maxlength="50" autocomplete="family-name" value="${e(user.last_name || '')}">
          </div>
          <div class="field">
            <label for="date_of_birth">Date of birth</label>
            <input type="date" id="date_of_birth" name="date_of_birth" min="1900-01-01" max="${today}" autocomplete="bday" value="${e(user.date_of_birth || '')}">
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Save details</button></div>
        </form>
      </section>

      <section id="location" class="story-block">
        <h2>Location</h2>
        <p>ShopSmart looks for stores inside this radius when it compares your list.</p>
        <form action="/profile/location" method="POST" class="form-grid">
          ${token}
          <div class="field">
            <label for="zip_code">ZIP code</label>
            <input type="text" id="zip_code" name="zip_code" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="postal-code" value="${e(user.zip_code || '')}">
          </div>
          <div class="field">
            <label for="radius_miles">Search radius</label>
            <select id="radius_miles" name="radius_miles">
              ${RADIUS_OPTIONS.map((r) => `<option value="${r}"${Number(user.radius_miles) === r ? ' selected' : ''}>${r} miles</option>`).join('')}
            </select>
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Save location</button></div>
        </form>
      </section>

      <section id="brands" class="story-block">
        <h2>Preferred brands</h2>
        <p>Pick a brand once and ShopSmart uses it every time that item is on your list.</p>
        <ul class="brand-list">${brandRows}
        </ul>
        <form action="/profile/brands" method="POST" class="form-grid brand-add">
          ${token}
          <div class="field">
            <label for="item">Item</label>
            <input type="text" id="item" name="item" maxlength="60" placeholder="Milk" required>
          </div>
          <div class="field">
            <label for="brand">Brand</label>
            <input type="text" id="brand" name="brand" maxlength="60" placeholder="Kroger" required>
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Save brand</button></div>
        </form>
        <p class="hint">Saving an item that is already on the list changes its brand.</p>
      </section>

      <section id="photo" class="story-block">
        <h2>Profile photo</h2>
        <p>Optional. JPG, PNG or WebP, up to 2 MB.</p>
        <form action="/profile/avatar" method="POST" enctype="multipart/form-data" class="form-grid">
          ${token}
          <div class="field">
            <label for="avatar">Choose a photo</label>
            <input type="file" id="avatar" name="avatar" accept="image/jpeg,image/png,image/webp" required>
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Upload photo</button></div>
        </form>
        ${
          user.avatar_file
            ? `<form action="/profile/avatar/delete" method="POST" class="remove-photo">${token}<button class="link-btn" type="submit">Remove current photo</button></form>`
            : ''
        }
      </section>

      <footer class="site-footer"><p>&copy; 2026 ShopSmart. All rights reserved.</p></footer>
    </main>
  </div>
  <script src="/js/profile.js"></script>
</body>
</html>`;
}

module.exports = { escapeHtml, statusPage, profilePage };