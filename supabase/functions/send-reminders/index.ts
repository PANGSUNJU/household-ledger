// =====================================================================
// 주간 정리 알림 보내기 (Supabase Edge Function: send-reminders)
//
// 두 가지로 불린다
//  1. 예약 실행 (10분마다, supabase/cron-send-reminders.sql)
//     헤더 x-cron-secret 이 CRON_SECRET 과 같으면
//     → 오늘이 정한 요일이고 정한 시간이 지났고 이번 주에 아직 안 보낸 사람에게 보낸다
//  2. 앱 설정 화면의 '시험 알림 보내기'
//     로그인한 사용자 본인에게만 바로 보낸다
//
// 필요한 비밀값 (Supabase → Edge Functions → Secrets)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto:내메일), CRON_SECRET
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 넣어 준다 (서버 안에서만 쓰임)
//
// 함수 설정에서 'Enforce JWT verification(JWT 확인)'은 끈다 (예약 실행은 로그인 없이 부르므로).
// 대신 위 1·2 중 하나가 아니면 거절한다.
// =====================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

/** 지금 한국 날짜·요일·시각 */
export function kstNow(d: Date = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000)
  const iso = k.toISOString()
  return { date: iso.slice(0, 10), weekday: k.getUTCDay(), time: iso.slice(11, 16) }
}

type RemindSetting = {
  user_id: string
  remind_enabled: boolean
  remind_weekday: number
  remind_time: string        // 'HH:MM:SS'
  remind_sent_on: string | null
}

/** 지금 보내야 하는지: 정한 요일 + 정한 시간이 지남 + 오늘 아직 안 보냄 */
export function isDue(s: RemindSetting, now: ReturnType<typeof kstNow>) {
  return !!s.remind_enabled &&
    s.remind_weekday === now.weekday &&
    String(s.remind_time || '21:00').slice(0, 5) <= now.time &&
    (!s.remind_sent_on || s.remind_sent_on < now.date)
}

/** 알림 내용 */
export function buildMessage(needs: number, test = false) {
  const body = needs > 0
    ? `이번 주 정리할까요? 금액 입력이 필요한 고정 지출 ${needs}건이 있어요.`
    : '이번 주 카드 앱 이용내역을 캡처해서 한 번에 정리해요.'
  return {
    title: test ? '시험 알림이에요' : '가계부 정리할 시간이에요',
    body: test ? `알림이 잘 와요! ${body}` : body,
    url: needs > 0 ? '/settings/recurring' : '/capture',
    tag: test ? 'test' : 'weekly-remind'
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Deno 에서만 불러오는 것들 (시험 때 node 에서 위 함수만 따로 쓰려고 안에서 불러온다)
  const { createClient } = await import('jsr:@supabase/supabase-js@2')
  const webpush = (await import('npm:web-push@3.6.7')).default
  const env = (k: string) => Deno.env.get(k) || ''

  for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env(k)) return json({ error: `비밀값 ${k} 가 없어요` }, 500)
  }
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

  const now = kstNow()
  let targets: string[] = []
  let test = false

  const cronSecret = env('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) {
    // 1. 예약 실행
    const { data, error } = await admin.from('user_settings')
      .select('user_id, remind_enabled, remind_weekday, remind_time, remind_sent_on')
      .eq('remind_enabled', true).eq('remind_weekday', now.weekday)
    if (error) return json({ error: error.message }, 500)
    targets = (data as RemindSetting[]).filter((s) => isDue(s, now)).map((s) => s.user_id)
  } else {
    // 2. 시험 알림: 로그인한 본인만
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data, error } = token ? await admin.auth.getUser(token) : { data: { user: null }, error: null }
    if (error || !data?.user) return json({ error: '로그인이 필요해요' }, 401)
    targets = [data.user.id]
    test = true
  }

  let sent = 0, failed = 0, removed = 0
  for (const userId of targets) {
    const [{ count }, { data: subs }] = await Promise.all([
      admin.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'needs_amount'),
      admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
    ])
    const msg = buildMessage(count || 0, test)
    let okForUser = 0
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(msg),
          { TTL: 12 * 3600, urgency: 'normal' }
        )
        sent++; okForUser++
        await admin.from('push_subscriptions').update({ last_sent_at: new Date().toISOString() }).eq('id', s.id)
      } catch (e) {
        failed++
        // 앱을 지웠거나 알림을 끈 폰: 주소를 정리한다
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) { removed++; await admin.from('push_subscriptions').delete().eq('id', s.id) }
        else console.error('보내기 실패', code, (e as Error).message)
      }
    }
    // 이번 주는 보냈다고 표시 (폰이 하나도 없으면 다음 확인 때 또 보지 않게 그래도 표시)
    if (!test) await admin.from('user_settings').update({ remind_sent_on: now.date }).eq('user_id', userId)
    if (test && !(subs || []).length) return json({ error: '이 계정에 알림 받을 폰이 없어요', sent: 0 }, 400)
    if (test && !okForUser) return json({ error: '보내지 못했어요', failed, removed }, 502)
  }
  return json({ now, targets: targets.length, sent, failed, removed })
}

// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno
if (D?.serve) D.serve(handler)
