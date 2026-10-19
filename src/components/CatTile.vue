<template>
  <span class="tile" :class="{ 'tile-2l': lines.length === 2, 'tile-3c': lines.length === 1 && lines[0].length === 3 }" :style="{ background: color || '#F3EFEA' }" aria-hidden="true">
    <span v-for="(l, i) in lines" :key="i">{{ l }}</span>
  </span>
</template>

<script>
import { tileLines } from '@/lib/tile'

/* 분류 네모 (목록·자주 쓰는 내역에서 같이 씀) */
export default {
  name: 'CatTile',
  props: {
    name: { type: String, default: '' },
    color: { type: String, default: '' }
  },
  computed: { lines() { return tileLines(this.name) } }
}
</script>

<style scoped>
.tile {
  width: 36px; height: 36px; flex-shrink: 0; border-radius: var(--radius);
  font-size: 12px; line-height: 14px; font-weight: 600; color: #4A3F3A;
  display: flex; flex-direction: column; align-items: center; justify-content: center; letter-spacing: -0.3px;
}
/* 이름이 부모 화면의 class(.two 등)와 겹치지 않게 tile- 로 시작 */
.tile { box-sizing: border-box; padding: 0 4px; text-align: center; }
.tile.tile-3c { font-size: 11px; padding: 0 2px; }
.tile.tile-2l { font-size: 10.5px; line-height: 12px; gap: 1px; }
</style>
