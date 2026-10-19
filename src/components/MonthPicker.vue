<template>
  <BottomSheet :open="open" title="연월 선택" @close="$emit('close')">
    <div class="picker">
      <div class="year-row">
        <button type="button" class="step" aria-label="이전 해" :disabled="year <= MIN_YEAR" @click="year--"><AppIcon name="back" :size="20" /></button>
        <strong aria-live="polite">{{ year }}년</strong>
        <button type="button" class="step" aria-label="다음 해" :disabled="year >= maxYear" @click="year++"><AppIcon name="next" :size="20" /></button>
      </div>
      <div class="months" role="group" :aria-label="`${year}년 월`">
        <button
          v-for="mo in 12" :key="mo" type="button" class="mon"
          :class="{ on: year === y && mo === m, now: year === todayY && mo === todayM }"
          :aria-pressed="year === y && mo === m"
          :aria-label="`${year}년 ${mo}월` + (year === todayY && mo === todayM ? ' (이번 달)' : '')"
          @click="pick(mo)"
        >{{ mo }}월</button>
      </div>
      <button type="button" class="this-month" @click="pickToday">이번 달로</button>
    </div>
  </BottomSheet>
</template>

<script>
/*
 * 위쪽 'YYYY년 M월'을 누르면 뜨는 연월 고르기
 *  · 해는 ‹ › 로 넘기고, 달을 누르면 바로 그 달로 간다
 *  · 이번 달은 점선 테두리, 지금 보고 있는 달은 색으로 표시
 */
import BottomSheet from './BottomSheet.vue'
import AppIcon from './AppIcon.vue'
import { todayKST, parse } from '@/lib/date'

export default {
  name: 'MonthPicker',
  components: { BottomSheet, AppIcon },
  props: {
    open: { type: Boolean, default: false },
    y: { type: Number, required: true },
    m: { type: Number, required: true }
  },
  emits: ['pick', 'close'],
  data() {
    const { y, m } = parse(todayKST())
    return { year: this.y, todayY: y, todayM: m, MIN_YEAR: 2000 }
  },
  computed: {
    maxYear() { return this.todayY + 1 }
  },
  watch: {
    // 열 때마다 지금 보고 있는 해부터
    open(v) { if (v) this.year = this.y }
  },
  methods: {
    pick(mo) { this.$emit('pick', { y: this.year, m: mo }) },
    pickToday() { this.$emit('pick', { y: this.todayY, m: this.todayM }) }
  }
}
</script>

<style scoped>
.picker { display: flex; flex-direction: column; gap: 16px; padding-bottom: 8px; }
.year-row { display: flex; align-items: center; justify-content: space-between; }
.year-row strong { font-size: 20px; }
.step { width: var(--tap); height: var(--tap); border: 0; border-radius: 12px; background: var(--surface-sunken); display: flex; align-items: center; justify-content: center; }
.step:disabled { opacity: 0.35; }
.months { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.mon { height: 52px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); font-size: 16px; color: var(--text); }
.mon.now { border-style: dashed; border-color: var(--accent); }
.mon.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); font-weight: 700; }
.this-month { height: 46px; border: 0; border-radius: 12px; background: var(--surface-sunken); font-size: 15px; color: var(--text); }
</style>
