<template>
  <div class="pinpad">
    <div class="dots" :class="{ shake }" role="status" :aria-label="`4자리 중 ${value.length}자리 입력됨`">
      <span v-for="i in 4" :key="i" :class="{ on: i <= value.length }" />
    </div>
    <p class="msg" :class="{ error: !!error }" aria-live="polite">{{ error || hint }}</p>
    <div class="keys">
      <button v-for="n in [1, 2, 3, 4, 5, 6, 7, 8, 9]" :key="n" type="button" :disabled="disabled" @click="press(n)">{{ n }}</button>
      <span />
      <button type="button" :disabled="disabled" @click="press(0)">0</button>
      <button type="button" class="back" aria-label="지우기" :disabled="disabled" @click="value = value.slice(0, -1)">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" /><path d="M17 9l-5 6M12 9l5 6" /></svg>
      </button>
    </div>
  </div>
</template>

<script>
/* 숫자 4자리 입력 키패드 (잠금 화면, 잠금 비밀번호 정하기) */
export default {
  name: 'PinPad',
  props: {
    hint: { type: String, default: '숫자 4자리' },
    error: { type: String, default: '' },
    disabled: { type: Boolean, default: false }
  },
  emits: ['complete'],
  data() { return { value: '', shake: false } },
  mounted() { window.addEventListener('keydown', this.onKey) },
  beforeUnmount() { window.removeEventListener('keydown', this.onKey) },
  methods: {
    press(n) {
      if (this.value.length >= 4) return
      this.value += String(n)
      if (this.value.length === 4) {
        const v = this.value
        setTimeout(() => this.$emit('complete', v), 120)
      }
    },
    /** 부모가 틀렸을 때 호출: 흔들고 비우기 */
    reset(withShake = false) {
      this.value = ''
      if (withShake) { this.shake = true; setTimeout(() => { this.shake = false }, 400) }
    },
    onKey(e) {
      if (this.disabled) return
      if (/^[0-9]$/.test(e.key)) this.press(Number(e.key))
      else if (e.key === 'Backspace') this.value = this.value.slice(0, -1)
    }
  }
}
</script>

<style scoped>
.pinpad { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.dots { display: flex; gap: 18px; padding: 8px 0; }
.dots span { width: 16px; height: 16px; border-radius: 8px; background: var(--line); }
.dots span.on { background: #E8806A; }
.dots.shake { animation: shake 0.35s; }
@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
.msg { margin: 0; min-height: 20px; font-size: 14px; color: var(--text-sub); }
.msg.error { color: var(--expense); }
.keys { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 28px; width: 100%; max-width: 300px; }
.keys button { height: 68px; border: 0; border-radius: 34px; background: var(--surface); font-size: 26px; font-weight: 500; }
.keys button:disabled { opacity: 0.5; }
.keys .back { background: transparent; color: var(--text-sub); display: flex; align-items: center; justify-content: center; }
</style>
