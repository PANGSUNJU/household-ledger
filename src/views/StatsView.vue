<template>
  <main class="page stats">
    <header class="head">
      <h1 class="page-title">통계</h1>
      <span class="range">{{ rangeLabel }}</span>
    </header>

    <!-- 기간 빠른 선택 (항상 '이번 달'로 열린다) -->
    <div class="periods" role="radiogroup" aria-label="기간">
      <button
        v-for="p in PERIODS" :key="p.v" type="button" role="radio"
        :aria-checked="period === p.v" :class="{ on: period === p.v }" @click="choose(p.v)"
      >{{ p.t }}</button>
    </div>
    <form v-if="period === 'custom'" class="custom" @submit.prevent="applyCustom">
      <input v-model="custom.from" type="date" aria-label="시작 날짜" :max="today">
      <span>~</span>
      <input v-model="custom.to" type="date" aria-label="끝 날짜" :max="today">
      <button type="submit" :disabled="!custom.from || !custom.to">보기</button>
    </form>

    <p v-if="loading && !now" class="muted">불러오는 중…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <template v-else>
      <section class="card summary" aria-label="이번 달 요약">
        <span class="muted small">{{ periodName }} 지출</span>
        <strong class="big">{{ won(now.spent) }}원</strong>
        <span v-if="diffText" class="badge" :class="diff > 0 ? 'up' : 'down'">{{ diffText }}</span>
        <div class="lines">
          <div><span class="muted">수입</span><strong class="amount-income">{{ won(now.income) }}원</strong></div>
          <div v-if="now.savings"><span class="muted">그중 저축/투자</span><strong class="savings">{{ won(now.savings) }}원</strong></div>
        </div>
      </section>

      <BudgetCard v-if="period === 'this'" :y="thisY" :m="thisM" :spent="now.budgetSpent" />

      <div class="tabs" role="tablist" aria-label="보는 기준">
        <button
          v-for="t in TABS" :key="t.v" type="button" role="tab"
          :aria-selected="tab === t.v" :class="{ on: tab === t.v }" @click="tab = t.v; showAll = false"
        >{{ t.t }}</button>
      </div>

      <section class="card bars" :aria-label="tabLabel + ' 지출'">
        <p v-if="!rows.length" class="muted empty">이 기간 지출 기록이 없어요.</p>
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
        </span>
        <AppIcon name="next" :size="18" class="chev" />
      </router-link>
    </template>
  </main>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import { listTransactions, listCategories } from '@/lib/api'
import BudgetCard from '@/components/BudgetCard.vue'
import { statsRange, rangeText, todayKST, parse, addDays } from '@/lib/date'
import { dataState, freshness } from '@/lib/sync'
import { won } from '@/lib/money'
import { summarize } from '@/lib/stats'

/*
 * 통계 (SPEC 5-3): 항상 '이번 달(1일~오늘)'로 열린다.
 * 지난달 대비는 지난달 같은 기간(1일~같은 날)과 비교한다. (SPEC 10-A)
 * 기간 빠른 선택: 이번 달 / 지난달 / 최근 30일 / 직접 선택 (SPEC 5-3). 지난번 선택은 기억하지 않는다.
 */
export default {
  name: 'StatsView',
  mixins: [freshness],
  components: { AppIcon, BudgetCard },
  data() {
    return {
      TABS: [{ v: 'byCategory', t: '분류별' }, { v: 'byStore', t: '사용처별' }, { v: 'byMethod', t: '결제수단별' }],
      tab: 'byCategory', showAll: false,
      PERIODS: [
        { v: 'this', t: '이번 달' }, { v: 'last', t: '지난달' }, { v: 'd30', t: '최근 30일' },
        { v: 'year', t: '올해' }, { v: 'custom', t: '직접 선택' }
      ],
      period: 'this', today: todayKST(),
      thisY: parse(todayKST()).y, thisM: parse(todayKST()).m,
      custom: { from: addDays(todayKST(), -6), to: todayKST() },
      range: statsRange('this'), reqSeq: 0, now: null, prev: null, categories: [],
      loading: true, error: ''
    }
  },
  computed: {
    rangeLabel() { return rangeText(this.range.from, this.range.to) },
    periodName() { return { this: '이번 달', last: '지난달', d30: '최근 30일', year: '올해', custom: '이 기간' }[this.period] },
    tabLabel() { return { byCategory: '분류', byStore: '사용처', byMethod: '결제수단' }[this.tab] },
    diff() { return this.now && this.prev ? this.now.spent - this.prev.spent : 0 },
    diffText() {
      const label = this.range.cmpLabel
      if (!this.prev || !this.diff) return this.prev && this.now.spent ? `${label}과 같아요` : ''
      return `${label}보다 ${won(Math.abs(this.diff))}원 ${this.diff > 0 ? '더 썼어요 ▲' : '덜 썼어요 ▼'}`
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
  created() { this.firstShow = true; this.load() },
  activated() {
    if (this.firstShow) { this.firstShow = false; return }
    if (!this.needsRefresh()) return
    // 날짜가 바뀌었으면 '이번 달·지난달·최근 30일' 기간도 오늘 기준으로 다시
    const t = todayKST()
    if (t !== this.today) {
      this.today = t; this.thisY = parse(t).y; this.thisM = parse(t).m
      if (this.period !== 'custom') this.range = statsRange(this.period)
    }
    this.load()
  },
  methods: {
    won,
    choose(v) {
      this.period = v
      if (v === 'custom') return   // '보기'를 누르면 바뀐다
      this.range = statsRange(v)
      this.showAll = false
      this.load()
    },
    applyCustom() {
      this.range = statsRange('custom', this.custom)
      this.custom = { from: this.range.from, to: this.range.to }
      this.showAll = false
      this.load()
    },
    async load() {
      const seq = ++this.reqSeq   // 기간을 빨리 바꾸면 늦게 온 앞 기간 응답은 버린다
      const ver = dataState.version
      this.loading = true; this.error = ''
      try {
        const last = this.range.cmp
        const [cur, prev, cats] = await Promise.all([
          listTransactions(this.range.from, this.range.to),
          listTransactions(last.from, last.to),
          listCategories({ includeHidden: true })
        ])
        if (seq !== this.reqSeq) return
        this.now = summarize(cur)
        this.prev = prev.length ? summarize(prev) : null
        this.categories = cats
        this.markFresh(ver)
      } catch (e) {
        if (seq !== this.reqSeq) return
        this.error = '통계를 불러오지 못했어요.'
        console.error(e)
      } finally {
        if (seq === this.reqSeq) this.loading = false
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
.periods { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.periods button { height: 36px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); font-size: 13px; color: var(--text-sub); }
.periods button.on { border-color: #E8806A; background: #FFE6DA; color: #8E3F33; font-weight: 600; }
.custom { display: flex; align-items: center; gap: 6px; }
.custom input { flex: 1; min-width: 0; height: 40px; border: 1px solid var(--border); border-radius: 10px; padding: 0 8px; font-size: 14px; background: var(--surface); }
.custom button { height: 40px; padding: 0 14px; border: 0; border-radius: 10px; background: var(--primary); color: var(--on-primary); font-weight: 600; }
</style>
