/*
 * 설치형 앱(PWA)과 폰 푸시 알림
 *  · 갤럭시(크롬): '앱 설치' 버튼 → 앱 서랍에 아이콘, 주소창 없이 열림
 *  · 아이폰: 사파리 공유 → '홈 화면에 추가' (iOS 16.4+ 에서 그 아이콘으로 열면 알림도 받음)
 *  · 알림은 https 배포 주소에서만 된다 (localhost 는 PC에서만 시험 가능)
 */
import { reactive } from 'vue'
import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export const pwa = reactive({
  installEvent: null,      // 크롬이 준 '설치' 기회 (누르면 설치 창)
  installed: false,
  registration: null
})

/** 앱처럼 열려 있는지 (설치한 아이콘으로 열었는지) */
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** 앱 시작할 때 한 번: 서비스 워커 등록 + 설치 기회 받아 두기 */
export function initPwa() {
  pwa.installed = isStandalone()
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()           // 크롬 기본 띠 대신 설정 화면의 버튼으로
    pwa.installEvent = e
  })
  window.addEventListener('appinstalled', () => { pwa.installed = true; pwa.installEvent = null })
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => { pwa.registration = reg })
      .catch((e) => console.warn('서비스 워커 등록 실패', e))
  }
}

/** '앱 설치' 창 띄우기 → true(설치함) / false */
export async function promptInstall() {
  const e = pwa.installEvent
  if (!e) return false
  e.prompt()
  const { outcome } = await e.userChoice
  pwa.installEvent = null
  return outcome === 'accepted'
}

/* ---------- 푸시 알림 ---------- */

/**
 * 이 폰에서 알림을 받을 수 있는 상태
 *  'no-key'      배포 설정에 알림 열쇠(VITE_VAPID_PUBLIC_KEY)가 없음
 *  'need-https'  https 주소가 아님 (192.168… 로 연 경우 등)
 *  'ios-install' 아이폰인데 홈 화면 아이콘으로 열지 않음
 *  'unsupported' 이 브라우저는 알림을 못 받음
 *  'denied'      알림을 막아 둠 (폰 설정에서 풀어야 함)
 *  'ready'       받을 수 있음
 */
export function pushSupport() {
  if (!VAPID) return 'no-key'
  if (!(location.protocol === 'https:' || location.hostname === 'localhost')) return 'need-https'
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'ready'
}

async function registration() {
  if (pwa.registration) return pwa.registration
  pwa.registration = await navigator.serviceWorker.ready
  return pwa.registration
}

/** 이 폰의 지금 알림 등록 (없으면 null) */
export async function currentSubscription() {
  if (pushSupport() !== 'ready') return null
  try { return await (await registration()).pushManager.getSubscription() } catch { return null }
}

function keyBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function deviceName() {
  const ua = navigator.userAgent
  const os = /Android/.test(ua) ? 'Android' : isIos() ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : '기기'
  const br = /SamsungBrowser/.test(ua) ? '삼성 인터넷' : /Edg\//.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '브라우저'
  return `${os} ${br}`
}

/** 알림 받기 켜기: 허용 묻기 → 등록 → 서버에 이 폰 주소 저장 */
export async function enablePush() {
  const state = pushSupport()
  if (state !== 'ready') throw Object.assign(new Error(state), { state })
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw Object.assign(new Error('denied'), { state: 'denied' })
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) })
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_device: deviceName()
  })
  if (error) throw error
  return sub
}

/** 이 폰 알림 끄기 */
export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** 시험 알림 (본인 폰 모두에) */
export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke('send-reminders', { body: { test: true } })
  if (error) {
    let msg = ''
    try { msg = (await error.context?.json?.())?.error || '' } catch { /* 내용 없음 */ }
    throw Object.assign(error, { userMessage: msg })
  }
  return data
}
