/*
 * ML Kit 결과 → 한 줄씩 글자 (화면·폰과 상관없는 계산 — node 시험에서 바로 씀)
 *  · ML Kit 는 '가게 이름'과 '금액'을 서로 다른 덩어리로 돌려준다
 *  · 세로 가운데가 가까운 줄끼리 같은 줄로 보고, 왼쪽부터 이어 붙인다 → 지금 해석 규칙(parseCapture)에 그대로 넣음
 */
export function mlkitToText(result) {
  const items = []
  for (const b of result?.blocks || []) {
    for (const l of b.lines || []) {
      const box = l.boundingBox || b.boundingBox
      if (!l.text || !box) continue
      const h = Math.max(1, box.bottom - box.top)
      items.push({ t: l.text.trim(), x: box.left, cy: (box.top + box.bottom) / 2, h })
    }
  }
  items.sort((a, b) => a.cy - b.cy)
  const rows = []
  for (const it of items) {
    const row = rows.find((r) => Math.abs(r.cy - it.cy) < Math.min(r.h, it.h) * 0.55)
    if (row) { row.items.push(it); row.cy = (row.cy * (row.items.length - 1) + it.cy) / row.items.length; row.h = Math.max(row.h, it.h) }
    else rows.push({ cy: it.cy, h: it.h, items: [it] })
  }
  return rows.sort((a, b) => a.cy - b.cy).map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.t).join(' ')).join('\n')
}
