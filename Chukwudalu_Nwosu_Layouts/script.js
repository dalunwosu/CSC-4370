
// Key used to store the visitor's choice in localStorage
const STORAGE_KEY = 'shopsmart-theme';

// The <html> element is where the data-theme attribute lives
const root = document.documentElement;

/* Read the saved theme ('light' or 'dark') from localStorage.
   Wrapped in try/catch because storage can be blocked (e.g. private browsing). */
function getSavedTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

/* Save the chosen theme so it is remembered on the next visit. */
function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    // If storage is unavailable the toggle still works, it just won't persist.
  }
}

/* Decide which theme to start with:
   a saved choice wins; otherwise follow the operating system preference. */
function getInitialTheme() {
  const saved = getSavedTheme();
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return systemPrefersDark ? 'dark' : 'light';
}

/* Apply a theme: set the attribute that style.css listens for, then update
   the toggle button's icon and accessibility attributes to match. */
function applyTheme(theme) {
  root.setAttribute('data-theme', theme);

  // The button may not exist yet when this first runs in the <head>
  const button = document.getElementById('theme-toggle');
  if (!button) {
    return;
  }

  const isDark = theme === 'dark';
  button.setAttribute('aria-pressed', String(isDark));
  button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  // Show the icon for the theme you would switch TO: sun in dark mode, moon in light mode
  button.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
}

/* Flip between light and dark, then save the new choice. */
function toggleTheme() {
  const current = root.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveTheme(next);
}

// Apply the starting theme immediately, before the page renders
applyTheme(getInitialTheme());

// Once the HTML is loaded, sync the button's icon and wire up the click handler
document.addEventListener('DOMContentLoaded', function () {
  applyTheme(root.getAttribute('data-theme'));

  const button = document.getElementById('theme-toggle');
  button.addEventListener('click', toggleTheme);
});