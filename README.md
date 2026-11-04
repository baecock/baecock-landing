# 배콕 (Baecock) 소개 페이지

배드민턴 동호회 운영 앱 **배콕**의 사전 홍보용 랜딩 웹사이트입니다.

배콕의 핵심 가치는 두 축입니다 — 밴드, 엑셀, 카카오톡, 종이로 흩어진 **동호회 운영**을 하나의 앱으로 모으는 것과, 그 활동을 바탕으로 **나의 배드민턴 성장 스토리**를 기록하는 것. 이 사이트는 방문자가 배콕이 어떤 서비스인지 이해하고, 앱 설치까지 자연스럽게 이어지도록 안내합니다. 웹사이트 자체는 앱의 기능을 그대로 제공하지 않으며, 서비스 소개와 정보 제공 역할에 집중합니다.

## 기술 스택

빌드 도구, 백엔드, DB, 로그인 연동이 전혀 없는 **완전 정적 사이트**입니다.

- HTML / CSS / Vanilla JavaScript
- 별도의 패키지 매니저나 빌드 과정 없이 브라우저에서 바로 실행

## 페이지 구성

| 파일 | 설명 |
| --- | --- |
| `index.html` | 소개 페이지 (Hero, 동호회 관리 · 개인 성장 두 축 소개, 실제 앱 화면 미리 보기, 출시 알림) |
| `features.html` | 전체 기능 소개 페이지 (동호회 관리 / 개인의 성장 스토리) |
| `guide.html` | 배드민턴 동호회 관리 가이드 (카테고리별 상세 안내 + FAQ) |
| `terms.html` | 이용약관 |
| `privacy.html` | 개인정보처리방침 |
| `delete-account/` | 계정 삭제(회원탈퇴) 안내 — Google Play "계정 삭제 URL"로 등록할 페이지 |
| `invite/`, `posts/`, `lesson/` | 앱 공유 링크(동호회 초대·게시글·레슨방 초대)가 앱으로 바로 열리지 않을 때 보이는 안내 페이지 (앱 TASK-202) |

## 폴더 구조

```
.
├── index.html
├── features.html
├── guide.html
├── terms.html
├── privacy.html
├── CNAME            # 커스텀 도메인 baekok.cloud (GitHub Pages)
├── .nojekyll        # .well-known 폴더를 GitHub Pages가 그대로 올리도록
├── .well-known/     # 앱 링크 인증 파일 (iOS apple-app-site-association, Android assetlinks.json)
├── invite/ posts/ lesson/   # 공유 링크 안내 페이지
├── assets/images/screens/   # 홈 "앱 화면 미리 보기" 6장 (webp, Figma XhTz 파일 섹션 563:10355에서 3배 내보내기 → 600폭)
├── css/
│   ├── tokens.css   # 색상/간격/반경 등 디자인 토큰
│   └── style.css
└── js/
    ├── site-header.js
    ├── site-footer.js
    ├── header-scroll.js
    ├── guide-nav.js
    ├── reveal.js
    ├── scroll-top.js
    ├── launch-alert.js  # 출시 알림 구글폼 주소 (출시 전용)
    └── app-link-page.js # 공유 링크 안내 페이지의 "앱에서 열기"·코드 표시
```

## 실행 방법

빌드 과정이 없으므로 `index.html`을 브라우저에서 바로 열거나, 로컬 서버로 띄워서 확인할 수 있습니다.

```bash
npx serve .
```

## 주요 원칙

- 이 사이트는 앱의 웹 버전이 아닙니다. 회원 관리, 회비 관리 등 실제 앱 기능은 배콕 앱에서 제공됩니다.
- 커뮤니티 탭, 블로그 등은 스코프 밖입니다.
- 실제 App Store / Google Play 링크가 확정되기 전까지 다운로드 배지는 비활성 상태(출시 준비 중)로 표시합니다.
- 기능 설명은 앱에 실제로 들어간 기능만 적습니다. 출시 후로 미룬 기능(사진첩, 칭호·배지, 포인트·리워드 등)은 넣지 않습니다.
- 홍보 문구에 "무료", "AI 추천" 같은 표현을 쓰지 않습니다.

## 출시 후 할 일

- 개인정보처리방침·이용약관·계정 삭제 안내의 "서비스 출시일부터 시행"을 실제 날짜(예: 2026년 12월 1일)로 바꾸고, 이후 개정하면 이전 버전을 남겨 둡니다.
- Google Play Console → 앱 콘텐츠 → 데이터 보안의 계정 삭제 URL에 `https://baekok.cloud/delete-account/`를 넣습니다.

- `data-launch-alert`가 붙은 "출시 알림 받기" 버튼(헤더, 홈 히어로·마지막 섹션, 기능 소개 CTA, 가이드 FAQ)을 지우거나 스토어 링크로 바꾸고, `js/launch-alert.js`와 각 페이지의 script 태그를 지웁니다.
- 홈 마지막 섹션의 스토어 배지를 실제 App Store / Google Play 링크로 연결합니다.
- `invite/`, `posts/`, `lesson/` 안내 페이지의 "출시 알림 받기"를 스토어 버튼으로 바꿉니다.
- Play Console 앱 서명을 켜면 업로드 키·앱 서명 키의 SHA-256을 `.well-known/assetlinks.json`에 추가합니다(지금은 개발용 debug 키만 있음).
