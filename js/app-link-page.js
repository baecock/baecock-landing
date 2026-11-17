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
  var query = new URLSearchParams(window.location.search);
  var value = (query.get(param) || "").trim();
  // 초대 링크에는 링크를 공유한 회원(by)이 함께 담겨 있다. "앱에서 열기"로 넘길 때 빠뜨리면 가입한 사람의
  // 가입정보에 "○○님의 초대로 가입"이 남지 않는다. (2026-11-17)
  var inviter = kind === "invite" ? (query.get("by") || "").trim() : "";

  var openButton = document.querySelector("[data-open-app]");
  if (openButton) {
    openButton.href = value
      ? "baekok://open/" + kind + "/?" + param + "=" + encodeURIComponent(value) +
        (inviter ? "&by=" + encodeURIComponent(inviter) : "")
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
