<template>
  <BottomSheet :open="open" :title="kind === 'expense' ? '지출 분류 추가' : '수입 분류 추가'" @close="$emit('close')">
    <form class="sheet-form" @submit.prevent="save">
      <label for="new-cat-name" class="lbl">이름</label>
      <input id="new-cat-name" ref="name" v-model="name" class="box" type="text" maxlength="20" placeholder="예: 반려동물, 경조사" required>
      <span class="lbl">색</span>
      <div class="palette" role="radiogroup" aria-label="분류 색">
        <button
          v-for="p in PASTELS" :key="p" type="button" role="radio" :aria-checked="color === p"
          :aria-label="'색 ' + p" :class="{ on: color === p }" :style="{ background: p }" @click="color = p"
        />
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" class="btn-primary" :disabled="!name.trim() || busy">{{ busy ? '추가하는 중…' : '추가하고 고르기' }}</button>
    </form>
  </BottomSheet>
</template>

<script>
/*
 * 입력 화면에서 바로 분류 추가 (설정으로 나가지 않아 쓰던 내용이 그대로 남는다)
 *  · 같은 이름이 이미 있으면 새로 만들지 않고 그 분류를 고른다
 *  · 색은 아직 안 쓴 파스텔을 먼저 골라 둔다
 */
import BottomSheet from './BottomSheet.vue'
import { addCategory } from '@/lib/api'
import { PASTELS } from '@/lib/manage'

export default {
  name: 'CategoryAddSheet',
  components: { BottomSheet },
  props: {
    open: { type: Boolean, default: false },
    kind: { type: String, required: true },          // 'expense' | 'income'
    existing: { type: Array, default: () => [] }     // 지금 보이는 같은 종류 분류들
  },
  emits: ['close', 'added', 'picked'],
  data() { return { PASTELS, name: '', color: PASTELS[0], busy: false, error: '' } },
  watch: {
    open(v) {
      if (!v) return
      this.name = ''; this.error = ''
      const used = new Set(this.existing.map((c) => (c.color || '').toUpperCase()))
      this.color = PASTELS.find((p) => !used.has(p.toUpperCase())) || PASTELS[0]
      this.$nextTick(() => this.$refs.name?.focus())
    }
  },
  methods: {
    async save() {
      const name = this.name.trim()
      if (!name || this.busy) return
      const same = this.existing.find((c) => c.name === name)
      if (same) { this.$emit('picked', same); return }
      this.busy = true; this.error = ''
      try {
        this.$emit('added', await addCategory({ kind: this.kind, name, color: this.color }))
      } catch (e) {
        this.error = '추가하지 못했어요. 다시 해 주세요.'
        console.error(e)
      } finally { this.busy = false }
    }
  }
}
</script>

<style scoped>
.sheet-form { display: flex; flex-direction: column; gap: 10px; }
.lbl { font-size: 13px; color: var(--text-sub); }
.box { height: 48px; width: 100%; border: 1px solid var(--border); border-radius: 12px; padding: 0 14px; font-size: 16px; background: var(--surface); }
.palette { display: flex; flex-wrap: wrap; gap: 10px; }
.palette button { width: 36px; height: 36px; border-radius: 10px; border: 2px solid transparent; }
.palette button.on { border-color: #3A3330; }
.error { margin: 0; font-size: 13px; color: var(--expense); }
</style>
