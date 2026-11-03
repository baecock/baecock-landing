/*
  출시 전 "출시 알림 받기" 버튼이 여는 구글폼 주소.
  data-launch-alert가 붙은 링크는 모두 이 주소로 연결된다.
  출시 후에는 data-launch-alert 버튼을 지우거나 스토어 링크로 바꾸고, 이 파일을 지운다.
*/
(function () {
  var LAUNCH_ALERT_URL = "https://forms.gle/roARwu3qbQithTn68";

  document.querySelectorAll("a[data-launch-alert]").forEach(function (link) {
    link.href = LAUNCH_ALERT_URL;
    link.target = "_blank";
    link.rel = "noopener";
  });
})();
