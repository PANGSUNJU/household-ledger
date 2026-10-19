<template>
  <main class="page list-page">
    <header class="head">
      <h1 class="page-title">내역</h1>
      <div v-if="!searching" class="month">
        <button type="button" class="icon-btn" aria-label="이전 달" @click="move(-1)"><AppIcon name="back" :size="20" /></button>
        <button type="button" class="ym" aria-label="연월 선택" @click="picker = true">{{ y }}년 {{ m }}월<AppIcon name="down" :size="16" /></button>
        <button type="button" class="icon-btn" aria-label="다음 달" @click="move(1)"><AppIcon name="next" :size="20" /></button>
      </div>
    </header>

    <label class="search">
      <AppIcon name="search" :size="20" />
      <span class="sr-only">검색</span>
      <input v-model="query" type="search" placeholder="가게, 메모, 금액으로 검색" @input="onSearch">
    </label>

    <div class="filters" role="radiogroup" aria-label="종류 필터">
      <button
        v-for="f in FILTERS" :key="f.v" type="button" role="radio"
        :aria-checked="filter === f.v" :class="{ on: filter === f.v }" @click="filter = f.v"
      >{{ f.t }}</button>
      <span v-if="searching" class="count muted">{{ visible.length }}건 찾음</span>
    </div>

    <p v-if="loading" class="msg muted">불러오는 중…</p>
    <p v-else-if="error" class="msg error">{{ error }}</p>
    <p v-else-if="!groups.length" class="msg muted">{{ searching ? '찾는 기록이 없어요.' : '이 달에는 기록이 없어요.' }}</p>

    <section v-for="g in groups" :key="g.date" class="card group">
      <div class="g-head">
        <h2>{{ g.label }}</h2>
        <span class="muted">{{ g.total }}</span>
      </div>
      <TxRow v-for="t in g.items" :key="t.id" :tx="t" :original-amount="originals[t.refund_of_id]" class="row" />
    </section>
    <MonthPicker :open="picker" :y="y" :m="m" @pick="goMonth" @close="picker = false" />
  </main>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import TxRow from '@/components/TxRow.vue'
import MonthPicker from '@/components/MonthPicker.vue'
import { listMonth, searchTransactions } from '@/lib/api'
import { todayKST, parse, addMonths, label } from '@/lib/date'
import { won } from '@/lib/money'

export default {
  name: 'ListView',
  components: { AppIcon, TxRow, MonthPicker },
  data() {
    const { y, m } = parse(todayKST())
    return {
      FILTERS: [{ v: 'all', t: '전체' }, { v: 'expense', t: '지출' }, { v: 'income', t: '수입' }],
      y, m, picker: false, query: '', filter: 'all', txs: [], loading: false, error: '', timer: null, reqSeq: 0
    }
  },
  computed: {
    searching() { return this.query.trim().length > 0 },
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
      return [...byDate.entries()].map(([date, items]) => {
        let spent = 0, refund = 0, income = 0
        for (const t of items) {
          if (t.amount == null) continue
          if (t.kind === 'expense') spent += t.amount
          else if (t.category?.is_refund) refund += t.amount
          else income += t.amount
        }
        const parts = []
        if (spent) parts.push(`지출 ${won(spent)}`)
        if (refund) parts.push(`환불 ${won(refund)}`)
        if (income) parts.push(`수입 ${won(income)}`)
        return { date, label: label(date), items, total: parts.join(' · ') }
      })
    }
  },
  created() { this.load() },
  beforeUnmount() { clearTimeout(this.timer) },
  methods: {
    async load() {
      const seq = ++this.reqSeq   // 검색어를 빨리 바꾸면 늦게 온 앞 검색 결과는 버린다
      this.loading = true; this.error = ''
      try {
        const rows = this.searching ? await searchTransactions(this.query) : await listMonth(this.y, this.m)
        if (seq === this.reqSeq) this.txs = rows
      } catch (e) {
        if (seq !== this.reqSeq) return
        this.error = '기록을 불러오지 못했어요.'
        console.error(e)
      } finally {
        if (seq === this.reqSeq) this.loading = false
      }
    },
    onSearch() {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.load(), 250)
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
.msg { margin: 8px 0; font-size: 14px; }
.error { color: var(--expense); }
.group { padding: 12px 16px 4px 16px; }
.g-head { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 4px; }
.g-head h2 { margin: 0; font-size: 14px; font-weight: 600; color: #5A4E48; }
.g-head span { font-size: 13px; }
.row { border-top: 1px solid var(--line-soft); }
</style>
