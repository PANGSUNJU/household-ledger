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
async function prepare(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const MAX_W = 1600, MAX_SIDE = 6000
  let scale = Math.min(1, MAX_W / bmp.width, MAX_SIDE / bmp.height)
  if (bmp.width < 700) scale = Math.min(2, 1000 / bmp.width)   // 작은 이미지는 키워야 잘 읽힌다
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  return canvas
}

/**
 * 이미지 → 읽은 글자
 * onProgress({ stage: 'load' | 'read', pct })
 */
export async function readImage(file, onProgress) {
  progressFn = (m) => {
    if (!onProgress) return
    if (m.status === 'recognizing text') onProgress({ stage: 'read', pct: Math.round(m.progress * 100) })
    else onProgress({ stage: 'load', pct: Math.round((m.progress || 0) * 100) })
  }
  try {
    const [worker, canvas] = await Promise.all([getWorker(), prepare(file)])
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
