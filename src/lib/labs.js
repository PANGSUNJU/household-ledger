/*
 * 시험 기능 켜고 끄기 (이 폰·브라우저에만 저장, 서버·DB에는 저장하지 않음)
 *  · 되돌릴 때 SQL 없이 코드만 빼면 되게
 */
const NAME_KEY = 'ledger.labNameBoost'

/** 이름 더 정확하게 읽기 (PaddleOCR 한국어 모델) — 기본 꺼짐 */
export function nameBoostOn() {
  try { return localStorage.getItem(NAME_KEY) === '1' } catch { return false }
}
export function setNameBoost(on) {
  try { if (on) localStorage.setItem(NAME_KEY, '1'); else localStorage.removeItem(NAME_KEY) } catch { /* 저장 못 함 */ }
}
