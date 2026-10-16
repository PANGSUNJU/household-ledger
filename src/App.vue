<template>
  <OfflineScreen v-if="!online" @retry="checkOnline" />
  <LockScreen v-if="auth.user && lock.locked" />
  <!-- 로그인 상태면 잠금 설정을 확인한 뒤에 화면을 그린다 (잠긴 내용이 잠깐 보이지 않게) -->
  <template v-if="!auth.user || lock.loaded">
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

export default {
  name: 'App',
  components: { BottomNav, OfflineScreen, LockScreen },
  data() {
    return { online: navigator.onLine }
  },
  computed: {
    auth() { return auth },
    lock() { return lock }
  },
  watch: {
    'auth.user': {
      immediate: true,
      handler(user, before) {
        if (user && !before) {
          initLock()
        } else if (!user) {
          resetLock()
          // 로그아웃되면 로그인 화면으로
          if (before && !this.$route.meta.public) this.$router.replace({ name: 'login' })
        }
      }
    }
  },
  mounted() {
    window.addEventListener('online', this.checkOnline)
    window.addEventListener('offline', this.checkOnline)
  },
  beforeUnmount() {
    window.removeEventListener('online', this.checkOnline)
    window.removeEventListener('offline', this.checkOnline)
  },
  methods: {
    checkOnline() { this.online = navigator.onLine }
  }
}
</script>
