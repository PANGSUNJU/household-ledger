import { reactive } from 'vue'
import { supabase, isConfigured } from './supabase'
import { isNative, NATIVE_REDIRECT, openInBrowser, initNative } from './native'

const LAST_PROVIDER_KEY = 'ledger.lastProvider'

/** 로그인 상태 (앱 전체에서 함께 씀) */
export const auth = reactive({
  ready: false,      // 처음 세션 확인이 끝났는지
  session: null,
  /** 카카오·구글에서 돌아올 때 생긴 오류 (예: 동의 취소) — 로그인 화면에 보여준다 */
  returnError: '',
  get user() { return this.session?.user ?? null },
  /** 지금 로그인 방식: 'kakao' | 'google' | 'email' */
  get provider() { return this.user?.app_metadata?.provider ?? null }
})

export async function initAuth() {
  if (!isConfigured) { auth.ready = true; return }
  auth.returnError = readReturnError()
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    auth.session = data.session
  } catch (e) {
    console.warn('로그인 상태를 확인하지 못했어요', e)
    auth.session = null
    if (!auth.returnError) auth.returnError = '로그인 상태를 확인하지 못했어요. 다시 로그인해 주세요.'
  }
  auth.ready = true
  // 안드로이드 앱: 폰 브라우저에서 로그인하고 돌아오면 그 결과로 로그인
  initNative({
    onAuthReturn: async (r) => {
      try {
        if (r.error) { auth.returnError = /access_denied|cancel/i.test(r.error) ? '로그인을 취소했어요.' : `로그인하지 못했어요. (${r.error.slice(0, 80)})`; return }
        const { error } = r.code
          ? await supabase.auth.exchangeCodeForSession(r.code)
          : await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token })
        if (error) throw error
      } catch (e) {
        console.warn('앱 로그인 실패', e)
        auth.returnError = '로그인하지 못했어요. 다시 해 주세요.'
      }
    }
  }).catch((e) => console.warn('앱 기능 준비 실패', e))
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
  if (isNative()) {
    // 앱: 카카오·구글 화면을 폰 브라우저로 열고, 끝나면 앱 주소로 돌아온다
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true }
    })
    if (error) throw error
    await openInBrowser(data.url)
    return
  }
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
    options: { emailRedirectTo: isNative() ? NATIVE_REDIRECT : window.location.origin }
  })
  if (error) throw error
}

/**
 * 로그아웃: 이 기기의 로그인 정보는 인터넷이 불안해도 반드시 지운다 (scope: local)
 * (서버 응답 실패로 로그인 정보가 남으면 잠금 화면 '비밀번호를 잊었어요'가 잠금을 풀어 버릴 수 있다)
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) console.warn('로그아웃 중 오류', error)
  } catch (e) {
    console.warn('로그아웃 중 오류', e)
  }
  auth.session = null
}

/** 카카오·구글이 돌려준 오류(주소 뒤 error_description)를 읽고 주소에서 지운다 */
function readReturnError() {
  try {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const q = new URLSearchParams(window.location.search)
    const desc = hash.get('error_description') || q.get('error_description') || ''
    const code = hash.get('error') || q.get('error') || ''
    if (!desc && !code) return ''
    window.history.replaceState(null, '', window.location.pathname)
    if (/access_denied|cancel/i.test(code + desc)) return '로그인을 취소했어요.'
    if (/email/i.test(desc)) return '카카오에서 이메일을 받지 못해 로그인하지 못했어요. Supabase 카카오 설정의 "Allow users without an email"을 켜 주세요.'
    return `로그인하지 못했어요. (${(desc || code).slice(0, 80)})`
  } catch {
    return ''
  }
}

/** "지난번에 카카오로 로그인했어요" 표시용 (이 기기에만 저장) */
export function lastProvider() {
  try { return localStorage.getItem(LAST_PROVIDER_KEY) } catch { return null }
}
function rememberProvider(p) {
  try { localStorage.setItem(LAST_PROVIDER_KEY, p) } catch { /* 저장 못 해도 괜찮음 */ }
}

export const PROVIDER_LABEL = { kakao: '카카오', google: '구글', email: '이메일' }
