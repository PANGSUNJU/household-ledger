<template>
  <router-link :to="'/entry/' + tx.id" class="tx">
    <CatTile :name="tx.category?.name || '미분류'" :color="tileColor" />
    <span class="main">
      <span class="name">{{ tx.store_name || tx.category?.name || (tx.kind === 'income' ? '수입' : '지출') }}</span>
      <!-- 분류는 화면 읽기 프로그램용으로만 (눈으로는 왼쪽 네모) -->
      <span class="sr-only">{{ tx.category?.name || '미분류' }}</span>
      <span v-if="subText" class="sub">{{ subText }}</span>
    </span>
    <!-- 오른쪽: 금액, 그 아래 작은 글씨로 결제수단 (체크·신용 구분용) -->
    <span class="right">
      <span class="amt" :class="{ 'amount-income': tx.kind === 'income', 'amount-expense': tx.kind === 'expense' && tx.amount != null }">{{ amountText }}</span>
      <span v-if="tx.payment_method" class="pm">{{ tx.payment_method.name }}</span>
    </span>
  </router-link>
</template>

<script>
import { signed } from '@/lib/money'
import CatTile from './CatTile.vue'

/* 기록 한 줄 (캘린더 그날 내역, 내역 목록에서 같이 씀) */
export default {
  name: 'TxRow',
  components: { CatTile },
  props: {
    tx: { type: Object, required: true },
    /** 환불 수수료 표시용: 원래 구매 금액 (없으면 생략) */
    originalAmount: { type: Number, default: null }
  },
  computed: {
    isRefund() { return this.tx.kind === 'income' && this.tx.category?.is_refund },
    tileColor() { return this.tx.category?.color || '#F3EFEA' },
    /** 회색 글씨: 메모 (최대 2줄). 환불이면 수수료를 앞에 */
    subText() {
      const parts = []
      if (this.isRefund && this.originalAmount != null && this.originalAmount > this.tx.amount) {
        parts.push(`수수료 ${(this.originalAmount - this.tx.amount).toLocaleString('ko-KR')}원`)
      }
      if (this.tx.memo) parts.push(this.tx.memo)
      return parts.join(' · ')
    },
    amountText() {
      return this.tx.status === 'needs_amount' ? '금액 입력 필요' : signed(this.tx.amount, this.tx.kind)
    }
  }
}
</script>

<style scoped>
.tx { display: flex; align-items: center; gap: 12px; padding: 9px 0; color: var(--text); text-decoration: none; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.name { font-size: 15px; font-weight: 500; }
.sub {
  font-size: 12px; line-height: 16px; color: var(--text-sub); white-space: pre-line; word-break: keep-all; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden;
}
.right { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; max-width: 42%; }
.amt { font-size: 15px; font-weight: 600; white-space: nowrap; }
.pm { font-size: 11px; line-height: 14px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
</style>
