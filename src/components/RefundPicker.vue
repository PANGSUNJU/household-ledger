<template>
  <section class="refund" aria-label="환불할 구매 찾기">
    <strong class="title">어떤 구매를 환불받았나요?</strong>

    <template v-if="!manual">
      <div class="search-row">
        <label class="search">
          <AppIcon name="search" :size="18" />
          <span class="sr-only">구매 검색</span>
          <input v-model="query" type="search" placeholder="가게·금액으로 찾기">
        </label>
        <label class="receipt" :class="{ busy: reading }">
          <AppIcon name="image" :size="18" />{{ reading ? readingText : '영수증으로 찾기' }}
          <input type="file" accept="image/*" class="sr-only" :disabled="reading" @change="onReceipt">
        </label>
      </div>

      <p v-if="receiptMsg" class="msg" role="status">{{ receiptMsg }}</p>
      <p v-if="loading" class="msg">최근 지출을 불러오는 중…</p>
      <p v-else-if="error" class="msg error">{{ error }}</p>
      <p v-else-if="!filtered.length && !original" class="msg">
        {{ query ? '찾는 구매가 없어요.' : '최근 90일 동안 지출 기록이 없어요.' }}
      </p>

      <div v-else class="list" role="radiogroup" aria-label="최근 지출">
        <button
          v-for="t in shown" :key="t.id" type="button" role="radio"
          class="item" :class="{ on: original && original.id === t.id }" :aria-checked="!!original && original.id === t.id"
          @click="$emit('update:original', original && original.id === t.id ? null : t)"
        >
          <span class="radio" aria-hidden="true" />
          <span class="main">
            <span class="name">{{ t.store_name || t.category?.name || '지출' }}</span>
            <span class="sub">{{ shortDate(t.date) }} · {{ t.category?.name || '미분류' }}{{ t.payment_method ? ' · ' + t.payment_method.name : '' }}</span>
          </span>
          <span class="amt">-{{ won(t.amount) }}</span>
        </button>
        <button v-if="filtered.length > shown.length" type="button" class="more" @click="limit += 10">더 보기 ({{ filtered.length - shown.length }}건)</button>
      </div>

      <div v-if="original" class="calc" aria-live="polite">
        <div><span>원래 금액</span><strong>{{ won(original.amount) }}</strong></div>
        <div><span>돌려받은 돈</span><strong class="amount-income">{{ refundAmount ? won(refundAmount) : '–' }}</strong></div>
        <div><span>수수료</span><strong :class="fee > 0 ? 'amount-expense' : ''">{{ fee === null ? '–' : won(fee) }}</strong></div>
      </div>
      <p v-if="original && overRefund" class="note warn">돌려받은 돈이 원래 금액보다 많아요. 금액을 확인해 주세요.</p>
      <p v-else-if="original && refundAmount" class="note">
        {{ original.category?.name || '미분류' }}에서 {{ won(refundAmount) }}원을 빼고,
        {{ fee > 0 ? `수수료 ${won(fee)}원만 쓴 돈으로 남아요.` : '쓴 돈이 남지 않아요.' }}
      </p>

      <button type="button" class="switch" @click="goManual">원래 구매를 찾지 못했어요</button>
    </template>

    <!-- 원래 구매가 기록에 없을 때: 빼는 지출 분류를 직접 고른다 -->
    <template v-else>
      <p class="note">원래 구매가 기록에 없으면, 어느 지출에서 뺄지 골라 주세요.</p>
      <CategoryGrid
        :categories="expenseCategories" :model-value="manualCategoryId" label="빼는 지출 분류"
        @update:model-value="$emit('update:manualCategoryId', $event)"
      />
      <button type="button" class="switch" @click="manual = false; $emit('update:manualCategoryId', null)">최근 구매에서 찾기</button>
    </template>
  </section>
</template>

<script>
import AppIcon from './AppIcon.vue'
import CategoryGrid from './CategoryGrid.vue'
import { recentExpenses } from '@/lib/api'
import { addDays, todayKST, parse } from '@/lib/date'
import { won } from '@/lib/money'

export default {
  name: 'RefundPicker',
  components: { AppIcon, CategoryGrid },
  props: {
    original: { type: Object, default: null },
    manualCategoryId: { type: String, default: null },
    startManual: { type: Boolean, default: false },
    refundAmount: { type: Number, default: null },
    expenseCategories: { type: Array, required: true },
    /** 처음 검색어 (캡처·영수증에서 넘어올 때 가게 이름) */
    initialQuery: { type: String, default: '' }
  },
  emits: ['update:original', 'update:manualCategoryId', 'read-receipt'],
  data() {
    return {
      manual: this.startManual, query: this.initialQuery, items: [], loading: false, error: '', limit: 5,
      reading: false, readingText: '', receiptMsg: ''
    }
  },
  computed: {
    filtered() {
      // 빈칸은 빼고 비교 ('이마트 경산점' 으로 찾아도 '이마트경산점' 이 나오게)
      const flat = (v) => (v || '').replace(/[,\s원]/g, '').toLowerCase()
      const q = flat(this.query)
      if (!q) return this.items
      return this.items.filter((t) =>
        flat(t.store_name).includes(q) ||
        flat(t.category?.name).includes(q) ||
        String(t.amount).includes(q))
    },
    shown() {
      const list = this.filtered.slice(0, this.limit)
      // 고른 구매는 목록 밖에 있어도 보이게
      if (this.original && !list.some((t) => t.id === this.original.id)) list.unshift(this.original)
      return list
    },
    fee() {
      if (!this.original || !this.refundAmount) return null
      return Math.max(this.original.amount - this.refundAmount, 0)
    },
    overRefund() {
      return !!(this.original && this.refundAmount && this.refundAmount > this.original.amount)
    }
  },
  watch: {
    query() { this.limit = 5 }
  },
  created() { this.load() },
  methods: {
    won,
    async load() {
      this.loading = true; this.error = ''
      try {
        this.items = await recentExpenses(addDays(todayKST(), -90))
      } catch (e) {
        this.error = '최근 지출을 불러오지 못했어요.'
        console.error(e)
      } finally {
        this.loading = false
      }
    },
    /**
     * 취소·환불 영수증 사진으로 원래 구매 찾기 (SPEC 10-B)
     * 날짜·금액·가게를 읽어 같은 금액의 최근 지출을 찾는다. 하나뿐이면 바로 고른다.
     */
    async onReceipt(e) {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      this.reading = true; this.readingText = '읽는 중…'; this.receiptMsg = ''
      try {
        const [{ readImage }, { parseReceipt }] = await Promise.all([import('@/lib/ocr'), import('@/lib/ocr-parse')])
        const text = await readImage(file, ({ stage, pct }) => { this.readingText = stage === 'read' ? `읽는 중 ${pct}%` : '준비 중…' })
        const r = parseReceipt(text, todayKST())
        this.$emit('read-receipt', r)
        if (!r.amount) { this.receiptMsg = '금액을 읽지 못했어요. 가게·금액으로 찾아 주세요.'; return }
        const same = this.items.filter((t) => t.amount === r.amount)
        const norm = (s) => (s || '').replace(/\s|\(주\)|㈜/g, '')
        const best = same.filter((t) => r.store && (norm(t.store_name).includes(norm(r.store)) || norm(r.store).includes(norm(t.store_name))))
        const pick = best.length === 1 ? best[0] : same.length === 1 ? same[0] : null
        if (pick) {
          this.$emit('update:original', pick)
          this.receiptMsg = `영수증(${r.store || '가게 모름'} ${won(r.amount)}원)과 같은 구매를 찾았어요.`
        } else {
          this.query = String(r.amount)
          this.receiptMsg = same.length ? `${won(r.amount)}원 구매가 여러 개예요. 골라 주세요.` : `${won(r.amount)}원 구매를 찾지 못했어요.`
        }
      } catch (err) {
        this.receiptMsg = '영수증을 읽지 못했어요. 가게·금액으로 찾아 주세요.'
        console.error(err)
      } finally { this.reading = false }
    },
    goManual() {
      this.manual = true
      this.$emit('update:original', null)
    },
    shortDate(d) {
      const { m, d: day } = parse(d)
      return `${m}월 ${day}일`
    }
  }
}
</script>

<style scoped>
.refund { background: #F2F7FD; border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.title { font-size: 15px; }
.search-row { display: flex; gap: 8px; }
.search {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 10px;
  background: var(--surface); border: 1px solid #D3E0F0; border-radius: var(--radius); color: var(--text-sub);
}
.search input { flex: 1; min-width: 0; border: 0; outline: none; font-size: 14px; background: transparent; color: var(--text); }
.receipt {
  height: 44px; padding: 0 10px; border: 0; border-radius: var(--radius); background: var(--capture-bg); color: var(--capture-fg);
  font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 4px; white-space: nowrap;
}
.receipt:disabled { opacity: 0.55; cursor: not-allowed; }
.msg { margin: 0; font-size: 13px; color: var(--text-sub); }
.list { background: var(--surface); border-radius: var(--radius); display: flex; flex-direction: column; overflow: hidden; }
.item {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 0; background: transparent; text-align: left;
}
.item + .item { border-top: 1px solid var(--line-soft); }
.item.on { background: #EEF5FD; box-shadow: inset 0 0 0 1.5px #5B84C4; }
.radio { width: 20px; height: 20px; flex-shrink: 0; border-radius: 10px; border: 2px solid #B8A69C; }
.item.on .radio { border: 6px solid var(--income); }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.name { font-size: 14px; font-weight: 600; }
.sub { font-size: 12px; color: var(--text-sub); }
.amt { font-size: 14px; font-weight: 600; }
.more { height: 40px; border: 0; border-top: 1px solid var(--line-soft); background: transparent; color: var(--accent); font-size: 13px; }
.calc { background: var(--surface); border-radius: var(--radius); padding: 10px 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); text-align: center; gap: 4px; }
.calc div { display: flex; flex-direction: column; }
.calc span { font-size: 12px; color: var(--text-sub); }
.calc strong { font-size: 15px; }
.note { margin: 0; font-size: 12px; line-height: 18px; color: #5A4E48; }
.note.warn { color: var(--expense); }
.switch { align-self: flex-start; border: 0; background: transparent; color: var(--accent); font-size: 13px; padding: 6px 0; }
</style>
