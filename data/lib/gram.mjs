// gram.mjs — 문법 단원 생성 헬퍼 (간결 표기 → 앱 스키마 변환)
// u(pattern, gloss, explain, rules[], examples[[jp,kr]...], checks[[q,[opts],a]...])
export const u = (pattern, gloss, explain, rules, examples, checks) => ({
  pattern, gloss, explain,
  rules,
  examples: examples.map(([jp, kr]) => ({ jp, kr })),
  checks: checks.map(([q, options, a]) => ({ q, options, a: a || 0 })),
});
