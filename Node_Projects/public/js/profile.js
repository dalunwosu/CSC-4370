// profile.js - small conveniences for the profile page. The forms work without it.
(function () {
  // Bring the saved/error message into view after the page reloads.
  var flash = document.querySelector('.flash');
  if (flash) flash.scrollIntoView({ block: 'nearest' });

  // Check the photo size before uploading so people get an instant answer.
  var photo = document.getElementById('avatar');
  if (photo) {
    photo.addEventListener('change', function () {
      var file = photo.files[0];
      photo.setCustomValidity(file && file.size > 2 * 1024 * 1024 ? 'Choose a photo under 2 MB.' : '');
      if (!photo.checkValidity()) photo.reportValidity();
    });
  }

  // Stop double submits on the forms that save something.
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var b = form.querySelector('button[type="submit"].btn');
      if (b) { b.disabled = true; }
    });
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });
})();