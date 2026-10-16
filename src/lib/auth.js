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

/**
 * Supabase 대시보드에서 이 로그인 방식이 켜져 있는지 확인.
 * 꺼진 채로 넘어가면 "Unsupported provider" 영어 오류 화면이 떠서, 먼저 확인한다.
 * 확인 자체가 실패하면 true (일단 진행)
 */
export async function isProviderEnabled(provider) {
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }
    })
    if (!res.ok) return true
    const settings = await res.json()
    return settings?.external?.[provider] !== false
  } catch {
    return true
  }
}

export class ProviderDisabledError extends Error {
  constructor(provider) {
    super(`${provider} login is not enabled`)
    this.provider = provider
  }
}

/** 구글·카카오 로그인 (Supabase 대시보드에서 켜야 동작) */
export async function signInWith(provider) {
  if (!(await isProviderEnabled(provider))) throw new ProviderDisabledError(provider)
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
