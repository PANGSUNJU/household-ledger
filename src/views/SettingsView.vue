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
      <div class="row">
        <span class="row-icon" style="background: #FFE6DA; color: #8E3F33"><AppIcon name="lock" :size="16" /></span>
        <span class="row-label two-line">
          <label for="lock-switch">화면 잠금</label>
          <span class="muted small">앱을 열 때 숫자 4자리를 물어봐요</span>
        </span>
        <button
          id="lock-switch" type="button" role="switch" class="switch" :class="{ on: lock.enabled }"
          :aria-checked="lock.enabled" :disabled="busy" @click="toggleLock"
        ><span class="knob" /></button>
      </div>
      <div class="row timeout" :class="{ disabled: !lock.enabled }">
        <span class="row-label">다시 묻는 시간</span>
        <div v-if="lock.enabled" class="times" role="radiogroup" aria-label="다시 묻는 시간">
          <button
            v-for="t in TIMEOUTS" :key="t.v" type="button" role="radio"
            :aria-checked="lock.timeout === t.v" :class="{ on: lock.timeout === t.v }" @click="chooseTimeout(t.v)"
          >{{ t.t }}</button>
        </div>
        <span v-else class="muted small">잠금을 켜면 고를 수 있어요</span>
      </div>
      <p v-if="lockError" class="lock-error" role="alert">{{ lockError }}</p>
    </section>

    <section class="card menu" aria-label="기타">
      <button type="button" class="row logout" @click="logout">로그아웃</button>
    </section>

    <!-- 잠금 비밀번호 정하기: 두 번 입력 -->
    <BottomSheet :open="pinSheet" :title="pinStep === 1 ? '잠금 비밀번호 정하기' : '한 번 더 입력해 주세요'" @close="pinSheet = false">
      <PinPad
        :key="pinStep" ref="pad" :hint="pinStep === 1 ? '숫자 4자리' : '확인을 위해 같은 숫자를 한 번 더'"
        :error="pinError" :disabled="busy" @complete="onPin"
      />
      <p class="muted small center">잊어버리면 로그아웃 후 다시 로그인해서 새로 정할 수 있어요.</p>
    </BottomSheet>
  </main>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import PinPad from '@/components/PinPad.vue'
import { auth, signOut, PROVIDER_LABEL } from '@/lib/auth'
import { lock, TIMEOUTS } from '@/lib/lock'
import { setLockPin, disableLock, setLockTimeout } from '@/lib/api'

export default {
  name: 'SettingsView',
  components: { AppIcon, BottomSheet, PinPad },
  data() {
    return {
      TIMEOUTS, busy: false, lockError: '',
      pinSheet: false, pinStep: 1, firstPin: '', pinError: '',
      menu: [
        { to: '/settings/recurring', label: '고정 수입·지출', icon: 'repeat', bg: '#E9E3FA', fg: '#4F3F86' },
        { to: '/settings/payment-methods', label: '결제수단 관리', icon: 'card', bg: '#FFE6DA', fg: '#8E3F33' },
        { to: '/settings/categories', label: '분류 관리', icon: 'grid', bg: '#DCF1E6', fg: '#2E6A4E' },
        { to: '/settings/quick', label: '자주 쓰는 내역', icon: 'bolt', bg: '#FFF1C7', fg: '#5E4710' }
      ]
    }
  },
  computed: {
    lock() { return lock },
    provider() { return auth.provider },
    providerLabel() { return PROVIDER_LABEL[auth.provider] || '계정' },
    providerInitial() { return { kakao: 'K', google: 'G' }[auth.provider] || '@' },
    displayName() {
      const m = auth.user?.user_metadata || {}
      return m.name || m.full_name || m.nickname || auth.user?.email || '내 계정'
    }
  },
  methods: {
    async toggleLock() {
      this.lockError = ''
      if (!lock.enabled) {
        this.pinStep = 1; this.firstPin = ''; this.pinError = ''; this.pinSheet = true
        return
      }
      this.busy = true
      try {
        await disableLock()
        lock.enabled = false
      } catch (e) {
        this.lockError = '잠금을 끄지 못했어요. 다시 해 주세요.'
        console.error(e)
      } finally { this.busy = false }
    },
    async onPin(pin) {
      this.pinError = ''
      if (this.pinStep === 1) {
        this.firstPin = pin
        this.pinStep = 2
        return
      }
      if (pin !== this.firstPin) {
        this.pinError = '두 번 입력한 숫자가 달라요. 처음부터 다시 해 주세요.'
        this.pinStep = 1; this.firstPin = ''
        return
      }
      this.busy = true
      try {
        await setLockPin(pin)
        lock.enabled = true
        this.pinSheet = false
      } catch (e) {
        this.pinError = '저장하지 못했어요. 다시 해 주세요.'
        this.pinStep = 1; this.firstPin = ''
        console.error(e)
      } finally { this.busy = false }
    },
    async chooseTimeout(sec) {
      const before = lock.timeout
      lock.timeout = sec
      try { await setLockTimeout(sec) } catch (e) {
        lock.timeout = before
        this.lockError = '바꾸지 못했어요.'
        console.error(e)
      }
    },
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
.two-line { display: flex; flex-direction: column; }
.switch { position: relative; width: 52px; height: 32px; flex-shrink: 0; border: 0; border-radius: 16px; background: var(--border); transition: background 0.15s; }
.switch.on { background: #E8806A; }
.switch .knob { position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 13px; background: #FFFFFF; box-shadow: 0 1px 3px rgba(120, 90, 70, 0.25); transition: left 0.15s; }
.switch.on .knob { left: 23px; }
.timeout { flex-wrap: wrap; padding-top: 8px; padding-bottom: 8px; }
.timeout.disabled .row-label { color: var(--text-faint); }
.times { display: flex; gap: 6px; }
.times button { height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); font-size: 13px; }
.times button.on { border-color: #E8806A; background: #FFE6DA; color: #8E3F33; font-weight: 600; }
.lock-error { margin: 0; padding: 0 16px 12px 16px; font-size: 13px; color: var(--expense); }
.center { text-align: center; margin: 0; }
</style>
