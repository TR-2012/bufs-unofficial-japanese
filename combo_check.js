/* global module */
// 단어 조합 작문 판정기 — 브라우저(window.TJCombo)와 Node(require) 양쪽에서 쓰는 순수 함수 모음.
//
// 규칙 기반 점검만 한다: ① 일본어 한 문장인지 ② 제시 단어를 모두 썼는지 ③ 문법 조건을 만족했는지.
// 문법의 옳고 그름·자연스러움은 규칙으로 판정할 수 없으므로 점수에 반영하지 않는다(그 부분은 AI 첨삭의 몫).
/** @param {any} root @param {() => any} factory */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TJCombo = factory();
})(/** @type {any} */ (typeof self !== 'undefined' ? self : this), function () {
  var MIN_LEN = 6;

  function norm(s) {
    return String(s == null ? '' : s).normalize('NFKC').replace(/[\s\u3000]/g, '');
  }

  function hasWord(n, word) {
    var keys = (word && word.k && word.k.length) ? word.k : [word && word.w];
    for (var i = 0; i < keys.length; i++) {
      var k = norm(keys[i]);
      if (k && n.indexOf(k) >= 0) return true;
    }
    return false;
  }

  function hasCond(n, cond) {
    try { return new RegExp(cond.re).test(n); } catch (e) { return false; }
  }

  // item: {words:[{w,r,m,k}], cond?:{t,re}}  →  {score, all, checks:[{ok,text}]}
  function check(item, answer) {
    var n = norm(answer);
    var words = (item && item.words) || [];
    var cond = item && item.cond;
    var checks = [];

    // 단어만 나열한 답을 거르기 위해 조사가 하나도 없으면 문장으로 보지 않는다.
    var jp = /[\u3040-\u30ff\u4e00-\u9fff]/.test(n) && !/[\uac00-\ud7a3]/.test(n) && n.length >= MIN_LEN && /[をがはにでともへのやか]/.test(n);
    checks.push({ ok: jp, text: jp ? '일본어 문장으로 작성했어요' : '한글 없이, 조사를 갖춘 일본어 문장으로 써 주세요' });

    var wordPts = cond ? 60 : 90;
    var got = 0;
    words.forEach(function (w) {
      var ok = hasWord(n, w);
      if (ok) got++;
      checks.push({ ok: ok, text: '「' + w.w + '」 ' + (ok ? '사용했어요' : '문장에서 찾지 못했어요 (활용형도 인정돼요)') });
    });

    var condOk = true;
    if (cond) {
      condOk = hasCond(n, cond);
      checks.push({ ok: condOk, text: cond.t + (condOk ? ' 조건을 충족했어요' : ' 조건이 보이지 않아요') });
    }

    var score = (jp ? 10 : 0) + Math.round(wordPts * got / Math.max(1, words.length)) + (cond && condOk ? 30 : 0);
    var all = jp && got === words.length && condOk;
    return { score: all ? 100 : Math.min(score, 99), all: all, checks: checks };
  }

  return { check: check, norm: norm };
});
