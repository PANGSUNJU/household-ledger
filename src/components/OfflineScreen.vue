<template>
  <div class="offline" role="alert">
    <div class="icon"><AppIcon name="wifi-off" :size="46" :stroke="1.8" /></div>
    <h1>인터넷 연결이 필요해요</h1>
    <p>와이파이나 데이터가 켜져 있는지 확인해 주세요.<br>연결되면 바로 이어서 쓸 수 있어요.</p>
    <button type="button" class="btn-primary" @click="$emit('retry')">다시 시도</button>
    <div class="note">입력하던 내용은 그대로 남아 있어요</div>
  </div>
</template>

<script>
import AppIcon from './AppIcon.vue'

/* SPEC 10-D: 인터넷이 안 되면 앱을 쓸 수 없게 하고 안내한다 */
export default {
  name: 'OfflineScreen',
  components: { AppIcon },
  emits: ['retry']
}
</script>

<style scoped>
.offline {
  position: fixed; inset: 0; z-index: 100; background: var(--bg);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 20px; padding: 48px 32px; text-align: center;
}
.icon {
  width: 96px; height: 96px; border-radius: 30px; background: var(--info-bg); color: var(--info-fg);
  display: flex; align-items: center; justify-content: center;
}
h1 { margin: 0; font-size: 22px; }
p { margin: 0; font-size: 15px; line-height: 24px; color: var(--text-sub); }
.btn-primary { max-width: 280px; }
.note {
  position: absolute; left: 16px; right: 16px; bottom: 40px;
  background: var(--surface); border-radius: var(--radius-md); padding: 12px 14px;
  font-size: 13px; color: var(--text-sub); box-shadow: 0 4px 14px rgba(120, 90, 70, 0.10);
}
</style>
