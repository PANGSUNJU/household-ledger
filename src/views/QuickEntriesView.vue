<template>
  <main class="frame">
    <ScreenHeader title="자주 쓰는 내역" back="back" fallback="/settings" />
    <div class="body">
      <ComingNext title="자주 쓰는 내역" board="자주 쓰는 내역 관리" />
    </div>
  </main>
</template>

<script>
import ScreenHeader from '@/components/ScreenHeader.vue'
import ComingNext from '@/components/ComingNext.vue'

export default {
  name: 'QuickEntriesView',
  components: { ScreenHeader, ComingNext }
}
</script>

<style scoped>
.body { padding: 4px 16px 24px 16px; }
</style>
