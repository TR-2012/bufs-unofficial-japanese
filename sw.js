/* BUFS 비공식 일본어 학습 — 서비스 워커 (설치·오프라인용)
 *
 * 전략
 *  - 화면·스크립트·데이터(같은 출처): 네트워크 우선(4초) → 실패하면 저장본. 배포하면 항상 최신이 보이고, 오프라인이면 저장본이 열린다.
 *  - 음성(audio/*.mp3): 저장본 우선 → 없으면 받아서 저장(재생한 문장만 쌓인다, 상한 MAX_AUDIO개).
 *  - 외부 요청은 건드리지 않는다.
 *
 * 규칙: 미리 저장할 파일 목록(SHELL)을 바꾸면 CACHE 이름의 숫자를 올린다(이전 캐시는 activate에서 지워진다).
 *
 * ★ 문제가 생겼을 때(서비스 워커를 모든 기기에서 끄기):
 *   이 파일 전체를 아래 두 줄로 바꿔 배포한다. 기기들이 새 sw.js를 받는 즉시 스스로 등록을 해제하고 캐시를 지운다.
 *     self.addEventListener('install', () => self.skipWaiting());
 *     self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.map(c => caches.delete(c)))).then(() => self.registration.unregister())));
 *   (파일을 그냥 삭제하면 이미 설치된 기기에는 남아 있으므로 위 방법을 쓴다.)
 */
/** @type {ServiceWorkerGlobalScope} */
// @ts-ignore  서비스 워커의 전역(self)을 서비스 워커 타입으로 본다
const sw = self;
const CACHE = 'bufs-v2';
const AUDIO = 'bufs-audio-v1';
const MAX_AUDIO = 800;
const NET_TIMEOUT = 4000;

const SHELL = [
  './', 'index.html', 'support.js', 'tts.js', 'combo_check.js', 'pwa.js', 'haruko.jpg',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon-180.png',
  'vendor/react-18.3.1.min.js', 'vendor/react-dom-18.3.1.min.js',
  'data/kanji.json', 'data/words.json', 'data/grammar.json', 'data/writing.json', 'data/writing_combo.json', 'data/quiz_core.json',
];

sw.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 한 파일이 실패해도 설치 전체가 막히지 않게 하나씩 담는다
      .then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => sw.skipWaiting())
  );
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== AUDIO).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim())
  );
});

function networkFirst(req) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
    const timer = setTimeout(() => {
      fromCache().then((r) => { if (r && !settled) { settled = true; resolve(r); } });
    }, NET_TIMEOUT);
    fetch(req).then((res) => {
      clearTimeout(timer);
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      if (!settled) { settled = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      fromCache().then((r) => { if (!settled) { settled = true; resolve(r || Response.error()); } });
    });
  });
}

async function audioCacheFirst(req) {
  const cache = await caches.open(AUDIO);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.status === 200 && res.type === 'basic') {
    cache.put(req, res.clone()).then(async () => {
      const keys = await cache.keys();
      if (keys.length > MAX_AUDIO) {
        for (const k of keys.slice(0, keys.length - MAX_AUDIO)) await cache.delete(k);
      }
    }).catch(() => {});
  }
  return res;
}

sw.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;
  if (req.headers.has('range')) return;            // Range 요청은 브라우저에 맡긴다
  if (/\/audio\/.+\.mp3$/.test(url.pathname)) { e.respondWith(audioCacheFirst(req)); return; }
  e.respondWith(networkFirst(req));
});
