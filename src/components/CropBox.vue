<template>
  <div class="crop">
    <div
      ref="view" class="view" :style="{ height: base.h ? `${base.h}px` : '62dvh' }"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @wheel="wheel"
    >
      <div ref="stage" class="stage" :style="stageStyle">
        <img :src="src" alt="자를 이미지" draggable="false" @load="onLoad">
        <!-- 잘라낼 바깥은 어둡게 -->
        <span class="shade" :style="{ left: 0, top: 0, width: '100%', height: pct(r.y) }" />
        <span class="shade" :style="{ left: 0, top: pct(r.y + r.h), width: '100%', bottom: 0 }" />
        <span class="shade" :style="{ left: 0, top: pct(r.y), width: pct(r.x), height: pct(r.h) }" />
        <span class="shade" :style="{ left: pct(r.x + r.w), top: pct(r.y), right: 0, height: pct(r.h) }" />
        <div class="box" data-h="move" :style="{ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h), boxShadow: boxShadow }">
          <span v-for="h in HANDLES" :key="h" class="h" :class="h" :data-h="h" :aria-label="LABELS[h]" :style="{ transform: `scale(${1 / z})` }" />
        </div>
      </div>
    </div>
    <!-- 확대 버튼 (두 손가락으로 벌려도 됨) — 이미지를 가리지 않게 아래 줄에 -->
    <div class="tools">
      <p class="hint">두 손가락으로 벌려 크게 보기<br>한 손가락으로 영역 조절</p>
      <div class="zoom">
        <button type="button" aria-label="확대" @click="zoomBy(1.6)">+</button>
        <button type="button" aria-label="축소" :disabled="z <= 1" @click="zoomBy(1 / 1.6)">−</button>
        <button type="button" class="fit" aria-label="전체 보기" :disabled="z <= 1" @click="reset">전체</button>
      </div>
    </div>
  </div>
</template>

<script>
/*
 * 이미지 영역 고르기 (캡처에서 이용내역 부분만 남기기)
 *  · 네 모서리를 끌어 크기 조절, 상자 안을 끌어 옮기기, 바깥을 끌면 새로 그리기
 *  · 두 손가락으로 벌리면 확대·이동 (긴 캡처도 글자를 보며 자르기), +/− 버튼, PC 는 Ctrl+휠
 *  · 값은 이미지 크기에 대한 비율 { x, y, w, h } (0~1) — 확대와 상관없음
 */
const MIN = 0.06

export default {
  name: 'CropBox',
  props: {
    src: { type: String, required: true },
    modelValue: { type: Object, default: () => ({ x: 0, y: 0, w: 1, h: 1 }) }
  },
  emits: ['update:modelValue'],
  data() {
    return {
      HANDLES: ['tl', 'tr', 'bl', 'br', 't', 'b'],
      LABELS: { tl: '왼쪽 위 모서리', tr: '오른쪽 위 모서리', bl: '왼쪽 아래 모서리', br: '오른쪽 아래 모서리', t: '위쪽 가장자리', b: '아래쪽 가장자리' },
      nw: 9, nh: 16, drag: null,
      // 화면 크기: 보기 칸 폭 W·높이, 확대 1배일 때 이미지 크기
      base: { W: 0, w: 0, h: 0 },
      z: 1, tx: 0, ty: 0
    }
  },
  computed: {
    r() { return this.modelValue },
    stageStyle() {
      const { W, w, h } = this.base
      if (!w) return { width: '100%', height: '100%', opacity: 0 }
      return { width: `${w}px`, height: `${h}px`, left: `${(W - w) / 2}px`, transform: `translate(${this.tx}px, ${this.ty}px) scale(${this.z})` }
    },
    // 확대해도 테두리는 2px 로 보이게
    boxShadow() { return `inset 0 0 0 ${2 / this.z}px #FFFFFF, 0 0 0 ${1 / this.z}px rgba(0, 0, 0, 0.25)` }
  },
  mounted() {
    this.pointers = new Map()
    window.addEventListener('resize', this.measure)
    this.measure()
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.measure)
  },
  methods: {
    pct(v) { return (v * 100).toFixed(3) + '%' },
    onLoad(e) {
      const img = e.target
      if (img.naturalWidth) { this.nw = img.naturalWidth; this.nh = img.naturalHeight }
      this.measure()
    },
    /** 확대 1배: 이미지 비율 그대로, 화면 높이의 62%·보기 칸 폭을 넘지 않게 (긴 캡처도 한눈에) */
    measure() {
      const W = this.$refs.view?.clientWidth || 0
      if (!W) return
      const maxH = window.innerHeight * 0.62
      let w = W, h = W * this.nh / this.nw
      if (h > maxH) { h = maxH; w = h * this.nw / this.nh }
      this.base = { W, w, h }
      this.reset()
    },
    reset() { this.z = 1; this.tx = 0; this.ty = 0 },
    /** 가장 크게: 이미지 폭이 보기 칸을 채운 뒤 3배까지 */
    maxZ() { return Math.max(4, (this.base.W / this.base.w) * 3) },
    /** 보기 칸 안의 점 (px, py) 을 기준으로 확대 */
    zoomAt(nz, px, py) {
      nz = Math.min(this.maxZ(), Math.max(1, nz))
      const ox = (this.base.W - this.base.w) / 2
      // 그 점 아래 이미지 자리가 그대로 남도록
      this.tx = px - ox - (px - ox - this.tx) * (nz / this.z)
      this.ty = py - (py - this.ty) * (nz / this.z)
      this.z = nz
      this.clampPan()
    },
    /** + 버튼: 이미지가 보기 칸 폭보다 좁으면 먼저 '폭에 맞춤' (긴 캡처는 처음에 아주 가늘게 보여서) */
    zoomBy(f) {
      const v = this.$refs.view
      const fit = this.base.W / this.base.w
      const nz = f > 1 && this.z < fit * 0.98 ? fit : this.z * f
      this.zoomAt(nz, v.clientWidth / 2, v.clientHeight / 2)
    },
    /** 이미지가 보기 칸 밖으로 빠져나가지 않게 */
    clampPan() {
      const { W, w, h } = this.base
      const H = this.$refs.view?.clientHeight || h
      const ox = (W - w) / 2
      const cw = w * this.z, ch = h * this.z
      if (cw <= W) this.tx = (W - cw) / 2 - ox
      else this.tx = Math.min(-ox, Math.max(W - cw - ox, this.tx))
      if (ch <= H) this.ty = (H - ch) / 2
      else this.ty = Math.min(0, Math.max(H - ch, this.ty))
    },
    viewPoint(e) {
      const b = this.$refs.view.getBoundingClientRect()
      return { x: e.clientX - b.left, y: e.clientY - b.top }
    },
    /** 화면 위치 → 이미지 비율 (확대·이동이 반영된 실제 자리로 계산) */
    point(e) {
      const b = this.$refs.stage.getBoundingClientRect()
      return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }
    },
    pinchInfo() {
      const [a, b] = [...this.pointers.values()]
      return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }
    },
    down(e) {
      this.pointers.set(e.pointerId, this.viewPoint(e))
      this.$refs.view.setPointerCapture?.(e.pointerId)
      e.preventDefault()
      if (this.pointers.size === 2) {
        // 두 번째 손가락: 자르기 대신 확대 — 첫 손가락이 바꾼 영역은 되돌린다
        if (this.drag) { this.$emit('update:modelValue', this.drag.rect0); this.drag = null }
        this.pinch = { ...this.pinchInfo(), z: this.z, tx: this.tx, ty: this.ty }
        return
      }
      if (this.pointers.size > 2) return
      const p = this.point(e)
      const h = e.target.dataset?.h || 'new'
      this.drag = { h, start: p, rect: { ...this.r }, rect0: { ...this.r } }
      if (h === 'new') this.drag.rect = { x: p.x, y: p.y, w: 0, h: 0 }
    },
    move(e) {
      if (!this.pointers.has(e.pointerId)) return
      this.pointers.set(e.pointerId, this.viewPoint(e))
      if (this.pinch && this.pointers.size >= 2) {
        const { mx, my, d } = this.pinchInfo()
        // 시작할 때 상태에서 다시 계산 (흔들림 없게)
        this.z = this.pinch.z; this.tx = this.pinch.tx; this.ty = this.pinch.ty
        this.zoomAt(this.pinch.z * d / this.pinch.d, this.pinch.mx, this.pinch.my)
        this.tx += mx - this.pinch.mx; this.ty += my - this.pinch.my
        this.clampPan()
        return
      }
      if (!this.drag) return
      const p = this.point(e)
      const { h, start, rect } = this.drag
      const dx = p.x - start.x, dy = p.y - start.y
      let { x, y, w, h: hh } = rect
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
      if (h === 'move') {
        x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - hh)
      } else if (h === 'new') {
        x = Math.min(start.x, p.x); y = Math.min(start.y, p.y); w = Math.abs(dx); hh = Math.abs(dy)
      } else {
        let left = x, top = y, right = x + w, bottom = y + hh
        if (h.includes('l')) left = clamp(left + dx, 0, right - MIN)
        if (h.includes('r')) right = clamp(right + dx, left + MIN, 1)
        if (h === 'tl' || h === 'tr' || h === 't') top = clamp(top + dy, 0, bottom - MIN)
        if (h === 'bl' || h === 'br' || h === 'b') bottom = clamp(bottom + dy, top + MIN, 1)
        x = left; y = top; w = right - left; hh = bottom - top
      }
      this.$emit('update:modelValue', { x, y, w, h: hh })
    },
    up(e) {
      this.pointers.delete(e.pointerId)
      if (this.pinch) {
        // 두 손가락을 모두 뗄 때까지는 자르기를 다시 시작하지 않는다
        if (this.pointers.size === 0) this.pinch = null
        return
      }
      if (!this.drag) return
      // 너무 작게 그렸으면 전체로 되돌린다 (그냥 톡 누른 경우)
      if (this.r.w < MIN || this.r.h < MIN) this.$emit('update:modelValue', this.drag.h === 'new' ? { x: 0, y: 0, w: 1, h: 1 } : this.drag.rect)
      this.drag = null
    },
    /** PC: Ctrl+휠 확대, 확대된 상태에서 휠은 위아래 이동 */
    wheel(e) {
      if (e.ctrlKey) {
        e.preventDefault()
        const p = this.viewPoint(e)
        this.zoomAt(this.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p.x, p.y)
      } else if (this.z > 1) {
        e.preventDefault()
        this.tx -= e.deltaX; this.ty -= e.deltaY
        this.clampPan()
      }
    }
  }
}
</script>

<style scoped>
.crop { display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding: 6px 0 4px; }
.view {
  position: relative; width: 100%; overflow: hidden; border-radius: 12px;
  touch-action: none; user-select: none; -webkit-user-select: none; background: #F3EEE9;
}
.stage { position: absolute; top: 0; transform-origin: 0 0; }
.stage img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.shade { position: absolute; background: rgba(40, 30, 25, 0.48); pointer-events: none; }
.box { position: absolute; cursor: move; }
.h { position: absolute; width: 28px; height: 28px; transform-origin: center; }
.h::after { content: ''; position: absolute; width: 14px; height: 14px; border-radius: 4px; background: #FFFFFF; border: 2px solid #C96A55; left: 7px; top: 7px; box-sizing: border-box; }
.tl { left: -14px; top: -14px; cursor: nwse-resize; }
.tr { right: -14px; top: -14px; cursor: nesw-resize; }
.bl { left: -14px; bottom: -14px; cursor: nesw-resize; }
.br { right: -14px; bottom: -14px; cursor: nwse-resize; }
.t { left: calc(50% - 14px); top: -14px; cursor: ns-resize; }
.b { left: calc(50% - 14px); bottom: -14px; cursor: ns-resize; }
.t::after, .b::after { width: 22px; height: 8px; left: 3px; top: 10px; border-radius: 4px; }
.tools { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.zoom { display: flex; gap: 6px; flex-shrink: 0; }
.zoom button {
  min-width: 38px; height: 38px; padding: 0 10px; border-radius: 999px; border: none;
  background: var(--surface, #fff); color: var(--text, #3A2E2A); font-size: 20px; font-weight: 700;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.zoom button.fit { font-size: 13px; }
.zoom button:disabled { opacity: 0.45; }
.hint { margin: 0; text-align: left; line-height: 1.4; font-size: 12px; color: var(--text-faint, #9A8F88); }
</style>
