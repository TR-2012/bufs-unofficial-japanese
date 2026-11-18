/* global module */
// 저장값 검사기 — 브라우저(window.TJStore)와 Node(require) 양쪽에서 쓰는 순수 함수 모음.
//
// localStorage의 tj.* 값은 남이 준 백업 파일로도 들어올 수 있다. 모양이 틀린 값을 그대로 쓰면
// 앱이 열리지 않거나 전역 객체(Object.prototype)가 오염되므로, 읽을 때와 백업을 불러올 때 여기서 걸러 낸다.
// 읽기 함수는 예외를 던지지 않고 저장값을 고치지도 않는다. 모양이 틀리면 빈 기본값을 돌려준다.
/** @param {any} root @param {() => any} factory */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TJStore = factory();
})(/** @type {any} */ (typeof self !== 'undefined' ? self : this), function () {
  const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
  const QUIZ_LEVELS = ['전체'].concat(JLPT_LEVELS);
  const SEEN_KINDS = ['k', 'w', 'm', 'g', 'wm', 'ws'];
  const WRITE_EXTRA_SUBS = { sentence: ['basic', 'mid', 'adv'], keigo: ['sonkei', 'kenjo', 'settai'], free: ['daily', 'opinion', 'es'], biz: ['mail', 'report'] };
  // 한자·단어 항목에서 숫자·참거짓이어도 되는 필드(나머지 필드는 글자만 받는다)
  const NUMBER_FIELDS = ['strokes', 'grade', 'year', 'day', 'practical'];
  const FLAG_FIELDS = ['cognate'];
  const PROMPT_FIELDS = ['prompt', 'model', 'note', 'ko', 'ex'];
  const TODAY_COUNTERS = ['k', 'w', 'q', 'g'];
  const COUNT_TEXT = /^\d{1,15}$/;
  const SKIPPED_PREFIX = 'tj.nudge.';   // 안내용 키: 백업에 넣지도, 불러오지도 않는다
  const SCHEMA_KEY = 'tj.schema';       // 앱이 직접 기록한다

  function parseJson(raw) { try { return JSON.parse(raw); } catch (e) { return undefined; } }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isCount(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0; }
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined; }
  function text(v) { return typeof v === 'string' ? v : ''; }
  function textList(v) { return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; }
  function objectList(v) { return Array.isArray(v) ? v.filter(isPlainObject) : []; }

  // 글자 배열(펼친 카드·이미 본 항목). 예: tj.rev.k, tj.seen.w
  function readTextList(raw) { return textList(parseJson(raw)); }

  // 일반 객체를 그대로. 예: tj.mn.known = {"日":1}
  function readPlainObject(raw) {
    const parsed = parseJson(raw);
    return isPlainObject(parsed) ? parsed : {};
  }

  // 오늘의 진도 {d,k,w,q,g}. 오늘 것이 아니거나 숫자가 아닌 칸이 있으면 null.
  function readToday(raw, todayYmd) {
    const parsed = parseJson(raw);
    if (!isPlainObject(parsed) || parsed.d !== todayYmd) return null;
    const countersOk = TODAY_COUNTERS.every((name) => own(parsed, name) === undefined || isCount(parsed[name]));
    return countersOk ? parsed : null;
  }

  function cleanRecord(item) {
    const out = {};
    for (const key of Object.keys(item)) {
      const value = item[key];
      const keep = typeof value === 'string'
        || (typeof value === 'number' && Number.isFinite(value) && NUMBER_FIELDS.includes(key))
        || (typeof value === 'boolean' && FLAG_FIELDS.includes(key));
      if (keep && key !== '__proto__') out[key] = value;
    }
    return out;
  }

  // 한자·단어 추가분. idField('char' 또는 'word')가 글자인 항목만, 필드는 타입이 맞는 것만 남긴다.
  function readRecordList(raw, idField) {
    return objectList(parseJson(raw))
      .filter((item) => typeof own(item, idField) === 'string' && item[idField])
      .map(cleanRecord);
  }

  function cleanGrammarUnit(unit) {
    return {
      pattern: unit.pattern, gloss: text(unit.gloss), explain: text(unit.explain), rules: textList(unit.rules),
      examples: objectList(unit.examples).map((e) => ({ jp: text(e.jp), kr: text(e.kr) })),
      checks: objectList(unit.checks).map((c) => ({ q: text(c.q), options: textList(c.options), a: isCount(c.a) ? c.a : 0, explain: text(c.explain) })),
    };
  }

  // 문법 추가분 {N5..N1: 단원[]}. 데이터의 키가 아니라 정해진 급수 목록을 돈다(__proto__ 같은 키를 쓰지 않는다).
  function readGrammarExtra(raw) {
    const parsed = parseJson(raw);
    const out = {};
    for (const level of JLPT_LEVELS) {
      const units = isPlainObject(parsed) ? own(parsed, level) : undefined;
      out[level] = objectList(units).filter((u) => typeof u.pattern === 'string' && u.pattern).map(cleanGrammarUnit);
    }
    return out;
  }

  function cleanPrompt(item) {
    const out = {};
    for (const field of PROMPT_FIELDS) { if (typeof item[field] === 'string') out[field] = item[field]; }
    return out;
  }

  // 작문 추가분 {탭:{하위:문제[]}}. 정해진 탭·하위 목록만 돈다.
  function readWriteExtra(raw) {
    const parsed = parseJson(raw);
    const out = {};
    for (const tab of Object.keys(WRITE_EXTRA_SUBS)) {
      const group = isPlainObject(parsed) ? own(parsed, tab) : undefined;
      out[tab] = {};
      for (const sub of WRITE_EXTRA_SUBS[tab]) {
        const prompts = isPlainObject(group) ? own(group, sub) : undefined;
        out[tab][sub] = objectList(prompts).filter((p) => typeof p.prompt === 'string' && p.prompt).map(cleanPrompt);
      }
    }
    return out;
  }

  // ---------- 백업 불러오기: 키마다 최상위 모양만 본다(항목 안쪽은 위 읽기 함수가 거른다) ----------
  const isCountText = (value) => COUNT_TEXT.test(value);
  const isFlagText = (value) => value === '0' || value === '1';
  const isQuizLevel = (value) => QUIZ_LEVELS.includes(value);
  const isJsonList = (value) => Array.isArray(parseJson(value));
  const isJsonObject = (value) => isPlainObject(parseJson(value));

  const KEY_RULES = {
    'tj.xp': isCountText, 'tj.solved': isCountText, 'tj.day': isCountText, 'tj.dark': isFlagText, 'tj.quiz.level': isQuizLevel,
    'tj.rev.k': isJsonList, 'tj.rev.w': isJsonList, 'tj.kanji.extra': isJsonList, 'tj.word.extra': isJsonList,
    'tj.mn.known': isJsonObject, 'tj.today': isJsonObject, 'tj.streak': isJsonObject, 'tj.grammar.extra': isJsonObject, 'tj.write.extra': isJsonObject,
  };
  const DAY_PREFIX = 'tj.day.';
  const SEEN_PREFIX = 'tj.seen.';

  // 키에 맞는 검사 함수. 이 앱이 쓰는 키가 아니면 null.
  function ruleForKey(key) {
    if (Object.prototype.hasOwnProperty.call(KEY_RULES, key)) return KEY_RULES[key];
    if (key.startsWith(DAY_PREFIX) && JLPT_LEVELS.includes(key.slice(DAY_PREFIX.length))) return isCountText;
    if (key.startsWith(SEEN_PREFIX) && SEEN_KINDS.includes(key.slice(SEEN_PREFIX.length))) return isJsonList;
    return null;
  }

  // 백업 파일의 data({키: 글자}) → { accepted: [[키, 값]], skipped: [키] }
  // tj.로 시작하지 않는 키·안내용 키·tj.schema는 조용히 넘긴다(예전부터 불러오지 않던 것).
  function splitBackupData(data) {
    const accepted = [];
    const skipped = [];
    for (const key of Object.keys(data)) {
      if (!key.startsWith('tj.') || key.startsWith(SKIPPED_PREFIX) || key === SCHEMA_KEY) continue;
      const rule = ruleForKey(key);
      if (rule && typeof data[key] === 'string' && rule(data[key])) accepted.push([key, data[key]]);
      else skipped.push(key);
    }
    return { accepted: accepted, skipped: skipped };
  }

  return {
    readTextList: readTextList, readPlainObject: readPlainObject, readToday: readToday, readRecordList: readRecordList,
    readGrammarExtra: readGrammarExtra, readWriteExtra: readWriteExtra, splitBackupData: splitBackupData,
    isKnownKey: function (key) { return ruleForKey(key) !== null; },
  };
});
