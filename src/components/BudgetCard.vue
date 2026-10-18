<template>
  <section v-if="ready" class="card budget" :aria-label="`${m}월 예산`">
    <template v-if="budget">
      <div class="b-head">
        <span class="muted small">{{ m }}월 예산 {{ won(budget.amount) }}원<span v-if="budget.inherited" class="tiny"> (지난 예산 그대로)</span></span>
        <button type="button" class="edit" @click="openSheet">바꾸기</button>
      </div>
      <div class="b-main">
        <strong :class="{ over: left < 0 }">{{ left < 0 ? won(-left) + '원 넘었어요' : won(left) + '원 남았어요' }}</strong>
        <span v-if="isThisMonth && left > 0" class="per-day">오늘 포함 {{ daysLeft }}일 · 하루 {{ won(perDay) }}원</span>
      </div>
      <div class="meter" role="progressbar" :aria-valuenow="Math.round(pct)" aria-valuemin="0" aria-valuemax="100" :aria-label="`예산의 ${Math.round(pct)}% 사용`">
        <span class="fill" :class="{ over: left < 0 }" :style="{ width: Math.min(100, pct) + '%' }" />
      </div>
      <span class="muted tiny">쓴 돈 {{ won(spent) }}원</span>
    </template>
    <button v-else type="button" class="set" @click="openSheet">
      <span><b>{{ m }}월 예산 정하기</b></span>
      <span aria-hidden="true">→</span>
    </button>

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
import { won, calcAmount } from '@/lib/money'
import { todayKST, parse, format, daysInMonth } from '@/lib/date'

/*
 * 한 달 총예산 (SPEC 5-5)
 *  · 사용 금액 = 그 달(1일~말일) 쓴 돈 (저축/투자, 금액 입력 필요 제외, 환불 반영) — 부모가 넘겨준다
 *  · 하루 쓸 수 있는 금액 = 남은 예산 ÷ 오늘 포함 남은 날
 *  · 그 달 예산이 없으면 그 전 예산을 그대로 쓴다
 *  · 0003 SQL 전이면 카드를 숨긴다
 */
export default {
  name: 'BudgetCard',
  components: { BottomSheet },
  props: {
    y: { type: Number, required: true },
    m: { type: Number, required: true },
    spent: { type: Number, required: true }
  },
  data() {
    return { budget: null, ready: false, sheet: false, amountText: '', busy: false, err: '' }
  },
  computed: {
    month01() { return format(this.y, this.m, 1) },
    isThisMonth() { return todayKST().slice(0, 7) === this.month01.slice(0, 7) },
    left() { return (this.budget?.amount || 0) - this.spent },
    pct() { return this.budget ? (this.spent / this.budget.amount) * 100 : 0 },
    daysLeft() { return daysInMonth(this.y, this.m) - parse(todayKST()).d + 1 },
    perDay() { return Math.floor(Math.max(0, this.left) / this.daysLeft) },
    amount() { const a = calcAmount(this.amountText); return a > 0 ? a : null }
  },
  watch: { month01() { this.load() } },
  created() { this.load() },
  methods: {
    won,
    async load() {
      try {
        this.budget = await getBudget(this.month01)
        this.ready = true
      } catch (e) {
        // 표가 아직 없으면(0003 SQL 전) 조용히 숨긴다
        this.ready = false
        console.warn('예산을 불러오지 못했어요', e)
      }
    },
    openSheet() {
      this.amountText = this.budget ? String(this.budget.amount) : ''
      this.err = ''; this.sheet = true
    },
    async save() {
      this.busy = true; this.err = ''
      try {
        const b = await saveBudget(this.month01, this.amount)
        this.budget = { ...b, inherited: false }
        this.sheet = false
      } catch (e) { this.err = '저장하지 못했어요. 다시 해 주세요.'; console.error(e) } finally { this.busy = false }
    },
    async remove() {
      this.busy = true; this.err = ''
      try {
        await deleteBudget(this.month01)
        this.sheet = false
        await this.load()
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
.b-main { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.b-main strong { font-size: 18px; }
.b-main strong.over { color: var(--expense); }
.per-day { font-size: 13px; font-weight: 600; color: var(--accent); }
.meter { height: 8px; border-radius: 4px; background: #F6F1EC; overflow: hidden; }
.fill { display: block; height: 100%; border-radius: 4px; background: #E9A592; }
.fill.over { background: var(--expense); }
.set { display: flex; justify-content: space-between; align-items: center; gap: 8px; border: 0; background: transparent; padding: 2px 0; text-align: left; font-size: 14px; color: var(--text); }
.sheet-form { display: flex; flex-direction: column; gap: 10px; }
.lbl { font-size: 13px; color: var(--text-sub); }
.box { height: 48px; width: 100%; border: 1px solid var(--border); border-radius: 12px; padding: 0 14px; font-size: 16px; background: var(--surface); }
.error { margin: 0; font-size: 13px; color: var(--expense); }
.mini { align-self: center; height: 36px; padding: 0 14px; border: 0; border-radius: var(--radius-sm); background: var(--surface-sunken); font-size: 13px; }
.mini.danger { color: var(--expense); }
p { margin: 0; }
</style>
