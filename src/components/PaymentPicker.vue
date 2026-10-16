<template>
  <div class="pay">
    <div class="chips" role="radiogroup" aria-label="결제수단">
      <button
        v-for="m in methods" :key="m.id" type="button" role="radio"
        class="chip" :class="{ selected: m.id === modelValue }" :aria-checked="m.id === modelValue"
        @click="$emit('update:modelValue', m.id === modelValue ? null : m.id)"
      >{{ m.name }}</button>
      <button v-if="!adding" type="button" class="chip add" @click="startAdd">+ 새로 등록</button>
    </div>

    <!-- 등록 안 된 결제수단은 이 자리에서 바로 등록 (SPEC 3) -->
    <form v-if="adding" class="add-form" @submit.prevent="save">
      <div class="type" role="radiogroup" aria-label="종류">
        <button type="button" role="radio" :aria-checked="type === 'card'" :class="{ on: type === 'card' }" @click="type = 'card'">카드</button>
        <button type="button" role="radio" :aria-checked="type === 'transfer'" :class="{ on: type === 'transfer' }" @click="type = 'transfer'">계좌이체</button>
      </div>
      <label class="sr-only" for="pm-name">결제수단 이름</label>
      <input id="pm-name" ref="name" v-model="name" type="text" maxlength="30" placeholder="예: 신한 체크, 월급 통장" required>
      <div class="row">
        <button type="button" class="ghost" @click="adding = false">취소</button>
        <button type="submit" class="ok" :disabled="!name.trim() || busy">등록</button>
      </div>
      <p class="hint">카드번호·계좌번호는 저장하지 않아요. 알아보기 쉬운 이름만 정해 주세요.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>

<script>
import { addPaymentMethod } from '@/lib/api'

export default {
  name: 'PaymentPicker',
  props: {
    methods: { type: Array, required: true },
    modelValue: { type: String, default: null }
  },
  emits: ['update:modelValue', 'added'],
  data() {
    return { adding: false, type: 'card', name: '', busy: false, error: '' }
  },
  methods: {
    startAdd() {
      this.adding = true; this.name = ''; this.error = ''
      this.$nextTick(() => this.$refs.name?.focus())
    },
    async save() {
      this.busy = true; this.error = ''
      try {
        const m = await addPaymentMethod({ type: this.type, name: this.name })
        this.$emit('added', m)
        this.$emit('update:modelValue', m.id)
        this.adding = false
      } catch (e) {
        this.error = '등록하지 못했어요. 다시 해 주세요.'
        console.error(e)
      } finally {
        this.busy = false
      }
    }
  }
}
</script>

<style scoped>
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  height: 36px; padding: 0 12px; border: 1px solid var(--border); border-radius: 18px;
  background: var(--surface); font-size: 13px;
}
.chip.selected { border: 1.5px solid #C96A55; background: #FFE6DA; color: #8E3F33; font-weight: 600; }
.chip.add { border-style: dashed; border-color: #B8A69C; color: var(--text-sub); }

.add-form {
  margin-top: 10px; padding: 12px; border-radius: var(--radius-md); background: var(--surface-sunken);
  display: flex; flex-direction: column; gap: 8px;
}
.type { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.type button { height: 36px; border: 0; border-radius: var(--radius); background: var(--surface); font-size: 14px; color: var(--text-sub); }
.type button.on { color: var(--text); font-weight: 700; box-shadow: inset 0 0 0 1.5px #C96A55; }
.add-form input { height: 44px; border: 1px solid var(--border); border-radius: var(--radius); padding: 0 12px; font-size: 15px; background: var(--surface); }
.row { display: flex; gap: 8px; justify-content: flex-end; }
.row button { height: 38px; padding: 0 16px; border: 0; border-radius: var(--radius); font-size: 14px; }
.ghost { background: transparent; color: var(--text-sub); }
.ok { background: var(--primary); color: var(--on-primary); font-weight: 700; }
.ok:disabled { opacity: 0.5; }
.hint { margin: 0; font-size: 12px; color: var(--text-sub); }
.error { margin: 0; font-size: 12px; color: var(--expense); }
</style>
