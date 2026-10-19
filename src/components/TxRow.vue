<template>
  <router-link :to="'/entry/' + tx.id" class="tx">
    <CatTile :name="tx.category?.name || '기타'" :color="tileColor" />
    <span class="main">
      <span class="name">{{ tx.store_name || tx.category?.name || (tx.kind === 'income' ? '수입' : '지출') }}</span>
      <span class="sub">{{ subText }}</span>
    </span>
    <span class="amt" :class="{ 'amount-income': tx.kind === 'income', 'amount-expense': tx.kind === 'expense' && tx.amount != null }">{{ amountText }}</span>
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
    subText() {
      const parts = [this.tx.category?.name || '미분류']
      if (this.isRefund && this.originalAmount != null && this.originalAmount > this.tx.amount) {
        parts.push(`수수료 ${(this.originalAmount - this.tx.amount).toLocaleString('ko-KR')}원`)
      }
      parts.push(this.tx.payment_method?.name || '미지정')
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
.sub { font-size: 12px; color: var(--text-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.amt { font-size: 15px; font-weight: 600; white-space: nowrap; }
</style>
