<template>
  <main class="page settings">
    <h1 class="page-title">설정</h1>

    <section class="card account" aria-label="계정">
      <span class="avatar" :class="provider" aria-hidden="true">{{ providerInitial }}</span>
      <div>
        <strong>{{ displayName }}</strong>
        <span class="muted">{{ providerLabel }}로 로그인됨</span>
      </div>
    </section>

    <section class="card menu" aria-label="가계부 관리">
      <h2>가계부 관리</h2>
      <router-link v-for="item in menu" :key="item.to" :to="item.to" class="row">
        <span class="row-icon" :style="{ background: item.bg, color: item.fg }"><AppIcon :name="item.icon" :size="16" /></span>
        <span class="row-label">{{ item.label }}</span>
        <AppIcon name="next" :size="18" class="chev" />
      </router-link>
    </section>

    <section class="card menu" aria-label="보안">
      <h2>보안</h2>
      <div class="row static">
        <span class="row-icon" style="background: #FFE6DA; color: #8E3F33"><AppIcon name="lock" :size="16" /></span>
        <span class="row-label">화면 잠금 <span class="muted small">· 다음 단계에서 연결해요</span></span>
      </div>
    </section>

    <section class="card menu" aria-label="기타">
      <button type="button" class="row logout" @click="logout">로그아웃</button>
    </section>
  </main>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import { auth, signOut, PROVIDER_LABEL } from '@/lib/auth'

export default {
  name: 'SettingsView',
  components: { AppIcon },
  data() {
    return {
      menu: [
        { to: '/settings/payment-methods', label: '결제수단 관리', icon: 'card', bg: '#FFE6DA', fg: '#8E3F33' },
        { to: '/settings/categories', label: '분류 관리', icon: 'grid', bg: '#DCF1E6', fg: '#2E6A4E' },
        { to: '/settings/quick', label: '자주 쓰는 내역', icon: 'bolt', bg: '#FFF1C7', fg: '#5E4710' }
      ]
    }
  },
  computed: {
    provider() { return auth.provider },
    providerLabel() { return PROVIDER_LABEL[auth.provider] || '계정' },
    providerInitial() { return { kakao: 'K', google: 'G' }[auth.provider] || '@' },
    displayName() {
      const m = auth.user?.user_metadata || {}
      return m.name || m.full_name || m.nickname || auth.user?.email || '내 계정'
    }
  },
  methods: {
    async logout() {
      await signOut()
      this.$router.replace({ name: 'login' })
    }
  }
}
</script>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 14px; }
.account { padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
.account div { display: flex; flex-direction: column; }
.account strong { font-size: 16px; }
.account .muted { font-size: 13px; }
.avatar {
  width: 44px; height: 44px; border-radius: 22px; background: var(--surface-sunken);
  display: flex; align-items: center; justify-content: center; font-weight: 700;
}
.avatar.kakao { background: #FEE500; color: #191600; }
.avatar.google { background: var(--surface); border: 1.5px solid var(--text); }
.menu { display: flex; flex-direction: column; }
.menu h2 { margin: 0; padding: 14px 16px 4px 16px; font-size: 13px; font-weight: 600; color: var(--text-sub); }
.row {
  display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 0 16px;
  color: var(--text); text-decoration: none; font-size: 15px;
}
.row + .row { border-top: 1px solid var(--line-soft); }
.row-icon { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; }
.row-label { flex: 1; }
.chev { color: #B8A69C; }
.small { font-size: 12px; }
.logout { border: 0; background: transparent; text-align: left; color: var(--expense); width: 100%; }
</style>
