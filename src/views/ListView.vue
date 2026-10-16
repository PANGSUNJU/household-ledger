<template>
  <main class="page">
    <h1 class="page-title">내역</h1>
    <ComingNext title="내역" board="내역 목록·검색" />
  </main>
</template>

<script>
import ComingNext from '@/components/ComingNext.vue'

export default {
  name: 'ListView',
  components: { ComingNext }
}
</script>
