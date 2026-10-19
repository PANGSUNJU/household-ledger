/*
 * v-sortable: 관리 화면 목록을 손잡이(≡)로 끌어서 순서 바꾸기
 *  · <section v-sortable="onSort"> 안의 .m-row 를 .drag-handle 로만 끈다
 *    (줄의 다른 곳을 밀면 평소처럼 화면이 내려감)
 *  · 놓으면 화면(DOM)은 원래대로 돌려 두고 onSort(from, to) 만 부른다
 *    → 순서는 Vue 데이터가 정함 (SortableJS 와 Vue 가 서로 DOM 을 건드려 꼬이지 않게)
 */
import Sortable from 'sortablejs'

export default {
  mounted(el, binding) {
    el._onSort = binding.value
    el._sortable = Sortable.create(el, {
      handle: '.drag-handle',
      draggable: '.m-row',
      animation: 150,
      forceFallback: true,        // 폰·PC 모두 같은 방식으로 끌기
      fallbackTolerance: 4,
      ghostClass: 'drag-ghost',
      chosenClass: 'drag-chosen',
      fallbackClass: 'drag-float',
      onEnd(evt) {
        const { item, from, oldIndex, newIndex, oldDraggableIndex: o, newDraggableIndex: n } = evt
        if (oldIndex === newIndex) return
        from.removeChild(item)
        from.insertBefore(item, from.children[oldIndex] || null)
        if (o !== n) el._onSort?.(o, n)
      }
    })
  },
  updated(el, binding) { el._onSort = binding.value },
  unmounted(el) { el._sortable?.destroy() }
}
