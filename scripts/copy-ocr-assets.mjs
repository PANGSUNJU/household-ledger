/*
 * 이미지 글자 읽기(tesseract.js)에 필요한 파일을 public/ocr 로 복사한다.
 *  · 인터넷의 다른 서버(CDN)에 기대지 않고 우리 앱 주소에서 바로 받게 하려고
 *  · npm install / dev / build 때 자동으로 실행된다 (package.json 의 postinstall·predev·prebuild)
 *  · public/ocr 는 git 에 올리지 않는다 (.gitignore)
 */
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const out = 'public/ocr'
const nm = 'node_modules'
const files = [
  [`${nm}/tesseract.js/dist/worker.min.js`, `${out}/worker.min.js`],
  // 글자 인식 엔진: 폰이 지원하는 기능에 따라 셋 중 하나를 쓴다 (LSTM 전용)
  [`${nm}/tesseract.js-core/tesseract-core-lstm.wasm.js`, `${out}/core/tesseract-core-lstm.wasm.js`],
  [`${nm}/tesseract.js-core/tesseract-core-simd-lstm.wasm.js`, `${out}/core/tesseract-core-simd-lstm.wasm.js`],
  [`${nm}/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js`, `${out}/core/tesseract-core-relaxedsimd-lstm.wasm.js`],
  // 한국어·영어 글자 데이터 (작고 정확한 best_int)
  [`${nm}/@tesseract.js-data/kor/4.0.0_best_int/kor.traineddata.gz`, `${out}/lang/kor.traineddata.gz`],
  [`${nm}/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz`, `${out}/lang/eng.traineddata.gz`],
  // [시험 기능] 이름 더 정확하게 읽기: PaddleOCR 한국어 모델 + 실행 도구 (설정에서 켰을 때만 받음)
  [`${nm}/@rustors/model-ppocrv5-korean/models/rec.rten`, `${out}/paddle/rec_ko.rten`],
  [`${nm}/@rustors/model-ppocrv5-korean/models/dict.txt`, `${out}/paddle/dict_ko.txt`]
]

let copied = 0
for (const [from, to] of files) {
  if (!existsSync(from)) { console.warn(`[ocr] 없음: ${from} (npm install 을 먼저 하세요)`); continue }
  mkdirSync(join(to, '..'), { recursive: true })
  cpSync(from, to)
  copied++
}
console.log(`[ocr] 글자 읽기 파일 ${copied}/${files.length}개 준비됨 → ${out}`)
