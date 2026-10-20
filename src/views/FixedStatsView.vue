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
              <span class="muted small">{{ visibleLabel }} 평균</span>
              <strong class="avg">{{ won(average) }}원<span class="per">/달</span></strong>
            </div>
            <span class="muted tiny hint">{{ canLoadMore || firstVisible > 0 ? '← 밀어서 지난 달 보기' : '' }}</span>
          </div>

          <!-- 옆으로 밀면 지난 달이 나오고, 왼쪽 끝에 가까워지면 그 전 달을 불러와 이어 붙인다 -->
          <div
            ref="scroller" class="plot-scroll" :class="{ dragging: drag.on }"
            @scroll.passive="onScroll" @pointerdown="dragStart" @click.capture="dragClick"
          >
            <div class="plot">
              <button
                v-for="(mo, i) in months" :key="mo.key" type="button" class="col"
                :class="{ on: mo.key === selKey, wait: mo.key < loadedFrom }" :aria-pressed="mo.key === selKey"
                :aria-label="`${mo.label} 고정 지출 ${won(mo.done)}원` + (mo.planned ? `, 예정 ${won(mo.planned)}원` : '') + (mo.needs ? `, 금액 입력 필요 ${mo.needs}건` : '')"
                @click="select(mo.key)"
              >
                <span class="val">{{ mo.key === selKey ? compactWon(mo.done + mo.planned) : '' }}</span>
              <span class="stack" :style="{ height: barPct(mo) + '%' }">
                <span v-if="mo.planned" class="seg-plan" :style="{ flexGrow: mo.planned }" />
                <span v-if="mo.done" class="seg-done" :style="{ flexGrow: mo.done }" />
              </span>
                <span v-if="mo.needs" class="dot" aria-hidden="true">!</span>
                <span class="mlabel">{{ mo.short }}</span>
              </button>
            </div>
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

          <p v-if="!cur.rows.length" class="muted small empty-month">고정 지출이 없어요</p>
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
            <div v-if="cur.savings"><span class="muted">그중 저축/투자</span><b class="savings">{{ won(cur.savings) }}원</b></div>
            <div v-if="cur.income"><span class="muted">고정 수입</span><b class="amount-income">{{ won(cur.income) }}원</b></div>
          </div>
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
 *  · 저축/투자 분류도 지출로 합계에 넣고, 그중 얼마인지 따로 보여준다 (통계와 같은 규칙)
 */
export default {
  name: 'FixedStatsView',
  components: { ScreenHeader, AppIcon },
  data() {
    const today = todayKST()
    const { y, m } = parse(today)
    return {
      today, y, m,
      count: 12,              // 불러와 둔 달 수 (이번 달부터 거꾸로)
      loadedFrom: '',         // 기록을 받아 온 가장 이른 달 'YYYY-MM-01' (이보다 앞 칸은 받는 중)
      loadingMore: false,
      selKey: format(y, m, 1),
      firstVisible: 0,        // 차트에서 지금 보이는 첫 칸 번호
      drag: { on: false, x: 0, left: 0, moved: false, justDragged: false },   // PC 마우스로 끌기
      txs: [], items: [], categories: [],
      loading: true, error: '', setupMissing: false
    }
  },
  computed: {
    catMap() { return Object.fromEntries(this.categories.map((c) => [c.id, c])) },
    itemMap() { return Object.fromEntries(this.items.map((x) => [x.id, x])) },
    /** 불러온 달(count) 만큼 계산. 왼쪽이 오래된 달, 오른쪽 끝이 이번 달 */
    allMonths() {
      const out = []
      const n = this.count
      for (let i = n - 1; i >= 0; i--) {
        const { y, m } = addMonths(this.y, this.m, -i)
        out.push({
          key: format(y, m, 1), y, m,
          label: `${y !== this.y ? y + '년 ' : ''}${m}월`,
          short: m === 1 || i === n - 1 ? `${String(y).slice(2)}.${m}` : `${m}월`,
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
        if (cat?.is_savings && t.status === 'confirmed') mo.savings += t.amount
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
      const thisMo = out[out.length - 1]
      const end = addDays(format(this.y, this.m, daysInMonth(this.y, this.m)), 3)
      for (const o of upcoming(this.items, this.today, end, this.today)) {
        if (o.month !== thisMo.key || o.item.kind !== 'expense') continue
        const cat = this.catMap[o.item.category_id]
        if (cat?.is_savings && o.item.is_amount_fixed) thisMo.savings += o.item.amount
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
    months() { return this.allMonths },
    hasAny() { return this.txs.length > 0 || this.items.some((x) => x.is_active && x.kind === 'expense') },
    selIndex() { return this.months.findIndex((x) => x.key === this.selKey) },
    cur() { return this.months[this.selIndex] },
    /** 가장 이른 고정 항목 시작 달 (처음 몇 칸을 보여줄지 정할 때 씀) */
    minKey() {
      const starts = this.items.map((x) => (x.start_date || '').slice(0, 7) + '-01').filter((k) => k.length === 10)
      const txMin = this.txs.reduce((a, t) => (!a || t.recurring_month < a ? t.recurring_month : a), '')
      const all = [...starts, txMin].filter(Boolean).sort()
      return all[0] || format(this.y, this.m, 1)
    },
    /** 어디까지 밀 수 있나: 최근 2년(24칸)까지는 기록이 없어도 빈 칸으로, 그보다 오래된 기록이 있으면 거기까지 */
    limitKey() {
      const two = addMonths(this.y, this.m, -23)
      const k = format(two.y, two.m, 1)
      return this.minKey < k ? this.minKey : k
    },
    canLoadMore() { return !!this.months[0] && this.months[0].key > this.limitKey },
    canPrev() { return this.selIndex > 0 || this.canLoadMore },
    canNext() { return this.selIndex < this.months.length - 1 },
    prevOfCur() {
      const i = this.selIndex
      return i > 0 ? this.months[i - 1] : null
    },
    /** 막대 높이 기준: 불러온 모든 달 중 가장 큰 값 (밀 때마다 높이가 바뀌지 않게) */
    maxTotal() { return Math.max(1, ...this.months.map((x) => x.done + x.planned)) },
    /** 지금 화면에 보이는 6칸 */
    visible() { return this.months.slice(this.firstVisible, this.firstVisible + 6) },
    visibleLabel() {
      const v = this.visible
      if (!v.length) return ''
      const a = v[0], b = v[v.length - 1]
      if (v.length === 1) return a.label
      // 해가 걸치면 양쪽에 해를 붙인다 (2025년 11월~2026년 4월), 같은 해면 앞에만(올해면 생략)
      if (a.y !== b.y) return `${a.y}년 ${a.m}월~${b.y}년 ${b.m}월`
      return `${a.label}~${b.m}월`
    },
    /** 평균: 보이는 6칸 중 기록이 있는 달만 (이번 달은 예정 포함 합계로) */
    average() {
      const used = this.visible.filter((x) => x.done + x.planned > 0)
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
  beforeUnmount() { window.removeEventListener('pointermove', this.dragMove); window.removeEventListener('pointerup', this.dragEnd) },
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
    colWidth() {
      const el = this.$refs.scroller
      const col = el?.querySelector('.col')
      return col ? col.getBoundingClientRect().width + 4 : 1   // 막대 칸 + 사이 4px
    },
    onScroll() {
      const el = this.$refs.scroller
      if (!el) return
      this.firstVisible = Math.max(0, Math.round(el.scrollLeft / this.colWidth()))
      // 왼쪽 끝에서 두 칸 안쪽으로 들어오면 그 전 6개월을 불러온다
      if (el.scrollLeft < this.colWidth() * 2) this.loadMore()
    },
    /** 고른 달이 차트에서 보이게 (부드럽게) */
    reveal(key, smooth = true) {
      this.$nextTick(() => {
        const el = this.$refs.scroller
        const i = this.months.findIndex((x) => x.key === key)
        if (!el || i < 0) return
        const w = this.colWidth()
        const left = el.scrollLeft, right = left + el.clientWidth
        const x = i * w
        if (x < left) el.scrollTo({ left: x, behavior: smooth ? 'smooth' : 'auto' })
        else if (x + w > right) el.scrollTo({ left: x + w - el.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
      })
    },
    select(key) { this.selKey = key; this.reveal(key) },
    /*
     * PC 마우스로 차트 끌기 (폰 손가락 밀기는 브라우저가 알아서 하므로 마우스만)
     *  · 5px 넘게 끌면 '이동', 아니면 손을 뗄 때 원래대로 '그달 선택'(클릭)
     *  · 끄는 동안은 칸 맞춤(스냅)을 잠시 끄고, 놓으면 다시 켜서 가까운 칸에 멈춤
     */
    dragStart(e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      const el = this.$refs.scroller
      this.drag = { on: true, x: e.clientX, left: el.scrollLeft, moved: false, justDragged: false }
      el.style.scrollSnapType = 'none'
      window.addEventListener('pointermove', this.dragMove)
      window.addEventListener('pointerup', this.dragEnd, { once: true })
    },
    dragMove(e) {
      if (!this.drag.on) return
      const dx = e.clientX - this.drag.x
      if (Math.abs(dx) > 5) this.drag.moved = true
      if (this.drag.moved) this.$refs.scroller.scrollLeft = this.drag.left - dx
    },
    dragEnd() {
      window.removeEventListener('pointermove', this.dragMove)
      const el = this.$refs.scroller
      const moved = this.drag.moved
      this.drag = { ...this.drag, on: false, justDragged: moved }
      if (!el) return
      el.style.scrollSnapType = ''
      if (moved) {
        // 가까운 칸에 부드럽게 맞춤
        const w = this.colWidth()
        el.scrollTo({ left: Math.round(el.scrollLeft / w) * w, behavior: 'smooth' })
      }
    },
    /** 끌고 난 직후의 클릭은 '그달 선택'으로 치지 않음 */
    dragClick(e) {
      if (this.drag.justDragged) { e.stopPropagation(); e.preventDefault(); this.drag.justDragged = false }
    },
    async step(dir) {
      const i = this.selIndex + dir
      if (i < 0) {
        if (!this.canLoadMore) return
        const want = addMonths(+this.selKey.slice(0, 4), +this.selKey.slice(5, 7), -1)
        await this.loadMore()
        this.select(format(want.y, want.m, 1))
        return
      }
      if (i < this.months.length) this.select(this.months[i].key)
    },
    /** 그 전 6개월: 칸을 먼저 붙이고(받는 중 흐린 막대) 스크롤 위치는 그대로, 받으면 막대가 자라남 */
    async loadMore() {
      if (this.loadingMore || !this.canLoadMore) return
      this.loadingMore = true
      const el = this.$refs.scroller
      const before = el ? el.scrollWidth - el.scrollLeft : 0
      const oldFirst = this.months[0]
      // 한도(limitKey)까지 남은 달만큼만 (최대 6칸)
      const left = (oldFirst.y * 12 + oldFirst.m) - (+this.limitKey.slice(0, 4) * 12 + +this.limitKey.slice(5, 7))
      const add = Math.min(6, left)
      if (add <= 0) { this.loadingMore = false; return }
      this.count += add
      await this.$nextTick()
      if (el) el.scrollLeft = el.scrollWidth - before   // 붙인 만큼 밀어서 보던 자리 그대로
      try {
        const from = addMonths(oldFirst.y, oldFirst.m, -add)
        const to = addMonths(oldFirst.y, oldFirst.m, -1)
        const more = await listFixedTransactions(format(from.y, from.m, 1), format(to.y, to.m, 1))
        this.txs = [...more, ...this.txs]
        this.loadedFrom = format(from.y, from.m, 1)
      } catch (e) {
        this.count -= add
        console.error(e)
      } finally {
        this.loadingMore = false
      }
    },
    async load() {
      this.loading = true; this.error = ''
      try {
        const [items, cats] = await Promise.all([listRecurringItems(), listCategories({ includeHidden: true })])
        this.items = items; this.categories = cats
        // 처음엔 12칸(최근 1년)을 불러 두고 6칸만 보여줌 → 바로 밀 수 있고, 더 밀면 6개월씩 더 불러옴
        this.count = 12
        const first = addMonths(this.y, this.m, -(this.count - 1))
        this.txs = await listFixedTransactions(format(first.y, first.m, 1), format(this.y, this.m, 1))
        this.loadedFrom = format(first.y, first.m, 1)
      } catch (e) {
        if (isMissingSetup(e)) this.setupMissing = true
        else { this.error = '불러오지 못했어요.'; console.error(e) }
      } finally {
        this.loading = false
      }
      // 처음엔 오른쪽 끝(이번 달)이 보이게
      this.$nextTick(() => {
        const el = this.$refs.scroller
        if (el) { el.scrollLeft = el.scrollWidth; this.onScroll() }
      })
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
.hint { padding-top: 2px; white-space: nowrap; }

/* 옆으로 밀기: 한 화면에 6칸, 칸 단위로 딱 맞춰 멈춤. 세로 스크롤은 페이지가 그대로 */
.plot-scroll {
  overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; overscroll-behavior-x: contain;
  scrollbar-width: none; -webkit-overflow-scrolling: touch; padding-bottom: 24px; margin-bottom: -22px;
}
.plot-scroll::-webkit-scrollbar { display: none; }
/* 마우스가 있는 기기: 끌 수 있다는 손 모양 */
@media (hover: hover) and (pointer: fine) {
  .plot-scroll { cursor: grab; }
  .plot-scroll .col { cursor: inherit; }
  .plot-scroll.dragging { cursor: grabbing; user-select: none; }
}
/* 막대: 바닥에 붙고 위쪽만 4px 둥글게, 막대 사이는 칸 여백 */
.plot {
  height: 170px; display: grid; grid-auto-flow: column; grid-auto-columns: calc((100% - 20px) / 6); gap: 4px;
  align-items: end; border-bottom: 1px solid var(--line); padding-top: 4px;
}
.col { scroll-snap-align: start; }
.col.wait .stack { background: var(--surface-sunken); height: 30% !important; }
.col {
  height: 100%; border: 0; background: transparent; padding: 0; position: relative;
  display: flex; flex-direction: column; justify-content: flex-end; align-items: center; border-radius: 8px;
}
.col:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.val { font-size: 11px; font-weight: 700; color: var(--text); min-height: 15px; white-space: nowrap; }
.stack {
  width: min(28px, 70%); display: flex; flex-direction: column; gap: 2px;
  border-radius: 4px 4px 0 0; overflow: hidden; min-height: 0;
  transition: height .35s ease;   /* 새로 불러오거나 기준이 바뀌면 부드럽게 자라남 */
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
