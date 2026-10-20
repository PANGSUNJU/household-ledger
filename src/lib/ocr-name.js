/*
 * [시험 기능] 이름 더 정확하게 읽기 — PaddleOCR 한국어 모델(PP-OCRv5 korean)로 이름 자리만 다시 읽기
 *  · 설정에서 켰을 때만 불러온다 (꺼져 있으면 이 파일도, 모델도 받지 않음)
 *  · 폰 안에서만 읽는다. 모델은 우리 앱 주소 /ocr/paddle 에서 (scripts/copy-ocr-assets.mjs), 실행 도구 wasm 은 빌드에 포함
 *  · 실행 도구: @rustors/web 의 RTen WebAssembly (MIT), 모델: PaddleOCR (Apache-2.0)
 */
import initWasm, { RtenModel } from '../../node_modules/@rustors/web/dist/wasm/rusto_rten_wasm.js'

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const H = 48
let ready = null
let model = null
let dict = null

export function initName() {
  ready = ready || (async () => {
    await initWasm({})   // 실행 도구(wasm)는 빌드할 때 앱 파일에 함께 들어감
    const [buf, txt] = await Promise.all([
      fetch(`${BASE}/ocr/paddle/rec_ko.rten`).then((r) => { if (!r.ok) throw new Error('model'); return r.arrayBuffer() }),
      fetch(`${BASE}/ocr/paddle/dict_ko.txt`).then((r) => { if (!r.ok) throw new Error('dict'); return r.text() })
    ])
    model = new RtenModel(new Uint8Array(buf))
    dict = txt.replace(/\r/g, '').split('\n')
    if (dict[dict.length - 1] === '') dict.pop()
  })().catch((e) => { ready = null; throw e })
  return ready
}

/** 캔버스의 한 자리(box) → { text, conf } */
export function readNameBox(src, box) {
  const sw = Math.max(1, box.x1 - box.x0), sh = Math.max(1, box.y1 - box.y0)
  const W = Math.min(1600, Math.max(16, Math.round(sw * H / sh)))
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(src, box.x0, box.y0, sw, sh, 0, 0, W, H)
  const px = ctx.getImageData(0, 0, W, H).data
  const plane = H * W
  const data = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {   // 모델은 BGR 순서, -1~1
    data[i] = (px[i * 4 + 2] / 255 - 0.5) / 0.5
    data[plane + i] = (px[i * 4 + 1] / 255 - 0.5) / 0.5
    data[2 * plane + i] = (px[i * 4] / 255 - 0.5) / 0.5
  }
  const out = model.run(new Uint32Array([1, 3, H, W]), data)
  const T = out.shape[1], C = out.shape[2], prob = out.data
  let text = '', prev = -1, conf = 0, n = 0
  for (let t = 0; t < T; t++) {
    let best = 0, bv = -Infinity
    for (let k = 0; k < C; k++) { const v = prob[t * C + k]; if (v > bv) { bv = v; best = k } }
    if (best !== 0 && best !== prev) { text += best - 1 < dict.length ? dict[best - 1] : ' '; conf += bv; n++ }
    prev = best
  }
  out.free?.()
  c.width = c.height = 0
  return { text: text.trim(), conf: n ? conf / n : 0 }
}
