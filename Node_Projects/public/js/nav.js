// nav.js - makes the navbar on the static pages match the login state.
// Asks the server "am I logged in?" and swaps Log in / Sign up for Profile / Log out.
// If the request fails (for example the page was opened as a plain file), the navbar is left alone.
(function () {
  fetch('/api/me', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (me) {
      if (!me.loggedIn) return;

      // A logged-in person has no reason to see the login or sign-up forms.
      var page = location.pathname;
      if (page.endsWith('/login.html') || page.endsWith('/register.html')) {
        location.replace('/profile');
        return;
      }

      var nav = document.querySelector('.main-nav');
      if (!nav) return;
      var here = page.split('/').pop() || 'index.html';
      function link(href, label, cls) {
        var active = href.split('/').pop() === here ? ' active' : '';
        return '<a href="' + href + '" class="' + ((cls || '') + active).trim() + '">' + label + '</a>';
      }
      nav.innerHTML =
        link('index.html', 'Home') +
        link('about.html', 'About') +
        link('/profile', 'Profile') +
        link('/logout', 'Log out', 'nav-cta');
    })
    .catch(function () { /* keep the default navbar */ });
})();