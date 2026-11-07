const assert = require('node:assert/strict');
const { createApp, suite } = require('./harness.cjs');
const S = suite('핵심 로직');

const DAY = 86400000;
// FakeDate가 설치된 상태(테스트 내부)에서만 호출한다
const ymd = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const ymdAt = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

/* ===================== RANKS ===================== */

S.test('RANKS는 11개 계급을 반환한다', () => {
  const app = createApp();
  try { assert.equal(app.RANKS().length, 11); } finally { app.dispose(); }
});

S.test('RANKS 임계값은 0부터 엄격하게 오름차순이다', () => {
  const app = createApp();
  try {
    const r = app.RANKS();
    assert.equal(r[0][0], 0);
    for (let i = 1; i < r.length; i++) assert.ok(r[i][0] > r[i - 1][0], i + '번째 임계값이 오름차순이 아님');
  } finally { app.dispose(); }
});

S.test('RANKS 첫 계급은 [0,입문], 마지막은 [42000,N1 도전]', () => {
  const app = createApp();
  try {
    assert.deepEqual(app.RANKS()[0], [0, '입문']);
    assert.deepEqual(app.RANKS()[10], [42000, 'N1 도전']);
  } finally { app.dispose(); }
});

S.test('RANKS 입문 직후 4개 계급의 임계값과 이름', () => {
  const app = createApp();
  try {
    const r = app.RANKS();
    assert.deepEqual(r[1], [300, '새싹']);
    assert.deepEqual(r[2], [1200, '초급']);
    assert.deepEqual(r[3], [3000, '초급 숙련']);
    assert.deepEqual(r[4], [6000, '중급 입문']);
  } finally { app.dispose(); }
});

S.test('RANKS 중급~고급 5개 계급의 임계값과 이름', () => {
  const app = createApp();
  try {
    const r = app.RANKS();
    assert.deepEqual(r[5], [10000, '중급']);
    assert.deepEqual(r[6], [15000, '중급 숙련']);
    assert.deepEqual(r[7], [21000, '상급 입문']);
    assert.deepEqual(r[8], [28000, '상급']);
    assert.deepEqual(r[9], [35000, '고급']);
  } finally { app.dispose(); }
});

/* ===================== addXp ===================== */

S.test('addXp는 xp를 누적하고 tj.xp에 문자열로 저장한다', () => {
  const app = createApp();
  try {
    const xp0 = app.state.xp;
    assert.equal(typeof xp0, 'number');
    app.addXp(10);
    assert.equal(app.state.xp, xp0 + 10);
    assert.equal(app.storage.getItem('tj.xp'), String(xp0 + 10));
    app.addXp(5);
    assert.equal(app.state.xp, xp0 + 15);
    assert.equal(app.storage.getItem('tj.xp'), String(xp0 + 15));
  } finally { app.dispose(); }
});

S.test('addXp(0)도 값과 저장값을 그대로 갱신한다', () => {
  const app = createApp();
  try {
    app.addXp(7);
    const xp1 = app.state.xp;
    app.addXp(0);
    assert.equal(app.state.xp, xp1);
    assert.equal(app.storage.getItem('tj.xp'), String(xp1));
  } finally { app.dispose(); }
});

/* ===================== _firstSeen ===================== */

S.test('_firstSeen: 처음 본 키는 true이고 tj.seen.k에 기록한다', () => {
  const app = createApp();
  try {
    assert.equal(app._firstSeen('k', '日'), true);
    assert.equal(app.storage.getItem('tj.seen.k'), '["日"]');
  } finally { app.dispose(); }
});

S.test('_firstSeen: 같은 키 재호출은 false(경험치 중복 방지)', () => {
  const app = createApp();
  try {
    assert.equal(app._firstSeen('k', '日'), true);
    assert.equal(app._firstSeen('k', '日'), false);
    assert.equal(app.storage.getItem('tj.seen.k'), '["日"]');
  } finally { app.dispose(); }
});

S.test('_firstSeen: 다른 키는 true이고 목록에 누적된다', () => {
  const app = createApp();
  try {
    app._firstSeen('k', '日');
    assert.equal(app._firstSeen('k', '月'), true);
    assert.deepEqual(JSON.parse(app.storage.getItem('tj.seen.k')), ['日', '月']);
  } finally { app.dispose(); }
});

S.test('_firstSeen: 저장소에 미리 심은 키는 즉시 false', () => {
  const app = createApp({ storage: { 'tj.seen.k': '["日"]' } });
  try {
    assert.equal(app._firstSeen('k', '日'), false);
    assert.equal(app._firstSeen('k', '月'), true);
    assert.deepEqual(JSON.parse(app.storage.getItem('tj.seen.k')), ['日', '月']);
  } finally { app.dispose(); }
});

/* ===================== _loadNum ===================== */

S.test('_loadNum: 숫자 문자열을 파싱한다', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.num.b', '42');
    assert.equal(app._loadNum('tj.num.b', 99), 42);
  } finally { app.dispose(); }
});

S.test('_loadNum: 접두 숫자만 파싱한다(12abc → 12)', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.num.c', '12abc');
    assert.equal(app._loadNum('tj.num.c', 99), 12);
  } finally { app.dispose(); }
});

S.test('_loadNum: 소수점 이하는 잘린다(3.9 → 3)', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.num.d', '3.9');
    assert.equal(app._loadNum('tj.num.d', 99), 3);
  } finally { app.dispose(); }
});

S.test('_loadNum: 음수도 그대로 반환한다', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.num.e', '-7');
    assert.equal(app._loadNum('tj.num.e', 0), -7);
  } finally { app.dispose(); }
});

S.test('_loadNum: 없는 키·빈 문자열은 기본값', () => {
  const app = createApp();
  try {
    assert.equal(app._loadNum('tj.num.none', 99), 99);
    app.storage.setItem('tj.num.g', '');
    assert.equal(app._loadNum('tj.num.g', 99), 99);
  } finally { app.dispose(); }
});

S.test('_loadNum: 파싱 불가 문자열은 기본값', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.num.f', 'abc');
    assert.equal(app._loadNum('tj.num.f', 99), 99);
  } finally { app.dispose(); }
});

/* ===================== _loadJson / _saveJson ===================== */

S.test('_loadJson: 유효한 JSON 객체를 반환한다', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.json.a', '{"x":1}');
    assert.deepEqual(app._loadJson('tj.json.a', null), { x: 1 });
  } finally { app.dispose(); }
});

S.test('_loadJson: 없는 키는 기본값', () => {
  const app = createApp();
  try { assert.equal(app._loadJson('tj.json.missing', 'D'), 'D'); } finally { app.dispose(); }
});

S.test('_loadJson: 저장된 null은 기본값으로 대체된다', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.json.b', 'null');
    assert.equal(app._loadJson('tj.json.b', 'D'), 'D');
  } finally { app.dispose(); }
});

S.test('_loadJson: 잘못된 JSON은 기본값', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.json.c', '{bad json');
    assert.equal(app._loadJson('tj.json.c', 'D'), 'D');
  } finally { app.dispose(); }
});

S.test('_saveJson: 객체를 JSON 문자열로 저장하고 _loadJson으로 복원된다', () => {
  const app = createApp();
  try {
    app._saveJson('tj.json.s', { a: [1, 2] });
    assert.equal(app.storage.getItem('tj.json.s'), '{"a":[1,2]}');
    assert.deepEqual(app._loadJson('tj.json.s', null), { a: [1, 2] });
  } finally { app.dispose(); }
});

S.test('_saveJson: 문자열 값은 JSON 따옴표로 저장된다', () => {
  const app = createApp();
  try {
    app._saveJson('tj.json.t', 'hello');
    assert.equal(app.storage.getItem('tj.json.t'), '"hello"');
    assert.equal(app._loadJson('tj.json.t', null), 'hello');
  } finally { app.dispose(); }
});

/* ===================== _visitStreak ===================== */

S.test('_visitStreak: 기록이 없으면 1이고 {last:오늘,n:1}을 저장한다', () => {
  const app = createApp();
  try {
    assert.equal(app._visitStreak(), 1);
    const s = JSON.parse(app.storage.getItem('tj.streak'));
    assert.equal(s.last, ymd());
    assert.equal(s.n, 1);
  } finally { app.dispose(); }
});

S.test('_visitStreak: 같은 날 재방문은 저장된 streak 값을 그대로 반환한다(n:3 → 3)', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.streak', JSON.stringify({ last: ymd(), n: 3 }));
    assert.equal(app._visitStreak(), 3);
    const s = JSON.parse(app.storage.getItem('tj.streak'));
    assert.equal(s.n, 3);
    assert.equal(s.last, ymd());
  } finally { app.dispose(); }
});

S.test('_visitStreak: 같은 날인데 n이 없으면 1로 취급한다', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.streak', JSON.stringify({ last: ymd() }));
    assert.equal(app._visitStreak(), 1);
  } finally { app.dispose(); }
});

S.test('_visitStreak: 어제 방문 기록이면 n+1 (n:2 → 3)', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.streak', JSON.stringify({ last: ymdAt(Date.now() - DAY), n: 2 }));
    assert.equal(app._visitStreak(), 3);
    assert.equal(JSON.parse(app.storage.getItem('tj.streak')).n, 3);
  } finally { app.dispose(); }
});

S.test('_visitStreak: 어제인데 n이 없으면 (0)+1 = 1', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.streak', JSON.stringify({ last: ymdAt(Date.now() - DAY) }));
    assert.equal(app._visitStreak(), 1);
  } finally { app.dispose(); }
});

S.test('_visitStreak: 3일 전 기록은 끊긴 것으로 보고 1부터 다시', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.streak', JSON.stringify({ last: ymdAt(Date.now() - 3 * DAY), n: 5 }));
    assert.equal(app._visitStreak(), 1);
    const s = JSON.parse(app.storage.getItem('tj.streak'));
    assert.equal(s.n, 1);
    assert.equal(s.last, ymd());
  } finally { app.dispose(); }
});

S.test('_visitStreak: 하루 advance 후 재방문하면 연속 2일', () => {
  const app = createApp();
  try {
    assert.equal(app._visitStreak(), 1);
    app.advance(DAY);
    assert.equal(app._visitStreak(), 2);
    assert.equal(JSON.parse(app.storage.getItem('tj.streak')).n, 2);
  } finally { app.dispose(); }
});

/* ===================== _loadToday / _bumpToday / _ymd ===================== */

S.test('_ymd: 로컬 날짜를 패딩 없는 YYYY-M-D로 반환한다', () => {
  const app = createApp();
  try {
    const d = new Date();
    assert.equal(app._ymd(), d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate());
  } finally { app.dispose(); }
});

S.test('_loadToday: 기록이 없으면 오늘 날짜와 0 카운터를 반환한다', () => {
  const app = createApp();
  try {
    const t = app._loadToday();
    assert.equal(t.d, app._ymd());
    assert.equal(t.k, 0);
    assert.equal(t.w, 0);
    assert.equal(t.q, 0);
    assert.equal(t.g, 0);
  } finally { app.dispose(); }
});

S.test('_loadToday: 오늘 날짜의 기록은 그대로 반환한다', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.today', JSON.stringify({ d: app._ymd(), k: 5, w: 2, q: 1, g: 0 }));
    const t = app._loadToday();
    assert.equal(t.k, 5);
    assert.equal(t.w, 2);
    assert.equal(t.q, 1);
  } finally { app.dispose(); }
});

S.test('_loadToday: 지난 날짜 기록은 버리고 초기화한다', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.today', JSON.stringify({ d: '1999-1-1', k: 9, w: 9, q: 9, g: 9 }));
    const t = app._loadToday();
    assert.equal(t.d, app._ymd());
    assert.equal(t.k, 0);
    assert.equal(t.w, 0);
  } finally { app.dispose(); }
});

S.test('_bumpToday: k 카운트를 1 올리고 tj.today에 저장한다', () => {
  const app = createApp();
  try {
    app._bumpToday('k');
    assert.equal(app.state.today.k, 1);
    const saved = JSON.parse(app.storage.getItem('tj.today'));
    assert.equal(saved.k, 1);
    assert.equal(saved.d, app._ymd());
  } finally { app.dispose(); }
});

S.test('_bumpToday: 같은 필드를 두 번 누르면 2가 된다', () => {
  const app = createApp();
  try {
    app._bumpToday('k');
    app._bumpToday('k');
    assert.equal(app.state.today.k, 2);
    assert.equal(JSON.parse(app.storage.getItem('tj.today')).k, 2);
  } finally { app.dispose(); }
});

S.test('_bumpToday: w를 올려도 k 카운트는 유지된다', () => {
  const app = createApp();
  try {
    app._bumpToday('k');
    app._bumpToday('w');
    assert.equal(app.state.today.k, 1);
    assert.equal(app.state.today.w, 1);
    assert.equal(app.state.today.q, 0);
    assert.equal(app.state.today.g, 0);
  } finally { app.dispose(); }
});

S.test('_bumpToday: 날짜가 바뀌면(advance 24시간) 카운터가 0부터 다시 시작된다', () => {
  const app = createApp();
  try {
    app._bumpToday('k');
    app._bumpToday('k');
    assert.equal(app.state.today.k, 2);
    app.advance(DAY);
    app._bumpToday('k');
    assert.equal(app.state.today.k, 1);
    assert.equal(app.state.today.w, 0);
    assert.equal(app.state.today.q, 0);
    assert.equal(app.state.today.g, 0);
    assert.equal(app.state.today.d, app._ymd());
    assert.equal(JSON.parse(app.storage.getItem('tj.today')).d, app._ymd());
  } finally { app.dispose(); }
});

/* ===================== 스키마 ===================== */

S.test('_schemaVersion: 현재 스키마는 1', () => {
  const app = createApp();
  try { assert.equal(app._schemaVersion(), 1); } finally { app.dispose(); }
});

S.test('_migrate: from < 1은 변환 없이 undefined를 반환한다', () => {
  const app = createApp();
  try { assert.equal(app._migrate(0), undefined); } finally { app.dispose(); }
});

S.test('생성자: 생성 직후 tj.schema 기록이 존재한다', () => {
  const app = createApp();
  try { assert.ok(app.storage.getItem('tj.schema') != null, 'tj.schema가 기록되어 있어야 함'); }
  finally { app.dispose(); }
});

/* ===================== _dayKey / _loadDay ===================== */

S.test("_dayKey: '전체'는 'tj.day', 레벨은 'tj.day.레벨'", () => {
  const app = createApp();
  try {
    assert.equal(app._dayKey('전체'), 'tj.day');
    assert.equal(app._dayKey('N5'), 'tj.day.N5');
    assert.equal(app._dayKey('N4'), 'tj.day.N4');
  } finally { app.dispose(); }
});

S.test('_loadDay: 기록이 없으면 기본값 1', () => {
  const app = createApp();
  try {
    assert.equal(app._loadDay('전체'), 1);
    assert.equal(app._loadDay('N5'), 1);
  } finally { app.dispose(); }
});

S.test('_loadDay: 저장된 값을 읽는다(7)', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.day.N5', '7');
    assert.equal(app._loadDay('N5'), 7);
    app.storage.setItem('tj.day', '12');
    assert.equal(app._loadDay('전체'), 12);
  } finally { app.dispose(); }
});

S.test('_loadDay: 0·음수·불량값은 1로 클램프된다', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.day', '0');
    assert.equal(app._loadDay('전체'), 1);
    app.storage.setItem('tj.day.N4', '-5');
    assert.equal(app._loadDay('N4'), 1);
    app.storage.setItem('tj.day.N3', 'abc');
    assert.equal(app._loadDay('N3'), 1);
  } finally { app.dispose(); }
});

/* ===================== _normSearch ===================== */

S.test('_normSearch: null·빈 문자열은 빈 문자열', () => {
  const app = createApp();
  try {
    assert.equal(app._normSearch(null), '');
    assert.equal(app._normSearch(''), '');
    assert.equal(app._normSearch(undefined), '');
  } finally { app.dispose(); }
});

S.test('_normSearch: 공백을 제거하고 소문자로 바꾼다', () => {
  const app = createApp();
  try {
    assert.equal(app._normSearch('  AbC  '), 'abc');
    assert.equal(app._normSearch(' Word '), 'word');
  } finally { app.dispose(); }
});

S.test('_normSearch: 한글은 trim만 적용된다', () => {
  const app = createApp();
  try { assert.equal(app._normSearch('  단어 '), '단어'); } finally { app.dispose(); }
});

S.test('_normSearch: 숫자도 문자열로 정규화된다', () => {
  const app = createApp();
  try { assert.equal(app._normSearch(123), '123'); } finally { app.dispose(); }
});

/* ===================== _mnKnownMap / _mnSaveKnown ===================== */

S.test('_mnKnownMap: 저장소가 비어 있으면 빈 객체', () => {
  const app = createApp();
  try { assert.deepEqual(app._mnKnownMap(), {}); } finally { app.dispose(); }
});

S.test('_mnKnownMap: 저장된 맵을 그대로 반환한다', () => {
  const app = createApp({ storage: { 'tj.mn.known': '{"N5":["日"]}' } });
  try { assert.deepEqual(app._mnKnownMap(), { N5: ['日'] }); } finally { app.dispose(); }
});

S.test('_mnKnownMap: 잘못된 JSON이면 빈 객체', () => {
  const app = createApp({ storage: { 'tj.mn.known': '{bad' } });
  try { assert.deepEqual(app._mnKnownMap(), {}); } finally { app.dispose(); }
});

S.test('_mnSaveKnown: 현재 맵을 tj.mn.known에 JSON으로 저장한다', () => {
  const app = createApp();
  try {
    const m = app._mnKnownMap();
    m.N4 = ['語'];
    app._mnSaveKnown();
    assert.equal(app.storage.getItem('tj.mn.known'), JSON.stringify({ N4: ['語'] }));
  } finally { app.dispose(); }
});

/* ===================== toggleKanji / toggleWord ===================== */

S.test('toggleKanji: 공개 시 목록 저장·XP 불변·오늘 한자 카운트+1', () => {
  const app = createApp();
  try {
    const xp0 = app.state.xp;
    const k0 = app.state.today ? app.state.today.k : 0;
    app.toggleKanji('日');
    assert.deepEqual(app.state.revealedKanji, ['日']);
    assert.equal(app.storage.getItem('tj.rev.k'), '["日"]');
    assert.equal(app.storage.getItem('tj.seen.k'), '["日"]');
    assert.equal(app.state.xp, xp0);   // 뜻 보기만으로는 XP를 주지 않는다
    assert.equal(app.state.today.k, k0 + 1);
  } finally { app.dispose(); }
});

S.test('toggleKanji: 다시 누르면 목록에서 제거되고 XP는 불변', () => {
  const app = createApp();
  try {
    app.toggleKanji('日');
    const xp1 = app.state.xp;
    app.toggleKanji('日');
    assert.deepEqual(app.state.revealedKanji, []);
    assert.equal(app.storage.getItem('tj.rev.k'), '[]');
    assert.equal(app.state.xp, xp1);
  } finally { app.dispose(); }
});

S.test('toggleKanji: 접었다 다시 펴도 XP가 중복되지 않는다', () => {
  const app = createApp();
  try {
    app.toggleKanji('日');
    const xp1 = app.state.xp;
    const k1 = app.state.today.k;
    app.toggleKanji('日');
    app.toggleKanji('日');
    assert.deepEqual(app.state.revealedKanji, ['日']);
    assert.equal(app.state.xp, xp1);
    assert.equal(app.state.today.k, k1);
  } finally { app.dispose(); }
});

S.test('toggleKanji: 미리 본 적 있는 한자는 XP·카운트 없이 공개만 된다', () => {
  const app = createApp({ storage: { 'tj.seen.k': '["日"]' } });
  try {
    const xp0 = app.state.xp;
    const k0 = app.state.today ? app.state.today.k : 0;
    app.toggleKanji('日');
    assert.deepEqual(app.state.revealedKanji, ['日']);
    assert.equal(app.storage.getItem('tj.rev.k'), '["日"]');
    assert.equal(app.state.xp, xp0);
    assert.equal(app.state.today ? app.state.today.k : 0, k0);
  } finally { app.dispose(); }
});

S.test('toggleKanji: 여러 키는 공개 순서대로 쌓인다', () => {
  const app = createApp();
  try {
    app.toggleKanji('日');
    app.toggleKanji('月');
    assert.deepEqual(app.state.revealedKanji, ['日', '月']);
    app.toggleKanji('日');
    assert.deepEqual(app.state.revealedKanji, ['月']);
    assert.equal(app.storage.getItem('tj.rev.k'), '["月"]');
  } finally { app.dispose(); }
});

S.test('toggleWord: 공개 시 XP+1·tj.rev.w 저장·오늘 단어 카운트+1', () => {
  const app = createApp();
  try {
    const xp0 = app.state.xp;
    const w0 = app.state.today ? app.state.today.w : 0;
    app.toggleWord('本');
    assert.deepEqual(app.state.revealedWord, ['本']);
    assert.equal(app.storage.getItem('tj.rev.w'), '["本"]');
    assert.equal(app.storage.getItem('tj.seen.w'), '["本"]');
    assert.equal(app.state.xp, xp0 + 1);
    assert.equal(app.state.today.w, w0 + 1);
  } finally { app.dispose(); }
});

S.test('toggleWord: 다시 누르면 제거되고, 재공개해도 XP가 중복되지 않는다', () => {
  const app = createApp();
  try {
    app.toggleWord('本');
    const xp1 = app.state.xp;
    app.toggleWord('本');
    assert.deepEqual(app.state.revealedWord, []);
    assert.equal(app.storage.getItem('tj.rev.w'), '[]');
    assert.equal(app.state.xp, xp1);
    app.toggleWord('本');
    assert.deepEqual(app.state.revealedWord, ['本']);
    assert.equal(app.state.xp, xp1);
  } finally { app.dispose(); }
});

/* ===================== 화면 ===================== */

S.test('_validScreens: 9개 화면이 정해진 순서로 반환된다', () => {
  const app = createApp();
  try {
    assert.deepEqual(app._validScreens(), ['home', 'kanji', 'mnemonic', 'word', 'practical', 'notebook', 'quiz', 'grammar', 'writing']);
  } finally { app.dispose(); }
});

S.test('_screenFromHash: 빈 해시는 기본 home', () => {
  const app = createApp({ hash: '' });
  try { assert.equal(app._screenFromHash(), 'home'); } finally { app.dispose(); }
});

S.test('_screenFromHash: #/quiz → quiz', () => {
  const app = createApp({ hash: '#/quiz' });
  try { assert.equal(app._screenFromHash(), 'quiz'); } finally { app.dispose(); }
});

S.test('_screenFromHash: 슬래시 없는 #word 도 word 로 인식된다', () => {
  const app = createApp({ hash: '#word' });
  try { assert.equal(app._screenFromHash(), 'word'); } finally { app.dispose(); }
});

S.test('_screenFromHash: 쿼리스트링은 무시된다 (#!/quiz?x=1 → quiz)', () => {
  const app = createApp({ hash: '#/quiz?x=1' });
  try { assert.equal(app._screenFromHash(), 'quiz'); } finally { app.dispose(); }
});

S.test('_screenFromHash: 하위 경로는 첫 세그먼트만 (#/home/2 → home)', () => {
  const app = createApp({ hash: '#/home/2' });
  try { assert.equal(app._screenFromHash(), 'home'); } finally { app.dispose(); }
});

S.test('_screenFromHash: 무효 해시는 기본 home', () => {
  const app = createApp({ hash: '#/bogus' });
  try { assert.equal(app._screenFromHash(), 'home'); } finally { app.dispose(); }
});

S.test('_screenFromHash: 무효 해시일 때는 fallback 인자를 쓴다', () => {
  const app = createApp({ hash: '#/bogus' });
  try { assert.equal(app._screenFromHash('kanji'), 'kanji'); } finally { app.dispose(); }
});

S.test('_screenFromHash: 유효 해시가 fallback보다 우선한다', () => {
  const app = createApp({ hash: '#/quiz' });
  try { assert.equal(app._screenFromHash('kanji'), 'quiz'); } finally { app.dispose(); }
});

S.test('setScreen: state.screen을 갱신한다', () => {
  const app = createApp();
  try {
    app.setScreen('quiz');
    assert.equal(app.state.screen, 'quiz');
    app.setScreen('grammar');
    assert.equal(app.state.screen, 'grammar');
  } finally { app.dispose(); }
});

/* ===================== 다크 모드 ===================== */

S.test('초기 다크: 저장값이 없으면 시스템 라이트를 따른다 (false)', () => {
  const app = createApp({ dark: false });
  try { assert.equal(app.state.dark, false); } finally { app.dispose(); }
});

S.test('초기 다크: 저장값이 없으면 시스템 다크를 따른다 (true)', () => {
  const app = createApp({ dark: true });
  try { assert.equal(app.state.dark, true); } finally { app.dispose(); }
});

S.test('초기 다크: 저장된 tj.dark=1이 시스템(라이트)보다 우선한다', () => {
  const app = createApp({ storage: { 'tj.dark': '1' }, dark: false });
  try { assert.equal(app.state.dark, true); } finally { app.dispose(); }
});

S.test('초기 다크: 저장된 tj.dark=0이 시스템(다크)보다 우선한다', () => {
  const app = createApp({ storage: { 'tj.dark': '0' }, dark: true });
  try { assert.equal(app.state.dark, false); } finally { app.dispose(); }
});

S.test('toggleDark: 켜면 tj.dark=1 저장 + hh-dark 클래스 추가', () => {
  const app = createApp({ dark: false });
  try {
    app.toggleDark();
    assert.equal(app.state.dark, true);
    assert.equal(app.storage.getItem('tj.dark'), '1');
    assert.ok(app.htmlClasses.has('hh-dark'));
  } finally { app.dispose(); }
});

S.test('toggleDark: 끄면 tj.dark=0 저장 + hh-dark 클래스 제거', () => {
  const app = createApp({ dark: true });
  try {
    app.toggleDark();
    assert.equal(app.state.dark, false);
    assert.equal(app.storage.getItem('tj.dark'), '0');
    assert.ok(!app.htmlClasses.has('hh-dark'));
  } finally { app.dispose(); }
});

/* ===================== _nudges / 알림 ===================== */

S.test('_nudges: 신규 사용자는 모든 알림이 꺼져 있고 "백업 없음 0일" 문구', () => {
  const app = createApp();
  try {
    const n = app._nudges();
    assert.equal(n.a2hs, false);
    assert.equal(n.due, false);
    assert.equal(n.install, false);
    assert.equal(n.text, '아직 백업한 적이 없어요. 기록을 시작한 지 0일이 지났어요. 파일로 저장해 두면 기기를 바꿔도 이어서 할 수 있어요.');
  } finally { app.dispose(); }
});

S.test('_nudges: 기록 있음 + firstAt 7일 전 → due true, "7일" 문구', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.nudge.firstAt', String(Date.now() - 7 * DAY));
    app.addXp(1);
    const n = app._nudges();
    assert.equal(n.due, true);
    assert.equal(n.text, '아직 백업한 적이 없어요. 기록을 시작한 지 7일이 지났어요. 파일로 저장해 두면 기기를 바꿔도 이어서 할 수 있어요.');
  } finally { app.dispose(); }
});

S.test('_nudges: firstAt 6일 전이면 아직 due 아님', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.nudge.firstAt', String(Date.now() - 6 * DAY));
    app.addXp(1);
    assert.equal(app._nudges().due, false);
  } finally { app.dispose(); }
});

S.test('_nudges: 기록이 없으면 7일이 지나도 due 아님', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.nudge.firstAt', String(Date.now() - 7 * DAY));
    assert.equal(app._nudges().due, false);
  } finally { app.dispose(); }
});

S.test('_nudges: snooze가 미래면 due가 막힌다', () => {
  const app = createApp();
  try {
    app.storage.setItem('tj.nudge.firstAt', String(Date.now() - 7 * DAY));
    app.storage.setItem('tj.nudge.snooze', String(Date.now() + 1));
    app.addXp(1);
    assert.equal(app._nudges().due, false);
  } finally { app.dispose(); }
});

S.run().then((r) => process.exit(r.fail ? 1 : 0));
