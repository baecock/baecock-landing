/*
  /invite/, /posts/ 안내 페이지 공용 스크립트.
  앱에서 공유한 링크(https://baekok.cloud/invite/?code=…, /posts/?id=…)가 앱으로 바로 열리지
  않았을 때(앱 미설치, 카카오톡 인앱 브라우저 등) 이 페이지가 열린다.
  body의 data-link-kind(invite | posts)와 data-link-param(code | id)으로 쿼리 값을 읽어
  "앱에서 열기"(baekok://open/…) 주소와 코드 표시를 채운다.
*/
(function () {
  var body = document.body;
  var kind = body.getAttribute("data-link-kind");
  var param = body.getAttribute("data-link-param");
  var value = (new URLSearchParams(window.location.search).get(param) || "").trim();

  var openButton = document.querySelector("[data-open-app]");
  if (openButton) {
    openButton.href = value
      ? "baekok://open/" + kind + "/?" + param + "=" + encodeURIComponent(value)
      : "baekok://open/";
  }

  var codeBox = document.querySelector("[data-code-box]");
  var codeText = document.querySelector("[data-code-text]");
  if (codeBox && codeText) {
    if (value) {
      codeText.textContent = value;
      codeBox.hidden = false;
    } else {
      codeBox.hidden = true;
    }
  }

  var copyButton = document.querySelector("[data-copy-code]");
  if (copyButton && value) {
    copyButton.addEventListener("click", function () {
      var done = function () {
        copyButton.textContent = "복사했어요";
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done, function () {});
      }
    });
  }
})();
