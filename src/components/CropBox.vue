<template>
  <div class="crop">
    <div
      ref="stage" class="stage" :style="stageStyle"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"
    >
      <img :src="src" alt="자를 이미지" draggable="false" @load="onLoad">
      <!-- 잘라낼 바깥은 어둡게 -->
      <span class="shade" :style="{ left: 0, top: 0, width: '100%', height: pct(r.y) }" />
      <span class="shade" :style="{ left: 0, top: pct(r.y + r.h), width: '100%', bottom: 0 }" />
      <span class="shade" :style="{ left: 0, top: pct(r.y), width: pct(r.x), height: pct(r.h) }" />
      <span class="shade" :style="{ left: pct(r.x + r.w), top: pct(r.y), right: 0, height: pct(r.h) }" />
      <div class="box" data-h="move" :style="{ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) }">
        <span v-for="h in HANDLES" :key="h" class="h" :class="h" :data-h="h" :aria-label="LABELS[h]" />
      </div>
    </div>
  </div>
</template>

<script>
/*
 * 이미지 영역 고르기 (캡처에서 이용내역 부분만 남기기)
 *  · 네 모서리를 끌어 크기 조절, 상자 안을 끌어 옮기기, 바깥을 끌면 새로 그리기
 *  · 값은 이미지 크기에 대한 비율 { x, y, w, h } (0~1)
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
      nw: 9, nh: 16, drag: null
    }
  },
  computed: {
    r() { return this.modelValue },
    /** 이미지 비율 그대로, 화면 높이의 62%를 넘지 않게 (긴 캡처도 한눈에) */
    stageStyle() {
      return { aspectRatio: `${this.nw} / ${this.nh}`, width: `min(100%, calc(62dvh * ${this.nw} / ${this.nh}))` }
    }
  },
  methods: {
    pct(v) { return (v * 100).toFixed(3) + '%' },
    onLoad(e) {
      const img = e.target
      if (img.naturalWidth) { this.nw = img.naturalWidth; this.nh = img.naturalHeight }
    },
    point(e) {
      const b = this.$refs.stage.getBoundingClientRect()
      return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }
    },
    down(e) {
      const p = this.point(e)
      const h = e.target.dataset?.h || 'new'
      this.drag = { h, start: p, rect: { ...this.r } }
      if (h === 'new') this.drag.rect = { x: p.x, y: p.y, w: 0, h: 0 }
      this.$refs.stage.setPointerCapture?.(e.pointerId)
      e.preventDefault()
    },
    move(e) {
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
    up() {
      if (!this.drag) return
      // 너무 작게 그렸으면 전체로 되돌린다 (그냥 톡 누른 경우)
      if (this.r.w < MIN || this.r.h < MIN) this.$emit('update:modelValue', this.drag.h === 'new' ? { x: 0, y: 0, w: 1, h: 1 } : this.drag.rect)
      this.drag = null
    }
  }
}
</script>

<style scoped>
.crop { display: flex; justify-content: center; padding: 6px 0 10px; }
.stage {
  position: relative;
  touch-action: none; user-select: none; -webkit-user-select: none; background: #F3EEE9;
}
.stage img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.shade { position: absolute; background: rgba(40, 30, 25, 0.48); pointer-events: none; }
.box { position: absolute; box-shadow: inset 0 0 0 2px #FFFFFF, 0 0 0 1px rgba(0, 0, 0, 0.25); cursor: move; }
.h { position: absolute; width: 28px; height: 28px; }
.h::after { content: ''; position: absolute; width: 14px; height: 14px; border-radius: 4px; background: #FFFFFF; border: 2px solid #C96A55; left: 7px; top: 7px; box-sizing: border-box; }
.tl { left: -14px; top: -14px; cursor: nwse-resize; }
.tr { right: -14px; top: -14px; cursor: nesw-resize; }
.bl { left: -14px; bottom: -14px; cursor: nesw-resize; }
.br { right: -14px; bottom: -14px; cursor: nwse-resize; }
.t { left: calc(50% - 14px); top: -14px; cursor: ns-resize; }
.b { left: calc(50% - 14px); bottom: -14px; cursor: ns-resize; }
.t::after, .b::after { width: 22px; height: 8px; left: 3px; top: 10px; border-radius: 4px; }
</style>
