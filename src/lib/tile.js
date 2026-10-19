/*
 * 분류 네모 안 글자 (목록 왼쪽)
 *  · 두 글자 이하: 한 줄 그대로        식비, 교통, 기타
 *  · 세 글자: 한 줄 (조금 작게)         경조사, 반려견
 *  · 네 글자 이상: 두 줄로 나눠 보이기   카페·간식 → 카페/간식, 생활용품 → 생활/용품, 저축/투자 → 저축/투자
 *    ·  /  빈칸이 있으면 그 자리에서 나누고, 없으면 두 글자씩 (다섯 글자부터는 줄마다 두 글자까지)
 *    첫 낱말이 세 글자 이상이면 그 낱말만 한 줄 (데이트 비용 → 데이트)
 */
export function tileLines(name) {
  const n = (name || '기타').trim()
  const parts = n.split(/[·/\s]+/).filter(Boolean)
  if (parts.length >= 2) {
    // 첫 낱말이 세 글자 이상이면 그 낱말만 (데이트 비용 → 데이트)
    if (parts[0].length >= 3) return [parts[0].slice(0, 3)]
    return [parts[0], parts[1].slice(0, 2)]
  }
  if (n.length <= 3) return [n]
  return [n.slice(0, 2), n.slice(2, 4)]
}
