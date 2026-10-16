<template>
  <div class="coming card">
    <strong>{{ title }}</strong>
    <span>다음 단계에서 이 화면을 채워요. 디자인: "기본 + 파스텔 색" 페이지의 {{ board }}</span>
  </div>
</template>

<script>
/* 뼈대 단계 표시용. 화면을 채우면 지운다. */
export default {
  name: 'ComingNext',
  props: {
    title: { type: String, default: '준비 중' },
    board: { type: String, required: true }
  }
}
</script>

<style scoped>
.coming {
  display: flex; flex-direction: column; gap: 6px; padding: 16px;
  border: 1.5px dashed var(--border); background: transparent;
  font-size: 13px; color: var(--text-sub); line-height: 19px;
}
.coming strong { color: var(--text); font-size: 15px; }
</style>
