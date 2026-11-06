/* PWA 보조 스크립트 — 서비스 워커 등록 + 「앱으로 설치」 이벤트 보관.
 * (index.html 인라인 script는 support.js가 camelCase를 바꿔 깨뜨리므로 외부 파일로 둔다.) */
(function () {
  try {
    // 설치 이벤트: 앱이 늦게 떠도 놓치지 않도록 window.__bip에 보관한다.
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      window.__bip = e;
      try { window.dispatchEvent(new Event('bufs-install-ready')); } catch (_) {}
    });
    window.addEventListener('appinstalled', function () {
      window.__bip = null;
      try { localStorage.setItem('tj.nudge.install', '1'); } catch (_) {}
      try { window.dispatchEvent(new Event('bufs-install-done')); } catch (_) {}
    });
    // 서비스 워커 등록(HTTPS·localhost에서만 동작, 실패해도 앱은 그대로 동작)
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  } catch (_) {}
})();
