<template>
  <header class="screen-header">
    <button v-if="back" type="button" class="icon-btn" :aria-label="backLabel" @click="goBack">
      <AppIcon :name="back === 'close' ? 'close' : 'back'" :size="22" />
    </button>
    <h1>{{ title }}</h1>
    <div class="actions"><slot /></div>
  </header>
</template>

<script>
import AppIcon from './AppIcon.vue'

export default {
  name: 'ScreenHeader',
  components: { AppIcon },
  props: {
    title: { type: String, required: true },
    /** 'back' | 'close' | false */
    back: { type: [String, Boolean], default: 'back' },
    fallback: { type: String, default: '/' }
  },
  computed: {
    backLabel() { return this.back === 'close' ? '닫기' : '뒤로' }
  },
  methods: {
    goBack() {
      if (window.history.length > 1) this.$router.back()
      else this.$router.push(this.fallback)
    }
  }
}
</script>

<style scoped>
.screen-header { display: flex; align-items: center; gap: 4px; padding: 10px 8px 4px 8px; min-height: 58px; }
h1 { margin: 0; font-size: 17px; font-weight: 600; flex-grow: 1; }
.icon-btn {
  width: var(--tap); height: var(--tap); border: 0; background: transparent; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
}
.actions { display: flex; align-items: center; gap: 8px; padding-right: 8px; }
</style>
