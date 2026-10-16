/*
 * 화면 잠금 (SPEC 6 user_settings): 설정에서 켜면 앱을 열 때 숫자 4자리를 묻는다.
 * '다시 묻는 시간'(lock_timeout 초) 동안은 다른 앱에 다녀와도 다시 묻지 않는다.
 * 비밀번호 확인은 서버 함수(verify_lock_pin)로만 한다. 원래 숫자는 어디에도 저장하지 않는다.
 */
import { reactive } from 'vue'
import { getSettings } from './api'

export const lock = reactive({
  enabled: false,
  timeout: 0,      // 초: 0(즉시), 60, 300, 1800
  locked: false,
  loaded: false
})

let hiddenAt = null
let listening = false
let graceUntil = 0

/**
 * 사진·캡처를 고르러 갤러리에 다녀오는 동안은 잠그지 않는다 (2분까지)
 * '즉시' 잠금이면 파일을 고르는 순간 화면이 잠겨 버리기 때문
 */
export function holdLock(ms = 120000) {
  graceUntil = Date.now() + ms
}

export async function initLock() {
  try {
    const s = await getSettings()
    lock.enabled = !!s.lock_enabled
    lock.timeout = s.lock_timeout ?? 0
    lock.locked = lock.enabled   // 앱을 처음 열 때는 항상 묻는다
  } catch (e) {
    console.warn('잠금 설정을 불러오지 못했어요', e)
  } finally {
    lock.loaded = true
  }
  if (!listening) {
    document.addEventListener('visibilitychange', onVisibility)
    listening = true
  }
}

export function resetLock() {
  lock.enabled = false; lock.timeout = 0; lock.locked = false; lock.loaded = false
}

function onVisibility() {
  if (!lock.enabled) return
  if (document.hidden) {
    hiddenAt = Date.now()
  } else if (hiddenAt !== null) {
    const away = (Date.now() - hiddenAt) / 1000
    hiddenAt = null
    if (Date.now() < graceUntil) { graceUntil = 0; return }
    if (away >= lock.timeout) lock.locked = true
  }
}

export const TIMEOUTS = [
  { v: 0, t: '즉시' }, { v: 60, t: '1분' }, { v: 300, t: '5분' }, { v: 1800, t: '30분' }
]
