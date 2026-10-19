/* 관리 화면 공통: 끌어서 옮긴 순서 정리·저장 */
import { saveOrder } from './api'

/** from 번째를 to 자리로 옮긴 새 목록 (sort_order 도 1부터 다시 매김) */
export function reorder(list, from, to) {
  const next = list.slice()
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x)
  next.forEach((it, i) => { it.sort_order = i + 1 })
  return next
}

/** 끌어서 옮긴 순서를 저장: 자리가 바뀐 줄만 (from~to 사이) */
export async function saveMoved(table, next, from, to) {
  const lo = Math.min(from, to), hi = Math.max(from, to)
  await saveOrder(table, next.slice(lo, hi + 1).map((x) => ({ id: x.id, sort_order: x.sort_order })))
}

/* 분류 색 고르기용 파스텔 (디자인 "기본 + 파스텔 색") */
export const PASTELS = [
  '#FFD8C7', '#FFE9A8', '#C9EBD8', '#CFE2F8', '#DCD3F7',
  '#F7D3E4', '#C8ECE9', '#F2DEC9', '#DDEBC4', '#E6DDD5'
]
