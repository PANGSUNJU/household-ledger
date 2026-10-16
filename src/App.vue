<template>
  <OfflineScreen v-if="!online" @retry="checkOnline" />
  <LockScreen v-if="auth.user && lock.locked" />
  <!-- 로그인 상태면 잠금 설정 확인 + 고정 항목 자동 기록이 끝난 뒤에 화면을 그린다
       (잠긴 내용이 잠깐 보이지 않게, 오늘 들어온 월급이 첫 화면에 바로 보이게) -->
  <template v-if="!auth.user || (lock.loaded && rec.ready)">
    <router-view />
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

export default {
  name: 'App',
  components: { BottomNav, OfflineScreen, LockScreen },
  data() {
    return { online: navigator.onLine }
  },
  computed: {
    auth() { return auth },
    lock() { return lock },
    rec() { return recurringState }
  },
  watch: {
    'auth.user': {
      immediate: true,
      handler(user, before) {
        if (user && !before) {
          initLock()
          runRecurring()
        } else if (!user) {
          resetLock()
          resetRecurring()
          // 로그아웃되면 로그인 화면으로
          if (before && !this.$route.meta.public) this.$router.replace({ name: 'login' })
        }
      }
    }
  },
  mounted() {
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
      if (document.visibilityState === 'visible' && auth.user) runRecurring()
    }
  }
}
</script>
