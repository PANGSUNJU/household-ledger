<template>
  <main class="page calendar">
    <header class="month-head">
      <button type="button" class="icon-btn" aria-label="이전 달" @click="move(-1)"><AppIcon name="back" :size="22" /></button>
      <h1>{{ y }}년 {{ m }}월</h1>
      <button type="button" class="icon-btn" aria-label="다음 달" @click="move(1)"><AppIcon name="next" :size="22" /></button>
    </header>

    <router-link v-if="needCount" to="/settings/recurring" class="need-banner">
      금액을 넣어야 하는 고정 지출 {{ needCount }}건 <span aria-hidden="true">→</span>
    </router-link>

    <section class="card summary" aria-label="이번 달 요약">
      <div>
        <span class="muted">{{ m }}월 쓴 돈</span>
        <strong class="amount-expense">{{ won(summary.spent) }}원</strong>
      </div>
      <div class="divider">
        <span class="muted">{{ m }}월 수입</span>
        <strong class="amount-income">{{ won(summary.income) }}원</strong>
      </div>
    </section>

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
          <span v-if="c.rec" class="store">{{ c.rec.top }}{{ c.rec.count + c.rec.needs > 1 ? ' 외' : '' }}</span>
          <span v-if="c.rec && c.rec.spent > 0" class="amt">-{{ compact(c.rec.spent) }}</span>
          <span v-else-if="c.rec && (c.rec.income || c.rec.spent < 0)" class="amt plus">+{{ compact(c.rec.income - c.rec.spent) }}</span>
          <span v-else-if="c.rec && c.rec.needs" class="amt need">입력 필요</span>
          <template v-if="!c.rec && c.plans.length">
            <span class="store plan">{{ c.plans[0].item.name }}{{ c.plans.length > 1 ? ' 외' : '' }}</span>
            <span class="amt plan">예정</span>
          </template>
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
      <p v-else-if="!selectedTxs.length && !selectedPlans.length" class="muted empty-msg">기록이 없어요. + 버튼으로 추가해 보세요.</p>
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

    <router-link :to="{ name: 'entry', query: { date: selected } }" class="fab" aria-label="기록 추가">
      <AppIcon name="plus" :size="28" :stroke="2.2" />
    </router-link>
  </main>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import TxRow from '@/components/TxRow.vue'
import { listMonth, listRecurringItems, listNeedsAmount, listCategories } from '@/lib/api'
import { upcoming } from '@/lib/recurring'
import { todayKST, parse, format, daysInMonth, weekday, addMonths, label } from '@/lib/date'
import { won, signed, compact } from '@/lib/money'
import { summarize, byDay } from '@/lib/stats'

export default {
  name: 'CalendarView',
  components: { AppIcon, TxRow },
  data() {
    const today = todayKST()
    // 저장 후 돌아오면 그 날짜를 보여준다 (?date=YYYY-MM-DD)
    const q = this.$route.query.date
    const selected = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : today
    const { y, m } = parse(selected)
    return {
      WEEK: ['일', '월', '화', '수', '목', '금', '토'],
      today, y, m, selected,
      txs: [], loading: false, error: '',
      items: [], needCount: 0, catColors: {}
    }
  },
  computed: {
    blanks() { return weekday(this.y, this.m, 1) },
    days() { return byDay(this.txs) },
    /** 날짜별 '예정' 고정 항목 (오늘 다음 날부터) */
    plans() {
      const out = {}
      const from = format(this.y, this.m, 1)
      const to = format(this.y, this.m, daysInMonth(this.y, this.m))
      for (const o of upcoming(this.items, from, to, this.today)) (out[o.date] ||= []).push(o)
      return out
    },
    cells() {
      const out = []
      for (let d = 1; d <= daysInMonth(this.y, this.m); d++) {
        const date = format(this.y, this.m, d)
        const rec = this.days[date]
        const plans = this.plans[date] || []
        out.push({
          d, date, rec, plans, wd: weekday(this.y, this.m, d),
          aria: `${this.m}월 ${d}일` +
            (rec ? `, ${rec.count}건, 지출 ${won(rec.spent)}원` + (rec.needs ? `, 금액 입력 필요 ${rec.needs}건` : '')
              : plans.length ? `, 고정 항목 예정 ${plans.length}건` : ', 기록 없음')
        })
      }
      return out
    },
    summary() { return summarize(this.txs) },
    selectedTxs() { return this.txs.filter((t) => t.date === this.selected) },
    selectedPlans() { return this.plans[this.selected] || [] },
    selectedTotal() { return this.days[this.selected]?.spent || 0 },
    dayLabel() { return label(this.selected) }
  },
  created() { this.load() },
  methods: {
    won, signed, compact,
    async load() {
      this.loading = true; this.error = ''
      try {
        // 고정 항목·금액 입력 필요는 0002 SQL 전이면 실패할 수 있어서 따로 (실패해도 캘린더는 보인다)
        const [txs, items, needs, cats] = await Promise.all([
          listMonth(this.y, this.m),
          listRecurringItems().catch(() => []),
          listNeedsAmount().catch(() => []),
          listCategories({ includeHidden: true }).catch(() => [])
        ])
        this.txs = txs; this.items = items; this.needCount = needs.length
        this.catColors = Object.fromEntries(cats.map((c) => [c.id, c.color]))
      } catch (e) {
        this.error = '기록을 불러오지 못했어요.'
        console.error(e)
      } finally {
        this.loading = false
      }
    },
    move(diff) {
      const next = addMonths(this.y, this.m, diff)
      this.y = next.y; this.m = next.m
      const sameMonthAsToday = format(next.y, next.m, 1).slice(0, 7) === this.today.slice(0, 7)
      this.selected = sameMonthAsToday ? this.today : format(next.y, next.m, 1)
      this.load()
    },
    catColor(item) { return this.catColors[item.category_id] || '#F3EFEA' }
  }
}
</script>

<style scoped>
.month-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 4px 0; }
.month-head h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
.icon-btn {
  width: var(--tap); height: var(--tap); border: 0; background: transparent; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
}

.summary { margin: 4px 0 12px 0; padding: 14px 18px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.summary div { display: flex; flex-direction: column; gap: 2px; }
.summary span { font-size: 13px; }
.summary strong { font-size: 20px; }
.divider { border-left: 1px solid var(--line); padding-left: 16px; }

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
.store { font-size: 10px; line-height: 13px; color: var(--text-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.amt { font-size: 10px; line-height: 13px; font-weight: 600; color: var(--expense); }
.amt.plus { color: var(--income); }
.amt.need { color: #A9533F; font-size: 9px; }
.store.plan, .amt.plan { color: var(--text-faint); font-weight: 500; }
.cell.planned { background: repeating-linear-gradient(135deg, transparent 0 5px, #F6EFEA 5px 7px); }
.need-banner {
  display: flex; justify-content: space-between; align-items: center; margin: 4px 0 8px 0; padding: 12px 14px;
  border-radius: var(--radius-md); background: #FFE6DA; color: #8E3F33; font-size: 14px; font-weight: 600; text-decoration: none;
}
.tx.need :deep(.amt) { color: #A9533F; font-size: 13px; }
.plan-row { opacity: 0.62; }
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

.fab {
  position: fixed; bottom: calc(var(--nav-h) + 20px + env(safe-area-inset-bottom));
  right: max(20px, calc(50% - 240px + 20px));
  width: 60px; height: 60px; border-radius: 30px; background: var(--primary); color: var(--on-primary);
  display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 16px rgba(201, 106, 85, 0.30); z-index: 11;
}
</style>
