<template>
  <div class="lock" role="dialog" aria-modal="true" aria-label="화면 잠금">
    <div class="icon"><AppIcon name="lock" :size="28" /></div>
    <h1>비밀번호를 입력해 주세요</h1>
    <PinPad ref="pad" :error="error" :disabled="checking" @complete="check" />
    <button type="button" class="forgot" @click="forgot">비밀번호를 잊었어요 (다시 로그인)</button>
  </div>
</template>

<script>
import AppIcon from './AppIcon.vue'
import PinPad from './PinPad.vue'
import { verifyLockPin } from '@/lib/api'
import { lock } from '@/lib/lock'
import { signOut } from '@/lib/auth'

export default {
  name: 'LockScreen',
  components: { AppIcon, PinPad },
  data() { return { error: '', checking: false } },
  methods: {
    async check(pin) {
      this.checking = true; this.error = ''
      try {
        if (await verifyLockPin(pin)) {
          lock.locked = false
        } else {
          this.error = '비밀번호가 달라요'
          this.$refs.pad.reset(true)
        }
      } catch (e) {
        this.error = '확인하지 못했어요. 인터넷 연결을 확인해 주세요.'
        this.$refs.pad.reset()
        console.error(e)
      } finally {
        this.checking = false
      }
    },
    /* 잊었으면 로그아웃 → 다시 로그인한 뒤 설정에서 잠금을 껐다 켜서 새로 정한다 */
    async forgot() {
      await signOut()
      lock.locked = false
      this.$router.replace({ name: 'login' })
    }
  }
}
</script>

<style scoped>
.lock {
  position: fixed; inset: 0; z-index: 90; background: var(--bg);
  display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 100px 32px 40px 32px;
}
.icon { width: 56px; height: 56px; border-radius: 16px; background: #FFE6DA; color: #8E3F33; display: flex; align-items: center; justify-content: center; }
h1 { margin: 0; font-size: 20px; }
.forgot { margin-top: auto; border: 0; background: transparent; color: var(--accent); font-size: 14px; padding: 12px; }
</style>
