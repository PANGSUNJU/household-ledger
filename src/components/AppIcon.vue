<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    :stroke-width="stroke" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
  >
    <template v-if="name === 'calendar'"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></template>
    <template v-else-if="name === 'list'"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></template>
    <template v-else-if="name === 'chart'"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></template>
    <template v-else-if="name === 'settings'"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14" /></template>
    <template v-else-if="name === 'close'"><path d="M18 6L6 18M6 6l12 12" /></template>
    <template v-else-if="name === 'back'"><path d="M15 18l-6-6 6-6" /></template>
    <template v-else-if="name === 'next'"><path d="M9 18l6-6-6-6" /></template>
    <template v-else-if="name === 'down'"><path d="M6 9l6 6 6-6" /></template>
    <template v-else-if="name === 'search'"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></template>
    <template v-else-if="name === 'image'"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></template>
    <template v-else-if="name === 'check'"><path d="M20 6L9 17l-5-5" /></template>
    <template v-else-if="name === 'wifi-off'"><path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.4-1.7M1.5 9.3A15 15 0 0 1 6 6.5M22.5 9.3A15 15 0 0 0 12 5c-.8 0-1.6.1-2.4.2M12 20h.01" /></template>
    <template v-else-if="name === 'card'"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></template>
    <template v-else-if="name === 'grid'"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></template>
    <template v-else-if="name === 'bolt'"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></template>
    <template v-else-if="name === 'repeat'"><path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" /></template>
    <template v-else-if="name === 'lock'"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></template>
  </svg>
</template>

<script>
export default {
  name: 'AppIcon',
  props: {
    name: { type: String, required: true },
    size: { type: [Number, String], default: 24 },
    stroke: { type: [Number, String], default: 2 }
  }
}
</script>
