import { createRouter, createWebHistory } from 'vue-router'
import { auth } from '@/lib/auth'
import { isConfigured } from '@/lib/supabase'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
  { path: '/setup', name: 'setup', component: () => import('@/views/SetupView.vue'), meta: { public: true } },

  // 하단 메뉴가 보이는 화면
  { path: '/', name: 'calendar', component: () => import('@/views/CalendarView.vue'), meta: { nav: true } },
  { path: '/list', name: 'list', component: () => import('@/views/ListView.vue'), meta: { nav: true } },
  { path: '/stats', name: 'stats', component: () => import('@/views/StatsView.vue'), meta: { nav: true } },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { nav: true } },

  // 입력·관리 화면 (하단 메뉴 없음)
  { path: '/entry', name: 'entry', component: () => import('@/views/EntryView.vue') },
  { path: '/entry/:id', name: 'entry-edit', component: () => import('@/views/EntryView.vue'), props: true },
  { path: '/capture', name: 'capture', component: () => import('@/views/CaptureView.vue') },
  { path: '/settings/payment-methods', name: 'payment-methods', component: () => import('@/views/PaymentMethodsView.vue') },
  { path: '/settings/categories', name: 'categories', component: () => import('@/views/CategoriesView.vue') },
  { path: '/settings/recurring', name: 'recurring', component: () => import('@/views/RecurringView.vue') },
  { path: '/stats/fixed', name: 'fixed-stats', component: () => import('@/views/FixedStatsView.vue') },
  { path: '/settings/quick', name: 'quick', component: () => import('@/views/QuickEntriesView.vue') },

  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  // 아래 메뉴 화면(기억해 두는 화면)은 보던 스크롤 위치로, 나머지는 맨 위로
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.meta.nav && scrollMemo.has(to.name)) return { top: scrollMemo.get(to.name) }
    return { top: 0 }
  }
})

const scrollMemo = new Map()
router.beforeEach((to, from) => {
  if (from.meta?.nav && from.name) scrollMemo.set(from.name, window.scrollY)
  return true
})

// 로그인 확인
router.beforeEach((to) => {
  if (!isConfigured && to.name !== 'setup') return { name: 'setup' }
  if (to.meta.public) return true
  // 로그인 결과(토큰·오류)가 붙은 주소(#…)는 다음 주소로 기억하지 않는다
  const next = to.hash ? to.path : to.fullPath
  if (!auth.user) return { name: 'login', query: next === '/' ? {} : { next } }
  return true
})

export default router
