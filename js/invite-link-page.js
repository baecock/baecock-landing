/*
  짧은 초대 링크 페이지(/i/{토큰}) 스크립트. (2026-11-24)
  동호회 이름·초대 코드·"앱에서 열기" 주소는 Cloudflare Worker가 HTML에 미리 채워 두고, 이 스크립트는
  화면 동작만 맡는다.
  - 코드 복사: 클립보드 API가 막힌 인앱 브라우저를 위해 선택 복사로 한 번 더 시도한다.
  - 앱에서 열기: 눌렀는데 잠시 뒤에도 페이지가 그대로 보이면(앱 미설치·열기 실패) 코드 입력 안내를 보여 준다.
  - 동호회 사진을 못 불러오면 배콕 아이콘으로 바꾼다.
*/
(function () {
  var FALLBACK_IMAGE = "assets/images/og-invite.png";

  var image = document.querySelector("[data-invite-club-image]");
  if (image) {
    var useFallback = function () {
      if (image.getAttribute("src") !== FALLBACK_IMAGE) image.setAttribute("src", FALLBACK_IMAGE);
    };
    image.addEventListener("error", useFallback);
    if (image.complete && image.naturalWidth === 0) useFallback();
  }

  var codeText = document.querySelector("[data-invite-code]");
  var copyButton = document.querySelector("[data-copy-code]");
  var copyStatus = document.querySelector("[data-copy-status]");

  function showCopied(ok) {
    if (copyButton) copyButton.textContent = ok ? "복사했어요" : "코드 복사";
    if (copyStatus) {
      copyStatus.textContent = ok
        ? "초대 코드를 복사했어요."
        : "복사하지 못했어요. 코드를 길게 눌러 직접 복사해 주세요.";
    }
  }

  function copyBySelection(value) {
    var field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.className = "invite-code__clipboard";
    document.body.appendChild(field);
    field.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    document.body.removeChild(field);
    return ok;
  }

  if (copyButton && codeText) {
    copyButton.addEventListener("click", function () {
      var value = (codeText.textContent || "").trim();
      if (!value || /^-+$/.test(value)) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(
          function () {
            showCopied(true);
          },
          function () {
            showCopied(copyBySelection(value));
          }
        );
      } else {
        showCopied(copyBySelection(value));
      }
    });
  }

  var fallback = document.querySelector("[data-open-fallback]");
  var steps = document.getElementById("invite-steps");
  var openTimer = null;

  function cancelOpenTimer() {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) cancelOpenTimer();
  });
  window.addEventListener("pagehide", cancelOpenTimer);

  document.querySelectorAll("[data-open-app]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!fallback) return;
      cancelOpenTimer();
      openTimer = setTimeout(function () {
        openTimer = null;
        if (document.hidden) return;
        fallback.hidden = false;
        if (steps && steps.scrollIntoView) steps.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 1600);
    });
  });

  var reloadButton = document.querySelector("[data-reload]");
  if (reloadButton) {
    reloadButton.addEventListener("click", function () {
      window.location.reload();
    });
  }
})();
