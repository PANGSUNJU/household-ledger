<template>
  <main class="page list-page">
    <header class="head">
      <h1 class="page-title">내역</h1>
      <div v-if="!(searching && scope === 'all')" class="month">
        <button type="button" class="icon-btn" aria-label="이전 달" @click="move(-1)"><AppIcon name="back" :size="20" /></button>
        <button type="button" class="ym" aria-label="연월 선택" @click="picker = true">{{ y }}년 {{ m }}월<AppIcon name="down" :size="16" /></button>
        <button type="button" class="icon-btn" aria-label="다음 달" @click="move(1)"><AppIcon name="next" :size="20" /></button>
      </div>
      <!-- 최근 1년에서 찾는 중: 연월 자리에 표시 + 돌아가기 -->
      <div v-else class="all-scope">
        <span>최근 1년</span>
        <button type="button" class="back-month" @click="setScope('month')"><AppIcon name="back" :size="16" />{{ m }}월로</button>
      </div>
    </header>

    <label class="search">
      <AppIcon name="search" :size="20" />
      <span class="sr-only">검색</span>
      <input v-model="query" type="search" placeholder="사용처, 메모, 금액으로 검색" @input="onSearch">
    </label>

    <div class="filters" role="radiogroup" aria-label="종류 필터">
      <button
        v-for="f in FILTERS" :key="f.v" type="button" role="radio"
        :aria-checked="filter === f.v" :class="{ on: filter === f.v }" @click="filter = f.v"
      >{{ f.t }}</button>
      <span v-if="searching" class="count muted">{{ scopeName }} {{ visible.length }}건</span>
    </div>

    <!-- 검색할 때만: 찾은 기록의 합계 (캘린더와 같은 규칙: 환불은 지출에서 빼고 회색으로 따로) -->
    <p v-if="searching && sumLine.length && !(loading && !freshAt) && !error" class="sum" aria-live="polite">
      <span v-for="(p, i) in sumLine" :key="i" :class="p.cls">{{ p.text }}</span>
      <span v-if="txs.length >= SEARCH_LIMIT" class="cap">최근 {{ SEARCH_LIMIT.toLocaleString('ko-KR') }}건까지 더했어요</span>
    </p>

    <p v-if="loading && !freshAt" class="msg muted">불러오는 중…</p>
    <p v-else-if="error" class="msg error">{{ error }}</p>
    <p v-else-if="!groups.length" class="msg muted">{{ searching ? (scope === 'month' ? `${m}월에는 찾는 기록이 없어요.` : '최근 1년 동안 찾는 기록이 없어요.') : '이 달에는 기록이 없어요.' }}</p>

    <section v-for="g in groups" :key="g.date" class="card group">
      <div class="g-head">
        <h2>{{ g.label }}</h2>
      </div>
      <TxRow v-for="t in g.items" :key="t.id" :tx="t" :original-amount="originals[t.refund_of_id]" class="row" />
    </section>

    <!-- 검색은 고른 달에서 먼저. 더 넓게 보고 싶을 때만 -->
    <button v-if="searching && scope === 'month' && !error && !(loading && !freshAt)" type="button" class="wider" @click="setScope('all')">
      최근 1년에서 찾기<AppIcon name="next" :size="16" />
    </button>
    <MonthPicker :open="picker" :y="y" :m="m" @pick="goMonth" @close="picker = false" />
  </main>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import TxRow from '@/components/TxRow.vue'
import MonthPicker from '@/components/MonthPicker.vue'
import { dataState, freshness } from '@/lib/sync'
import { listMonth, searchTransactions, SEARCH_LIMIT } from '@/lib/api'
import { summarize } from '@/lib/stats'
import { won } from '@/lib/money'
import { todayKST, parse, format, daysInMonth, addMonths, addDays, label } from '@/lib/date'

export default {
  name: 'ListView',
  mixins: [freshness],
  components: { AppIcon, TxRow, MonthPicker },
  data() {
    const { y, m } = parse(todayKST())
    return {
      SEARCH_LIMIT,
      FILTERS: [{ v: 'all', t: '전체' }, { v: 'expense', t: '지출' }, { v: 'income', t: '수입' }],
      y, m, picker: false, query: '', scope: 'month', filter: 'all', txs: [], loading: false, error: '', timer: null, reqSeq: 0
    }
  },
  computed: {
    searching() { return this.query.trim().length > 0 },
    scopeName() { return this.scope === 'month' ? `${this.m}월` : '최근 1년' },
    /** 검색 합계 한 줄: 0원인 쪽은 숨김. [지출]이면 지출만, [수입]이면 수입만 */
    sumLine() {
      const s = summarize(this.txs)
      const out = []
      if (this.filter !== 'income' && s.spent) out.push({ text: `지출 ${s.spent < 0 ? '-' : ''}${won(Math.abs(s.spent))}원`, cls: 'amount-expense' })
      if (this.filter !== 'expense' && s.income) out.push({ text: `수입 ${won(s.income)}원`, cls: 'amount-income' })
      if (this.filter !== 'income' && s.refund) out.push({ text: `환불 ${won(s.refund)}원 빠짐`, cls: 'refund' })
      return out
    },
    visible() { return this.filter === 'all' ? this.txs : this.txs.filter((t) => t.kind === this.filter) },
    /** 환불 수수료 표시용: 불러온 기록 중 원래 구매 금액 */
    originals() {
      const map = {}
      for (const t of this.txs) map[t.id] = t.amount
      return map
    },
    groups() {
      const byDate = new Map()
      for (const t of this.visible) {
        if (!byDate.has(t.date)) byDate.set(t.date, [])
        byDate.get(t.date).push(t)
      }
      // 날짜별 합계는 보여주지 않는다 (달력 칸에 그날 수입·지출이 나온다)
      return [...byDate.entries()].map(([date, items]) => ({ date, label: label(date), items }))
    }
  },
  created() { this.firstShow = true; this.load() },
  activated() {
    if (this.firstShow) { this.firstShow = false; return }
    if (this.needsRefresh()) this.load()
  },
  beforeUnmount() { clearTimeout(this.timer) },
  methods: {
    async load() {
      const seq = ++this.reqSeq   // 검색어를 빨리 바꾸면 늦게 온 앞 검색 결과는 버린다
      const ver = dataState.version
      this.loading = true; this.error = ''
      try {
        const range = { from: format(this.y, this.m, 1), to: format(this.y, this.m, daysInMonth(this.y, this.m)) }
        const rows = !this.searching ? await listMonth(this.y, this.m)
          : await searchTransactions(this.query, this.scope === 'month' ? range : { from: addDays(todayKST(), -365) })   // 넓히면 최근 1년
        if (seq === this.reqSeq) { this.txs = rows; this.markFresh(ver) }
      } catch (e) {
        if (seq !== this.reqSeq) return
        this.error = '기록을 불러오지 못했어요.'
        console.error(e)
      } finally {
        if (seq === this.reqSeq) this.loading = false
      }
    },
    onSearch() {
      if (!this.searching) this.scope = 'month'   // 검색어를 지우면 다시 '고른 달'부터
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.load(), 250)
    },
    setScope(s) {
      if (this.scope === s) return
      this.scope = s
      this.load()
    },
    move(diff) {
      this.goMonth(addMonths(this.y, this.m, diff))
    },
    goMonth({ y, m }) {
      this.picker = false
      if (y === this.y && m === this.m) return
      this.y = y; this.m = m
      this.load()
    }
  }
}
</script>

<style scoped>
.list-page { display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; align-items: center; justify-content: space-between; }
.month { display: flex; align-items: center; gap: 2px; font-size: 14px; font-weight: 600; }
.ym { display: flex; align-items: center; gap: 2px; min-height: 36px; padding: 0 6px; border: 0; border-radius: 10px; background: transparent; font: inherit; color: inherit; }
.icon-btn { width: 36px; height: 36px; border: 0; background: transparent; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.search {
  display: flex; align-items: center; gap: 8px; height: 46px; padding: 0 12px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; color: var(--text-sub);
}
.search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font-size: 15px; color: var(--text); }
.filters { display: flex; align-items: center; gap: 8px; }
.filters button { height: 34px; padding: 0 14px; border: 1px solid var(--border); border-radius: 17px; background: var(--surface); font-size: 13px; }
.filters button.on { border-color: var(--primary); background: var(--primary); color: var(--on-primary); font-weight: 600; }
.count { margin-left: auto; font-size: 13px; }
.sum { margin: -2px 0 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; font-size: 15px; font-weight: 700; }
.sum .refund, .sum .cap { font-size: 12px; font-weight: 500; color: var(--text-faint); }
.all-scope { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }
.back-month { display: flex; align-items: center; gap: 2px; height: 32px; padding: 0 10px 0 6px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); font-size: 13px; color: var(--text-sub); }
.wider {
  display: flex; align-items: center; justify-content: center; gap: 4px; height: 46px; margin-top: 2px;
  border: 1px dashed var(--border); border-radius: 12px; background: transparent; font-size: 14px; font-weight: 600; color: var(--text-sub);
}
.msg { margin: 8px 0; font-size: 14px; }
.error { color: var(--expense); }
.group { padding: 12px 16px 4px 16px; }
.g-head { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 4px; }
.g-head h2 { margin: 0; font-size: 14px; font-weight: 600; color: #5A4E48; }
.g-head span { font-size: 13px; }
.row { border-top: 1px solid var(--line-soft); }
</style>
