(function () {
  var sidebar = document.querySelector(".guide-sidebar");
  var sections = document.querySelectorAll(".guide-section[id]");
  if (!sidebar || !sections.length) return;

  var links = sidebar.querySelectorAll(".guide-sidebar__link");
  var linkByHref = {};
  links.forEach(function (link) {
    linkByHref[link.getAttribute("href")] = link;
  });

  function setActive(id) {
    links.forEach(function (link) {
      link.classList.remove("is-active");
    });
    var active = linkByHref["#" + id];
    if (active) active.classList.add("is-active");
  }

  if (!("IntersectionObserver" in window)) return;

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          setActive(entry.target.id);
        }
      });
    },
    { rootMargin: "-30% 0px -60% 0px" }
  );

  sections.forEach(function (section) {
    observer.observe(section);
  });
})();
