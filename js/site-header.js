(function () {
  var currentScript = document.currentScript;
  var page = currentScript ? currentScript.getAttribute("data-page") : "";

  var navLinks = [
    { page: "index", href: "index.html", label: "소개" },
    { page: "features", href: "features.html", label: "기능" },
    { page: "guide", href: "guide.html", label: "가이드" },
  ];

  var navHtml = navLinks
    .map(function (link) {
      var isActive = link.page === page;
      var attrs = isActive ? ' class="is-active" aria-current="page"' : "";
      return '<a href="' + link.href + '"' + attrs + ">" + link.label + "</a>";
    })
    .join("");

  document.write(
    '<header class="site-header">' +
      '<div class="container site-header__inner">' +
        '<a class="site-logo" href="index.html">' +
          '<img class="site-logo__icon" src="assets/icons/favicon-192.png" alt="" />' +
          "배콕(BaeKOK)" +
        "</a>" +
        '<button class="site-header__menu-toggle" type="button" aria-label="메뉴 열기" aria-expanded="false" aria-controls="site-nav">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
        '<nav class="site-nav" id="site-nav" aria-label="주요 메뉴">' + navHtml +
          '<a class="site-nav__cta btn-primary" href="index.html#download" data-launch-alert>출시 알림 받기</a>' +
        '</nav>' +
        '<div class="site-header__actions">' +
          '<a class="btn-primary" href="index.html#download" data-launch-alert>출시 알림 받기</a>' +
        "</div>" +
      "</div>" +
    "</header>"
  );

  var header = document.querySelector(".site-header");
  var menuToggle = document.querySelector(".site-header__menu-toggle");
  var siteNav = document.querySelector(".site-nav");

  function closeMenu() {
    header.classList.remove("is-menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "메뉴 열기");
  }

  menuToggle.addEventListener("click", function () {
    var isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    header.classList.toggle("is-menu-open", !isOpen);
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "메뉴 열기" : "메뉴 닫기");
  });

  siteNav.addEventListener("click", function (event) {
    if (event.target.closest("a")) closeMenu();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth >= 1024) closeMenu();
  });
})();
