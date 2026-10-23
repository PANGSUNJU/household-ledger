/*
 * ML Kit 결과 → 한 줄씩 글자 (화면·폰과 상관없는 계산 — node 시험에서 바로 씀)
 *  · ML Kit 는 '가게 이름'과 '금액'을 서로 다른 덩어리로 돌려준다
 *  · 세로 가운데가 가까운 줄끼리 같은 줄로 보고, 왼쪽부터 이어 붙인다 → 지금 해석 규칙(parseCapture)에 그대로 넣음
 */
/**
 * ML Kit 가 금액 끝 '원'을 빼거나 다른 글자로 읽는 것 바로잡기 (실제 ML Kit 결과에서 본 모양)
 *  · '8,000 원' → '8,000' (띄어 쓴 '원'을 빠뜨림), '33,750원' → '33,750%l' / '5,500%1', '1,234,560원' → '1,234,560!'
 *  · '3,600원' → '3,6002' (원 → 숫자 하나 더), '14,900원' → '14,900 A' / '14,900A'
 *  · 오른쪽 칸의 짧은 숫자만 있는 줄 '400' → '400원'
 *  · 줄 끝의 '천 단위 쉼표 숫자'만 고친다 (시간 18:43, 날짜 2026.10.19, '본인1234' 는 건드리지 않음)
 */
export function fixWon(t, right = false) {
  let s = t.trim()
  // 쉼표 묶음 뒤에 숫자가 하나 더 붙은 것 ('3,6002') → 원
  s = s.replace(/(\d{1,3}(?:,\d{3})*,\d{3})\d$/, '$1원')
  // 쉼표 묶음 금액 뒤에 원이 없거나 엉뚱한 글자 → 원
  s = s.replace(/(\d{1,3}(?:,\d{3})+)\s*(?:[%!|lIiAaOQ1]{1,2}|[윈월운웬원ㅇ])?$/, '$1원')
  // 오른쪽 칸에 숫자(1~3자리)만 있는 줄
  if (right) s = s.replace(/^([+\-]?\s?\d{1,3})\s*(?:[%!|lIiAaOQ]{1,2})?$/, '$1원')
  return s
}

export function mlkitToText(result) {
  const items = []
  for (const b of result?.blocks || []) {
    for (const l of b.lines || []) {
      const box = l.boundingBox || b.boundingBox
      if (!l.text || !box) continue
      const h = Math.max(1, box.bottom - box.top)
      items.push({ t: l.text.trim(), x: box.left, right: box.right, cy: (box.top + box.bottom) / 2, h })
    }
  }
  // 이미지 폭 대신: 가장 오른쪽 글자 끝. 그 절반보다 오른쪽에서 시작하는 줄 = 금액 칸
  const maxRight = Math.max(1, ...items.map((i) => i.right))
  for (const it of items) it.t = fixWon(it.t, it.x > maxRight * 0.5)
  items.sort((a, b) => a.cy - b.cy)
  const rows = []
  for (const it of items) {
    const row = rows.find((r) => Math.abs(r.cy - it.cy) < Math.min(r.h, it.h) * 0.55)
    if (row) { row.items.push(it); row.cy = (row.cy * (row.items.length - 1) + it.cy) / row.items.length; row.h = Math.max(row.h, it.h) }
    else rows.push({ cy: it.cy, h: it.h, items: [it] })
  }
  return rows.sort((a, b) => a.cy - b.cy).map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.t).join(' ')).join('\n')
}
