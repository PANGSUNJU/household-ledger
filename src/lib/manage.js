/* 관리 화면 공통: 목록에서 한 칸 위/아래로 옮기고 순서를 저장 */
import { saveOrder } from './api'

export async function moveAndSave(table, list, index, dir) {
  const j = index + dir
  if (j < 0 || j >= list.length) return list
  const next = list.slice()
  ;[next[index], next[j]] = [next[j], next[index]]
  await saveOrder(table, next.map((x) => x.id))
  return next
}

/* 분류 색 고르기용 파스텔 (디자인 "기본 + 파스텔 색") */
export const PASTELS = [
  '#FFD8C7', '#FFE9A8', '#C9EBD8', '#CFE2F8', '#DCD3F7',
  '#F7D3E4', '#C8ECE9', '#F2DEC9', '#DDEBC4', '#E6DDD5'
]
