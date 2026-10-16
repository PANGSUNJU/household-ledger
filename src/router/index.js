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
  { path: '/settings/quick', name: 'quick', component: () => import('@/views/QuickEntriesView.vue') },

  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

// 로그인 확인
router.beforeEach((to) => {
  if (!isConfigured && to.name !== 'setup') return { name: 'setup' }
  if (to.meta.public) return true
  if (!auth.user) return { name: 'login', query: { next: to.fullPath } }
  return true
})

export default router
