/*
 * 이미지 글자 읽기 (SPEC 5-7) — 폰·PC 브라우저 안에서만 읽는다
 *  · 무료 도구 tesseract.js (운영비 0원)
 *  · 이미지는 서버로 보내지 않고, 읽은 뒤 메모리에서 버린다 (원본 저장 안 함)
 *  · 필요한 파일은 우리 앱 주소의 /ocr 에서 받는다 (scripts/copy-ocr-assets.mjs)
 *  · 처음 한 번은 글자 데이터(약 4.5MB)를 받느라 느리고, 그 뒤엔 브라우저에 저장돼 빠르다
 */
import { createWorker } from 'tesseract.js'
import { pickCuts } from './ocr-cut'

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
let workerPromise = null
let progressFn = null

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker(['kor', 'eng'], 1, {
      workerPath: `${BASE}/ocr/worker.min.js`,
      corePath: `${BASE}/ocr/core`,
      langPath: `${BASE}/ocr/lang`,
      gzip: true,
      logger: (m) => progressFn?.(m)
    }).catch((e) => { workerPromise = null; throw e })
  }
  return workerPromise
}

/**
 * 사진·캡처를 읽기 좋게: 사진 방향 바로잡기 + 너무 크면 줄이기
 * 길게 이어 찍은 캡처는 여러 조각으로 나눠 읽는다 (cutPoints)
 */
/** 이미지 파일 열기: 사진 방향 옵션 → 옵션 없이 → <img> 순서로 시도 */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* 다음 방법 */ }
    try { return await createImageBitmap(file) } catch { /* 다음 방법 */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new Error('이 이미지 형식은 열 수 없어요. 캡처(PNG·JPG)로 다시 올려 주세요.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function prepare(file, crop) {
  const bmp = await decode(file)
  try {
    // 고른 영역만 (비율 → 픽셀)
    const c = crop && crop.w > 0 && crop.h > 0 ? crop : { x: 0, y: 0, w: 1, h: 1 }
    const sx = Math.round(c.x * bmp.width), sy = Math.round(c.y * bmp.height)
    const sw = Math.max(1, Math.round(c.w * bmp.width)), sh = Math.max(1, Math.round(c.h * bmp.height))
    // 길게 이어 찍은 캡처: 통째로 줄이면 글자가 너무 작아져서 못 읽는다
    // → 기록 사이 빈 줄에서 여러 조각으로 잘라 조각마다 보통 크기로 읽는다
    const cuts = cutPoints(bmp, sx, sy, sw, sh)
    const pieces = []
    for (let k = 0; k < cuts.length - 1; k++) pieces.push(drawPiece(bmp, sx, sy + cuts[k], sw, cuts[k + 1] - cuts[k], !!crop))
    return pieces
  } finally {
    bmp.close?.()   // <img> 에는 close 가 없다
  }
}

/** 한 조각을 읽기 좋은 크기의 캔버스로 */
function drawPiece(bmp, sx, sy, sw, sh, padded) {
  const MAX_W = 1600, MAX_SIDE = 6000
  let scale = Math.min(1, MAX_W / sw, MAX_SIDE / sh)
  if (sw < 700) scale = Math.min(2, 1000 / sw, MAX_SIDE / sh)   // 작은 이미지는 키워야 잘 읽힌다
  const w = Math.round(sw * scale), h = Math.round(sh * scale)
  // 자른 이미지는 글자가 가장자리에 붙어 잘 못 읽어서 흰 여백을 둘러 준다
  const pad = padded ? 32 : 0
  const canvas = document.createElement('canvas')
  canvas.width = w + pad * 2; canvas.height = h + pad * 2
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, sx, sy, sw, sh, pad, pad, w, h)
  darkToLight(ctx, canvas.width, canvas.height)
  return canvas
}

/**
 * 긴 캡처를 자를 자리 (조각 시작·끝 y, 원본 픽셀). 보통 캡처는 [0, sh] 한 조각
 * 조각 높이는 폭의 약 2.5배(폰 한 화면쯤). 그 근처에서 글자가 없는 가로줄(빈 줄)을 찾아 자른다
 */
export function cutPoints(bmp, sx, sy, sw, sh) {
  const piece = Math.round(sw * 2.5)
  if (sh <= piece * 1.4) return [0, sh]
  // 작게 줄인 그림으로 가로줄마다 '글자가 있는지' 본다 (폭 120px, 세로는 원본 1/ratio)
  const aw = 120, ratio = sw / aw
  const ah = Math.max(1, Math.round(sh / ratio))
  const cv = document.createElement('canvas')
  cv.width = aw; cv.height = ah
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, aw, ah)
  return pickCuts(ctx.getImageData(0, 0, aw, ah).data, aw, ah, ratio, sh, piece)
}

/**
 * 어두운 화면(다크 모드) 캡처면 색을 뒤집어 '흰 바탕 검은 글씨'로 만든다
 * (글자 읽기 도구가 그 모양에 맞춰져 있다). 밝은 화면은 그대로 둔다
 */
export function darkToLight(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  let sum = 0, n = 0
  for (let i = 0; i < d.length; i += 4 * 97) { sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; n++ }
  if (!n || sum / n >= 110) return false
  for (let i = 0; i < d.length; i += 4) {
    const g = 255 - (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114)
    d[i] = d[i + 1] = d[i + 2] = g
  }
  ctx.putImageData(img, 0, 0)
  return true
}

/**
 * 이미지 → 읽은 글자
 * onProgress({ stage: 'load' | 'read', pct })
 * crop: 읽을 영역 { x, y, w, h } (0~1 비율, 없으면 전체)
 */
export async function readImage(file, onProgress, crop = null) {
  progressFn = (m) => {
    if (!onProgress) return
    if (m.status === 'recognizing text') onProgress({ stage: 'read', pct: Math.round(m.progress * 100) })
    else onProgress({ stage: 'load', pct: Math.round((m.progress || 0) * 100) })
  }
  try {
    const [worker, pieces] = await Promise.all([getWorker(), prepare(file, crop)])
    // 조각이 여럿이면 차례로 읽어 이어 붙인다 (진행률은 전체 기준으로)
    const texts = []
    for (let k = 0; k < pieces.length; k++) {
      if (pieces.length > 1) progressFn = (m) => {
        if (!onProgress) return
        if (m.status === 'recognizing text') onProgress({ stage: 'read', pct: Math.round((k + m.progress) / pieces.length * 100) })
      }
      const { data } = await worker.recognize(pieces[k])
      texts.push(data.text || '')
      pieces[k].width = pieces[k].height = 0   // 메모리 바로 비우기
    }
    return texts.join('\n')
  } finally {
    progressFn = null
  }
}

/** 화면을 떠날 때 메모리 정리 */
export async function closeReader() {
  if (!workerPromise) return
  const p = workerPromise
  workerPromise = null
  try { (await p).terminate() } catch { /* 이미 닫힘 */ }
}
