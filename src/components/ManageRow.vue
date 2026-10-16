<template>
  <div class="m-row">
    <slot name="lead" />
    <span class="label"><slot /></span>
    <slot name="trail" />
    <div v-if="movable" class="order">
      <button type="button" :disabled="first" :aria-label="name + ' 위로'" @click="$emit('up')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
      </button>
      <button type="button" :disabled="last" :aria-label="name + ' 아래로'" @click="$emit('down')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
    </div>
  </div>
</template>

<script>
/* 관리 화면 한 줄: 앞 표시 + 이름 + 버튼들 + 순서 바꾸기(위/아래) */
export default {
  name: 'ManageRow',
  props: {
    name: { type: String, default: '' },
    movable: { type: Boolean, default: true },
    first: { type: Boolean, default: false },
    last: { type: Boolean, default: false }
  },
  emits: ['up', 'down']
}
</script>

<style scoped>
.m-row { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 8px 0 16px; }
.m-row + .m-row { border-top: 1px solid var(--line-soft); }
.label { flex: 1; min-width: 0; font-size: 15px; display: flex; flex-direction: column; }
.order { display: flex; flex-direction: column; }
.order button { width: 32px; height: 22px; border: 0; background: transparent; color: #8A7E78; display: flex; align-items: center; justify-content: center; }
.order button:disabled { color: #DDD3CC; cursor: default; }
</style>
