<template>
  <div class="m-row">
    <slot name="lead" />
    <span class="label"><slot /></span>
    <slot name="trail" />
    <!-- 순서 바꾸기: 이 손잡이를 잡고 위아래로 끌기 (목록에 v-sortable) -->
    <span v-if="movable" class="drag-handle" role="img" :aria-label="name + ' 순서 바꾸기 손잡이'">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14" /></svg>
    </span>
  </div>
</template>

<script>
/* 관리 화면 한 줄: 앞 표시 + 이름 + 버튼들 + 순서 바꾸기 손잡이(≡, 끌기) */
export default {
  name: 'ManageRow',
  props: {
    name: { type: String, default: '' },
    movable: { type: Boolean, default: true }
  }
}
</script>

<style scoped>
.m-row { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 8px 0 16px; }
.m-row + .m-row { border-top: 1px solid var(--line-soft); }
.label { flex: 1; min-width: 0; font-size: 15px; display: flex; flex-direction: column; }
.drag-handle {
  width: 40px; height: 44px; margin-right: -4px; display: flex; align-items: center; justify-content: center;
  color: #A89C96; cursor: grab; touch-action: none;   /* 손잡이에서는 화면 밀기 대신 끌기 */
  -webkit-user-select: none; user-select: none;
}
.drag-handle:active { cursor: grabbing; }
/* 끄는 중 (SortableJS 가 붙이는 이름) */
.m-row.drag-ghost { opacity: 0.35; }
.m-row.drag-float { background: var(--surface); box-shadow: 0 8px 24px rgba(60, 40, 30, 0.18); border-radius: 12px; opacity: 0.95 !important; }
</style>
