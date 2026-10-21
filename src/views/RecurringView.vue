<template>
  <main class="manage">
    <ScreenHeader title="고정 수입·지출" fallback="/settings">
      <button v-if="!setupMissing" type="button" class="add-btn" @click="openNew">+ 추가</button>
    </ScreenHeader>

    <div class="body">
      <p v-if="setupMissing" class="notice" role="alert">
        고정 항목을 쓰려면 Supabase <b>SQL Editor</b>에서 <code>supabase/migrations/0002_recurring.sql</code> 내용을 한 번 실행해 주세요.
      </p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <!-- 이번 달 고정: 지출 | 수입 나란히 (캘린더 요약 카드와 같은 모양) -->
      <section v-if="loaded && !setupMissing && (items.length || doneTxs.length)" class="card month" :aria-label="`${thisM}월 고정 지출·수입`">
        <div class="month-head">
          <span class="muted">{{ thisM }}월 고정</span>
          <router-link to="/stats/fixed" class="link">달마다 보기 →</router-link>
        </div>
        <div class="cols">
          <div class="col-exp">
            <span class="muted small">고정 지출</span>
            <strong class="big amount-expense">{{ won(month.total) }}원</strong>
            <span v-if="month.unknown" class="unknown">+ 금액 미정 {{ month.unknown }}건</span>
            <span class="sub">나감 {{ won(month.done) }}원</span>
            <span class="sub">예정 {{ won(month.left) }}원</span>
          </div>
          <div class="col-inc">
            <span class="muted small">고정 수입</span>
            <strong class="big amount-income">{{ won(month.inTotal) }}원</strong>
            <span v-if="month.inUnknown" class="unknown">+ 금액 미정 {{ month.inUnknown }}건</span>
            <span class="sub">들어옴 {{ won(month.inDone) }}원</span>
            <span class="sub">예정 {{ won(month.inLeft) }}원</span>
          </div>
        </div>
      </section>

      <!-- 금액 입력 필요 모아보기 -->
      <section v-if="needs.length" class="card needs" aria-label="금액을 넣어야 하는 기록">
        <h2>금액을 넣어 주세요 <span class="count">{{ needs.length }}건</span></h2>
        <TxRow v-for="t in needs" :key="t.id" :tx="t" :fixed-tag="false" class="need-row" />
      </section>

      <template v-for="group in groups" :key="group.kind">
        <h2 v-if="group.list.length" class="group-title">{{ group.title }}</h2>
        <section v-if="group.list.length" v-sortable="(from, to) => onSort(group.kind, from, to)" class="card" :aria-label="group.title">
          <ManageRow v-for="it in group.list" :key="it.id" :name="it.name" class="rec-row">
            <template #lead>
              <span class="tile" :style="{ background: catOf(it)?.color || '#F3EFEA' }">{{ dayBadge(it) }}</span>
            </template>
            <span>{{ it.name }}
              <strong v-if="it.is_amount_fixed" class="amt" :class="it.kind === 'income' ? 'amount-income' : 'exp'">{{ won(it.amount) }}원</strong>
              <span v-else class="vary">매달 다름</span>
            </span>
            <span class="muted small">{{ scheduleText(it) }}{{ nextText(it) }}</span>
            <span v-if="!activeCatOf(it)" class="no-cat">분류를 골라 주세요</span>
            <template #trail>
              <button type="button" class="mini" @click="openEdit(it)">수정</button>
            </template>
          </ManageRow>
        </section>
      </template>

      <p v-if="loaded && !setupMissing && !activeItems.length" class="intro empty">
        아직 없어요. 월급, 보험료, 통신비, 월세처럼 매달 나가고 들어오는 돈을 <b>+ 추가</b>로 등록해 보세요.
      </p>

      <template v-if="stopped.length">
        <button type="button" class="hidden-toggle" @click="showStopped = !showStopped">
          그만둔 항목 {{ stopped.length }}개 {{ showStopped ? '접기' : '보기' }}
        </button>
        <section v-if="showStopped" class="card" aria-label="그만둔 고정 항목">
          <ManageRow v-for="it in stopped" :key="it.id" :name="it.name" :movable="false">
            <span>{{ it.name }}</span>
            <span class="muted small">{{ it.end_date ? label(it.end_date) + '에 그만둠' : '그만둠' }}</span>
            <template #trail>
              <button type="button" class="mini" :disabled="busy" @click="restart(it)">다시 시작</button>
            </template>
          </ManageRow>
        </section>
      </template>
    </div>

    <!-- 등록·수정 -->
    <BottomSheet :open="sheet.open" :title="sheet.id ? '고정 항목 수정' : '새 고정 항목'" @close="sheet.open = false">
      <form class="sheet-form" @submit.prevent="saveSheet">
        <div v-if="!sheet.id" class="seg" role="radiogroup" aria-label="종류">
          <button type="button" role="radio" :aria-checked="sheet.kind === 'expense'" :class="{ on: sheet.kind === 'expense' }" @click="setKind('expense')">고정 지출</button>
          <button type="button" role="radio" :aria-checked="sheet.kind === 'income'" :class="{ on: sheet.kind === 'income' }" @click="setKind('income')">고정 수입</button>
        </div>

        <label for="r-name" class="lbl">이름</label>
        <input id="r-name" v-model="sheet.name" class="box" type="text" maxlength="30" :placeholder="sheet.kind === 'income' ? '예: 월급' : '예: 실비보험'" required>

        <span class="lbl">금액</span>
        <div class="seg" role="radiogroup" aria-label="금액 방식">
          <button type="button" role="radio" :aria-checked="sheet.fixed" :class="{ on: sheet.fixed }" @click="sheet.fixed = true">매달 같음</button>
          <button type="button" role="radio" :aria-checked="!sheet.fixed" :class="{ on: !sheet.fixed }" @click="sheet.fixed = false">매달 다름</button>
        </div>
        <template v-if="sheet.fixed">
          <input id="r-amount" v-model="sheet.amountText" v-comma class="box" type="text" inputmode="decimal" placeholder="예: 55,000" aria-label="금액">
          <span v-if="sheet.amountText && sheetAmount === null" class="error">금액을 확인해 주세요</span>
        </template>
        <p v-else class="muted small hint">금액은 고지서가 나오면 넣어요</p>

        <label for="r-day" class="lbl">매달</label>
        <select id="r-day" v-model.number="sheet.day" class="box">
          <option v-for="d in 31" :key="d" :value="d">{{ d === 31 ? '말일' : d + '일' }}</option>
        </select>
        <span class="lbl">주말이면</span>
        <div class="seg seg3" role="radiogroup" aria-label="주말이면">
          <button
            v-for="r in WEEKEND_RULES" :key="r.value" type="button" role="radio"
            :aria-checked="sheet.rule === r.value" :class="{ on: sheet.rule === r.value }" @click="sheet.rule = r.value"
          >{{ r.label }}</button>
        </div>

        <span class="lbl">분류 <span v-if="!sheet.category_id" class="need-mark">골라 주세요</span></span>
        <CategoryGrid v-model="sheet.category_id" :categories="kindCats" />

        <span class="lbl">{{ sheet.kind === 'income' ? '받는 통장' : '결제수단' }}</span>
        <div class="chips">
          <button
            v-for="m in methods" :key="m.id" type="button" class="chip" :class="{ on: sheet.payment_method_id === m.id }"
            :aria-pressed="sheet.payment_method_id === m.id"
            @click="sheet.payment_method_id = sheet.payment_method_id === m.id ? null : m.id"
          >{{ m.name }}</button>
        </div>

        <label for="r-start" class="lbl">시작일</label>
        <input id="r-start" v-model="sheet.start" class="box" type="date" :max="maxStart" required>

        <p class="preview" aria-live="polite">{{ previewText }}</p>
        <p v-if="sheet.id" class="muted small">다음 회차부터 바뀌어요</p>
        <p v-if="sheetError" class="error" role="alert">{{ sheetError }}</p>

        <button type="submit" class="btn-primary" :disabled="!canSave || busy">{{ busy ? '저장하는 중…' : (sheet.id ? '저장' : '추가') }}</button>

        <div v-if="sheet.id" class="danger-row">
          <button type="button" class="mini" :disabled="busy" @click="stop">그만하기</button>
          <button v-if="!confirmDelete" type="button" class="mini danger" :disabled="busy" @click="confirmDelete = true">삭제</button>
          <span v-else class="confirm">
            <span class="small">삭제해도 지난 기록은 남아요.</span>
            <button type="button" class="mini danger" :disabled="busy" @click="remove">삭제</button>
          </span>
        </div>
      </form>
    </BottomSheet>
  </main>
</template>

<script>
import ScreenHeader from '@/components/ScreenHeader.vue'
import ManageRow from '@/components/ManageRow.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import CategoryGrid from '@/components/CategoryGrid.vue'
import TxRow from '@/components/TxRow.vue'
import {
  listRecurringItems, addRecurringItem, updateRecurringItem, deleteRecurringItem,
  listCategories, listPaymentMethods, listNeedsAmount, listFixedTransactions
} from '@/lib/api'
import { reorder, saveMoved } from '@/lib/manage'
import { calcAmount, won } from '@/lib/money'
import { todayKST, parse, format, daysInMonth, addDays, label } from '@/lib/date'
import { occurrencesBetween, upcoming, nextDate, scheduleText, runRecurring, isMissingSetup, WEEKEND_RULES } from '@/lib/recurring'

const emptySheet = (kind = 'expense') => ({
  open: true, id: null, kind, name: '', fixed: true, amountText: '', day: 25, rule: 'before',
  category_id: null, payment_method_id: null, start: todayKST()
})

export default {
  name: 'RecurringView',
  components: { ScreenHeader, ManageRow, BottomSheet, CategoryGrid, TxRow },
  data() {
    const today = todayKST()
    const { y, m } = parse(today)
    return {
      WEEKEND_RULES,
      today, thisY: y, thisM: m,
      items: [], categories: [], methods: [], needs: [], doneTxs: [],
      loaded: false, busy: false, error: '', setupMissing: false, showStopped: false,
      sheet: { ...emptySheet(), open: false }, sheetError: '', confirmDelete: false
    }
  },
  computed: {
    activeItems() { return this.items.filter((x) => x.is_active) },
    stopped() { return this.items.filter((x) => !x.is_active) },
    groups() {
      return [
        { kind: 'expense', title: '고정 지출', list: this.activeItems.filter((x) => x.kind === 'expense') },
        { kind: 'income', title: '고정 수입', list: this.activeItems.filter((x) => x.kind === 'income') }
      ]
    },
    month01() { return format(this.thisY, this.thisM, 1) },
    /** 이번 달(회차 기준) 고정 지출: 이미 나간 것 + 남은 예정 (저축/투자도 지출로 넣는다, 통계와 같은 규칙) */
    month() {
      let done = 0, unknown = 0, left = 0, inDone = 0, inLeft = 0, inUnknown = 0
      for (const t of this.doneTxs) {
        if (t.kind === 'income') { if (t.status === 'confirmed') inDone += t.amount; else inUnknown += 1; continue }
        if (t.status === 'needs_amount') unknown += 1
        else done += t.amount
      }
      const end = addDays(format(this.thisY, this.thisM, daysInMonth(this.thisY, this.thisM)), 3)
      for (const o of upcoming(this.activeItems, this.today, end, this.today)) {
        if (o.month !== this.month01) continue
        if (o.item.kind === 'income') { if (o.item.is_amount_fixed) inLeft += o.item.amount; else inUnknown += 1; continue }
        if (o.item.is_amount_fixed) left += o.item.amount
        else unknown += 1
      }
      return { done, left, total: done + left, unknown, inDone, inLeft, inTotal: inDone + inLeft, inUnknown }
    },
    kindCats() { return this.categories.filter((c) => c.kind === this.sheet.kind && c.is_active && !c.is_refund) },
    sheetAmount() { return calcAmount(this.sheet.amountText) },
    canSave() {
      if (!this.sheet.name.trim() || !this.sheet.start || !this.sheet.category_id) return false
      return !this.sheet.fixed || this.sheetAmount > 0
    },
    maxStart() { return addDays(this.today, 366) },
    draft() {
      return {
        is_active: true, day_of_month: this.sheet.day, weekend_rule: this.sheet.rule,
        start_date: this.sheet.start, end_date: null
      }
    },
    /** 미리보기: 시작일부터 오늘까지 바로 기록될 회차 수 + 다음 기록 날짜 */
    previewText() {
      if (!this.sheet.start) return ''
      const next = nextDate(this.draft, this.today)
      const nextPart = next ? `다음 기록: ${label(next)}` : ''
      if (this.sheet.id) return nextPart
      const past = this.sheet.start <= this.today ? occurrencesBetween([this.draft], this.sheet.start, this.today).length : 0
      return past ? `저장하면 지난 회차 ${past}건이 바로 기록돼요. ${nextPart}` : nextPart
    }
  },
  created() { this.load() },
  methods: {
    won, label, scheduleText,
    async load() {
      this.error = ''
      try {
        const [c, m, needs] = await Promise.all([listCategories({ includeHidden: true }), listPaymentMethods(), listNeedsAmount()])
        this.categories = c; this.methods = m; this.needs = needs
        const [items, done] = await Promise.all([listRecurringItems(), listFixedTransactions(this.month01, this.month01)])
        this.items = items; this.doneTxs = done
        this.setupMissing = false
      } catch (e) {
        if (isMissingSetup(e)) this.setupMissing = true
        else this.fail(e, '불러오지 못했어요.')
      } finally { this.loaded = true }
    },
    fail(e, msg) { this.error = msg; console.error(e) },
    catOf(it) { return this.categories.find((c) => c.id === it.category_id) },
    /** 지금 쓰는(숨기지 않은) 분류. 없으면 목록에 '분류를 골라 주세요' */
    activeCatOf(it) { const c = this.catOf(it); return c && c.is_active ? c : null },
    dayBadge(it) { return it.day_of_month >= 31 ? '말일' : it.day_of_month + '일' },
    nextText(it) {
      const n = nextDate(it, this.today)
      return n ? ` · 다음 ${label(n).replace(/\s\(.\)$/, '')}` : ''
    },
    setKind(k) { this.sheet.kind = k; this.sheet.category_id = null },
    openNew() {
      // 분류는 미리 고르지 않는다: 통신비·구독·보험처럼 사용자가 직접 정함
      //  (고정 항목인지는 분류가 아니라 기록의 source='recurring' 으로 구분)
      this.sheet = emptySheet()
      this.sheetError = ''; this.confirmDelete = false
    },
    openEdit(it) {
      this.sheet = {
        open: true, id: it.id, kind: it.kind, name: it.name, fixed: it.is_amount_fixed,
        amountText: it.amount ? String(it.amount) : '', day: it.day_of_month, rule: it.weekend_rule,
        // 숨긴 분류(예: 예전 '고정지출')면 비워서 다시 고르게
        category_id: this.activeCatOf(it)?.id || null, payment_method_id: it.payment_method_id, start: it.start_date
      }
      this.sheetError = ''; this.confirmDelete = false
    },
    async saveSheet() {
      if (!this.canSave || this.busy) return
      this.busy = true; this.sheetError = ''
      const row = {
        name: this.sheet.name.trim(),
        is_amount_fixed: this.sheet.fixed,
        amount: this.sheet.fixed ? this.sheetAmount : null,
        day_of_month: this.sheet.day,
        weekend_rule: this.sheet.rule,
        category_id: this.sheet.category_id,
        payment_method_id: this.sheet.payment_method_id,
        start_date: this.sheet.start
      }
      try {
        if (this.sheet.id) await updateRecurringItem(this.sheet.id, row)
        else await addRecurringItem({ ...row, kind: this.sheet.kind })
        this.sheet.open = false
        await this.afterChange()
      } catch (e) {
        // '그날 그대로'인데 DB 에 0005 를 아직 안 돌린 경우 (check 제약 위반)
        this.sheetError = e?.code === '23514' && this.sheet.rule === 'same'
          ? "'그날 그대로'를 쓰려면 Supabase 에서 0005_weekend_same.sql 을 한 번 실행해 주세요."
          : '저장하지 못했어요. 다시 해 주세요.'
        console.error(e)
      } finally { this.busy = false }
    },
    /** 바뀐 내용으로 날짜가 된 회차를 바로 기록하고 다시 불러온다 */
    async afterChange() {
      await runRecurring({ force: true })
      await this.load()
    },
    async stop() {
      this.busy = true; this.sheetError = ''
      try {
        await updateRecurringItem(this.sheet.id, { is_active: false, end_date: this.today < this.sheet.start ? this.sheet.start : this.today })
        this.sheet.open = false
        await this.load()
      } catch (e) { this.sheetError = '그만하지 못했어요.'; console.error(e) } finally { this.busy = false }
    },
    /** 다시 시작: 쉬는 동안의 회차는 만들지 않고 오늘부터 이어간다 */
    async restart(it) {
      this.busy = true; this.error = ''
      try {
        await updateRecurringItem(it.id, { is_active: true, end_date: null, generated_until: addDays(this.today, -1) })
        await this.afterChange()
      } catch (e) { this.fail(e, '다시 시작하지 못했어요.') } finally { this.busy = false }
    },
    async remove() {
      this.busy = true; this.sheetError = ''
      try {
        await deleteRecurringItem(this.sheet.id)
        this.sheet.open = false
        await this.load()
      } catch (e) { this.sheetError = '삭제하지 못했어요.'; console.error(e) } finally { this.busy = false }
    },
    async onSort(kind, from, to) {
      this.error = ''
      const next = reorder(this.activeItems.filter((x) => x.kind === kind), from, to)
      this.items = [...this.items].sort((a, b) => a.kind.localeCompare(b.kind) || a.sort_order - b.sort_order)
      try { await saveMoved('recurring_items', next, from, to) } catch (e) { this.fail(e, '순서를 바꾸지 못했어요.'); this.load() }
    }
  }
}
</script>

<style scoped src="./manage.css"></style>
<style scoped>
.tile { width: 36px; height: 36px; flex-shrink: 0; border-radius: var(--radius); font-size: 11px; font-weight: 700; color: #4A3F3A; display: flex; align-items: center; justify-content: center; }
.amt { font-weight: 600; margin-left: 4px; }
.amt.exp { color: var(--expense); }
/* 고정 항목 목록: 줄이 2~3줄이라 위아래·줄 사이를 넉넉하게 (이 화면만) */
.rec-row { padding-top: 12px; padding-bottom: 12px; }
.rec-row :deep(.label) { gap: 3px; }
.vary { margin-left: 6px; font-size: 12px; font-weight: 600; color: #8E3F33; background: #FFE6DA; border-radius: 6px; padding: 1px 6px; }
.group-title { margin: 6px 0 -4px 4px; font-size: 13px; font-weight: 600; color: var(--text-sub); }
.empty { padding: 4px 4px 0 4px; }
.notice code { font-size: 11px; word-break: break-all; }

.month { padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.month-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; }
.link { color: var(--accent); font-size: 13px; font-weight: 600; text-decoration: none; }
.big { font-size: 20px; letter-spacing: -0.4px; }
.unknown { font-size: 12px; font-weight: 600; color: #8E3F33; }
.cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding-top: 2px; }
.cols > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.col-inc { padding-left: 12px; border-left: 1px solid var(--line-soft); }
.cols .sub { font-size: 11px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.needs { padding: 14px 16px 4px 16px; border: 1.5px solid #F2C2B0; }
.needs h2 { margin: 0; font-size: 15px; }
.needs .count { color: #A9533F; }
.needs p { margin: 2px 0 4px 0; }
.need-row + .need-row { border-top: 1px solid var(--line-soft); }
.need-row :deep(.amt) { color: #A9533F; font-size: 14px; }

.two { display: grid; grid-template-columns: 2fr 3fr; gap: 10px; align-items: end; }
.seg3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.col { display: flex; flex-direction: column; gap: 6px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { height: 36px; padding: 0 12px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); font-size: 13px; }
.chip.on { border: 1.5px solid #C96A55; background: #FFE6DA; color: #8E3F33; font-weight: 600; }
.hint { margin: 0; line-height: 18px; }
.preview { margin: 0; font-size: 13px; font-weight: 600; color: var(--accent); min-height: 18px; }
.danger-row { display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap; }
.confirm { display: inline-flex; align-items: center; gap: 8px; color: var(--expense); }
select.box { appearance: auto; }
.no-cat { font-size: 12px; font-weight: 600; color: #A9533F; }
.need-mark { margin-left: 4px; font-size: 12px; font-weight: 600; color: #A9533F; }
</style>
