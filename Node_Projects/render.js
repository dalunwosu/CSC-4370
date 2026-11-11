// render.js - the HTML the server sends back for form results.
// It reuses the site's stylesheet so these pages look like the rest of ShopSmart.

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NAV = `
  <header class="top-nav">
    <a class="brand-name" href="/index.html">ShopSmart</a>
    <div class="nav-actions">
      <nav class="main-nav" aria-label="Main">
        <a href="/index.html">Home</a>
        <a href="/about.html">About</a>
        <a href="/login.html">Log in</a>
        <a class="nav-cta" href="/register.html">Sign up</a>
      </nav>
      <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch to dark mode" aria-pressed="false">
        <span class="theme-icon" aria-hidden="true">🌙</span>
      </button>
    </div>
  </header>`;

// ok = true shows the confirmation mark, false shows the warning mark.
function statusPage({ title, heading, message, ok, links = [] }) {
  const buttons = links
    .map((l, i) => `<a class="btn ${i === 0 ? 'btn-primary' : 'btn-ghost'}" href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | ShopSmart</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/site.css">
  <script src="/js/theme.js"></script>
</head>
<body>${NAV}
  <main class="status-wrap">
    <section class="status-card" role="status">
      <span class="status-mark ${ok ? 'is-ok' : 'is-bad'}" aria-hidden="true">${ok ? '✓' : '!'}</span>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(message)}</p>
      <div class="status-actions">${buttons}</div>
    </section>
  </main>
</body>
</html>`;
}

module.exports = { escapeHtml, statusPage };