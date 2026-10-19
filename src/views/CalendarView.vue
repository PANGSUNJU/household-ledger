<template>
  <main class="page calendar">
    <header class="month-head">
      <button type="button" class="icon-btn" aria-label="이전 달" @click="move(-1)"><AppIcon name="back" :size="22" /></button>
      <h1><button type="button" class="ym" aria-label="연월 선택" @click="picker = true">{{ y }}년 {{ m }}월<AppIcon name="down" :size="18" /></button></h1>
      <button type="button" class="icon-btn" aria-label="다음 달" @click="move(1)"><AppIcon name="next" :size="22" /></button>
    </header>

    <section v-if="showRemind" class="card remind" aria-label="주간 정리 안내">
      <strong>이번 주 정리할까요?</strong>
      <span v-if="needCount" class="muted small">금액 넣을 고정 지출 {{ needCount }}건</span>
      <div class="remind-btns">
        <router-link to="/capture" class="r-go">캡처로 정리하기</router-link>
        <router-link v-if="needCount" to="/settings/recurring" class="r-sub">금액 넣기</router-link>
        <button type="button" class="r-sub" @click="remindDone">다 했어요</button>
      </div>
    </section>

    <router-link v-else-if="needCount" to="/settings/recurring" class="need-banner">
      금액을 넣어야 하는 고정 지출 {{ needCount }}건 <span aria-hidden="true">→</span>
    </router-link>

    <section class="card summary" aria-label="이번 달 요약">
      <div>
        <span class="muted">{{ vm }}월 지출</span>
        <strong class="amount-expense">{{ won(summary.spent) }}원</strong>
      </div>
      <div class="divider">
        <span class="muted">{{ vm }}월 수입</span>
        <strong class="amount-income">{{ won(summary.income) }}원</strong>
      </div>
      <p class="net">수입 − 지출 = <b :class="net > 0 ? 'amount-income' : net < 0 ? 'amount-expense' : ''">{{ net < 0 ? '-' : '' }}{{ won(Math.abs(net)) }}원</b></p>
    </section>

    <BudgetCard :y="vy" :m="vm" :spent="summary.budgetSpent" :preset="budget" class="budget-card" @changed="(b) => budget = { loaded: true, ready: true, budget: b }" />

    <section class="card grid-wrap" aria-label="달력">
      <div class="weekdays">
        <span v-for="(w, i) in WEEK" :key="w" :class="{ sun: i === 0, sat: i === 6 }">{{ w }}</span>
      </div>
      <div class="grid">
        <span v-for="n in blanks" :key="'b' + n" class="cell empty" />
        <button
          v-for="c in cells" :key="c.date" type="button" class="cell"
          :class="{ 'has-rec': c.rec, planned: !c.rec && c.plans.length, today: c.date === today, future: c.date > today, selected: c.date === selected, sun: c.wd === 0, sat: c.wd === 6 }"
          :aria-label="c.aria" :aria-pressed="c.date === selected"
          @click="selected = c.date"
        >
          <span class="day">{{ c.d }}</span>
          <!-- 그날 총수입·총지출만 (자세한 건 아래 목록) -->
          <span v-if="c.inc > 0" class="amt plus">+{{ compact(c.inc) }}</span>
          <span v-if="c.exp > 0" class="amt">-{{ compact(c.exp) }}</span>
          <span v-if="c.rec && c.rec.needs && !c.inc && !c.exp" class="amt need">입력 필요</span>
          <span v-if="!c.rec && c.plans.length" class="amt plan">예정</span>
        </button>
      </div>
    </section>

    <section class="card day-list" :aria-label="dayLabel + ' 내역'">
      <div class="day-head">
        <h2>{{ dayLabel }}{{ selected === today ? ' · 오늘' : '' }}</h2>
        <span v-if="selectedTotal > 0" class="amount-expense">-{{ won(selectedTotal) }}원</span>
      </div>
      <p v-if="loading" class="muted empty-msg">불러오는 중…</p>
      <p v-else-if="error" class="error empty-msg">{{ error }}</p>
      <p v-else-if="!selectedTxs.length && !selectedPlans.length" class="muted empty-msg">기록이 없어요</p>
      <TxRow v-for="t in selectedTxs" :key="t.id" :tx="t" class="tx" :class="{ need: t.status === 'needs_amount' }" />
      <!-- 아직 날짜가 안 된 고정 항목 (예정) -->
      <router-link v-for="p in selectedPlans" :key="p.item.id" to="/settings/recurring" class="tx plan-row">
        <span class="tile" :style="{ background: catColor(p.item) }">예정</span>
        <span class="tx-main">
          <span class="tx-name">{{ p.item.name }}</span>
          <span class="tx-sub">고정 {{ p.item.kind === 'income' ? '수입' : '지출' }} · 그날 앱을 열면 기록돼요</span>
        </span>
        <span class="tx-amt" :class="{ 'amount-income': p.item.kind === 'income' }">{{ p.item.is_amount_fixed ? signed(p.item.amount, p.item.kind) : '금액 미정' }}</span>
      </router-link>
    </section>

    <MonthPicker :open="picker" :y="y" :m="m" @pick="goMonth" @close="picker = false" />

    <router-link :to="{ name: 'entry', query: { date: selected } }" class="fab" aria-label="기록 추가">
      <AppIcon name="plus" :size="28" :stroke="2.2" />
    </router-link>
  </main>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import TxRow from '@/components/TxRow.vue'
import BudgetCard from '@/components/BudgetCard.vue'
import MonthPicker from '@/components/MonthPicker.vue'
import { listMonth, listRecurringItems, listNeedsAmount, listCategories, getRemindSettings, saveRemindSettings, getBudget } from '@/lib/api'
import { shouldRemind } from '@/lib/remind'
import { upcoming } from '@/lib/recurring'
import { todayKST, parse, format, daysInMonth, weekday, addMonths, label } from '@/lib/date'
import { won, signed, compact } from '@/lib/money'
import { summarize, byDay } from '@/lib/stats'

export default {
  name: 'CalendarView',
  components: { AppIcon, TxRow, BudgetCard, MonthPicker },
  data() {
    const today = todayKST()
    // 저장 후 돌아오면 그 날짜를 보여준다 (?date=YYYY-MM-DD)
    const q = this.$route.query.date
    const selected = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : today
    const { y, m } = parse(selected)
    return {
      WEEK: ['일', '월', '화', '수', '목', '금', '토'],
      // y·m: 위 제목(바로 바뀜) / vy·vm: 아래 내용(그 달 기록을 다 불러온 뒤 한꺼번에 바뀜)
      today, y, m, vy: y, vm: m, selected, nextSelected: null, picker: false,
      budget: { loaded: false, ready: false, budget: null },
      txs: [], loading: false, error: '',
      items: [], needCount: 0, catColors: {}, remind: null, reqSeq: 0
    }
  },
  computed: {
    blanks() { return weekday(this.vy, this.vm, 1) },
    days() { return byDay(this.txs) },
    /** 날짜별 '예정' 고정 항목 (오늘 다음 날부터) */
    plans() {
      const out = {}
      const from = format(this.vy, this.vm, 1)
      const to = format(this.vy, this.vm, daysInMonth(this.vy, this.vm))
      for (const o of upcoming(this.items, from, to, this.today)) (out[o.date] ||= []).push(o)
      return out
    },
    cells() {
      const out = []
      for (let d = 1; d <= daysInMonth(this.vy, this.vm); d++) {
        const date = format(this.vy, this.vm, d)
        const rec = this.days[date]
        const plans = this.plans[date] || []
        // 총수입 / 총지출 (환불만 있는 날은 돌려받은 돈이라 수입 쪽에)
        const inc = rec ? rec.income + Math.max(0, -rec.spent) : 0
        const exp = rec ? Math.max(0, rec.spent) : 0
        out.push({
          d, date, rec, plans, inc, exp, wd: weekday(this.vy, this.vm, d),
          aria: `${this.vm}월 ${d}일` +
            (rec ? (inc ? `, 수입 ${won(inc)}원` : '') + (exp ? `, 지출 ${won(exp)}원` : '') + (rec.needs ? `, 금액 입력 필요 ${rec.needs}건` : '')
              : plans.length ? `, 고정 항목 예정 ${plans.length}건` : ', 기록 없음')
        })
      }
      return out
    },
    summary() { return summarize(this.txs) },
    /** 그 달 남은 돈 = 수입 − 지출 (지출은 저축/투자 포함, 환불 반영) */
    net() { return this.summary.income - this.summary.spent },
    selectedTxs() { return this.txs.filter((t) => t.date === this.selected) },
    showRemind() { return shouldRemind(this.remind) },
    selectedPlans() { return this.plans[this.selected] || [] },
    selectedTotal() { return this.days[this.selected]?.spent || 0 },
    dayLabel() { return label(this.selected) }
  },
  created() {
    this.load()
    getRemindSettings().then((r) => { this.remind = r })
  },
  methods: {
    won, signed, compact,
    async load() {
      const seq = ++this.reqSeq   // 빨리 달을 넘기면 늦게 온 앞 달 응답은 버린다
      const y = this.y, m = this.m
      this.loading = true; this.error = ''
      // 아래 내용은 새 달 기록·예산이 다 온 뒤 한 번에 바꾼다 (깜빡임 방지)
      const show = (txs, budget) => {
        this.vy = y; this.vm = m; this.txs = txs
        if (budget) this.budget = budget
        if (this.nextSelected) { this.selected = this.nextSelected; this.nextSelected = null }
      }
      try {
        // 고정 항목·금액 입력 필요는 0002 SQL 전이면 실패할 수 있어서 따로 (실패해도 캘린더는 보인다)
        const [txs, items, needs, cats, budget] = await Promise.all([
          listMonth(y, m),
          listRecurringItems().catch(() => []),
          listNeedsAmount().catch(() => []),
          listCategories({ includeHidden: true }).catch(() => []),
          // 예산 표가 없으면(0003 SQL 전) 카드만 숨긴다
          getBudget(format(y, m, 1)).then((b) => ({ loaded: true, ready: true, budget: b }), () => ({ loaded: true, ready: false, budget: null }))
        ])
        if (seq !== this.reqSeq) return
        show(txs, budget)
        this.items = items; this.needCount = needs.length
        this.catColors = Object.fromEntries(cats.map((c) => [c.id, c.color]))
      } catch (e) {
        if (seq !== this.reqSeq) return
        show([], null)
        this.error = '기록을 불러오지 못했어요.'
        console.error(e)
      } finally {
        if (seq === this.reqSeq) this.loading = false
      }
    },
    move(diff) {
      const next = addMonths(this.y, this.m, diff)
      this.goMonth(next)
    },
    /** 고른 연월로 이동 (화살표·연월 선택 둘 다) */
    goMonth({ y, m }) {
      this.picker = false
      if (y === this.y && m === this.m) return
      this.y = y; this.m = m
      const sameMonthAsToday = format(y, m, 1).slice(0, 7) === this.today.slice(0, 7)
      this.nextSelected = sameMonthAsToday ? this.today : format(y, m, 1)
      this.load()
    },
    async remindDone() {
      const t = todayKST()
      this.remind = { ...this.remind, remind_done_on: t }
      try { await saveRemindSettings({ remind_done_on: t }) } catch (e) { console.error(e) }
    },
    catColor(item) { return this.catColors[item.category_id] || '#F3EFEA' }
  }
}
</script>

<style scoped>
.month-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 4px 0; }
.month-head h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
.ym { display: flex; align-items: center; gap: 4px; min-height: var(--tap); padding: 0 10px; border: 0; border-radius: 12px; background: transparent; font: inherit; color: inherit; }
.ym:active { background: var(--surface-sunken); }
.icon-btn {
  width: var(--tap); height: var(--tap); border: 0; background: transparent; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
}

.budget-card { margin: -4px 0 12px 0; }
.summary { margin: 4px 0 12px 0; padding: 14px 18px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.summary div { display: flex; flex-direction: column; gap: 2px; }
.summary span { font-size: 13px; }
.summary strong { font-size: 20px; }
.divider { border-left: 1px solid var(--line); padding-left: 16px; }
.net { grid-column: 1 / -1; margin: 0; padding-top: 10px; border-top: 1px solid var(--line-soft); font-size: 13px; color: var(--text-sub); text-align: right; }
.net b { font-size: 14px; font-weight: 700; color: var(--text); }
.net b.amount-income { color: var(--income); }
.net b.amount-expense { color: var(--expense); }

.grid-wrap { padding: 10px 6px 8px 6px; }
.weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); text-align: center; font-size: 12px; font-weight: 500; color: var(--text-sub); padding-bottom: 6px; }
.grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
.cell {
  min-height: 58px; border: 0; border-radius: var(--radius); padding: 5px 2px 4px 2px; background: transparent;
  display: flex; flex-direction: column; align-items: center; gap: 1px; overflow: hidden;
}
.cell.empty { pointer-events: none; }
.cell.has-rec { background: #FFF4EE; }
.cell.selected { box-shadow: inset 0 0 0 1.5px var(--primary); }
.cell.today { background: var(--today-bg); box-shadow: inset 0 0 0 2px var(--today-ring); }
.day { font-size: 13px; line-height: 16px; font-weight: 500; }
.sun .day, .weekdays .sun { color: var(--expense); }
.sat .day, .weekdays .sat { color: var(--income); }
.future .day { color: var(--text-faint); }
.today .day { color: var(--today-fg); font-weight: 700; }
.amt { font-size: 10px; line-height: 13px; font-weight: 600; color: var(--expense); }
.amt.plus { color: var(--income); }
.amt.need { color: #A9533F; font-size: 9px; }
.amt.plan { color: var(--text-faint); font-weight: 500; }
.cell.planned { background: repeating-linear-gradient(135deg, transparent 0 5px, #F6EFEA 5px 7px); }
.need-banner {
  display: flex; justify-content: space-between; align-items: center; margin: 4px 0 8px 0; padding: 12px 14px;
  border-radius: var(--radius-md); background: #FFE6DA; color: #8E3F33; font-size: 14px; font-weight: 600; text-decoration: none;
}
.tx.need :deep(.amt) { color: #A9533F; font-size: 13px; }
.plan-row { opacity: 0.62; }
.remind { margin: 4px 0 10px 0; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; border: 1.5px solid #F4DC8E; background: #FFFBEA; }
.remind strong { font-size: 16px; }
.remind .small { font-size: 13px; line-height: 19px; }
.remind-btns { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 4px; }
.r-go { height: 38px; padding: 0 14px; border-radius: 10px; background: var(--primary); color: var(--on-primary); font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; text-decoration: none; }
.r-sub { height: 38px; padding: 0 12px; border: 0; border-radius: 10px; background: var(--surface-sunken); color: #5A4E48; font-size: 13px; display: inline-flex; align-items: center; text-decoration: none; }
.plan-row .tile { font-size: 11px; }

.day-list { margin-top: 12px; padding: 14px 16px 6px 16px; display: flex; flex-direction: column; }
.day-head { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 6px; }
.day-head h2 { margin: 0; font-size: 15px; font-weight: 600; }
.day-head span { font-size: 14px; font-weight: 600; }
.empty-msg { margin: 0; padding: 12px 0 14px 0; font-size: 14px; border-top: 1px solid var(--line-soft); }
.error { color: var(--expense); }
.tx { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--line-soft); color: var(--text); text-decoration: none; }
.tile { width: 36px; height: 36px; flex-shrink: 0; border-radius: var(--radius); font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; color: #4A3F3A; }
.tx-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.tx-name { font-size: 15px; font-weight: 500; }
.tx-sub { font-size: 12px; color: var(--text-sub); }
.tx-amt { font-size: 15px; font-weight: 600; }

/* 맨 아래 기록이 + 버튼(60px)에 가리지 않게: 메뉴 바 + 버튼 자리만큼 아래 여백 */
.calendar { padding-bottom: calc(var(--nav-h) + 20px + 60px + 16px + env(safe-area-inset-bottom)); }
.fab {
  position: fixed; bottom: calc(var(--nav-h) + 20px + env(safe-area-inset-bottom));
  right: max(20px, calc(50% - 240px + 20px));
  width: 60px; height: 60px; border-radius: 30px; background: var(--primary); color: var(--on-primary);
  display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 16px rgba(201, 106, 85, 0.30); z-index: 11;
}
</style>
