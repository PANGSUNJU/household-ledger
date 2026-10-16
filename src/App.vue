<template>
  <OfflineScreen v-if="!online" @retry="checkOnline" />
  <router-view />
  <BottomNav v-if="$route.meta.nav" />
</template>

<script>
import BottomNav from './components/BottomNav.vue'
import OfflineScreen from './components/OfflineScreen.vue'
import { auth } from './lib/auth'

export default {
  name: 'App',
  components: { BottomNav, OfflineScreen },
  data() {
    return { online: navigator.onLine }
  },
  watch: {
    // 로그아웃되면 로그인 화면으로
    'auth.user'(user) {
      if (!user && !this.$route.meta.public) this.$router.replace({ name: 'login' })
    }
  },
  computed: {
    auth() { return auth }
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
