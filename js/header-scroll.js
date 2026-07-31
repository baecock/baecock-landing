(function () {
  var body = document.body;
  if (!body.classList.contains("has-photo-hero")) return;

  function toggle() {
    if (window.scrollY > 40) {
      body.classList.add("is-scrolled");
    } else {
      body.classList.remove("is-scrolled");
    }
  }

  window.addEventListener("scroll", toggle, { passive: true });
  toggle();
})();
