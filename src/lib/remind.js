/*
 * 주간 정리 알림 (SPEC 5-8)
 * 웹앱은 서버 없이 0원으로 '진짜 푸시 알림'을 보내기 어렵다 (특히 아이폰).
 * 그래서 두 가지로 대신한다.
 *  1. 앱 안 안내: 정한 요일·시간이 지난 뒤 앱을 열면 "이번 주 정리할까요?"를 보여준다 (정리했다고 누를 때까지)
 *  2. 폰 캘린더 반복 알림: 매주 그 시간에 폰이 직접 알려준다 (.ics 파일 / 구글 캘린더 링크)
 */
import { todayKST, addDays, weekday, parse } from './date'

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** 지금 한국 시각 'HH:MM' */
export function nowTimeKST() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}

/** 가장 최근에 지난 알림 날짜 (오늘 포함, 오늘이면 시간이 지났을 때만) */
export function lastRemindDate(s, today = todayKST(), now = nowTimeKST()) {
  const { y, m, d } = parse(today)
  const diff = (weekday(y, m, d) - s.remind_weekday + 7) % 7
  let date = addDays(today, -diff)
  if (diff === 0 && now < (s.remind_time || '21:00').slice(0, 5)) date = addDays(today, -7)
  return date
}

/** 앱 안에 '이번 주 정리할까요?'를 보여줄지 */
export function shouldRemind(s, today = todayKST(), now = nowTimeKST()) {
  if (!s?.remind_enabled) return false
  const due = lastRemindDate(s, today, now)
  return !s.remind_done_on || s.remind_done_on < due
}

/** 다음 알림 날짜 (오늘이 그 요일이고 시간 전이면 오늘) */
export function nextRemindDate(s, today = todayKST(), now = nowTimeKST()) {
  const { y, m, d } = parse(today)
  const ahead = (s.remind_weekday - weekday(y, m, d) + 7) % 7
  if (ahead === 0 && now >= (s.remind_time || '21:00').slice(0, 5)) return addDays(today, 7)
  return addDays(today, ahead)
}

function icsEscape(t) {
  return String(t).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n')
}

/** 매주 반복 캘린더 일정 (.ics) — 아이폰·삼성 캘린더 등 */
export function buildIcs(s, appUrl) {
  const start = nextRemindDate(s).replace(/-/g, '')
  const hm = (s.remind_time || '21:00').slice(0, 5).replace(':', '') + '00'
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//household-ledger//weekly-remind//KO', 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Seoul',
    'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:KST', 'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:weekly-remind-${start}@household-ledger`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Asia/Seoul:${start}T${hm}`,
    'DURATION:PT10M',
    `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[s.remind_weekday]}`,
    `SUMMARY:${icsEscape('가계부 정리하기')}`,
    `DESCRIPTION:${icsEscape('이번 주 카드 앱 캡처를 올려서 정리해요. ' + appUrl)}`,
    `URL:${appUrl}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape('가계부 정리할 시간이에요')}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', ''
  ].join('\r\n')
}

/** 구글 캘린더에 반복 일정 추가 링크 (안드로이드에서 편함) */
export function googleCalendarUrl(s, appUrl) {
  const start = nextRemindDate(s).replace(/-/g, '')
  const [hh, mm] = (s.remind_time || '21:00').slice(0, 5).split(':').map(Number)
  const endMin = hh * 60 + mm + 10
  const t = (h, m) => `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: '가계부 정리하기',
    details: `이번 주 카드 앱 캡처를 올려서 정리해요. ${appUrl}`,
    dates: `${start}T${t(hh, mm)}/${start}T${t(Math.floor(endMin / 60) % 24, endMin % 60)}`,
    ctz: 'Asia/Seoul',
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[s.remind_weekday]}`
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}
