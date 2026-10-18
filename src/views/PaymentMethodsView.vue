<template>
  <main class="manage">
    <ScreenHeader title="결제수단 관리" fallback="/settings">
      <button type="button" class="add-btn" @click="openNew">+ 새로 등록</button>
    </ScreenHeader>

    <div class="body">
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section class="card" aria-label="사용 중인 결제수단">
        <ManageRow
          v-for="(m, i) in active" :key="m.id" :name="m.name"
          :first="i === 0" :last="i === active.length - 1"
          @up="move(i, -1)" @down="move(i, 1)"
        >
          <template #lead><span class="badge" :class="m.type">{{ TYPE[m.type] }}</span></template>
          {{ m.name }}
          <template #trail>
            <span v-if="m.type === 'cash'" class="muted small">기본</span>
            <template v-else>
              <button type="button" class="mini" @click="openEdit(m)">이름 바꾸기</button>
              <button type="button" class="mini" @click="setActive(m, false)">숨기기</button>
            </template>
          </template>
        </ManageRow>
      </section>

      <button v-if="hidden.length" type="button" class="hidden-toggle" :aria-expanded="showHidden" @click="showHidden = !showHidden">
        숨긴 결제수단 {{ hidden.length }}개
      </button>
      <section v-if="showHidden && hidden.length" class="card" aria-label="숨긴 결제수단">
        <ManageRow v-for="m in hidden" :key="m.id" :name="m.name" :movable="false">
          <template #lead><span class="badge" :class="m.type">{{ TYPE[m.type] }}</span></template>
          <span class="muted">{{ m.name }}</span>
          <template #trail><button type="button" class="mini" @click="setActive(m, true)">다시 보이기</button></template>
        </ManageRow>
      </section>
    </div>

    <BottomSheet :open="sheet.open" :title="sheet.id ? '이름 바꾸기' : '새 결제수단'" @close="sheet.open = false">
      <form class="sheet-form" @submit.prevent="saveSheet">
        <div v-if="!sheet.id" class="seg" role="radiogroup" aria-label="종류">
          <button type="button" role="radio" :aria-checked="sheet.type === 'card'" :class="{ on: sheet.type === 'card' }" @click="sheet.type = 'card'">카드</button>
          <button type="button" role="radio" :aria-checked="sheet.type === 'transfer'" :class="{ on: sheet.type === 'transfer' }" @click="sheet.type = 'transfer'">계좌이체</button>
        </div>
        <label for="pm-sheet-name" class="lbl">이름</label>
        <input id="pm-sheet-name" v-model="sheet.name" class="box" type="text" maxlength="30" placeholder="예: 신한 체크, 월급 통장" required>
        <button type="submit" class="btn-primary" :disabled="!sheet.name.trim() || busy">{{ sheet.id ? '저장' : '등록' }}</button>
      </form>
    </BottomSheet>
  </main>
</template>

<script>
import ScreenHeader from '@/components/ScreenHeader.vue'
import ManageRow from '@/components/ManageRow.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { listPaymentMethods, addPaymentMethod, updatePaymentMethod } from '@/lib/api'
import { moveAndSave } from '@/lib/manage'

export default {
  name: 'PaymentMethodsView',
  components: { ScreenHeader, ManageRow, BottomSheet },
  data() {
    return {
      TYPE: { cash: '현금', card: '카드', transfer: '이체' },
      all: [], showHidden: false, busy: false, error: '',
      sheet: { open: false, id: null, type: 'card', name: '' }
    }
  },
  computed: {
    active() { return this.all.filter((m) => m.is_active) },
    hidden() { return this.all.filter((m) => !m.is_active) }
  },
  created() { this.load() },
  methods: {
    async load() {
      try { this.all = await listPaymentMethods({ includeHidden: true }) } catch (e) { this.fail(e, '불러오지 못했어요.') }
    },
    fail(e, msg) { this.error = msg; console.error(e) },
    openNew() { this.sheet = { open: true, id: null, type: 'card', name: '' } },
    openEdit(m) { this.sheet = { open: true, id: m.id, type: m.type, name: m.name } },
    async saveSheet() {
      this.busy = true; this.error = ''
      try {
        if (this.sheet.id) {
          const u = await updatePaymentMethod(this.sheet.id, { name: this.sheet.name.trim() })
          this.all = this.all.map((m) => (m.id === u.id ? u : m))
        } else {
          this.all.push(await addPaymentMethod({ type: this.sheet.type, name: this.sheet.name }))
        }
        this.sheet.open = false
      } catch (e) { this.fail(e, '저장하지 못했어요. 다시 해 주세요.') } finally { this.busy = false }
    },
    async setActive(m, on) {
      this.error = ''
      try {
        const u = await updatePaymentMethod(m.id, { is_active: on })
        this.all = this.all.map((x) => (x.id === u.id ? u : x))
      } catch (e) { this.fail(e, '바꾸지 못했어요.') }
    },
    async move(i, dir) {
      this.error = ''
      try {
        const next = await moveAndSave('payment_methods', this.active, i, dir)
        this.all = [...next, ...this.hidden]
      } catch (e) { this.fail(e, '순서를 바꾸지 못했어요.'); this.load() }
    }
  }
}
</script>

<style scoped src="./manage.css"></style>
