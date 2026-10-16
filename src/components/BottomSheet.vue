<template>
  <div v-if="open" class="sheet-wrap">
    <div class="backdrop" aria-hidden="true" @click="$emit('close')" />
    <section class="sheet" role="dialog" aria-modal="true" :aria-label="title" @keydown.esc="$emit('close')">
      <span class="handle" aria-hidden="true" />
      <div class="sheet-head">
        <h2>{{ title }}</h2>
        <button type="button" class="x" aria-label="닫기" @click="$emit('close')"><AppIcon name="close" :size="20" /></button>
      </div>
      <slot />
    </section>
  </div>
</template>

<script>
import AppIcon from './AppIcon.vue'

export default {
  name: 'BottomSheet',
  components: { AppIcon },
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, required: true }
  },
  emits: ['close']
}
</script>

<style scoped>
.sheet-wrap { position: fixed; inset: 0; z-index: 50; }
.backdrop { position: absolute; inset: 0; background: rgba(58, 51, 48, 0.32); }
.sheet {
  position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px;
  max-height: 88dvh; overflow-y: auto; background: var(--surface); border-radius: 22px 22px 0 0;
  padding: 10px 16px calc(24px + env(safe-area-inset-bottom)) 16px; display: flex; flex-direction: column; gap: 14px;
}
.handle { align-self: center; width: 40px; height: 5px; border-radius: 3px; background: var(--border); }
.sheet-head { display: flex; align-items: center; justify-content: space-between; }
.sheet-head h2 { margin: 0; font-size: 18px; }
.x { width: 40px; height: 40px; border: 0; background: transparent; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
</style>
