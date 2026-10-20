/*
 * [시험 기능] 이름 더 정확하게 읽기 — 어느 줄의 어느 자리를 다시 읽을지 고르기 (화면 없이 계산만)
 *  · 금액이 있는 줄만, 이름 없는 줄(시간·잔액)은 빼고
 *  · 처음 읽은 이름이 미심쩍을 때만: 영어·기호·자모가 섞였거나, 숫자가 3자리 넘게·한글 사이에 끼었거나, 읽기 도구가 자신 없어함
 *  · 이름 시작은 목록 이름들이 모두 시작하는 왼쪽 줄(가운데값) — 아이콘·잘못 읽힌 앞 글자를 피하려고
 */
import { stripIcon } from './ocr-parse.js'

// 한글 사이에 낀 숫자('경산01점' ← DT), 이름 앞 1~2자리 숫자 낱말('04 경산역점' ← CU)도 미심쩍게
const DOUBT = /(^|\s|_)\d{3,}|[가-힣]\d+[가-힣]|(^|\s)\d{1,2}\s|[A-Za-z()[\]{}<>_|\\/'"`~!@#$%^&*=+?ㄱ-ㅣ]/
const MIN_CONF = 85

/** 금액 왼쪽 낱말들과, 앞쪽 아이콘 찌꺼기 낱말 수 */
function nameWords(line, amountX0) {
  const ws = (line.words || []).filter((w) => w.text && w.text.trim() && w.bbox.x1 <= amountX0 + 2).sort((a, b) => a.bbox.x0 - b.bbox.x0)
  let k = 0
  while (k < ws.length - 1) {
    const rest = ws.slice(k).map((w) => w.text.trim()).join(' ')
    const st = stripIcon(rest)
    if (st !== rest && rest.endsWith(st)) k++
    else break
  }
  return ws.slice(k)
}
const hasName = (ws) => {
  const t = ws.map((w) => w.text).join('')
  return (t.match(/[가-힣A-Za-z]/g) || []).length >= 2 && !/^\d{1,2}:\d{2}$/.test(t)
}

/**
 * lines: tesseract 줄들, cand: [{ i, box, parts }] (금액 자리)
 * → [{ i, box, parts }] 다시 읽을 이름 자리
 */
export function planNames(lines, cand) {
  const named = cand.map((c) => ({ c, ws: nameWords(lines[c.i], c.box.x0) })).filter((x) => x.ws.length && hasName(x.ws))
  const starts = named.map((x) => x.ws[0].bbox.x0).sort((a, b) => a - b)
  const left = starts.length ? starts[Math.floor(starts.length / 2)] : 0
  const out = []
  for (const { c, ws } of named) {
    const text = ws.map((w) => w.text).join(' ')
    const doubt = DOUBT.test(text) || ws.some((w) => (w.confidence ?? 100) < MIN_CONF)
    if (!doubt) continue
    const h = c.box.y1 - c.box.y0
    const box = { x0: Math.max(0, left - Math.round(h * 0.3)), y0: c.box.y0, x1: c.box.x0 - 4, y1: c.box.y1 }
    if (box.x1 - box.x0 < 20) continue
    out.push({ i: c.i, box, parts: c.parts })
  }
  return out
}

/** 다시 읽은 이름을 줄 글자에 넣기: 금액 앞부분을 새 이름으로 (아이콘이 붙어 읽힌 한 글자 'w카드잔액' 은 뗌) */
export function putName(text, parts, name) {
  const at = text.lastIndexOf(parts[0])
  if (at < 0 || !name) return text
  return name.replace(/^[A-Za-z"'`|.,·ㆍ](?=[가-힣])/, '') + ' ' + text.slice(at)
}
