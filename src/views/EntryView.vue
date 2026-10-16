<template>
  <main class="frame">
    <ScreenHeader title="기록 추가" back="close" fallback="/" />
    <div class="body">
      <ComingNext title="기록 추가" board="지출 입력 · 환불 입력" />
    </div>
  </main>
</template>

<script>
import ScreenHeader from '@/components/ScreenHeader.vue'
import ComingNext from '@/components/ComingNext.vue'

export default {
  name: 'EntryView',
  props: { id: { type: String, default: null } },
  components: { ScreenHeader, ComingNext }
}
</script>

<style scoped>
.body { padding: 4px 16px 24px 16px; }
</style>
