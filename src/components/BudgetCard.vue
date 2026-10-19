<template>
  <!-- 불러오는 동안에도 같은 높이를 차지해서 아래 달력이 들썩이지 않게 -->
  <section v-if="!state.loaded" class="card budget" aria-hidden="true">
    <div class="b-head"><span class="small">&nbsp;</span><span class="edit ghost" /></div>
    <div class="b-main"><strong>&nbsp;</strong></div>
    <div class="meter" />
    <div class="b-foot"><span class="tiny">&nbsp;</span></div>
  </section>
  <section v-else-if="state.ready" class="card budget" :aria-label="`${m}월 예산`">
    <template v-if="budget">
      <div class="b-head">
        <span class="muted small">{{ m }}월 예산 {{ won(budget.amount) }}원<span v-if="budget.inherited" class="tiny"> (지난 예산 그대로)</span></span>
        <button type="button" class="edit" @click="openSheet">바꾸기</button>
      </div>
      <div class="b-main">
        <strong :class="{ over: left < 0 }">{{ left < 0 ? won(-left) + '원 넘었어요' : won(left) + '원 남았어요' }}</strong>
      </div>
      <div class="meter" role="progressbar" :aria-valuenow="Math.round(pct)" aria-valuemin="0" aria-valuemax="100" :aria-label="`예산의 ${Math.round(pct)}% 사용`">
        <span class="fill" :class="{ over: left < 0 }" :style="{ width: Math.min(100, pct) + '%' }" />
      </div>
      <div class="b-foot">
        <span class="muted tiny">쓴 돈 {{ won(spent) }}원</span>
        <span v-if="isThisMonth && left > 0" class="per-day">하루 {{ won(perDay) }}원 · {{ daysLeft }}일 남음</span>
      </div>
    </template>
    <!-- 예산이 없어도 있을 때와 같은 모양·높이 -->
    <template v-else>
      <div class="b-head">
        <span class="muted small">{{ m }}월 예산</span>
        <button type="button" class="edit set" @click="openSheet">예산 정하기</button>
      </div>
      <div class="b-main"><strong>{{ won(spent) }}원 썼어요</strong></div>
      <div class="meter" />
      <div class="b-foot"><span class="muted tiny">예산 없음</span></div>
    </template>

    <BottomSheet :open="sheet" :title="`${m}월 예산`" @close="sheet = false">
      <form class="sheet-form" @submit.prevent="save">
        <label for="budget-amount" class="lbl">한 달에 쓸 돈</label>
        <input id="budget-amount" v-model="amountText" v-comma class="box" type="text" inputmode="decimal" placeholder="예: 1,000,000">
        <span v-if="amountText && !amount" class="error">금액을 확인해 주세요</span>
        <p v-if="err" class="error" role="alert">{{ err }}</p>
        <button type="submit" class="btn-primary" :disabled="!amount || busy">{{ busy ? '저장하는 중…' : '저장' }}</button>
        <button v-if="budget && !budget.inherited" type="button" class="mini danger" :disabled="busy" @click="remove">{{ m }}월 예산 지우기</button>
      </form>
    </BottomSheet>
  </section>
</template>

<script>
import BottomSheet from './BottomSheet.vue'
import { getBudget, saveBudget, deleteBudget } from '@/lib/api'
import { dataState } from '@/lib/sync'
import { won, calcAmount } from '@/lib/money'
import { todayKST, parse, format, daysInMonth } from '@/lib/date'

/*
 * 한 달 총예산 (SPEC 5-5)
 *  · 사용 금액 = 그 달(1일~말일) 쓴 돈 (저축/투자, 금액 입력 필요 제외, 환불 반영) — 부모가 넘겨준다
 *  · 하루 쓸 수 있는 금액 = 남은 예산 ÷ 오늘 포함 남은 날
 *  · 그 달 예산이 없으면 그 전 예산을 그대로 쓴다
 *  · 0003 SQL 전이면 카드를 숨긴다
 *  · preset 을 주면(캘린더) 부모가 그 달 기록과 함께 불러온 예산을 그대로 쓴다
 *    → 달을 바꿀 때 기록·예산이 한꺼번에 바뀌어 깜빡이지 않는다. 바꾸면 'changed' 로 알린다
 */
export default {
  name: 'BudgetCard',
  components: { BottomSheet },
  props: {
    y: { type: Number, required: true },
    m: { type: Number, required: true },
    spent: { type: Number, required: true },
    preset: { type: Object, default: undefined }   // { loaded, ready, budget }
  },
  emits: ['changed'],
  data() {
    return { own: { loaded: false, ready: false, budget: null }, sheet: false, amountText: '', busy: false, err: '' }
  },
  computed: {
    dataState() { return dataState },
    state() { return this.preset || this.own },
    budget() { return this.state.budget },
    month01() { return format(this.y, this.m, 1) },
    isThisMonth() { return todayKST().slice(0, 7) === this.month01.slice(0, 7) },
    left() { return (this.budget?.amount || 0) - this.spent },
    pct() { return this.budget ? (this.spent / this.budget.amount) * 100 : 0 },
    daysLeft() { return daysInMonth(this.y, this.m) - parse(todayKST()).d + 1 },
    perDay() { return Math.floor(Math.max(0, this.left) / this.daysLeft) },
    amount() { const a = calcAmount(this.amountText); return a > 0 ? a : null }
  },
  watch: {
    month01() { if (!this.preset) this.load() },
    // 다른 화면에서 예산을 바꾸면 (통계 화면처럼 스스로 불러오는 경우) 다시
    'dataState.version'() { if (!this.preset) this.load() }
  },
  created() { if (!this.preset) this.load() },
  methods: {
    won,
    async load() {
      const month = this.month01
      try {
        const budget = await getBudget(month)
        if (month === this.month01) this.own = { loaded: true, ready: true, budget }
      } catch (e) {
        // 표가 아직 없으면(0003 SQL 전) 조용히 숨긴다
        this.own = { loaded: true, ready: false, budget: null }
        console.warn('예산을 불러오지 못했어요', e)
      }
    },
    /** 바뀐 예산 반영 (부모가 쥐고 있으면 부모에게 알림) */
    setBudget(budget) {
      if (this.preset) this.$emit('changed', budget)
      else this.own = { loaded: true, ready: true, budget }
    },
    openSheet() {
      this.amountText = this.budget ? String(this.budget.amount) : ''
      this.err = ''; this.sheet = true
    },
    async save() {
      this.busy = true; this.err = ''
      try {
        const b = await saveBudget(this.month01, this.amount)
        this.setBudget({ ...b, inherited: false })
        this.sheet = false
      } catch (e) { this.err = '저장하지 못했어요. 다시 해 주세요.'; console.error(e) } finally { this.busy = false }
    },
    async remove() {
      this.busy = true; this.err = ''
      try {
        await deleteBudget(this.month01)
        this.sheet = false
        this.setBudget(await getBudget(this.month01))   // 지우면 그 전 예산이 이어진다
      } catch (e) { this.err = '지우지 못했어요.'; console.error(e) } finally { this.busy = false }
    }
  }
}
</script>

<style scoped>
.budget { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
.small { font-size: 13px; }
.tiny { font-size: 11px; }
.muted { color: var(--text-sub); }
.b-head { display: flex; justify-content: space-between; align-items: center; }
.edit { height: 28px; padding: 0 10px; border: 0; border-radius: 8px; background: var(--surface-sunken); font-size: 12px; color: #5A4E48; }
.b-main { display: flex; align-items: baseline; gap: 8px; white-space: nowrap; overflow: hidden; }
.b-foot { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-height: 18px; white-space: nowrap; }
.b-main strong { font-size: 18px; }
.b-main strong.over { color: var(--expense); }
.per-day { font-size: 13px; font-weight: 600; color: var(--accent); }
.meter { height: 8px; border-radius: 4px; background: #F6F1EC; overflow: hidden; }
.fill { display: block; height: 100%; border-radius: 4px; background: #E9A592; }
.fill.over { background: var(--expense); }
.edit.ghost { display: block; width: 52px; background: transparent; }
.sheet-form { display: flex; flex-direction: column; gap: 10px; }
.lbl { font-size: 13px; color: var(--text-sub); }
.box { height: 48px; width: 100%; border: 1px solid var(--border); border-radius: 12px; padding: 0 14px; font-size: 16px; background: var(--surface); }
.error { margin: 0; font-size: 13px; color: var(--expense); }
.mini { align-self: center; height: 36px; padding: 0 14px; border: 0; border-radius: var(--radius-sm); background: var(--surface-sunken); font-size: 13px; }
.mini.danger { color: var(--expense); }
p { margin: 0; }
</style>
