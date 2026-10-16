<template>
  <main class="frame">
    <ScreenHeader title="분류 관리" back="back" fallback="/settings" />
    <div class="body">
      <ComingNext title="분류 관리" board="분류 관리" />
    </div>
  </main>
</template>

<script>
import ScreenHeader from '@/components/ScreenHeader.vue'
import ComingNext from '@/components/ComingNext.vue'

export default {
  name: 'CategoriesView',
  components: { ScreenHeader, ComingNext }
}
</script>

<style scoped>
.body { padding: 4px 16px 24px 16px; }
</style>
