<template>
  <main class="manage">
    <ScreenHeader title="자주 쓰는 내역" fallback="/settings">
      <button type="button" class="add-btn" @click="openNew">+ 추가</button>
    </ScreenHeader>

    <div class="body">
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="loaded && !items.length" class="intro">자주 쓰는 지출을 등록하면 입력할 때 한 번에 채워져요</p>

      <section v-if="items.length" v-sortable="onSort" class="card" aria-label="등록된 빠른 입력">
        <ManageRow v-for="q in items" :key="q.id" :name="q.name">
          <template #lead>
            <CatTile :name="catOf(q)?.name || '기타'" :color="catOf(q)?.color" />
          </template>
          <span>{{ q.name }} <strong class="amt">{{ won(q.amount) }}원</strong></span>
          <span class="muted small">{{ catOf(q)?.name || '미분류' }} · {{ pmOf(q)?.name || '미지정' }}</span>
          <span v-if="q.memo" class="memo">{{ q.memo }}</span>
          <template #trail>
            <button type="button" class="mini" @click="openEdit(q)">수정</button>
          </template>
        </ManageRow>
      </section>
    </div>

    <BottomSheet :open="sheet.open" :title="sheet.id ? '빠른 입력 수정' : '새 빠른 입력'" @close="sheet.open = false">
      <form class="sheet-form" @submit.prevent="saveSheet">
        <div class="two">
          <div class="col">
            <label for="q-name" class="lbl">이름 (사용처)</label>
            <input id="q-name" v-model="sheet.name" class="box" type="text" maxlength="30" placeholder="예: 회사 앞 커피" required>
          </div>
          <div class="col">
            <label for="q-amount" class="lbl">금액</label>
            <input id="q-amount" v-model="sheet.amountText" v-comma class="box" type="text" inputmode="decimal" placeholder="4,500" required>
          </div>
        </div>
        <span v-if="sheet.amountText && sheetAmount === null" class="error">금액을 확인해 주세요</span>
        <span class="lbl">분류</span>
        <CategoryGrid v-model="sheet.category_id" :categories="expenseCats" />
        <span class="lbl">결제수단</span>
        <div class="chips">
          <button
            v-for="m in methods" :key="m.id" type="button" class="chip" :class="{ on: sheet.payment_method_id === m.id }"
            :aria-pressed="sheet.payment_method_id === m.id"
            @click="sheet.payment_method_id = sheet.payment_method_id === m.id ? null : m.id"
          >{{ m.name }}</button>
        </div>
        <label for="q-memo" class="lbl">메모 <span class="sub">(선택)</span></label>
        <input id="q-memo" v-model="sheet.memo" class="box" type="text" maxlength="200" placeholder="예: 아이스 아메리카노">
        <p v-if="sheetError" class="error" role="alert">{{ sheetError }}</p>
        <button type="submit" class="btn-primary" :disabled="!canSave || busy">{{ sheet.id ? '저장' : '추가' }}</button>
        <button v-if="sheet.id" type="button" class="mini danger del" @click="remove">이 빠른 입력 삭제</button>
      </form>
    </BottomSheet>
  </main>
</template>

<script>
import ScreenHeader from '@/components/ScreenHeader.vue'
import ManageRow from '@/components/ManageRow.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import CategoryGrid from '@/components/CategoryGrid.vue'
import CatTile from '@/components/CatTile.vue'
import { listQuickEntries, listCategories, listPaymentMethods, addQuickEntry, updateQuickEntry, deleteQuickEntry, isMissingQuickMemo } from '@/lib/api'
import { reorder, saveMoved } from '@/lib/manage'
import { calcAmount, won } from '@/lib/money'

export default {
  name: 'QuickEntriesView',
  components: { ScreenHeader, ManageRow, BottomSheet, CategoryGrid, CatTile },
  data() {
    return {
      items: [], categories: [], methods: [], loaded: false, busy: false, error: '',
      sheet: { open: false, id: null, name: '', amountText: '', category_id: null, payment_method_id: null, memo: '' },
      sheetError: ''
    }
  },
  computed: {
    expenseCats() { return this.categories.filter((c) => c.kind === 'expense' && c.is_active) },
    sheetAmount() { return calcAmount(this.sheet.amountText) },
    canSave() { return this.sheet.name.trim() && this.sheetAmount > 0 }
  },
  created() { this.load() },
  methods: {
    won,
    async load() {
      try {
        const [q, c, m] = await Promise.all([listQuickEntries(), listCategories({ includeHidden: true }), listPaymentMethods()])
        this.items = q; this.categories = c; this.methods = m
      } catch (e) { this.fail(e, '불러오지 못했어요.') } finally { this.loaded = true }
    },
    fail(e, msg) { this.error = msg; console.error(e) },
    catOf(q) { return this.categories.find((c) => c.id === q.category_id) },
    pmOf(q) { return this.methods.find((m) => m.id === q.payment_method_id) },
    openNew() { this.sheet = { open: true, id: null, name: '', amountText: '', category_id: null, payment_method_id: null, memo: '' }; this.sheetError = '' },
    openEdit(q) {
      this.sheet = { open: true, id: q.id, name: q.name, amountText: String(q.amount), category_id: q.category_id, payment_method_id: q.payment_method_id, memo: q.memo || '', hasMemoCol: 'memo' in q }
      this.sheetError = ''
    },
    async saveSheet() {
      this.busy = true; this.error = ''; this.sheetError = ''
      const row = { name: this.sheet.name.trim(), amount: this.sheetAmount, category_id: this.sheet.category_id, payment_method_id: this.sheet.payment_method_id }
      const memo = this.sheet.memo.trim()
      // 메모 칸이 있는 DB면 비운 것도 저장, 없으면(0007 전) 메모를 적었을 때만 보냄
      if (memo || this.sheet.hasMemoCol) row.memo = memo || null
      try {
        if (this.sheet.id) {
          const u = await updateQuickEntry(this.sheet.id, row)
          this.items = this.items.map((x) => (x.id === u.id ? u : x))
        } else {
          this.items.push(await addQuickEntry(row))
        }
        this.sheet.open = false
      } catch (e) {
        if (isMissingQuickMemo(e)) this.sheetError = '메모를 저장하려면 Supabase에서 0007_quick_memo.sql 을 한 번 실행해 주세요. (메모를 비우면 저장돼요)'
        else this.fail(e, '저장하지 못했어요. 다시 해 주세요.')
      } finally { this.busy = false }
    },
    async remove() {
      this.busy = true; this.error = ''
      try {
        await deleteQuickEntry(this.sheet.id)
        this.items = this.items.filter((x) => x.id !== this.sheet.id)
        this.sheet.open = false
      } catch (e) { this.fail(e, '삭제하지 못했어요.') } finally { this.busy = false }
    },
    async onSort(from, to) {
      this.error = ''
      const next = reorder(this.items, from, to)
      this.items = next
      try { await saveMoved('quick_entries', next, from, to) } catch (e) { this.fail(e, '순서를 바꾸지 못했어요.'); this.load() }
    }
  }
}
</script>

<style scoped src="./manage.css"></style>
<style scoped>
.amt { font-weight: 600; margin-left: 4px; }
.memo { font-size: 12px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lbl .sub { font-weight: 400; color: var(--text-faint); }
.two { display: grid; grid-template-columns: 3fr 2fr; gap: 10px; }
.col { display: flex; flex-direction: column; gap: 6px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { height: 36px; padding: 0 12px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); font-size: 13px; }
.chip.on { border: 1.5px solid #C96A55; background: #FFE6DA; color: #8E3F33; font-weight: 600; }
.del { align-self: center; height: 40px; padding: 0 16px; }
</style>
