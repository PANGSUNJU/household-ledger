<template>
  <nav class="bottom-nav" aria-label="주요 메뉴">
    <router-link
      v-for="item in items" :key="item.to" :to="item.to"
      class="nav-item" active-class="is-active"
    >
      <AppIcon :name="item.icon" />
      <span>{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<script>
import AppIcon from './AppIcon.vue'

export default {
  name: 'BottomNav',
  components: { AppIcon },
  data() {
    return {
      items: [
        { to: '/', label: '캘린더', icon: 'calendar' },
        { to: '/list', label: '내역', icon: 'list' },
        { to: '/stats', label: '통계', icon: 'chart' },
        { to: '/settings', label: '설정', icon: 'settings' }
      ]
    }
  }
}
</script>

<style scoped>
.bottom-nav {
  position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
  width: 100%; max-width: 480px; height: calc(var(--nav-h) + env(safe-area-inset-bottom));
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  background: var(--surface); border-top: 1px solid var(--line);
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  z-index: 10;
}
.nav-item {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  color: var(--text-sub); text-decoration: none; font-size: 12px; font-weight: 500;
}
.nav-item.is-active { color: var(--accent); font-weight: 600; }
</style>
