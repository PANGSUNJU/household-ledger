/*
 * 안드로이드 앱(Capacitor) 안에서만 쓰는 것
 *  · 웹(브라우저)에서는 아무 일도 하지 않는다 → 웹 동작은 그대로
 *  · 로그인: 카카오·구글은 앱 안 화면에서 막히므로 폰 기본 브라우저로 열고,
 *    끝나면 dev.pang7163y.ledger://login 주소로 앱에 돌아온다 (Supabase Redirect URLs 에 등록 필요)
 *  · 뒤로 가기 버튼: 앞 화면이 있으면 뒤로, 없으면 앱을 닫지 않고 내려 둔다
 */
import { Capacitor } from '@capacitor/core'

export const NATIVE_REDIRECT = 'dev.pang7163y.ledger://login'

export function isNative() {
  try { return Capacitor.isNativePlatform() } catch { return false }
}

/** 폰 기본 브라우저(앱 위에 뜨는 창)로 주소 열기 */
export async function openInBrowser(url) {
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url })
}

/** 로그인에서 돌아온 주소 → { access_token, refresh_token } | { code } | { error } | null */
export function parseAuthReturn(url) {
  if (!url || !url.startsWith(NATIVE_REDIRECT)) return null
  const rest = url.slice(NATIVE_REDIRECT.length)
  const hash = new URLSearchParams((rest.split('#')[1] || ''))
  const query = new URLSearchParams(((rest.split('#')[0].split('?')[1]) || ''))
  const get = (k) => hash.get(k) || query.get(k)
  const desc = get('error_description') || get('error')
  if (desc) return { error: desc }
  if (get('access_token') && get('refresh_token')) return { access_token: get('access_token'), refresh_token: get('refresh_token') }
  if (get('code')) return { code: get('code') }
  return null
}

/**
 * 앱 시작할 때 한 번 (웹에서는 아무것도 안 함)
 * onAuthReturn(result): 로그인에서 돌아왔을 때
 */
export async function initNative({ onAuthReturn }) {
  if (!isNative()) return
  const { App } = await import('@capacitor/app')
  const handle = async (url) => {
    const r = parseAuthReturn(url)
    if (!r) return
    try { const { Browser } = await import('@capacitor/browser'); await Browser.close() } catch { /* 이미 닫힘 */ }
    await onAuthReturn(r)
  }
  App.addListener('appUrlOpen', ({ url }) => handle(url))
  // 앱이 꺼져 있다가 로그인 주소로 열린 경우
  try { const launch = await App.getLaunchUrl(); if (launch?.url) await handle(launch.url) } catch { /* 없음 */ }
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else App.minimizeApp()
  })
}
