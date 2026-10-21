<template>
  <OfflineScreen v-if="!online" @retry="checkOnline" />
  <LockScreen v-if="auth.user && lock.locked" />
  <!-- 로그인 상태면 잠금 설정 확인 + 고정 항목 자동 기록이 끝난 뒤에 화면을 그린다
       (잠긴 내용이 잠깐 보이지 않게, 오늘 들어온 월급이 첫 화면에 바로 보이게) -->
  <template v-if="!auth.user || (lock.loaded && rec.ready)">
    <!-- 아래 메뉴 화면은 닫지 않고 기억해 둔다 (다시 열면 보던 그대로, 데이터는 뒤에서 새로 받음).
         로그아웃하면 include 가 비어 기억해 둔 화면도 모두 버린다 -->
    <router-view v-slot="{ Component }">
      <keep-alive :include="auth.user ? KEEP : []">
        <component :is="Component" />
      </keep-alive>
    </router-view>
    <BottomNav v-if="$route.meta.nav && !lock.locked" />
  </template>
</template>

<script>
import BottomNav from './components/BottomNav.vue'
import OfflineScreen from './components/OfflineScreen.vue'
import LockScreen from './components/LockScreen.vue'
import { auth } from './lib/auth'
import { lock, initLock, resetLock } from './lib/lock'
import { recurringState, runRecurring, resetRecurring } from './lib/recurring'
import { clearCache, dataState } from './lib/sync'
import { isNative } from './lib/native'

/** 캡처 화면이 잠깐 저장해 둔 읽은 결과: 30분 지났으면(로그아웃이면 바로) 지운다 */
function dropOldCaptureDraft(all = false) {
  try {
    const d = JSON.parse(localStorage.getItem('ledger.captureDraft') || 'null')
    if (d && (all || !(Date.now() - d.savedAt < 30 * 60 * 1000))) localStorage.removeItem('ledger.captureDraft')
  } catch { try { localStorage.removeItem('ledger.captureDraft') } catch { /* 무시 */ } }
}

export default {
  name: 'App',
  components: { BottomNav, OfflineScreen, LockScreen },
  data() {
    return { online: navigator.onLine, KEEP: ['CalendarView', 'ListView', 'StatsView', 'SettingsView'] }
  },
  computed: {
    auth() { return auth },
    lock() { return lock },
    rec() { return recurringState },
    dataState() { return dataState }
  },
  watch: {
    // 앱: 고정 항목 등을 저장·삭제하면 알림 예약 다시 맞추기 (3초 모아서)
    'dataState.version'() {
      if (!isNative() || !auth.user) return
      clearTimeout(this.notifyTimer)
      this.notifyTimer = setTimeout(() => import('./lib/appNotify').then((m) => m.rescheduleAll()).catch(() => {}), 3000)
    },
    'auth.user': {
      immediate: true,
      handler(user, before) {
        if (user && !before) {
          initLock()
          runRecurring()
          // 안드로이드 앱: 폰 안 알림 예약 (웹에서는 아무것도 안 함)
          if (isNative()) import('./lib/appNotify').then((m) => m.initAppNotify(this.$router)).catch((e) => console.warn(e))
        } else if (!user) {
          resetLock()
          resetRecurring()
          clearCache()
          if (isNative()) import('./lib/appNotify').then((m) => m.cancelAllNotify()).catch(() => {})
          dropOldCaptureDraft(true)
          // 로그아웃되면 로그인 화면으로
          if (before && !this.$route.meta.public) this.$router.replace({ name: 'login' })
        }
      }
    }
  },
  mounted() {
    dropOldCaptureDraft()
    window.addEventListener('online', this.checkOnline)
    window.addEventListener('offline', this.checkOnline)
    document.addEventListener('visibilitychange', this.onVisible)
  },
  beforeUnmount() {
    window.removeEventListener('online', this.checkOnline)
    window.removeEventListener('offline', this.checkOnline)
    document.removeEventListener('visibilitychange', this.onVisible)
  },
  methods: {
    checkOnline() { this.online = navigator.onLine },
    /* 앱을 켜 둔 채 날짜가 바뀌었으면 다시 앱으로 왔을 때 그날 고정 항목을 기록한다 (하루 한 번) */
    onVisible() {
      if (document.visibilityState === 'visible' && auth.user) {
        runRecurring()
        // 앱: 돌아올 때 알림 예약 다시 맞추기 (1시간에 한 번까지)
        if (isNative() && Date.now() - (this.notifyAt || 0) > 3600000) {
          this.notifyAt = Date.now()
          import('./lib/appNotify').then((m) => m.rescheduleAll()).catch(() => {})
        }
      }
    }
  }
}
</script>
