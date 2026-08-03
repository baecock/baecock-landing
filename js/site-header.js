(function () {
  var currentScript = document.currentScript;
  var page = currentScript ? currentScript.getAttribute("data-page") : "";

  var navLinks = [
    { page: "index", href: "index.html", label: "소개" },
    // { page: "match", href: "match.html", label: "매칭" },
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
          '<img class="site-logo__icon" src="assets/icons/web_logo.png" alt="" />' +
          "배콕" +
        "</a>" +
        '<nav class="site-nav" aria-label="주요 메뉴">' + navHtml + "</nav>" +
        '<div class="site-header__actions">' +
          '<a class="btn-primary" href="match.html">매칭 체험하기</a>' +
        "</div>" +
      "</div>" +
    "</header>"
  );
})();
