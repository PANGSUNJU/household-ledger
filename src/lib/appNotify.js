/*
 * 안드로이드 앱 알림 (폰 안에 미리 예약 — 서버·인터넷 필요 없음)
 *  · 고정 수입·지출: 그날 아침 9시 (설정 '고정 수입·지출 알림', 이 폰에만 저장, 기본 켜짐)
 *  · 주간 정리: 설정의 요일·시간 (서버 설정 user_settings 를 그대로 씀)
 *  · 앱을 열 때·돌아올 때·고정 항목이나 설정을 바꿀 때마다 다시 계산해서 예약을 새로 맞춘다
 *  · 웹(브라우저)에서는 아무것도 하지 않는다
 */
import { reactive } from 'vue'
import { registerPlugin } from '@capacitor/core'
import { isNative } from './native'
import { listRecurringItems, getRemindSettings } from './api'
import { occurrencesBetween } from './recurring'
import { todayKST, addDays } from './date'
import { planRecurring, planWeekly, RECURRING_DAYS } from './appNotify-plan'

const REC_KEY = 'ledger.notifyRecurring'
const CHANNEL = 'ledger'

// 우리 앱 전용 네이티브 기능 (android/.../AppSettingsPlugin.java)
const AppSettings = registerPlugin('AppSettings')

export const appNotify = reactive({
  perm: 'unknown',     // 'granted' | 'denied' | 'prompt' | 'unknown'
  rawPerm: '',         // 폰이 알려 준 그대로 (prompt-with-rationale 등) — 화면에 표시해 원인 찾기
  recurringOn: readRecurringOn(),
  count: 0,            // 지금 예약된 알림 수
  lastError: ''
})

function readRecurringOn() {
  try { return localStorage.getItem(REC_KEY) !== '0' } catch { return true }
}

let LN = null
async function plugin() {
  if (!LN) LN = (await import('@capacitor/local-notifications')).LocalNotifications
  return LN
}

function setPerm(display) {
  appNotify.rawPerm = String(display || '')
  appNotify.perm = display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
  return appNotify.perm
}

export async function refreshPermission() {
  if (!isNative()) return 'unknown'
  try { return setPerm((await (await plugin()).checkPermissions()).display) } catch (e) {
    appNotify.lastError = '알림 상태 확인 실패: ' + String(e?.message || e).slice(0, 80)
    return appNotify.perm
  }
}

/** 알림 허용 묻기 (한 번 거절하면 안드로이드가 다시 묻지 않음 → 폰 설정에서 켜야 함) */
export async function askPermission() {
  if (!isNative()) return 'unknown'
  const p = await (await plugin()).requestPermissions()
  return setPerm(p.display)
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
  const ln = await plugin()
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
  const ln = await plugin()
  appNotify.lastError = ''
  try {
    // 우리가 예약했던 것 모두 지우고 새로
    const pending = await ln.getPending()
    if (pending.notifications.length) await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
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
      await ln.schedule({
        notifications: list.map((n) => ({
          id: n.id, title: n.title, body: n.body, extra: n.extra, channelId: CHANNEL,
          smallIcon: 'ic_stat_notify', iconColor: '#E8806A',
          schedule: { at: n.at, allowWhileIdle: true },
          // 정확한 시각 알람은 안드로이드가 따로 허락(알람 및 리마인더)을 요구해서, 몇 분 늦어도 되는 일반 알람으로
          isExactNotification: false
        }))
      })
    }
    appNotify.count = list.length
  } catch (e) {
    console.warn('앱 알림 예약 실패', e)
    appNotify.lastError = String(e?.message || e).slice(0, 80)
  }
}

/** 설정: 고정 수입·지출 알림 켜고 끄기 (이 폰에만) */
export async function setRecurringOn(on) {
  appNotify.recurringOn = on
  try { localStorage.setItem(REC_KEY, on ? '1' : '0') } catch { /* 저장 못 함 */ }
  await rescheduleAll()
}

/** 시험 알림: 5초 뒤 */
export async function sendTestNotify() {
  const ln = await plugin()
  await ln.schedule({
    notifications: [{
      id: 999, title: '시험 알림이에요', body: '앱 알림이 잘 와요!', channelId: CHANNEL,
      smallIcon: 'ic_stat_notify', iconColor: '#E8806A', extra: { url: '/settings' },
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
      isExactNotification: false
    }]
  })
}

/** 로그아웃: 이 폰에 예약한 알림 모두 지우기 */
export async function cancelAllNotify() {
  if (!isNative()) return
  try {
    const ln = await plugin()
    const pending = await ln.getPending()
    if (pending.notifications.length) await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
    appNotify.count = 0
  } catch (e) { console.warn(e) }
}
