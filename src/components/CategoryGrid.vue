<template>
  <div class="cat-grid" role="radiogroup" :aria-label="label">
    <button
      v-for="c in categories" :key="c.id" type="button" role="radio"
      class="cat" :class="{ selected: c.id === modelValue }"
      :aria-checked="c.id === modelValue"
      :style="styleFor(c)"
      @click="$emit('update:modelValue', c.id === modelValue ? null : c.id)"
    >{{ c.name }}</button>
    <slot />
  </div>
</template>

<script>
/*
 * 분류 버튼 (탭 한 번으로 고르기, 다시 누르면 해제 → 미분류)
 * 분류 색은 DB의 color 값. 고르지 않은 버튼은 그 색을 연하게, 고른 버튼은 진하게 + 테두리.
 */
export default {
  name: 'CategoryGrid',
  props: {
    categories: { type: Array, required: true },
    modelValue: { type: String, default: null },
    label: { type: String, default: '분류' }
  },
  emits: ['update:modelValue'],
  methods: {
    styleFor(c) {
      const color = c.color || '#E6DDD5'
      return c.id === this.modelValue
        ? { background: color, borderColor: `color-mix(in srgb, ${color} 45%, #3A3330)` }
        : { background: `color-mix(in srgb, ${color} 45%, #FFFFFF)` }
    }
  }
}
</script>

<style scoped>
.cat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.cat {
  height: 42px; border: 2px solid transparent; border-radius: var(--radius);
  font-size: 14px; color: var(--text); padding: 0 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cat.selected { font-weight: 700; }
</style>
