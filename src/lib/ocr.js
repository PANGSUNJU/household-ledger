/*
 * 이미지 글자 읽기 (SPEC 5-7) — 폰·PC 브라우저 안에서만 읽는다
 *  · 무료 도구 tesseract.js (운영비 0원)
 *  · 이미지는 서버로 보내지 않고, 읽은 뒤 메모리에서 버린다 (원본 저장 안 함)
 *  · 필요한 파일은 우리 앱 주소의 /ocr 에서 받는다 (scripts/copy-ocr-assets.mjs)
 *  · 처음 한 번은 글자 데이터(약 4.5MB)를 받느라 느리고, 그 뒤엔 브라우저에 저장돼 빠르다
 */
import { createWorker } from 'tesseract.js'

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
 * 사진·캡처를 읽기 좋게: 사진 방향 바로잡기 + 너무 크면 줄이기 (긴 변 2400px)
 * 길게 이어 찍은 캡처는 폭만 맞춘다
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
  // 고른 영역만 (비율 → 픽셀)
  const c = crop && crop.w > 0 && crop.h > 0 ? crop : { x: 0, y: 0, w: 1, h: 1 }
  const sx = Math.round(c.x * bmp.width), sy = Math.round(c.y * bmp.height)
  const sw = Math.max(1, Math.round(c.w * bmp.width)), sh = Math.max(1, Math.round(c.h * bmp.height))
  const MAX_W = 1600, MAX_SIDE = 6000
  let scale = Math.min(1, MAX_W / sw, MAX_SIDE / sh)
  if (sw < 700) scale = Math.min(2, 1000 / sw)   // 작은 이미지는 키워야 잘 읽힌다
  const w = Math.round(sw * scale), h = Math.round(sh * scale)
  // 자른 이미지는 글자가 가장자리에 붙어 잘 못 읽어서 흰 여백을 둘러 준다
  const pad = crop ? 32 : 0
  const canvas = document.createElement('canvas')
  canvas.width = w + pad * 2; canvas.height = h + pad * 2
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, sx, sy, sw, sh, pad, pad, w, h)
  bmp.close?.()   // <img> 에는 close 가 없다
  darkToLight(ctx, canvas.width, canvas.height)
  return canvas
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
    const [worker, canvas] = await Promise.all([getWorker(), prepare(file, crop)])
    const { data } = await worker.recognize(canvas)
    return data.text || ''
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
