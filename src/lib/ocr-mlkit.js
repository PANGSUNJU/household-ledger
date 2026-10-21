/*
 * 안드로이드 앱 전용: 구글 ML Kit 글자 인식 (한국어 모델, 폰 안에서만 — 서버로 안 보냄)
 *  · ML Kit 는 '폰 안의 이미지 파일'을 읽어서, 조각 이미지를 앱 임시 폴더에 잠깐 저장했다가 읽고 바로 지운다
 *  · 주의: Capacitor 플러그인 객체는 async 함수에서 return/await 하지 않는다 (then 으로 착각해 멈춤)
 */
import { TextRecognition, Script } from '@capacitor-mlkit/text-recognition'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { mlkitToText } from './ocr-mlkit-lines'

function within(p, ms, what) {
  return Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} 응답 없음`)), ms))])
}

let seq = 0
/** 캔버스 한 장 → 읽은 글자 (줄마다) */
export async function mlkitRead(canvas) {
  const name = `ocr-${Date.now()}-${++seq}.jpg`
  const data = canvas.toDataURL('image/jpeg', 0.92).split(',')[1]
  const file = await within(Filesystem.writeFile({ path: name, data, directory: Directory.Cache }), 10000, '임시 저장')
  try {
    const r = await within(TextRecognition.processImage({ path: file.uri, script: Script.Korean }), 30000, 'ML Kit')
    return mlkitToText(r)
  } finally {
    Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => {})
  }
}
