import { reactive } from 'vue'
import { supabase, isConfigured } from './supabase'

const LAST_PROVIDER_KEY = 'ledger.lastProvider'

/** 로그인 상태 (앱 전체에서 함께 씀) */
export const auth = reactive({
  ready: false,      // 처음 세션 확인이 끝났는지
  session: null,
  get user() { return this.session?.user ?? null },
  /** 지금 로그인 방식: 'kakao' | 'google' | 'email' */
  get provider() { return this.user?.app_metadata?.provider ?? null }
})

export async function initAuth() {
  if (!isConfigured) { auth.ready = true; return }
  const { data } = await supabase.auth.getSession()
  auth.session = data.session
  auth.ready = true
  supabase.auth.onAuthStateChange((_event, session) => {
    auth.session = session
    if (session?.user?.app_metadata?.provider) {
      rememberProvider(session.user.app_metadata.provider)
    }
  })
}

/** 구글·카카오 로그인 (Supabase 대시보드에서 켜야 동작) */
export async function signInWith(provider) {
  rememberProvider(provider)
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin }
  })
  if (error) throw error
}

/** 개발용: 이메일로 로그인 링크 받기 (소셜 로그인 설정 전 테스트용) */
export async function signInWithEmail(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  })
  if (error) throw error
}

export async function signOut() {
  await supabase.auth.signOut()
}

/** "지난번에 카카오로 로그인했어요" 표시용 (이 기기에만 저장) */
export function lastProvider() {
  try { return localStorage.getItem(LAST_PROVIDER_KEY) } catch { return null }
}
function rememberProvider(p) {
  try { localStorage.setItem(LAST_PROVIDER_KEY, p) } catch { /* 저장 못 해도 괜찮음 */ }
}

export const PROVIDER_LABEL = { kakao: '카카오', google: '구글', email: '이메일' }
