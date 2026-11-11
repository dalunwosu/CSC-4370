// auth.js - small conveniences for the sign-up and log-in forms.
// The forms work without this file; it only adds the show/hide button, the strength
// meter, a double-submit guard, and reveals the Google/Apple buttons when Auth0 is set up.

(function () {
  // Show / hide password
  document.querySelectorAll('.show-pass').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('aria-controls'));
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', String(show));
    });
  });

  // Password strength meter (sign-up page only)
  var meter = document.getElementById('meter');
  var meterText = document.getElementById('meter-text');
  var pw = document.getElementById('password');
  if (meter && pw) {
    var labels = ['At least 8 characters.', 'Weak. Try a longer password.', 'Fair. Add numbers or symbols.', 'Good.', 'Strong.'];
    pw.addEventListener('input', function () {
      var v = pw.value, score = 0;
      if (v.length >= 8) score++;
      if (v.length >= 12) score++;
      if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
      if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
      if (v.length === 0) score = 0; else if (v.length < 8) score = 1;
      meter.setAttribute('data-level', String(score));
      meterText.textContent = v.length === 0 ? labels[0] : v.length < 8 ? 'Too short. Use at least 8 characters.' : labels[score];
    });
  }

  // Stop double submits
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var b = form.querySelector('button[type="submit"]');
      if (b) { b.disabled = true; b.textContent = 'One moment…'; }
    });
  });
  // Back/forward cache can restore a disabled button; re-enable on show.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) location.reload();
  });

  // Social buttons appear only if the server has Auth0 configured
  fetch('/auth/providers').then(function (r) { return r.json(); }).then(function (p) {
    var any = false;
    [['google', 'google-btn'], ['apple', 'apple-btn']].forEach(function (pair) {
      var el = document.getElementById(pair[1]);
      if (el && p[pair[0]]) { el.hidden = false; any = true; }
    });
    if (any) {
      document.getElementById('social-stack').hidden = false;
      document.getElementById('social-divider').hidden = false;
    }
  }).catch(function () { /* opened as a plain file or server offline: keep email form only */ });
})();