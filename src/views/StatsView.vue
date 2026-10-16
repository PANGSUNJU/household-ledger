<template>
  <main class="page stats">
    <header class="head">
      <h1 class="page-title">통계</h1>
      <span class="range">이번 달 · {{ rangeLabel }}</span>
    </header>

    <p v-if="loading" class="muted">불러오는 중…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <template v-else>
      <section class="card summary" aria-label="이번 달 요약">
        <span class="muted small">이번 달 쓴 돈 <span class="tiny">(환불 반영)</span></span>
        <strong class="big">{{ won(now.spent) }}원</strong>
        <span v-if="diffText" class="badge" :class="diff > 0 ? 'up' : 'down'">{{ diffText }}</span>
        <div class="lines">
          <div><span class="muted">수입</span><strong class="amount-income">{{ won(now.income) }}원</strong></div>
          <div v-if="now.savings"><span class="muted">저축/투자</span><strong class="savings">{{ won(now.savings) }}원</strong></div>
        </div>
      </section>

      <div class="tabs" role="tablist" aria-label="보는 기준">
        <button
          v-for="t in TABS" :key="t.v" type="button" role="tab"
          :aria-selected="tab === t.v" :class="{ on: tab === t.v }" @click="tab = t.v; showAll = false"
        >{{ t.t }}</button>
      </div>

      <section class="card bars" :aria-label="tabLabel + ' 지출'">
        <p v-if="!rows.length" class="muted empty">이번 달 지출 기록이 아직 없어요.</p>
        <div v-for="r in shownRows" :key="r.key" class="bar-row">
          <div class="bar-top">
            <span class="name">{{ r.name }}</span>
            <span class="diff" :class="r.diffClass">{{ r.diffText }}</span>
            <span class="amt">{{ won(r.amount) }}원</span>
          </div>
          <div class="track"><div class="fill" :style="{ width: r.pct + '%', background: r.color }" /></div>
        </div>
        <button v-if="rows.length > 6" type="button" class="more" @click="showAll = !showAll">
          {{ showAll ? '접기' : `전체 ${tabLabel} 보기 (${rows.length})` }}
        </button>
      </section>

      <router-link to="/stats/fixed" class="card fixed-link">
        <span class="fl-icon" aria-hidden="true"><AppIcon name="repeat" :size="18" /></span>
        <span class="fl-main">
          <strong>고정비 달마다 보기</strong>
          <span class="muted tiny">보험료·통신비처럼 매달 나가는 돈이 달마다 얼마였는지</span>
        </span>
        <AppIcon name="next" :size="18" class="chev" />
      </router-link>
    </template>
  </main>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import { listTransactions, listCategories } from '@/lib/api'
import { thisMonthRange, sameRangeLastMonth, parse } from '@/lib/date'
import { won } from '@/lib/money'
import { summarize } from '@/lib/stats'

/*
 * 통계 (SPEC 5-3): 항상 '이번 달(1일~오늘)'로 열린다.
 * 지난달 대비는 지난달 같은 기간(1일~같은 날)과 비교한다. (SPEC 10-A)
 * 기간 직접 고르기는 ② 단계.
 */
export default {
  name: 'StatsView',
  components: { AppIcon },
  data() {
    return {
      TABS: [{ v: 'byCategory', t: '분류별' }, { v: 'byStore', t: '가게별' }, { v: 'byMethod', t: '결제수단별' }],
      tab: 'byCategory', showAll: false,
      range: thisMonthRange(), now: null, prev: null, categories: [],
      loading: true, error: ''
    }
  },
  computed: {
    rangeLabel() {
      const a = parse(this.range.from), b = parse(this.range.to)
      return `${a.m}월 ${a.d}일~${b.d}일`
    },
    tabLabel() { return { byCategory: '분류', byStore: '가게', byMethod: '결제수단' }[this.tab] },
    diff() { return this.now && this.prev ? this.now.spent - this.prev.spent : 0 },
    diffText() {
      if (!this.prev || !this.diff) return this.prev && this.now.spent ? '지난달 같은 기간과 같아요' : ''
      return `지난달 같은 기간보다 ${won(Math.abs(this.diff))}원 ${this.diff > 0 ? '더 썼어요 ▲' : '덜 썼어요 ▼'}`
    },
    catMap() { return Object.fromEntries(this.categories.map((c) => [c.id, c])) },
    rows() {
      if (!this.now) return []
      const list = this.now[this.tab].filter((r) => r.amount > 0)
      const prevMap = Object.fromEntries((this.prev?.[this.tab] || []).map((r) => [r.key, r.amount]))
      const max = Math.max(...list.map((r) => r.amount), 1)
      return list.map((r) => {
        const cat = this.tab === 'byCategory' ? this.catMap[r.key] : null
        const d = r.amount - (prevMap[r.key] || 0)
        const base = cat?.color || '#FFB59A'
        return {
          key: r.key,
          name: this.tab === 'byCategory' ? (cat?.name || '미분류') : r.name,
          amount: r.amount,
          pct: Math.max(Math.round((r.amount / max) * 100), 2),
          color: `color-mix(in srgb, ${base} 82%, #3A3330)`,
          diffText: d === 0 ? '변화 없음' : `${d > 0 ? '+' : '-'}${won(Math.abs(d))} ${d > 0 ? '▲' : '▼'}`,
          diffClass: d > 0 ? 'up' : d < 0 ? 'down' : ''
        }
      })
    },
    shownRows() { return this.showAll ? this.rows : this.rows.slice(0, 6) }
  },
  created() { this.load() },
  methods: {
    won,
    async load() {
      this.loading = true; this.error = ''
      try {
        const last = sameRangeLastMonth(this.range.from, this.range.to)
        const [cur, prev, cats] = await Promise.all([
          listTransactions(this.range.from, this.range.to),
          listTransactions(last.from, last.to),
          listCategories({ includeHidden: true })
        ])
        this.now = summarize(cur)
        this.prev = prev.length ? summarize(prev) : null
        this.categories = cats
      } catch (e) {
        this.error = '통계를 불러오지 못했어요.'
        console.error(e)
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.stats { display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; align-items: center; justify-content: space-between; }
.range { height: 34px; padding: 0 12px; border-radius: 17px; background: var(--surface); border: 1px solid var(--border); font-size: 13px; font-weight: 500; display: flex; align-items: center; }
.error { color: var(--expense); }
.small { font-size: 13px; }
.tiny { font-size: 12px; }
.summary { padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.big { font-size: 30px; letter-spacing: -0.5px; }
.badge { align-self: flex-start; font-size: 13px; font-weight: 600; border-radius: 8px; padding: 3px 8px; margin-top: 2px; }
.badge.up { background: #FFE6DA; color: #8E3F33; }
.badge.down { background: var(--info-bg); color: var(--info-fg); }
.lines { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--line-soft); margin-top: 8px; padding-top: 10px; font-size: 14px; }
.lines div { display: flex; justify-content: space-between; }
.savings { color: #2A5E5A; }
.tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); background: var(--surface-sunken); border-radius: 12px; padding: 4px; }
.tabs button { height: 38px; border: 0; border-radius: 9px; background: transparent; color: var(--text-sub); font-size: 14px; }
.tabs button.on { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgba(120, 90, 70, 0.14); }
.bars { padding: 8px 18px 10px 18px; display: flex; flex-direction: column; }
.empty { margin: 12px 0; font-size: 14px; }
.bar-row { display: flex; flex-direction: column; gap: 5px; padding: 8px 0; }
.bar-top { display: flex; align-items: baseline; gap: 8px; }
.name { flex: 1; min-width: 0; font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.diff { font-size: 12px; font-weight: 600; color: var(--text-sub); white-space: nowrap; }
.diff.up { color: #9A4A2E; }
.diff.down { color: #3F64A6; }
.amt { font-size: 15px; font-weight: 600; min-width: 84px; text-align: right; }
.track { height: 8px; border-radius: 4px; background: #F6F1EC; overflow: hidden; }
.fill { height: 8px; border-radius: 4px; }
.more { height: 40px; border: 0; background: transparent; color: var(--accent); font-size: 14px; font-weight: 600; }
.fixed-link { display: flex; align-items: center; gap: 12px; padding: 14px 16px; color: var(--text); text-decoration: none; }
.fl-icon { width: 34px; height: 34px; border-radius: 10px; background: #E9E3FA; color: #4F3F86; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fl-main { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.fl-main strong { font-size: 15px; }
.chev { color: #B8A69C; }
</style>
