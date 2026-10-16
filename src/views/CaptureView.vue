<template>
  <main class="frame">
    <ScreenHeader title="캡처로 입력" back="back" fallback="/entry" />
    <div class="body">
      <ComingNext title="캡처로 입력" board="캡처 분석 확인 (③ 단계)" />
    </div>
  </main>
</template>

<script>
import ScreenHeader from '@/components/ScreenHeader.vue'
import ComingNext from '@/components/ComingNext.vue'

export default {
  name: 'CaptureView',
  components: { ScreenHeader, ComingNext }
}
</script>

<style scoped>
.body { padding: 4px 16px 24px 16px; }
</style>
