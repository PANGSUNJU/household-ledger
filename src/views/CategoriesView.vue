<template>
  <main class="manage">
    <ScreenHeader title="분류 관리" fallback="/settings">
      <button type="button" class="add-btn" @click="openNew">+ 분류 추가</button>
    </ScreenHeader>

    <div class="body">
      <div class="seg" role="tablist" aria-label="분류 종류">
        <button type="button" role="tab" :aria-selected="kind === 'expense'" :class="{ on: kind === 'expense' }" @click="kind = 'expense'">지출 {{ count('expense') }}</button>
        <button type="button" role="tab" :aria-selected="kind === 'income'" :class="{ on: kind === 'income' }" @click="kind = 'income'">수입 {{ count('income') }}</button>
      </div>
      <p class="intro">위아래 화살표로 순서를 바꾸면 입력 화면 버튼 순서도 바뀌어요.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section class="card" :aria-label="(kind === 'expense' ? '지출' : '수입') + ' 분류'">
        <ManageRow
          v-for="(c, i) in active" :key="c.id" :name="c.name"
          :first="i === 0" :last="i === active.length - 1"
          @up="move(i, -1)" @down="move(i, 1)"
        >
          <template #lead><span class="swatch" :style="{ background: c.color }" aria-hidden="true" /></template>
          {{ c.name }}
          <template #trail>
            <span v-if="c.is_savings" class="tag">예산에서 빼요</span>
            <span v-if="c.is_refund" class="tag lock">지울 수 없음</span>
            <button type="button" class="mini" @click="openEdit(c)">수정</button>
            <button v-if="!c.is_refund" type="button" class="mini" @click="setActive(c, false)">숨기기</button>
          </template>
        </ManageRow>
      </section>

      <button v-if="hidden.length" type="button" class="hidden-toggle" :aria-expanded="showHidden" @click="showHidden = !showHidden">
        숨긴 분류 {{ hidden.length }}개 <span class="muted">· 지난 기록은 그대로 남아요</span>
      </button>
      <section v-if="showHidden && hidden.length" class="card" aria-label="숨긴 분류">
        <ManageRow v-for="c in hidden" :key="c.id" :name="c.name" :movable="false">
          <template #lead><span class="swatch" :style="{ background: c.color }" aria-hidden="true" /></template>
          <span class="muted">{{ c.name }}</span>
          <template #trail><button type="button" class="mini" @click="setActive(c, true)">다시 보이기</button></template>
        </ManageRow>
      </section>

      <div class="notice">수입의 '환불' 분류는 통계 계산에 쓰여서 지우거나 숨길 수 없어요. '저축/투자'는 지출로 기록되지만 예산 계산에서는 빠져요.</div>
    </div>

    <BottomSheet :open="sheet.open" :title="sheet.id ? '분류 수정' : (kind === 'expense' ? '지출 분류 추가' : '수입 분류 추가')" @close="sheet.open = false">
      <form class="sheet-form" @submit.prevent="saveSheet">
        <label for="cat-name" class="lbl">이름</label>
        <input id="cat-name" v-model="sheet.name" class="box" type="text" maxlength="20" placeholder="예: 반려동물, 경조사" required>
        <span class="lbl">색</span>
        <div class="palette" role="radiogroup" aria-label="분류 색">
          <button
            v-for="p in PASTELS" :key="p" type="button" role="radio" :aria-checked="sheet.color === p"
            :aria-label="'색 ' + p" :class="{ on: sheet.color === p }" :style="{ background: p }" @click="sheet.color = p"
          />
        </div>
        <button type="submit" class="btn-primary" :disabled="!sheet.name.trim() || busy">{{ sheet.id ? '저장' : '추가' }}</button>
      </form>
    </BottomSheet>
  </main>
</template>

<script>
import ScreenHeader from '@/components/ScreenHeader.vue'
import ManageRow from '@/components/ManageRow.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { listCategories, addCategory, updateCategory } from '@/lib/api'
import { moveAndSave, PASTELS } from '@/lib/manage'

export default {
  name: 'CategoriesView',
  components: { ScreenHeader, ManageRow, BottomSheet },
  data() {
    return {
      PASTELS, kind: 'expense', all: [], showHidden: false, busy: false, error: '',
      sheet: { open: false, id: null, name: '', color: PASTELS[0] }
    }
  },
  computed: {
    ofKind() { return this.all.filter((c) => c.kind === this.kind) },
    active() { return this.ofKind.filter((c) => c.is_active) },
    hidden() { return this.ofKind.filter((c) => !c.is_active) }
  },
  watch: { kind() { this.showHidden = false } },
  created() { this.load() },
  methods: {
    count(k) { return this.all.filter((c) => c.kind === k && c.is_active).length },
    async load() {
      try { this.all = await listCategories({ includeHidden: true }) } catch (e) { this.fail(e, '불러오지 못했어요.') }
    },
    fail(e, msg) { this.error = msg; console.error(e) },
    openNew() { this.sheet = { open: true, id: null, name: '', color: PASTELS[this.active.length % PASTELS.length] } },
    openEdit(c) { this.sheet = { open: true, id: c.id, name: c.name, color: c.color } },
    replace(u) { this.all = this.all.map((c) => (c.id === u.id ? u : c)) },
    async saveSheet() {
      this.busy = true; this.error = ''
      try {
        if (this.sheet.id) this.replace(await updateCategory(this.sheet.id, { name: this.sheet.name.trim(), color: this.sheet.color }))
        else this.all.push(await addCategory({ kind: this.kind, name: this.sheet.name, color: this.sheet.color }))
        this.sheet.open = false
      } catch (e) { this.fail(e, '저장하지 못했어요. 다시 해 주세요.') } finally { this.busy = false }
    },
    async setActive(c, on) {
      this.error = ''
      try { this.replace(await updateCategory(c.id, { is_active: on })) } catch (e) { this.fail(e, '바꾸지 못했어요.') }
    },
    async move(i, dir) {
      this.error = ''
      try {
        const next = await moveAndSave('categories', this.active, i, dir)
        next.forEach((c, idx) => { c.sort_order = idx + 1 })
        this.all = [...this.all.filter((c) => c.kind !== this.kind), ...next, ...this.hidden]
      } catch (e) { this.fail(e, '순서를 바꾸지 못했어요.'); this.load() }
    }
  }
}
</script>

<style scoped src="./manage.css"></style>
