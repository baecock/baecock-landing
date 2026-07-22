(function () {
  var btn = document.getElementById("scroll-top");
  if (!btn) return;

  function toggle() {
    if (window.scrollY > window.innerHeight * 0.5) {
      btn.classList.add("is-visible");
    } else {
      btn.classList.remove("is-visible");
    }
  }

  btn.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", toggle, { passive: true });
  toggle();
})();
