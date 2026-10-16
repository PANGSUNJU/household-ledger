<template>
  <main class="manage fixed">
    <ScreenHeader title="고정비 달마다 보기" fallback="/stats" />

    <div class="body">
      <p v-if="setupMissing" class="notice" role="alert">
        고정 항목을 쓰려면 Supabase <b>SQL Editor</b>에서 <code>supabase/migrations/0002_recurring.sql</code> 내용을 한 번 실행해 주세요.
      </p>
      <p v-else-if="error" class="error" role="alert">{{ error }}</p>
      <p v-else-if="loading" class="muted">불러오는 중…</p>

      <template v-else>
        <p v-if="!hasAny" class="intro">
          아직 고정 항목 기록이 없어요. <router-link to="/settings/recurring">고정 수입·지출</router-link>에 보험료·통신비 같은 항목을 등록하면 여기서 달마다 모아 볼 수 있어요.
        </p>

        <!-- 달마다 고정 지출 막대 -->
        <section v-if="hasAny" class="card chart" aria-label="달마다 고정 지출">
          <div class="chart-head">
            <div>
              <span class="muted small">최근 {{ span }}개월 평균</span>
              <strong class="avg">{{ won(average) }}원<span class="per">/달</span></strong>
            </div>
            <div class="seg span" role="radiogroup" aria-label="기간">
              <button v-for="n in [6, 12]" :key="n" type="button" role="radio" :aria-checked="span === n" :class="{ on: span === n }" @click="setSpan(n)">{{ n }}개월</button>
            </div>
          </div>

          <div class="plot" :style="{ '--n': months.length }">
            <button
              v-for="(mo, i) in months" :key="mo.key" type="button" class="col"
              :class="{ on: i === sel }" :aria-pressed="i === sel"
              :aria-label="`${mo.label} 고정 지출 ${won(mo.done)}원` + (mo.planned ? `, 예정 ${won(mo.planned)}원` : '') + (mo.needs ? `, 금액 입력 필요 ${mo.needs}건` : '')"
              @click="sel = i"
            >
              <span class="val">{{ i === sel ? compactWon(mo.done + mo.planned) : '' }}</span>
              <span class="stack" :style="{ height: barPct(mo) + '%' }">
                <span v-if="mo.planned" class="seg-plan" :style="{ flexGrow: mo.planned }" />
                <span v-if="mo.done" class="seg-done" :style="{ flexGrow: mo.done }" />
              </span>
              <span v-if="mo.needs" class="dot" aria-hidden="true">!</span>
              <span class="mlabel">{{ mo.short }}</span>
            </button>
          </div>
          <div v-if="months.some((x) => x.planned) || months.some((x) => x.needs)" class="legend">
            <span><i class="sw done" />나간 돈</span>
            <span v-if="months.some((x) => x.planned)"><i class="sw plan" />이번 달 남은 예정</span>
            <span v-if="months.some((x) => x.needs)"><i class="sw need">!</i>금액 입력 필요</span>
          </div>
        </section>

        <!-- 고른 달 자세히 -->
        <section v-if="hasAny && cur" class="card detail" :aria-label="cur.label + ' 고정 지출 자세히'">
          <div class="d-head">
            <div class="d-nav">
              <button type="button" class="nav-btn" :disabled="!canPrev" aria-label="이전 달" @click="step(-1)">
                <AppIcon name="back" :size="18" />
              </button>
              <h2 aria-live="polite">{{ cur.label }} 고정 지출</h2>
              <button type="button" class="nav-btn" :disabled="!canNext" aria-label="다음 달" @click="step(1)">
                <AppIcon name="next" :size="18" />
              </button>
            </div>
            <strong>{{ won(cur.done + cur.planned) }}원</strong>
          </div>
          <p v-if="cur.planned" class="muted small sub">나간 돈 {{ won(cur.done) }}원 + 남은 예정 {{ won(cur.planned) }}원</p>
          <p v-if="diffText" class="badge" :class="diffClass">{{ diffText }}</p>
          <router-link v-if="cur.needs" to="/settings/recurring" class="need">
            금액을 아직 안 넣은 항목 {{ cur.needs }}건 — 넣으면 합계에 더해지고 지난달과 비교해 드려요 →
          </router-link>

          <p v-if="!cur.rows.length" class="muted small empty-month">이 달에는 고정 항목에서 들어온 지출이 없어요.</p>
          <ul class="rows">
            <li v-for="r in cur.rows" :key="r.key" class="row" :class="{ planned: r.planned }">
              <span class="tile" :style="{ background: r.color }" aria-hidden="true" />
              <span class="r-main">
                <span class="r-name">{{ r.name }}
                  <span v-if="r.variable" class="tag">매달 다름</span>
                  <span v-if="r.planned" class="tag plan">예정</span>
                </span>
                <span v-if="r.diff" class="r-diff" :class="r.diff > 0 ? 'up' : 'down'">
                  지난달보다 {{ won(Math.abs(r.diff)) }}원 {{ r.diff > 0 ? '늘었어요' : '줄었어요' }}
                </span>
              </span>
              <span class="r-amt" :class="{ need: r.amount == null }">{{ r.amount == null ? '입력 필요' : won(r.amount) + '원' }}</span>
            </li>
          </ul>

          <div v-if="cur.savings || cur.income" class="lines">
            <div v-if="cur.savings"><span class="muted">고정 저축/투자</span><b class="savings">{{ won(cur.savings) }}원</b></div>
            <div v-if="cur.income"><span class="muted">고정 수입</span><b class="amount-income">{{ won(cur.income) }}원</b></div>
          </div>
          <p class="muted tiny note">고정 항목에서 자동으로 들어온 기록만 모았어요. 저축/투자 분류는 고정비 합계에서 빼고 따로 보여줘요.</p>
        </section>
      </template>
    </div>
  </main>
</template>

<script>
import ScreenHeader from '@/components/ScreenHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { listFixedTransactions, listRecurringItems, listCategories } from '@/lib/api'
import { todayKST, parse, format, addMonths, daysInMonth, addDays } from '@/lib/date'
import { won } from '@/lib/money'
import { upcoming, isMissingSetup } from '@/lib/recurring'

/*
 * 고정비 달마다 보기
 *  · 고정 항목에서 만들어진 기록(source = recurring)을 회차(recurring_month) 기준으로 모은다
 *  · 확정 기록만 합계에. '금액 입력 필요'는 개수로 따로 알려준다 (SPEC 5-3)
 *  · 이번 달은 아직 날짜가 안 된 회차를 '예정'으로 더해 보여준다 (금액 고정인 것만)
 *  · 저축/투자 분류는 통계와 같은 규칙으로 고정비 합계에서 뺀다
 */
export default {
  name: 'FixedStatsView',
  components: { ScreenHeader, AppIcon },
  data() {
    const today = todayKST()
    const { y, m } = parse(today)
    return {
      today, y, m, span: 6, sel: 5,
      txs: [], items: [], categories: [],
      loading: true, error: '', setupMissing: false
    }
  },
  computed: {
    catMap() { return Object.fromEntries(this.categories.map((c) => [c.id, c])) },
    itemMap() { return Object.fromEntries(this.items.map((x) => [x.id, x])) },
    /** 12개월 치를 한 번에 계산해 두고 span 만큼 잘라 쓴다 */
    allMonths() {
      const out = []
      for (let i = 11; i >= 0; i--) {
        const { y, m } = addMonths(this.y, this.m, -i)
        out.push({
          key: format(y, m, 1), y, m,
          label: `${y !== this.y ? y + '년 ' : ''}${m}월`,
          short: m === 1 || i === 11 ? `${String(y).slice(2)}.${m}` : `${m}월`,
          done: 0, planned: 0, needs: 0, savings: 0, income: 0, byKey: new Map()
        })
      }
      const index = Object.fromEntries(out.map((x, i) => [x.key, i]))

      const addRow = (mo, key, row) => {
        const cur = mo.byKey.get(key)
        if (cur) { cur.amount = cur.amount == null || row.amount == null ? null : cur.amount + row.amount }
        else mo.byKey.set(key, row)
      }

      for (const t of this.txs) {
        const mo = out[index[t.recurring_month]]
        if (!mo) continue
        if (t.kind === 'income') { if (t.status === 'confirmed') mo.income += t.amount; continue }
        const item = this.itemMap[t.recurring_item_id]
        const cat = t.category || this.catMap[item?.category_id]
        if (cat?.is_savings) { if (t.status === 'confirmed') mo.savings += t.amount; continue }
        const needs = t.status === 'needs_amount'
        if (needs) mo.needs += 1
        else mo.done += t.amount
        addRow(mo, t.recurring_item_id || 'n:' + t.store_name, {
          name: item?.name || t.store_name || '고정 지출',
          amount: needs ? null : t.amount,
          variable: item ? !item.is_amount_fixed : false,
          color: cat?.color || '#F3EFEA',
          planned: false
        })
      }

      // 이번 달: 아직 날짜가 안 된 회차 (예정)
      const thisMo = out[11]
      const end = addDays(format(this.y, this.m, daysInMonth(this.y, this.m)), 3)
      for (const o of upcoming(this.items, this.today, end, this.today)) {
        if (o.month !== thisMo.key || o.item.kind !== 'expense') continue
        const cat = this.catMap[o.item.category_id]
        if (cat?.is_savings) { if (o.item.is_amount_fixed) thisMo.savings += o.item.amount; continue }
        // 금액이 매달 다른 예정은 합계에 못 넣고 목록에만 '예정'으로 보여준다
        if (o.item.is_amount_fixed) thisMo.planned += o.item.amount
        thisMo.byKey.set(o.item.id, {
          name: o.item.name, amount: o.item.is_amount_fixed ? o.item.amount : null,
          variable: !o.item.is_amount_fixed, color: cat?.color || '#F3EFEA', planned: true
        })
      }

      // 항목별 지난달 대비 (둘 다 금액이 있을 때만)
      out.forEach((mo, i) => {
        const prev = out[i - 1]
        mo.rows = [...mo.byKey.entries()].map(([key, r]) => {
          const p = prev?.byKey.get(key)
          const diff = !r.planned && r.amount != null && p && p.amount != null ? r.amount - p.amount : 0
          return { key, ...r, diff }
        }).sort((a, b) => (a.planned - b.planned) || ((b.amount ?? -1) - (a.amount ?? -1)))
      })
      return out
    },
    months() { return this.allMonths.slice(12 - this.span) },
    hasAny() { return this.txs.length > 0 || this.items.some((x) => x.is_active && x.kind === 'expense') },
    cur() { return this.months[this.sel] },
    /** 화살표: 6개월 보기에서 더 이전으로 가면 12개월 보기로 넓힌다 (최대 12개월 전까지) */
    canPrev() { return this.sel > 0 || this.span < 12 },
    canNext() { return this.sel < this.months.length - 1 },
    prevOfCur() {
      const i = this.allMonths.indexOf(this.cur)
      return i > 0 ? this.allMonths[i - 1] : null
    },
    maxTotal() { return Math.max(1, ...this.months.map((x) => x.done + x.planned)) },
    /** 평균: 기록이 있는 달만 (이번 달은 예정 포함 합계로) */
    average() {
      const used = this.months.filter((x) => x.done + x.planned > 0)
      if (!used.length) return 0
      return Math.round(used.reduce((s, x) => s + x.done + x.planned, 0) / used.length)
    },
    diff() {
      const p = this.prevOfCur
      if (!p || !(p.done + p.planned)) return null
      return (this.cur.done + this.cur.planned) - (p.done + p.planned)
    },
    diffText() {
      if (this.diff == null) return ''
      // 금액을 아직 안 넣은 항목이 있으면 비교가 틀어지니 넣은 뒤에 비교한다
      if (this.cur.needs) return ''
      if (this.diff === 0) return '지난달과 같아요'
      return `지난달보다 ${won(Math.abs(this.diff))}원 ${this.diff > 0 ? '많아요' : '적어요'}`
    },
    diffClass() { return this.diff > 0 ? 'up' : this.diff < 0 ? 'down' : '' }
  },
  created() { this.load() },
  methods: {
    won,
    compactWon(n) {
      if (n >= 10000) return `${Math.round(n / 1000) / 10}만`
      return won(n)
    },
    barPct(mo) {
      const v = mo.done + mo.planned
      return v ? Math.max(3, (v / this.maxTotal) * 100) : 0
    },
    setSpan(n) { this.span = n; this.sel = n - 1 },
    step(dir) {
      if (dir < 0 && this.sel === 0 && this.span < 12) {
        // 지금 고른 달을 그대로 두고 12개월로 넓힌 뒤 한 달 앞으로
        const offset = 12 - this.span
        this.span = 12
        this.sel = offset - 1
        return
      }
      const next = this.sel + dir
      if (next >= 0 && next < this.months.length) this.sel = next
    },
    async load() {
      this.loading = true; this.error = ''
      try {
        const first = addMonths(this.y, this.m, -11)
        const [txs, items, cats] = await Promise.all([
          listFixedTransactions(format(first.y, first.m, 1), format(this.y, this.m, 1)),
          listRecurringItems(),
          listCategories({ includeHidden: true })
        ])
        this.txs = txs; this.items = items; this.categories = cats
      } catch (e) {
        if (isMissingSetup(e)) this.setupMissing = true
        else { this.error = '불러오지 못했어요.'; console.error(e) }
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped src="./manage.css"></style>
<style scoped>
.tiny { font-size: 11px; }
.notice code { font-size: 11px; word-break: break-all; }
.intro a { color: var(--accent); font-weight: 600; }

.chart { padding: 14px 14px 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.chart-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.chart-head > div:first-child { display: flex; flex-direction: column; }
.avg { font-size: 22px; letter-spacing: -0.3px; }
.per { font-size: 13px; font-weight: 500; color: var(--text-sub); margin-left: 2px; }
.seg.span { width: 140px; }
.seg.span button { height: 32px; font-size: 13px; }

/* 막대: 바닥에 붙고 위쪽만 4px 둥글게, 막대 사이는 칸 여백 */
.plot {
  height: 170px; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 4px;
  align-items: end; border-bottom: 1px solid var(--line); padding-top: 4px;
}
.col {
  height: 100%; border: 0; background: transparent; padding: 0; position: relative;
  display: flex; flex-direction: column; justify-content: flex-end; align-items: center; border-radius: 8px;
}
.col:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.val { font-size: 11px; font-weight: 700; color: var(--text); min-height: 15px; white-space: nowrap; }
.stack {
  width: min(28px, 70%); display: flex; flex-direction: column; gap: 2px;
  border-radius: 4px 4px 0 0; overflow: hidden; min-height: 0;
}
.seg-done { background: #E9A592; flex-basis: 0; min-height: 2px; }
.seg-plan {
  flex-basis: 0; min-height: 2px;
  background: repeating-linear-gradient(135deg, #F6D4C8 0 3px, #FFFFFF 3px 6px);
  box-shadow: inset 0 0 0 1px #E9A592;
}
.col.on .seg-done { background: #C96A55; }
.dot {
  position: absolute; top: 18px; width: 16px; height: 16px; border-radius: 8px; background: #FFE6DA;
  color: #A9533F; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center;
}
.mlabel { position: absolute; bottom: -22px; font-size: 11px; color: var(--text-sub); white-space: nowrap; }
.col.on .mlabel { color: var(--text); font-weight: 700; }
.legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 22px; font-size: 12px; color: var(--text-sub); }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.sw { width: 12px; height: 12px; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-style: normal; }
.sw.done { background: #C96A55; }
.sw.plan { background: repeating-linear-gradient(135deg, #F6D4C8 0 3px, #FFFFFF 3px 6px); box-shadow: inset 0 0 0 1px #E9A592; }
.sw.need { background: #FFE6DA; color: #A9533F; font-size: 9px; line-height: 12px; font-weight: 800; border-radius: 6px; }
.chart:not(:has(.legend)) .plot { margin-bottom: 22px; }

.detail { padding: 14px 16px 12px 16px; display: flex; flex-direction: column; gap: 6px; }
.d-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.d-head h2 { margin: 0; font-size: 16px; white-space: nowrap; }
.d-nav { display: flex; align-items: center; gap: 2px; margin-left: -8px; }
.nav-btn {
  width: 36px; height: 36px; border: 0; border-radius: 10px; background: transparent; color: var(--text);
  display: flex; align-items: center; justify-content: center;
}
.nav-btn:disabled { color: #DDD3CC; }
.empty-month { margin: 6px 0 0 0; }
.nav-btn:not(:disabled):active { background: var(--surface-sunken); }
.d-head strong { font-size: 20px; }
.sub { margin: 0; }
.badge { align-self: flex-start; margin: 2px 0; }
.badge.up { background: #FFE6DA; color: #8E3F33; }
.badge.down { background: var(--info-bg); color: var(--info-fg); }
.need { display: block; padding: 10px 12px; border-radius: 10px; background: #FFE6DA; color: #8E3F33; font-size: 13px; font-weight: 600; text-decoration: none; }
.rows { list-style: none; margin: 4px 0 0 0; padding: 0; }
.row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line-soft); }
.row.planned { opacity: 0.6; }
.tile { width: 10px; height: 28px; border-radius: 4px; flex-shrink: 0; }
.r-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.r-name { font-size: 15px; font-weight: 500; }
.tag { margin-left: 4px; font-size: 11px; font-weight: 600; color: #8E3F33; background: #FFE6DA; border-radius: 5px; padding: 1px 5px; vertical-align: 1px; }
.tag.plan { color: var(--text-sub); background: var(--surface-sunken); }
.r-diff { font-size: 12px; font-weight: 600; }
.r-diff.up { color: #9A4A2E; }
.r-diff.down { color: #3F64A6; }
.r-amt { font-size: 15px; font-weight: 600; white-space: nowrap; }
.r-amt.need { color: #A9533F; font-size: 13px; }
.lines { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--line-soft); padding-top: 10px; font-size: 14px; }
.lines div { display: flex; justify-content: space-between; }
.savings { color: #2A5E5A; }
.note { margin: 4px 0 0 0; line-height: 16px; }
</style>
