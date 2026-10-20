<template>
  <main class="capture">
    <ScreenHeader title="캡처로 입력" back="back" fallback="/entry" />

    <div class="body">
      <!-- 1. 무엇을 올릴지 -->
      <div v-if="!groups.length && !reading" class="start">
        <div class="seg" role="radiogroup" aria-label="이미지 종류">
          <button type="button" role="radio" :aria-checked="mode === 'capture'" :class="{ on: mode === 'capture' }" @click="mode = 'capture'">카드·은행 앱 캡처</button>
          <button type="button" role="radio" :aria-checked="mode === 'receipt'" :class="{ on: mode === 'receipt' }" @click="mode = 'receipt'">영수증</button>
        </div>
        <p class="lead">
          {{ mode === 'capture'
            ? '카드·은행 앱의 이용내역 화면을 캡처해서 올려 주세요. 한 장에 여러 건이 있어도 한 번에 읽어요.'
            : '종이 영수증 사진이나 전자영수증 캡처를 올려 주세요. 날짜·사용처·합계를 읽고, 품목은 메모에 붙여요.' }}
        </p>
        <label class="pick">
          <AppIcon name="image" :size="22" />
          <span>{{ mode === 'capture' ? '캡처 고르기 (여러 장 가능)' : '영수증 사진 고르기' }}</span>
          <input ref="file" type="file" accept="image/*" :multiple="mode === 'capture'" class="sr-only" @click="holdLock()" @change="onFiles">
        </label>
        <label class="crop-opt">
          <input v-model="askCrop" type="checkbox" @change="saveCropOpt">
          <span>읽기 전에 영역 자르기</span>
        </label>
        <p class="safe">이미지는 폰 안에서만 읽고 저장하지 않아요</p>
      </div>

      <!-- 1-2. 영역 자르기 -->
      <section v-if="cropping" class="cropping" aria-label="읽을 영역 고르기">
        <div class="crop-head">
          <strong>읽을 부분만 남겨 주세요</strong>
          <span v-if="cropping.tag" class="muted small">{{ cropping.tag.replace(/ · $/, '') }}</span>
        </div>
        <CropBox v-model="cropping.rect" :src="cropping.url" />
        <div class="crop-btns">
          <button type="button" class="btn-primary" @click="finishCrop('crop')">이 부분 읽기</button>
          <button type="button" class="ghost-btn" @click="finishCrop('all')">자르지 않고 전체 읽기</button>
          <button type="button" class="text-btn" @click="finishCrop('skip')">이 이미지 빼기</button>
        </div>
      </section>

      <!-- 2. 읽는 중 -->
      <div v-if="reading && !cropping" class="reading" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true" />
        <strong>{{ readingText }}</strong>
        <span class="muted small">{{ firstLoad ? '처음 한 번은 글자 읽기 도구를 받느라 10~20초쯤 걸려요.' : '잠시만요.' }}</span>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <p v-if="restored && groups.length" class="info small-info restored">앱이 다시 열려서 아까 읽은 내용을 불러왔어요</p>
      <!-- 3. 읽은 결과 -->
      <template v-for="(g, gi) in groups" :key="g.id">
        <section class="group-head">
          <img v-if="g.thumb" :src="g.thumb" alt="" class="thumb">
          <div class="gh-text">
            <strong>{{ g.mode === 'capture' ? `카드·은행 앱 캡처 ${gi + 1}` : '영수증' }}</strong>
            <span class="muted small">{{ g.items.length ? `${g.items.length}건` : '읽은 기록이 없어요. 더 선명한 이미지로 다시 해 주세요.' }}</span>
            <span v-if="g.sec" class="muted small read-time">읽는 데 {{ g.sec }}초{{ g.boost ? ' · 이름 더 정확하게(시험) 켜짐' : '' }}</span>
          </div>
          <!-- 전체 선택: 결제 취소 줄은 빼고 이 캡처의 모든 줄 (입금·충전 포함) -->
          <label v-if="pickable(g).length > 1" class="all-check">
            <input
              type="checkbox" class="check" :checked="allOn(g)" :indeterminate.prop="!allOn(g) && someOn(g)"
              aria-label="이 캡처 전체 선택" @change="setAll(g, $event.target.checked)"
            >
            <span>전체</span>
          </label>
        </section>

        <!-- 취소 영수증: 원래 구매 찾기 -->
        <section v-if="g.mode === 'receipt' && g.receipt?.canceled" class="card cancel-receipt">
          <strong>취소·환불 영수증이에요</strong>
          <span class="muted small">{{ g.receipt.store || '사용처 모름' }} · {{ label(g.receipt.date) }} · {{ won(g.receipt.amount || 0) }}원</span>
          <p v-if="!g.matches.length" class="muted small">같은 구매를 못 찾았어요</p>
          <button
            v-for="t in g.matches" :key="t.id" type="button" class="match" @click="toRefund(g.receipt, t)"
          >
            <span><b>{{ t.store_name }}</b> · {{ label(t.date) }}</span>
            <span>-{{ won(t.amount) }} → 이 구매 환불로 기록</span>
          </button>
          <button type="button" class="btn-ghost" @click="toRefund(g.receipt, null)">환불로 기록 (직접 고르기)</button>
        </section>

        <article
          v-for="it in g.items" :key="it.id" class="card item"
          :class="{ off: !it.checked, cancel: it.kind === 'cancel', income: it.kind === 'income' }"
        >
          <div class="row1">
            <input
              v-model="it.checked" type="checkbox" class="check" :aria-label="(it.store || '기록') + ' 저장할지'"
              :disabled="it.kind === 'cancel'"
            >
            <div class="names">
              <input v-model="it.store" class="store" type="text" maxlength="50" :aria-label="it.kind === 'income' ? '입금처' : '사용처'" :placeholder="it.kind === 'income' ? '입금처' : '사용처'">
              <span class="sub">
                <!-- 날짜: 글자 + 작은 달력 아이콘. 진짜 날짜 칸은 투명하게 위에 덮어 눌러서 고르게 -->
                <label class="date-btn" :class="{ empty: !it.date }">
                  <span>{{ dateText(it.date) }}</span>
                  <AppIcon name="calendar" :size="13" :stroke="2" />
                  <input v-model="it.date" type="date" class="date-native" aria-label="날짜" @click="openPicker">
                </label>
                <span v-if="it.kind === 'cancel'" class="tag tag-cancel">결제 취소</span>
                <span v-else-if="it.kind === 'income'" class="tag tag-income">입금</span>
              </span>
              <!-- 고친 이름이면 원래 읽은 이름: 날짜 줄은 좁아서 따로 한 줄로 (길면 줄바꿈) -->
              <span v-if="it.raw && it.raw !== it.store" class="raw-name">원래 이름: {{ it.raw }}</span>
            </div>
            <label class="amt">
              <span class="sr-only">금액</span>
              <span class="sign" aria-hidden="true">{{ it.kind === 'income' ? '+' : it.kind === 'cancel' ? '' : '-' }}</span>
              <input
                v-comma :value="won(it.amount)" type="text" inputmode="numeric" :class="{ income: it.kind === 'income' }"
                @input="it.amount = calcAmount($event.target.value)"
              >
            </label>
          </div>

          <div v-if="it.kind !== 'cancel' && it.checked" class="cats">
            <button
              v-for="c in visibleCats(it)" :key="c.id" type="button" class="cat"
              :class="{ on: it.category_id === c.id }" :aria-pressed="it.category_id === c.id"
              :style="catStyle(c, it.category_id === c.id)"
              @click="it.category_id = it.category_id === c.id ? null : c.id"
            >{{ c.name }}</button>
            <button v-if="!it.allCats && catsFor(it).length > 4" type="button" class="cat more" @click="it.allCats = true">더보기</button>
          </div>
          <p v-if="it.memo && it.checked" class="memo muted small">{{ it.memo }}</p>

          <p v-if="it.checked && it.amount > MAX_AMOUNT" class="warn">10억 원까지 넣을 수 있어요</p>
          <p v-if="!it.date && it.kind !== 'cancel'" class="warn">날짜를 넣어 주세요</p>
          <p v-if="it.dup && it.checked" class="warn">⚠ 같은 날짜·금액·사용처 기록이 이미 있어요</p>
          <div v-if="it.kind === 'cancel'" class="info">
            <span>취소 건이라 빼뒀어요</span>
            <button type="button" @click="toRefund(it, it.match)">환불로 기록</button>
          </div>
          <p v-if="it.fixed === 'balance'" class="info small-info">남은 잔액으로 금액을 맞췄어요</p>
          <p v-if="it.charge && !it.checked" class="info small-info">잔액 충전이라 빼뒀어요</p>
          <p v-else-if="it.kind === 'income' && !it.checked" class="info small-info">입금이라 빼뒀어요</p>
        </article>

        <div v-if="g.items.length" class="pm">
          <span class="muted small">{{ g.mode === 'capture' ? '이 캡처의 결제수단' : '결제수단' }}</span>
          <div class="chips">
            <button
              v-for="m in methods" :key="m.id" type="button" class="chip"
              :class="{ on: g.payment_method_id === m.id }" :aria-pressed="g.payment_method_id === m.id"
              @click="g.payment_method_id = g.payment_method_id === m.id ? null : m.id"
            >{{ m.name }}</button>
          </div>
        </div>
      </template>

      <label v-if="groups.length && !reading && !cropping" class="pick more-pick">
        <AppIcon name="plus" :size="18" />
        <span>{{ mode === 'capture' ? '캡처 더 올리기' : '영수증 더 올리기' }}</span>
        <input type="file" accept="image/*" :multiple="mode === 'capture'" class="sr-only" @click="holdLock()" @change="onFiles">
      </label>
    </div>

    <div v-if="groups.length" class="bottom">
      <p v-if="saveError" class="error" role="alert">{{ saveError }}</p>
      <button type="button" class="btn-primary" :disabled="!toSave.length || saving || reading" @click="save">
        {{ saving ? '저장하는 중…' : toSave.length ? `${toSave.length}건 저장` : '저장할 기록을 골라 주세요' }}
      </button>
    </div>
  </main>
</template>

<script>
import ScreenHeader from '@/components/ScreenHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import CropBox from '@/components/CropBox.vue'
import {
  listCategories, listPaymentMethods, lastPaymentMethodId, lastExpenseAtStore, recentExpenses,
  listStoreAliases, saveStoreAliases, findSameTransactions, saveTransactions
} from '@/lib/api'
import { readImage, closeReader } from '@/lib/ocr'
import { holdLock } from '@/lib/lock'
import { nameBoostOn } from '@/lib/labs'
import { parseCapture, parseReceipt, guessCategoryName } from '@/lib/ocr-parse'
import { todayKST, label, addDays } from '@/lib/date'
import { won, calcAmount, MAX_AMOUNT } from '@/lib/money'

let seq = 0

/*
 * 읽은 결과 잠깐 저장 (폰이 메모리가 부족해 앱을 지웠다 다시 열면 되살리려고)
 *  · 이름·금액·날짜·체크·분류와 작은 미리보기만. 이미지 원본은 저장하지 않는다
 *  · 저장하거나 이 화면을 나가면 지우고, 30분이 지나면 쓰지 않고 지운다
 */
const DRAFT_KEY = 'ledger.captureDraft'
const DRAFT_MAX_MS = 30 * 60 * 1000
function readDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (d && Date.now() - d.savedAt < DRAFT_MAX_MS && Array.isArray(d.groups) && d.groups.length) return d
  } catch { /* 깨졌거나 못 읽음 */ }
  clearDraft()
  return null
}
function writeDraft(mode, groups) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), mode, groups })) } catch { /* 공간 부족 등: 되살리기만 못 함 */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* 무시 */ }
}

/** 목록 왼쪽 작은 미리보기 (저장해 둘 수 있게 작은 그림 글자로) */
async function smallThumb(file) {
  const bmp = await createImageBitmap(file)
  const w = 112, h = Math.round(Math.min(bmp.height, bmp.width * (144 / 112)) * (w / bmp.width))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  c.getContext('2d').drawImage(bmp, 0, 0, bmp.width, h * (bmp.width / w), 0, 0, w, h)
  bmp.close?.()
  return c.toDataURL('image/jpeg', 0.7)
}

/** '읽기 전에 영역 자르기' 선택 기억 (처음엔 켜짐) */
function readCropOpt() {
  try { return localStorage.getItem('ledger.askCrop') !== '0' } catch { return true }
}

/*
 * 캡처·영수증으로 입력 (SPEC 5-7, 10-A)
 *  1. 이미지를 고르면 기기 안에서 글자를 읽는다 (lib/ocr.js)
 *  2. 여러 건으로 나눠 보여준다 — 가게·날짜·금액·분류를 고치고, 빼고 싶은 건 체크를 끈다
 *     · 결제 취소 건은 빼두고 '환불로 기록'으로 넘어간다 / 입금 건도 빼둔다
 *     · 같은 날짜·금액·가게 기록이 있으면 알려준다
 *     · 가게 이름을 고치면 그 짝을 기억해 다음부터 고친 이름으로 채운다
 *  3. 결제수단은 캡처마다 한 번만 고른다
 */
export default {
  name: 'CaptureView',
  components: { ScreenHeader, AppIcon, CropBox },
  data() {
    return {
      mode: this.$route.query.mode === 'receipt' ? 'receipt' : 'capture',
      groups: [], categories: [], methods: [], aliases: {}, defaultPm: null,
      reading: false, readingText: '', firstLoad: true, error: '',
      saving: false, saveError: '', MAX_AMOUNT,
      askCrop: readCropOpt(), cropping: null, restored: false, lastRead: null
    }
  },
  computed: {
    toSave() {
      return this.groups.flatMap((g) => g.items
        .filter((it) => it.checked && it.kind !== 'cancel' && it.amount > 0 && it.amount <= MAX_AMOUNT && it.date)
        .map((it) => ({ it, g })))
    }
  },
  async created() {
    // 앱이 지워졌다 다시 열린 경우: 아까 읽은 결과 되살리기 (공유로 새로 들어온 때는 빼고)
    if (!this.$route.query.shared) {
      const d = readDraft()
      if (d) {
        this.mode = d.mode === 'receipt' ? 'receipt' : 'capture'
        this.groups = d.groups
        seq = Math.max(seq, ...d.groups.flatMap((g) => [g.id, ...g.items.map((it) => it.id)]))
        this.restored = true
      }
    }
    try {
      const [c, m, a, last] = await Promise.all([
        listCategories(), listPaymentMethods(), listStoreAliases(), lastPaymentMethodId().catch(() => null)
      ])
      this.categories = c; this.methods = m; this.aliases = a
      this.defaultPm = m.some((x) => x.id === last) ? last : null
    } catch (e) {
      this.error = '화면을 준비하지 못했어요. 다시 열어 주세요.'
      console.error(e)
    }
    try { this.firstLoad = !localStorage.getItem('ledger.ocrReady') } catch { /* 저장 못 함 */ }
    if (this.$route.query.shared) await this.takeShared()
  },
  watch: {
    groups: { deep: true, handler() { clearTimeout(this.draftTimer); this.draftTimer = setTimeout(this.saveDraftNow, 400) } }
  },
  mounted() {
    document.addEventListener('visibilitychange', this.saveDraftNow)
  },
  beforeUnmount() {
    document.removeEventListener('visibilitychange', this.saveDraftNow)
    clearTimeout(this.draftTimer)
    clearDraft()   // 화면을 나가면(저장 포함) 지운다. 앱이 지워질 때는 여기까지 오지 않아 남는다
    if (this.cropping) { URL.revokeObjectURL(this.cropping.url); this.cropping.resolve('skip') }
    for (const g of this.groups) if (g.thumb?.startsWith('blob:')) URL.revokeObjectURL(g.thumb)
    closeReader()
  },
  methods: {
    won, calcAmount, label, holdLock,
    /** 지금 읽은 결과를 잠깐 저장 (없으면 지움) */
    saveDraftNow() {
      if (this.groups.length) writeDraft(this.mode, this.groups)
      else clearDraft()
    },
    /** '10월 12일 (월)', 올해가 아니면 앞에 연도 */
    dateText(d) {
      if (!d) return '날짜 고르기'
      return (d.slice(0, 4) !== todayKST().slice(0, 4) ? `${d.slice(0, 4)}년 ` : '') + label(d)
    },
    /** PC 에서도 눌렀을 때 달력이 바로 뜨게 (폰은 원래 뜸) */
    openPicker(e) { try { e.target.showPicker?.() } catch { /* 지원 안 하면 그대로 */ } },
    /** 전체 선택에 들어가는 줄 (결제 취소 줄은 체크할 수 없어서 뺌) */
    pickable(g) { return g.items.filter((it) => it.kind !== 'cancel') },
    allOn(g) { const xs = this.pickable(g); return xs.length > 0 && xs.every((it) => it.checked) },
    someOn(g) { return this.pickable(g).some((it) => it.checked) },
    setAll(g, on) { for (const it of this.pickable(g)) it.checked = on },
    catsFor(it) { return this.categories.filter((c) => c.kind === (it.kind === 'income' ? 'income' : 'expense') && !c.is_refund) },
    visibleCats(it) {
      const all = this.catsFor(it)
      if (it.allCats) return all
      const first = all.slice(0, 4)
      const sel = all.find((c) => c.id === it.category_id)
      return sel && !first.includes(sel) ? [...first.slice(0, 3), sel] : first
    },
    catStyle(c, on) {
      const color = c.color || '#E6DDD5'
      return on ? { background: color, borderColor: `color-mix(in srgb, ${color} 45%, #3A3330)` } : { background: `color-mix(in srgb, ${color} 45%, #FFFFFF)` }
    },
    catIdByName(name) { return name ? this.categories.find((c) => c.kind === 'expense' && c.name === name)?.id || null : null },

    async onFiles(e) {
      const files = [...(e.target.files || [])]
      e.target.value = ''
      await this.processFiles(files)
    },

    /**
     * 다른 앱에서 '공유 → 가계부'로 받은 캡처 (서비스 워커가 잠깐 저장해 둔 것)
     * 꺼내서 읽고, 저장해 둔 것은 바로 지운다
     */
    async takeShared() {
      if (!('caches' in window)) return
      try {
        const cache = await caches.open('ledger-share')
        const keys = await cache.keys()
        const files = []
        for (const req of keys) {
          const res = await cache.match(req)
          if (!res) continue
          const blob = await res.blob()
          const name = decodeURIComponent(res.headers.get('X-File-Name') || 'shared.png')
          files.push(new File([blob], name, { type: blob.type || 'image/png' }))
          await cache.delete(req)
        }
        this.$router.replace({ name: 'capture' })   // 새로고침해도 다시 읽지 않게
        if (files.length) await this.processFiles(files)
        else this.error = '공유받은 이미지를 찾지 못했어요. 여기서 직접 골라 주세요.'
      } catch (e) {
        this.error = '공유받은 이미지를 열지 못했어요. 여기서 직접 골라 주세요.'
        console.error(e)
      }
    },

    saveCropOpt() {
      try { localStorage.setItem('ledger.askCrop', this.askCrop ? '1' : '0') } catch { /* 저장 못 함 */ }
    },

    /** 영역 자르기 화면을 띄우고 고를 때까지 기다린다 → { x,y,w,h } | null(전체) | 'skip' */
    pickArea(file, tag) {
      return new Promise((resolve) => {
        this.cropping = { url: URL.createObjectURL(file), rect: { x: 0, y: 0, w: 1, h: 1 }, tag, resolve }
      })
    },
    finishCrop(how) {
      const c = this.cropping
      if (!c) return
      URL.revokeObjectURL(c.url)
      this.cropping = null
      const full = c.rect.w > 0.98 && c.rect.h > 0.98
      c.resolve(how === 'skip' ? 'skip' : how === 'all' || full ? null : { ...c.rect })
    },

    async processFiles(files) {
      if (!files.length) return
      this.error = ''; this.reading = true
      try {
        for (let i = 0; i < files.length; i++) {
          const tag = files.length > 1 ? `${files.length}장 중 ${i + 1}장 ` : ''
          // 읽기 도구는 미리 받아 두면서, 그동안 영역을 고른다
          let crop = null
          if (this.askCrop) {
            crop = await this.pickArea(files[i], tag ? `${tag}· ` : '')
            if (crop === 'skip') continue
          }
          this.readingText = `${tag}읽을 준비 중…`
          const boost = nameBoostOn()
          const t0 = performance.now()
          const text = await readImage(files[i], ({ stage, pct }) => {
            this.readingText = stage === 'read' ? `${tag}글자 읽는 중 ${pct}%`
              : stage === 'name-load' ? `${tag}이름 읽기 도구 준비 중… (처음 한 번은 약 16MB)`
                : stage === 'name' ? `${tag}가게 이름 다시 읽는 중…`
                  : `${tag}읽기 도구 준비 중…`
          }, crop, { name: boost })
          this.lastRead = { sec: (performance.now() - t0) / 1000, boost }
          try { localStorage.setItem('ledger.ocrReady', '1') } catch { /* 저장 못 함 */ }
          this.firstLoad = false
          await this.addGroup(files[i], text)
          // [시험 기능] 읽는 데 걸린 시간 (이름 더 정확하게 켜고 끄며 비교하려고)
          const g = this.groups[this.groups.length - 1]
          if (g) { g.sec = Math.round(this.lastRead.sec * 10) / 10; g.boost = this.lastRead.boost }
        }
      } catch (err) {
        this.error = navigator.onLine
          ? '이미지를 읽지 못했어요. 다른 이미지로 다시 해 주세요.'
          : '처음 한 번은 읽기 도구를 받아야 해서 인터넷이 필요해요.'
        console.error(err)
      } finally {
        this.reading = false
      }
    },

    /** 읽은 글자 → 기록 후보 목록 */
    async addGroup(file, text) {
      const today = todayKST()
      const g = {
        id: ++seq, mode: this.mode, thumb: '', items: [], receipt: null, matches: [],
        payment_method_id: this.guessPm(text) || this.defaultPm
      }
      try { g.thumb = await smallThumb(file) } catch { g.thumb = '' }
      let found = []
      if (this.mode === 'capture') {
        found = parseCapture(text, today)
      } else {
        const r = parseReceipt(text, today)
        r.store = this.aliases[r.store] || r.store
        g.receipt = r
        if (r.canceled) g.matches = await this.findOriginals(r)
        else if (r.amount) found = [{ date: r.date, store: r.store, amount: r.amount, kind: 'expense', memo: r.memo }]
      }

      for (const f of found) {
        const raw = f.store
        g.items.push({
          id: ++seq, raw, store: this.aliases[raw] || raw, date: f.date > today ? today : f.date,
          amount: f.amount, kind: f.kind, memo: f.memo || '', charge: !!f.charge, fixed: f.fixed || '',
          // 지출·입금은 체크, 잔액 충전·취소·날짜 모름은 빼둠
          checked: (f.kind === 'expense' || f.kind === 'income') && !f.noDate && !f.charge, category_id: null, allCats: false, dup: false, match: null
        })
      }
      // 이미지 원본은 쓰지 않으므로 바로 버린다 (작은 미리보기만 이 화면에서 잠깐 보여준다)
      this.groups.push(g)
      await Promise.all([this.fillCategories(g.items), this.markDuplicates(), this.findCancelMatches(g.items)])
    },

    /** 캡처 글자에 등록된 결제수단 이름이 보이면 그것으로 (예: '신한 체크') */
    guessPm(text) {
      const flat = text.replace(/\s/g, '')
      const hit = this.methods.filter((m) => m.type !== 'cash' && m.name.replace(/\s/g, '').length >= 2 && flat.includes(m.name.replace(/\s/g, '')))
      return hit.length === 1 ? hit[0].id : null
    },

    /** 분류: 같은 가게의 마지막 분류 → 없으면 가게 이름으로 짐작 */
    async fillCategories(items) {
      const stores = [...new Set(items.filter((it) => it.kind === 'expense').map((it) => it.store).filter(Boolean))]
      const last = {}
      await Promise.all(stores.map(async (s) => { try { last[s] = await lastExpenseAtStore(s) } catch { last[s] = null } }))
      for (const it of items) {
        if (it.kind !== 'expense') continue
        const prev = last[it.store]?.category_id
        it.category_id = (prev && this.categories.some((c) => c.id === prev) ? prev : null) || this.catIdByName(guessCategoryName(it.store || it.raw))
      }
    },

    /** 같은 날짜·금액·가게 (이미 저장된 기록 + 이번에 올린 다른 캡처) */
    async markDuplicates() {
      const all = this.groups.flatMap((g) => g.items)
      let saved = []
      try { saved = await findSameTransactions(all.map((it) => it.date)) } catch (e) { console.warn(e) }
      const key = (d, a, s) => `${d}|${a}|${(s || '').replace(/\s/g, '')}`
      const have = new Set(saved.map((t) => key(t.date, t.amount, t.store_name)))
      const seen = new Set()
      for (const it of all) {
        const k1 = key(it.date, it.amount, it.store), k2 = key(it.date, it.amount, it.raw)
        it.dup = have.has(k1) || have.has(k2) || seen.has(k1)
        seen.add(k1)
      }
    },

    /** 취소 건: 원래 구매가 기록에 있으면 찾아 둔다 */
    async findCancelMatches(items) {
      for (const it of items.filter((x) => x.kind === 'cancel')) {
        const ms = await this.findOriginals({ store: it.store, amount: it.amount, date: it.date, raw: it.raw }, { fuzzy: true })
        it.match = ms.length === 1 ? ms[0] : null
        // 취소선이 그어진 금액은 잘못 읽히기 쉽다 → 찾은 원래 구매 금액으로 맞춘다
        if (it.match) it.amount = it.match.amount
      }
    },
    /**
     * 원래 구매 찾기: 같은 가게(이름 일부 겹침) + 같은 금액, 120일 안
     * fuzzy: 금액이 똑같은 게 없으면 자릿수가 같고 숫자 2개 이하만 다른 금액도 본다 (취소선 때문에 잘못 읽힌 경우)
     */
    async findOriginals(r, { fuzzy = false } = {}) {
      try {
        const until = r.date || todayKST()
        const list = await recentExpenses(addDays(until, -120), 300)
        const norm = (s) => (s || '').replace(/\s|\(주\)|㈜/g, '')
        const names = [norm(r.store), norm(r.raw)].filter(Boolean)
        const sameStore = (t) => !names.length || names.some((n) => norm(t.store_name).includes(n) || (norm(t.store_name) && n.includes(norm(t.store_name))))
        const cands = list.filter((t) => t.date <= until && sameStore(t))
        const exact = cands.filter((t) => t.amount === r.amount)
        if (exact.length || !fuzzy || !names.length) return exact
        const a = String(r.amount || '')
        const near = (n) => { const b = String(n); return b.length === a.length && [...b].filter((c, i) => c !== a[i]).length <= 2 }
        return cands.filter((t) => near(t.amount))
      } catch (e) { console.warn(e); return [] }
    },

    /** 환불 입력 화면으로 (원래 구매를 찾았으면 미리 골라 둔다) */
    toRefund(r, original) {
      const query = { refund: '1', amount: r.amount || '', date: r.date || todayKST(), store: r.store || '' }
      if (original) query.refund_of = original.id
      this.$router.push({ name: 'entry', query })
    },

    async save() {
      if (!this.toSave.length || this.saving) return
      this.saving = true; this.saveError = ''
      try {
        await saveTransactions(this.toSave.map(({ it, g }) => ({
          kind: it.kind === 'income' ? 'income' : 'expense',
          date: it.date, amount: Math.round(it.amount), store_name: (it.store || '').trim(),
          category_id: it.category_id, payment_method_id: g.payment_method_id, memo: it.memo, source: 'image'
        })))
        // 가게 이름을 고쳤으면 짝을 기억한다 (실패해도 기록 저장은 된 것)
        const pairs = this.toSave.map(({ it }) => ({ raw_name: it.raw, display_name: (it.store || '').trim() }))
          .filter((p) => p.raw_name && p.display_name && p.raw_name !== p.display_name && this.aliases[p.raw_name] !== p.display_name)
        try { await saveStoreAliases(pairs) } catch (e) { console.warn('가게 이름 짝 저장 실패', e) }
        const first = this.toSave.map(({ it }) => it.date).sort().pop()
        this.$router.replace({ name: 'calendar', query: { date: first } })
      } catch (e) {
        this.saveError = navigator.onLine ? '저장하지 못했어요. 다시 눌러 주세요.' : '인터넷 연결이 끊겼어요. 연결되면 다시 눌러 주세요.'
        console.error(e)
      } finally { this.saving = false }
    }
  }
}
</script>

<style scoped>
.capture { min-height: 100dvh; padding-bottom: 110px; }
.body { padding: 4px 16px 24px 16px; display: flex; flex-direction: column; gap: 12px; }
.muted { color: var(--text-sub); }
.small { font-size: 12px; }
.error { margin: 0; color: var(--expense); font-size: 13px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.start { display: flex; flex-direction: column; gap: 14px; padding-top: 6px; }
.seg { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface-sunken); border-radius: 12px; padding: 4px; }
.seg button { height: 40px; border: 0; border-radius: 9px; background: transparent; color: var(--text-sub); font-size: 14px; }
.seg button.on { background: var(--surface); color: var(--text); font-weight: 700; box-shadow: 0 1px 3px rgba(120, 90, 70, 0.14); }
.lead { margin: 0; font-size: 14px; line-height: 21px; }
.pick {
  display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 64px; border-radius: var(--radius-md);
  border: 1.5px dashed #D9B8F0; background: #F4EEFC; color: #4F3F86; font-weight: 600; font-size: 15px; cursor: pointer; position: relative;
}
.more-pick { min-height: 48px; border-style: solid; border-width: 0; background: #E9E3FA; }
.safe { margin: 0; font-size: 12px; line-height: 18px; color: var(--text-sub); background: var(--surface-sunken); border-radius: 10px; padding: 10px 12px; }

.reading { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 36px 0; text-align: center; }
.spinner { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #F2DED4; border-top-color: #C96A55; animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.group-head { display: flex; gap: 12px; align-items: center; padding-top: 4px; }
.thumb { width: 56px; height: 72px; object-fit: cover; object-position: top; border-radius: 10px; border: 1px solid var(--line); background: #fff; }
.gh-text { display: flex; flex-direction: column; gap: 2px; }
.read-time { font-size: 11px; color: var(--text-faint); }
.all-check { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--text-sub); cursor: pointer; flex-shrink: 0; white-space: nowrap; }

.item { padding: 14px 14px 14px 12px; display: flex; flex-direction: column; gap: 10px; }
.item.off { opacity: 0.72; }
.row1 { display: flex; align-items: flex-start; gap: 10px; }
.check { width: 22px; height: 22px; margin: 3px 0 0; accent-color: #C96A55; flex-shrink: 0; }
/* 분류 버튼·안내는 체크 칸 오른쪽(이름 줄)에 맞춰 시작 */
.item > :not(.row1) { margin-left: 32px; }
.names { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.store { border: 0; border-bottom: 1px dashed transparent; background: transparent; font-size: 16px; font-weight: 700; padding: 2px 0; color: var(--text); min-width: 0; }
.store:focus { outline: none; border-bottom-color: var(--accent); }
.sub { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-sub); white-space: nowrap; overflow: hidden; min-height: 22px; }
.sign { margin-right: -1px; }
.tag { flex-shrink: 0; padding: 1px 7px; border-radius: 999px; font-size: 11px; line-height: 16px; font-weight: 600; }
.tag-income { background: var(--info-bg); color: var(--info-fg); }
.tag-cancel { background: var(--surface-sunken); color: var(--text-sub); }
.raw-name { font-size: 11.5px; line-height: 16px; color: var(--text-faint); overflow-wrap: anywhere; }
.date-btn { position: relative; display: inline-flex; align-items: center; gap: 4px; color: var(--text-sub); cursor: pointer; }
.date-btn.empty { color: var(--expense); font-weight: 600; }
.date-btn svg { opacity: 0.6; flex-shrink: 0; }
.date-native { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: 0; padding: 0; cursor: pointer; }
.amt { display: flex; align-items: center; justify-content: flex-end; gap: 1px; width: 104px; min-height: 28px; flex-shrink: 0; font-weight: 700; font-size: 16px; }
.amt input { width: 92px; border: 0; background: transparent; font-size: 16px; font-weight: 700; text-align: right; color: var(--text); padding: 2px 0; }
/* 칸 너비를 숫자 길이에 맞춰 +/- 가 숫자 바로 앞에 붙게 (지원 안 하는 브라우저는 예전처럼 92px) */
@supports (field-sizing: content) {
  .amt input { width: auto; field-sizing: content; min-width: 2ch; max-width: 96px; }
}
.amt input.income { color: var(--income); }
.amt input:focus { outline: none; border-bottom: 1px dashed var(--accent); }
.cancel .amt input { color: var(--text-sub); }
.cats { display: flex; gap: 6px; flex-wrap: wrap; }
.cat { height: 34px; padding: 0 12px; border: 2px solid transparent; border-radius: 10px; font-size: 13px; color: var(--text); }
.cat.on { font-weight: 700; }
.cat.more { background: var(--surface-sunken); color: var(--text-sub); }
.memo { margin: 0; }
.warn { margin: 0; padding: 8px 10px; border-radius: 10px; background: #FFF1C7; color: #5E4710; font-size: 12px; font-weight: 600; }
.info { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 10px; background: var(--info-bg); color: var(--info-fg); font-size: 12px; margin: 0; }
.info button { border: 0; background: transparent; color: var(--info-fg); font-weight: 700; font-size: 12px; }
.small-info { display: block; }

.cancel-receipt { padding: 14px; display: flex; flex-direction: column; gap: 8px; border: 1.5px solid #CFE2F8; }
.cancel-receipt p { margin: 0; }
.match { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); font-size: 13px; text-align: left; }
.match span:last-child { color: var(--info-fg); font-weight: 600; }
.btn-ghost { height: 42px; border: 0; border-radius: 12px; background: var(--surface-sunken); font-size: 14px; color: #5A4E48; }

.pm { display: flex; flex-direction: column; gap: 8px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { height: 36px; padding: 0 14px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); font-size: 13px; }
.chip.on { border: 1.5px solid #C96A55; background: #FFE6DA; color: #8E3F33; font-weight: 600; }

.bottom {
  position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: var(--bg); border-top: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 6px;
}
.crop-opt { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; line-height: 20px; }
.crop-opt input { width: 20px; height: 20px; accent-color: #C96A55; flex-shrink: 0; }
.cropping { display: flex; flex-direction: column; gap: 12px; }
.crop-head { display: flex; flex-direction: column; gap: 2px; }
.crop-head strong { font-size: 16px; }
.crop-btns { display: flex; flex-direction: column; gap: 8px; }
.ghost-btn { height: 46px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); font-size: 15px; color: var(--text); }
.text-btn { height: 40px; border: 0; background: transparent; color: var(--text-sub); font-size: 14px; }
</style>
