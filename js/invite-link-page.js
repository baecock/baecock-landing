/*
  짧은 초대 링크 페이지(/i/?t={토큰}) 스크립트. (2026-11-24, 2026-11-26 브라우저 조회 방식 추가)
  - 조회: 주소의 t 값으로 Supabase RPC get_club_invite_link를 불러 동호회 이름·사진·초대 코드를 채운다
    (서버 없이 GitHub Pages만 쓰는 현재 방식). 앱과 같은 공개 키(publishable)만 쓰며 서버 비밀 키는 없다.
    Cloudflare Worker가 이미 채워 준 경우(body[data-invite-state]가 loading이 아님)에는 다시 조회하지 않는다.
  - 코드 복사: 클립보드 API가 막힌 인앱 브라우저를 위해 선택 복사로 한 번 더 시도한다.
  - 앱에서 열기: 눌렀는데 잠시 뒤에도 페이지가 그대로 보이면(앱 미설치·열기 실패) 코드 입력 안내를 보여 준다.
  - 동호회 사진을 못 불러오면 배콕 아이콘으로 바꾼다.
  운영 서버를 따로 만들면 아래 SUPABASE_URL·SUPABASE_PUBLISHABLE_KEY를 그 값으로 바꾼다.
*/
(function () {
  var SUPABASE_URL = "https://kwtphdchnikoitzfejzh.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mz2KTY17tIcOSql48yFafQ_QftZ9_nh";
  var TOKEN_PATTERN = /^[A-Za-z0-9]{6,32}$/;

  // 짧은 링크 토큰: ?t={토큰}. 나중에 서버가 /i/{토큰} 주소를 처리하게 되면 그 형식도 읽는다.
  function readToken() {
    var fromQuery = (new URLSearchParams(window.location.search).get("t") || "").trim();
    if (TOKEN_PATTERN.test(fromQuery)) return fromQuery;
    var match = /^\/i\/([^/]+)\/?$/.exec(window.location.pathname);
    return match && TOKEN_PATTERN.test(match[1]) ? match[1] : "";
  }

  var token = readToken();

  function setState(state) {
    document.body.setAttribute("data-invite-state", state);
  }

  // 앱에서 열기 주소: 토큰이 있으면 앱이 같은 초대를 열고, 없으면 앱만 연다.
  document.querySelectorAll("[data-open-app]").forEach(function (link) {
    link.setAttribute("href", token ? "baekok://open/i/?t=" + encodeURIComponent(token) : "baekok://open/");
  });

  function storageImageUrl(path) {
    var clean = String(path || "")
      .split("/")
      .filter(function (part) { return part && part !== "." && part !== ".."; })
      .map(encodeURIComponent)
      .join("/");
    return clean ? SUPABASE_URL + "/storage/v1/object/public/club-images/" + clean : "";
  }

  function showInvite(row) {
    var name = String(row.club_name || "").replace(/\s+/g, " ").trim() || "배콕 동호회";
    var clubName = document.querySelector("[data-invite-club-name]");
    var codeText = document.querySelector("[data-invite-code]");
    var image = document.querySelector("[data-invite-club-image]");
    if (clubName) clubName.textContent = name;
    if (codeText) codeText.textContent = String(row.invite_code || "").trim();
    if (image) {
      var photo = storageImageUrl(row.club_image_path);
      if (photo) image.setAttribute("src", photo);
      image.setAttribute("alt", "'" + name + "' 동호회 대표 사진");
    }
    document.title = "'" + name + "' 동호회 초대장 | 배콕(BaeKOK)";
    setState("ready");
  }

  function loadInvite() {
    if (!token) {
      setState("missing");
      return;
    }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 8000);
    var headers = { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json", Accept: "application/json" };
    if (SUPABASE_PUBLISHABLE_KEY.indexOf("eyJ") === 0) headers.Authorization = "Bearer " + SUPABASE_PUBLISHABLE_KEY;
    fetch(SUPABASE_URL + "/rest/v1/rpc/get_club_invite_link", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ p_token: token }),
      signal: controller.signal,
      referrerPolicy: "no-referrer",
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (rows) {
        var row = Array.isArray(rows) ? rows[0] : null;
        if (row && String(row.invite_code || "").trim()) showInvite(row);
        else setState("missing");
      })
      .catch(function () { setState("error"); })
      .then(function () { clearTimeout(timer); });
  }

  // Worker가 이미 채워 준 페이지(ready·missing·error)는 그대로 둔다.
  if (document.body.getAttribute("data-invite-state") === "loading") loadInvite();
})();

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
