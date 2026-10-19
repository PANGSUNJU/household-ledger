<template>
  <main class="entry">
    <!-- 위 줄은 화면을 내려도 붙어 있게 (캡처로 입력 버튼을 언제든 누를 수 있게). 지출·수입 모두 -->
    <ScreenHeader :title="isEdit ? '기록 수정' : '기록 추가'" back="close" fallback="/" class="pinned-head">
      <router-link v-if="!isEdit" to="/capture" class="capture">
        <AppIcon name="image" :size="16" />캡처로 입력
      </router-link>
    </ScreenHeader>

    <p v-if="loading" class="loading muted">불러오는 중…</p>
    <p v-else-if="loadError" class="loading error" role="alert">{{ loadError }}</p>

    <form v-else class="body" @submit.prevent="save">
      <p v-if="fromRecurring" class="from-rec" :class="{ need: needsAmount }" role="note">
        {{ needsAmount ? `고정 지출 '${store}'의 이번 금액을 넣어 주세요. 넣으면 통계에 들어가요.` : '고정 항목에서 자동으로 들어온 기록이에요. 여기서 고쳐도 다음 달 기록에는 영향이 없어요.' }}
      </p>
      <!-- 지출 / 수입 -->
      <div class="kind" role="radiogroup" aria-label="기록 종류">
        <button type="button" role="radio" :aria-checked="kind === 'expense'" :class="{ on: kind === 'expense', expense: true }" @click="setKind('expense')">지출</button>
        <button type="button" role="radio" :aria-checked="kind === 'income'" :class="{ on: kind === 'income', income: true }" @click="setKind('income')">수입</button>
      </div>

      <!-- 금액 + 계산기 -->
      <div class="field">
        <label for="amount" class="lbl">{{ isRefund ? '돌려받은 금액' : '금액' }}</label>
        <div class="amount-row" :class="{ invalid: amountText && amount === null }">
          <input
            id="amount" ref="amount" v-model="amountText" v-comma type="text" inputmode="decimal"
            autocomplete="off" placeholder="0" aria-describedby="amount-help"
          >
          <span v-if="showResult" class="result">= {{ won(amount) }}원</span>
          <span v-else class="unit">원</span>
        </div>
        <div class="ops" aria-label="계산 기호 넣기">
          <button v-for="op in OPS" :key="op.v" type="button" :aria-label="op.label" @click="insertOp(op.v)">{{ op.t }}</button>
          <button type="button" aria-label="금액 지우기" @click="amountText = ''; $refs.amount.focus()">C</button>
        </div>
        <span v-if="amountText && amount === null" id="amount-help" class="help">{{ tooBig(amountText) ? '금액이 너무 커요 (10억 원까지)' : '계산할 수 없는 식이에요' }}</span>
      </div>

      <!-- 빠른 입력 (지출, 새 기록일 때) -->
      <div v-if="kind === 'expense' && !isEdit && quickEntries.length" class="field">
        <span class="lbl">빠른 입력</span>
        <div class="quick">
          <button
            v-for="(q, i) in quickEntries" :key="q.id" type="button" class="q"
            :style="{ background: QUICK_BG[i % QUICK_BG.length] }" @click="applyQuick(q)"
          >{{ q.name }} {{ won(q.amount) }}</button>
        </div>
      </div>

      <!-- 날짜 · 사용처(지출) / 입금처(수입) -->
      <div class="two">
        <div class="field">
          <label for="date" class="lbl">날짜</label>
          <input id="date" v-model="date" type="date" required class="box">
        </div>
        <div class="field">
          <label for="store" class="lbl">{{ kind === 'income' && !isRefund ? '입금처' : '사용처' }}</label>
          <input
            id="store" v-model="store" type="text" maxlength="50" class="box"
            :placeholder="kind === 'income' && !isRefund ? '예: 회사, 중고거래' : '예: 다이소'" @change="onStoreChange"
          >
        </div>
      </div>

      <!-- 분류 -->
      <div class="field">
        <span class="lbl">분류</span>
        <CategoryGrid
          v-model="categoryId" :categories="kind === 'expense' ? expenseCategories : incomeCategories"
          @update:model-value="touched.category = true"
        >
          <button v-if="!isRefund" type="button" class="cat-add" @click="addingCat = true">+ 분류 추가</button>
        </CategoryGrid>
        <CategoryAddSheet
          :open="addingCat" :kind="kind" :existing="kind === 'expense' ? expenseCategories : incomeCategories"
          @close="addingCat = false" @added="onCatAdded" @picked="onCatPicked"
        />
      </div>

      <!-- 환불: 원래 구매 찾기 -->
      <RefundPicker
        v-if="isRefund"
        v-model:original="refundOf" v-model:manual-category-id="refundCategoryId"
        :start-manual="startManualRefund" :refund-amount="amount" :expense-categories="expenseCategories"
        :initial-query="refundQuery"
        @update:original="onPickOriginal" @read-receipt="onRefundReceipt"
      />

      <!-- 결제수단 -->
      <div class="field">
        <span class="lbl">{{ kind === 'income' ? '받은 통장' : '결제수단' }}
          <span v-if="paymentHint" class="sub">· {{ paymentHint }}</span>
        </span>
        <PaymentPicker
          v-model="paymentMethodId" :methods="paymentMethods"
          @update:model-value="touched.payment = true" @added="paymentMethods.push($event)"
        />
      </div>

      <!-- 메모 -->
      <div class="field">
        <label for="memo" class="lbl">메모 <span class="sub">(선택)</span></label>
        <input id="memo" v-model="memo" type="text" maxlength="200" class="box" placeholder="예: 친구 3명이랑 나눠 냄">
      </div>

      <!-- 수정일 때: 삭제 -->
      <div v-if="isEdit" class="danger">
        <button v-if="!confirmDelete" type="button" class="del" @click="confirmDelete = true">이 기록 삭제</button>
        <div v-else class="confirm" role="alert">
          <span>정말 삭제할까요? 되돌릴 수 없어요.</span>
          <button type="button" class="ghost" @click="confirmDelete = false">취소</button>
          <button type="button" class="del-now" :disabled="saving" @click="remove">삭제</button>
        </div>
      </div>

      <div class="bottom">
        <p v-if="saveError" class="error" role="alert">{{ saveError }}</p>
        <!-- 저장하면서 자주 쓰는 내역에도 (지출 새 기록일 때, 매번 꺼진 채로 시작) -->
        <label v-if="canAddQuick" class="also-quick">
          <input v-model="alsoQuick" type="checkbox">
          <span>자주 쓰는 내역에도 추가</span>
        </label>
        <button type="submit" class="btn-primary" :disabled="!canSave || saving">{{ saveLabel }}</button>
      </div>
    </form>
  </main>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import ScreenHeader from '@/components/ScreenHeader.vue'
import CategoryGrid from '@/components/CategoryGrid.vue'
import CategoryAddSheet from '@/components/CategoryAddSheet.vue'
import PaymentPicker from '@/components/PaymentPicker.vue'
import RefundPicker from '@/components/RefundPicker.vue'
import {
  listCategories, listPaymentMethods, listQuickEntries, addQuickEntry, getTransaction,
  lastExpenseAtStore, lastPaymentMethodId, saveTransaction, deleteTransaction
} from '@/lib/api'
import { todayKST } from '@/lib/date'
import { calcAmount, hasOperator, won, tooBig } from '@/lib/money'

export default {
  name: 'EntryView',
  components: { AppIcon, ScreenHeader, CategoryGrid, CategoryAddSheet, PaymentPicker, RefundPicker },
  props: { id: { type: String, default: null } },
  data() {
    const qDate = this.$route.query.date
    return {
      OPS: [
        { v: '+', t: '+', label: '더하기' }, { v: '-', t: '−', label: '빼기' },
        { v: '*', t: '×', label: '곱하기' }, { v: '/', t: '÷', label: '나누기' }
      ],
      QUICK_BG: ['#FFF1C7', '#FFE6DA', '#DFECFB', '#DCF1E6', '#E9E3FA'],
      loading: true, loadError: '', saving: false, saveError: '', confirmDelete: false,
      categories: [], paymentMethods: [], quickEntries: [], addingCat: false,
      alsoQuick: false,
      // 입력값
      kind: 'expense',
      amountText: '',
      date: /^\d{4}-\d{2}-\d{2}$/.test(qDate || '') ? qDate : todayKST(),
      store: '', categoryId: null, paymentMethodId: null, memo: '',
      refundOf: null, pickedOriginal: null, refundCategoryId: null, startManualRefund: false,
      // 사용자가 직접 고른 값은 가게별 기본값으로 덮어쓰지 않는다
      touched: { category: false, payment: false },
      paymentHint: '',
      fromRecurring: false, needsAmount: false, refundQuery: ''
    }
  },
  computed: {
    canAddQuick() { return this.kind === 'expense' && !this.isEdit && !this.fromRecurring },
    isEdit() { return !!this.id },
    expenseCategories() { return this.categories.filter((c) => c.kind === 'expense') },
    incomeCategories() { return this.categories.filter((c) => c.kind === 'income') },
    refundCategory() { return this.incomeCategories.find((c) => c.is_refund) },
    isRefund() { return this.kind === 'income' && !!this.categoryId && this.categoryId === this.refundCategory?.id },
    amount() { return calcAmount(this.amountText) },
    showResult() { return hasOperator(this.amountText) && this.amount !== null },
    canSave() {
      if (!this.amount || this.amount <= 0 || !this.date) return false
      if (this.isRefund && !this.refundOf && !this.refundCategoryId) return false
      return true
    },
    saveLabel() {
      if (this.saving) return '저장하는 중…'
      if (!this.amount || this.amount <= 0) return this.isRefund ? '환불 금액을 넣어 주세요' : '금액을 넣어 주세요'
      if (this.isRefund && !this.refundOf && !this.refundCategoryId) return '환불받은 구매를 골라 주세요'
      return `${this.isRefund ? '환불 ' : ''}${won(this.amount)}원 ${this.isEdit ? '수정' : '저장'}`
    }
  },
  created() { this.load() },
  methods: {
    /** 입력 화면에서 분류를 새로 만들었으면 목록에 넣고 바로 고른다 */
    onCatAdded(c) {
      this.categories.push(c)
      this.onCatPicked(c)
    },
    onCatPicked(c) {
      this.categoryId = c.id; this.touched.category = true
      this.addingCat = false
    },
    won, tooBig,
    async load() {
      this.loading = true; this.loadError = ''
      try {
        const [cats, methods, quick] = await Promise.all([
          listCategories(), listPaymentMethods(), this.isEdit ? Promise.resolve([]) : listQuickEntries()
        ])
        this.categories = cats; this.paymentMethods = methods; this.quickEntries = quick

        if (this.isEdit) {
          await this.fill(await getTransaction(this.id))
        } else if (this.$route.query.refund) {
          await this.fillRefund(this.$route.query)
        } else {
          const last = await lastPaymentMethodId()
          if (last && methods.some((m) => m.id === last)) {
            this.paymentMethodId = last
            this.paymentHint = '마지막으로 쓴 수단'
          }
        }
      } catch (e) {
        this.loadError = this.isEdit ? '기록을 불러오지 못했어요.' : '화면을 준비하지 못했어요. 다시 열어 주세요.'
        console.error(e)
      } finally {
        this.loading = false
        if (!this.isEdit || this.needsAmount) this.$nextTick(() => this.$refs.amount?.focus())
      }
    },
    async fill(t) {
      this.fromRecurring = t.source === 'recurring'
      this.needsAmount = t.status === 'needs_amount'
      this.kind = t.kind
      this.amountText = String(t.amount ?? '')
      this.date = t.date
      this.store = t.store_name || ''
      this.categoryId = t.category_id
      this.paymentMethodId = t.payment_method_id
      this.memo = t.memo || ''
      this.touched = { category: true, payment: true }
      // 숨긴 분류·결제수단이 걸린 기록도 그대로 보이게
      if (t.category && !this.categories.some((c) => c.id === t.category.id)) this.categories.push({ ...t.category, kind: t.kind })
      if (t.payment_method && !this.paymentMethods.some((m) => m.id === t.payment_method.id)) this.paymentMethods.push(t.payment_method)
      if (t.refund_of_id) {
        try { this.refundOf = await getTransaction(t.refund_of_id) } catch { this.refundOf = null }
        this.pickedOriginal = this.refundOf   // 수정: 지금 연결된 구매를 '앞서 고른 구매'로
      } else if (t.refund_category_id) {
        this.refundCategoryId = t.refund_category_id
        this.startManualRefund = true
      }
    },
    /** 캡처·영수증에서 '환불로 기록'을 눌러 왔을 때: 환불로 미리 채운다 */
    async fillRefund(q) {
      this.kind = 'income'
      this.categoryId = this.refundCategory?.id || null
      this.touched.category = true
      if (/^\d+$/.test(q.amount || '')) this.amountText = q.amount
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.date || '')) this.date = q.date
      this.store = (q.store || '').slice(0, 50)
      this.refundQuery = this.store
      if (q.refund_of) {
        try {
          this.refundOf = await getTransaction(q.refund_of)
          this.pickedOriginal = this.refundOf
          if (this.refundOf.payment_method_id) this.paymentMethodId = this.refundOf.payment_method_id
        } catch { this.refundOf = null }
      }
    },
    /** 환불 화면에서 영수증을 읽었으면 비어 있는 칸을 채운다 */
    onRefundReceipt(r) {
      if (!this.amountText && r.amount) this.amountText = String(r.amount)
      if (!this.store && r.store) this.store = r.store
      if (r.date && r.canceled) this.date = r.date
    },
    setKind(k) {
      if (this.kind === k) return
      this.kind = k
      this.categoryId = null
      this.touched.category = false
      this.refundOf = null
      this.refundCategoryId = null
    },
    insertOp(op) {
      const el = this.$refs.amount
      const v = this.amountText
      // 이미 기호로 끝나면 바꿔치기
      this.amountText = /[+\-*/]$/.test(v) ? v.slice(0, -1) + op : v + op
      this.$nextTick(() => { el.focus(); el.setSelectionRange(this.amountText.length, this.amountText.length) })
    },
    /** 저장한 사용처·금액·분류·결제수단을 자주 쓰는 내역에도 (이름은 사용처, 없으면 분류 이름). 실패해도 기록 저장은 된 것 */
    async addToQuick() {
      const cat = this.categories.find((c) => c.id === this.categoryId)
      const name = (this.store.trim() || cat?.name || '지출').slice(0, 30)
      if (this.quickEntries.some((q) => q.name === name && q.amount === this.amount)) return
      try {
        await addQuickEntry({ name, amount: this.amount, category_id: this.categoryId, payment_method_id: this.paymentMethodId })
      } catch (e) { console.warn('자주 쓰는 내역 추가 실패', e) }
    },
    applyQuick(q) {
      this.kind = 'expense'
      this.amountText = String(q.amount)
      this.store = q.name
      // 숨긴 분류(예: 예전 '고정지출')는 고르지 않는다
      if (q.category_id && this.categories.some((c) => c.id === q.category_id)) { this.categoryId = q.category_id; this.touched.category = true }
      if (q.payment_method_id) { this.paymentMethodId = q.payment_method_id; this.touched.payment = true; this.paymentHint = '' }
    },
    /** 가게별 기본값: 같은 가게에서 마지막으로 쓴 분류·결제수단을 미리 골라둔다 (SPEC 5-1) */
    async onStoreChange() {
      if (this.kind !== 'expense' || this.isEdit) return
      try {
        const last = await lastExpenseAtStore(this.store)
        if (!last) return
        if (!this.touched.category && last.category_id && this.categories.some((c) => c.id === last.category_id)) {
          this.categoryId = last.category_id
        }
        if (!this.touched.payment && last.payment_method_id && this.paymentMethods.some((m) => m.id === last.payment_method_id)) {
          this.paymentMethodId = last.payment_method_id
          this.paymentHint = '이 사용처에서 마지막으로 쓴 수단'
        }
      } catch (e) {
        console.warn('가게별 기본값을 불러오지 못했어요', e)
      }
    },
    /**
     * 환불할 구매를 고르면 사용처·결제수단을 원래 구매에서 가져온다
     *  · 비어 있거나, 앞서 고른 구매에서 가져온 값 그대로면(직접 고치지 않았으면) 새 구매 값으로 바꾼다
     *    → 수정 화면에서 다른 구매로 바꿔도 사용처가 예전 이름으로 남지 않는다
     */
    onPickOriginal(t) {
      if (!t) return
      const prev = this.pickedOriginal
      if (!this.store || (prev && this.store === (prev.store_name || ''))) this.store = t.store_name || ''
      if (t.payment_method_id && (!this.touched.payment || (prev && this.paymentMethodId === prev.payment_method_id))) {
        this.paymentMethodId = t.payment_method_id
      }
      this.pickedOriginal = t
      this.refundCategoryId = null
    },
    async save() {
      if (!this.canSave || this.saving) return
      this.saving = true; this.saveError = ''
      try {
        await saveTransaction({
          id: this.id || undefined,
          kind: this.kind,
          date: this.date,
          amount: this.amount,
          store_name: this.store.trim(),
          category_id: this.categoryId,
          payment_method_id: this.paymentMethodId,
          memo: this.memo.trim(),
          refund_of_id: this.isRefund ? this.refundOf?.id : null,
          refund_category_id: this.isRefund && !this.refundOf ? this.refundCategoryId : null
        })
        if (this.alsoQuick && this.canAddQuick) await this.addToQuick()
        this.$router.replace({ name: 'calendar', query: { date: this.date } })
      } catch (e) {
        // 입력한 내용은 그대로 두고 안내만 (SPEC 10-D)
        this.saveError = navigator.onLine
          ? '저장하지 못했어요. 입력한 내용은 그대로 있어요. 다시 눌러 주세요.'
          : '인터넷 연결이 끊겼어요. 연결되면 다시 눌러 주세요.'
        console.error(e)
      } finally {
        this.saving = false
      }
    },
    async remove() {
      this.saving = true; this.saveError = ''
      try {
        await deleteTransaction(this.id)
        this.$router.replace({ name: 'calendar', query: { date: this.date } })
      } catch (e) {
        this.saveError = '삭제하지 못했어요. 다시 해 주세요.'
        console.error(e)
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style scoped>
.entry { min-height: 100dvh; background: var(--surface); }
.loading { padding: 24px 16px; margin: 0; }
.error { color: var(--expense); }
.pinned-head { position: sticky; top: 0; z-index: 5; background: var(--surface); }
.capture {
  height: 36px; padding: 0 12px; border-radius: var(--radius); background: var(--capture-bg); color: var(--capture-fg);
  font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; text-decoration: none;
}
.body { padding: 0 16px calc(146px + env(safe-area-inset-bottom)) 16px; display: flex; flex-direction: column; gap: 16px; }

.kind { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); background: var(--surface-sunken); border-radius: 12px; padding: 4px; }
.kind button { height: 40px; border: 0; border-radius: 9px; background: transparent; color: var(--text-sub); font-size: 15px; }
.kind button.on { background: var(--surface); font-weight: 700; box-shadow: 0 1px 3px rgba(120, 90, 70, 0.14); }
.kind .expense.on { color: var(--expense); }
.kind .income.on { color: var(--income); }

.field { display: flex; flex-direction: column; gap: 6px; }
.lbl { font-size: 13px; color: var(--text-sub); }
.sub { font-size: 12px; }
.help { font-size: 12px; color: var(--text-sub); }
.amount-row { display: flex; align-items: baseline; gap: 6px; border-bottom: 2px solid var(--text); padding-bottom: 4px; }
.amount-row.invalid { border-color: var(--expense); }
.amount-row input {
  flex: 1; min-width: 0; border: 0; outline: none; padding: 0; background: transparent;
  font-size: 30px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums;
}
.result { font-size: 16px; font-weight: 600; color: #2E6A4E; white-space: nowrap; }
.unit { font-size: 18px; font-weight: 600; }
.ops { display: flex; gap: 6px; justify-content: flex-end; }
.ops button { width: 44px; height: 34px; border: 0; border-radius: var(--radius-sm); background: var(--surface-sunken); font-size: 17px; color: var(--text); }

.quick { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.q { height: 36px; padding: 0 12px; border: 0; border-radius: 18px; font-size: 13px; white-space: nowrap; color: var(--text); flex-shrink: 0; }
.also-quick { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 28px; font-size: 14px; color: var(--text-sub); }
.also-quick input { width: 20px; height: 20px; accent-color: #C96A55; }

.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.box {
  height: 44px; width: 100%; border: 1px solid var(--border); border-radius: var(--radius);
  padding: 0 12px; font-size: 15px; background: var(--surface);
}
.cat-add {
  background: transparent; font-family: inherit;
  height: 42px; border: 1px dashed #B8A69C; border-radius: var(--radius); color: var(--text-sub);
  font-size: 14px; display: flex; align-items: center; justify-content: center; text-decoration: none;
}

.danger { padding-top: 4px; }
.del { border: 0; background: transparent; color: var(--expense); font-size: 14px; padding: 8px 0; }
.confirm { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: var(--radius); background: #FFF1EA; font-size: 13px; }
.confirm span { flex: 1; }
.confirm button { height: 36px; padding: 0 12px; border: 0; border-radius: var(--radius-sm); font-size: 13px; }
.ghost { background: transparent; color: var(--text-sub); }
.del-now { background: var(--expense); color: #FFFFFF; font-weight: 700; }

.bottom {
  position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px;
  padding: 12px 16px calc(24px + env(safe-area-inset-bottom)) 16px; background: var(--surface); border-top: 1px solid var(--line-soft);
  display: flex; flex-direction: column; gap: 8px; z-index: 5;
}
.bottom .error { margin: 0; font-size: 13px; text-align: center; }
.from-rec { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--info-bg); color: var(--info-fg); font-size: 13px; line-height: 19px; }
.from-rec.need { background: #FFE6DA; color: #8E3F33; font-weight: 600; }
</style>
