/*
 * 안드로이드 앱 알림 (폰 안에 미리 예약 — 서버·인터넷 필요 없음)
 *  · 고정 수입·지출: 그날 아침 9시 (설정 '고정 수입·지출 알림', 이 폰에만 저장, 기본 켜짐)
 *  · 주간 정리: 설정의 요일·시간 (서버 설정 user_settings 를 그대로 씀)
 *  · 앱을 열 때·돌아올 때·고정 항목이나 설정을 바꿀 때마다 다시 계산해서 예약을 새로 맞춘다
 *  · 웹(브라우저)에서는 아무것도 하지 않는다
 */
import { reactive } from 'vue'
import { registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { isNative } from './native'
import { listRecurringItems, getRemindSettings } from './api'
import { occurrencesBetween } from './recurring'
import { todayKST, addDays } from './date'
import { planRecurring, planWeekly, RECURRING_DAYS } from './appNotify-plan'

const REC_KEY = 'ledger.notifyRecurring'

/** 폰 기능 호출이 응답 없이 멈추지 않게 (ms 안에 안 오면 실패로) */
function within(p, ms, what) {
  return Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} 응답 없음`)), ms))])
}
const CHANNEL = 'ledger'

// 우리 앱 전용 네이티브 기능 (android/.../AppSettingsPlugin.java)
const AppSettings = registerPlugin('AppSettings')

export const appNotify = reactive({
  perm: 'unknown',     // 'granted' | 'denied' | 'prompt' | 'unknown'
  rawPerm: '',         // 폰이 알려 준 그대로 — 화면에 표시해 원인 찾기
  lastRun: '',         // 마지막으로 예약을 맞춘 시각 (HH:MM)
  recurringOn: readRecurringOn(),
  count: 0,            // 지금 예약된 알림 수
  lastError: ''
})

function readRecurringOn() {
  try { return localStorage.getItem(REC_KEY) !== '0' } catch { return true }
}

/*
 * 주의: Capacitor 플러그인 객체는 async 함수에서 그대로 return 하거나 await 하면 안 된다
 * (모든 이름에 응답하는 특수 객체라 'then' 이 있는 것처럼 보여서, await 가 끝나지 않음)
 * → 맨 위에서 바로 가져와 그대로 쓴다
 */
function plugin() { return LocalNotifications }

function setPerm(display) {
  appNotify.rawPerm = String(display || '')
  appNotify.perm = display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
  return appNotify.perm
}

/**
 * 알림이 켜져 있는지: 안드로이드에 '이 앱 알림 켜져 있어?' 만 바로 묻는다
 * (권한 묻기 창 기능을 거치지 않아 멈추지 않음). 안 되면 우리 앱 전용 기능으로 한 번 더
 */
export async function refreshPermission() {
  if (!isNative()) return 'unknown'
  try {
    const r = await within(plugin().areEnabled(), 3000, '알림 상태')
    appNotify.rawPerm = r.value ? 'enabled' : 'disabled'
    return setPermOnly(r.value ? 'granted' : 'denied')
  } catch (e1) {
    try {
      const r = await within(AppSettings.notifyStatus(), 3000, '알림 상태(앱)')
      appNotify.rawPerm = (r.enabled ? 'enabled' : 'disabled') + ' (sdk ' + r.sdk + ')'
      return setPermOnly(r.enabled ? 'granted' : 'denied')
    } catch (e2) {
      appNotify.lastError = '알림 상태 확인 실패: ' + String(e1?.message || e1).slice(0, 60)
      return appNotify.perm
    }
  }
}
function setPermOnly(p) { appNotify.perm = p; return p }

/** 알림 허용 묻기 (한 번 거절하면 안드로이드가 다시 묻지 않음 → 폰 설정에서 켜야 함) */
export async function askPermission() {
  if (!isNative()) return 'unknown'
  if ((await refreshPermission()) === 'granted') return 'granted'
  try {
    const p = await within(plugin().requestPermissions(), 8000, '알림 허용 창')
    appNotify.rawPerm = String(p.display || '')
  } catch (e) {
    appNotify.lastError = String(e?.message || e).slice(0, 80)
  }
  return refreshPermission()
}

/** 폰의 '가계부 앱 알림 설정' 화면 열기 */
export async function openNotifySettings() {
  await AppSettings.openNotifications()
}

let started = false
/** 앱 시작(로그인 뒤) 한 번: 알림 채널, 알림을 누르면 그 화면으로 */
export async function initAppNotify(router) {
  if (!isNative() || started) return
  started = true
  const ln = plugin()
  try {
    await ln.createChannel({ id: CHANNEL, name: '가계부 알림', description: '고정 수입·지출, 주간 정리', importance: 4, visibility: 1 })
  } catch { /* 이미 있음 */ }
  ln.addListener('localNotificationActionPerformed', ({ notification }) => {
    const url = notification?.extra?.url
    if (url) router.push(url).catch(() => {})
  })
  await refreshPermission()
  await rescheduleAll()
}

let running = null
let again = false
/** 예약 다시 맞추기 (여러 번 불려도 한 번씩 차례로) */
export async function rescheduleAll() {
  if (!isNative()) return
  if (running) { again = true; return running }
  running = (async () => {
    try {
      do { again = false; await doReschedule() } while (again)
    } finally { running = null }
  })()
  return running
}

async function doReschedule() {
  const ln = plugin()
  appNotify.lastError = ''
  try {
    // 우리가 예약했던 것 모두 지우고 새로
    const pending = await within(ln.getPending(), 5000, '예약 목록')
    if (pending.notifications.length) await within(ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) }), 5000, '예약 지우기')
    if ((await refreshPermission()) !== 'granted') { appNotify.count = 0; return }

    const now = new Date()
    const list = []
    if (appNotify.recurringOn) {
      const items = await listRecurringItems().catch(() => [])
      const today = todayKST()
      list.push(...planRecurring(occurrencesBetween(items || [], today, addDays(today, RECURRING_DAYS)), now))
    }
    const s = await getRemindSettings()
    list.push(...planWeekly(s, now))

    if (list.length) {
      await within(ln.schedule({
        notifications: list.map((n) => ({
          id: n.id, title: n.title, body: n.body, extra: n.extra, channelId: CHANNEL,
          smallIcon: 'ic_stat_notify', iconColor: '#E8806A',
          schedule: { at: n.at, allowWhileIdle: true },
          // 정확한 시각 알람은 안드로이드가 따로 허락(알람 및 리마인더)을 요구해서, 몇 분 늦어도 되는 일반 알람으로
          isExactNotification: false
        }))
      }), 15000, '알림 예약')
    }
    appNotify.count = list.length
    appNotify.lastRun = new Date().toTimeString().slice(0, 5)
  } catch (e) {
    console.warn('앱 알림 예약 실패', e)
    appNotify.lastError = String(e?.message || e).slice(0, 80)
  }
}

/** 설정: 고정 수입·지출 알림 켜고 끄기 (이 폰에만) */
export async function setRecurringOn(on) {
  appNotify.recurringOn = on
  try { localStorage.setItem(REC_KEY, on ? '1' : '0') } catch { /* 저장 못 함 */ }
  rescheduleAll().catch(() => {})   // 예약은 뒤에서 (기다리지 않음)
}

/** 시험 알림: 5초 뒤 */
export async function sendTestNotify() {
  const ln = plugin()
  if ((await refreshPermission()) !== 'granted') throw new Error('알림이 꺼져 있어요')
  await within(ln.schedule({
    notifications: [{
      id: 999, title: '시험 알림이에요', body: '앱 알림이 잘 와요!', channelId: CHANNEL,
      smallIcon: 'ic_stat_notify', iconColor: '#E8806A', extra: { url: '/settings' },
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
      isExactNotification: false
    }]
  }), 8000, '시험 알림 예약')
}

/** 로그아웃: 이 폰에 예약한 알림 모두 지우기 */
export async function cancelAllNotify() {
  if (!isNative()) return
  try {
    const ln = plugin()
    const pending = await ln.getPending()
    if (pending.notifications.length) await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
    appNotify.count = 0
  } catch (e) { console.warn(e) }
}
