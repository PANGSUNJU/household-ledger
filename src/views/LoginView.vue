<template>
  <main class="login">
    <div class="intro">
      <div class="logo"><AppIcon name="calendar" :size="34" /></div>
      <h1>10초면 끝나는<br>내 가계부</h1>
      <p>카드 앱 화면 캡처 한 장이면 끝.<br>밀린 일주일도 5분이면 정리돼요.</p>
      <div class="stripes" aria-hidden="true">
        <span v-for="c in stripes" :key="c" :style="{ background: c }" />
      </div>
    </div>

    <div class="actions">
      <div v-if="last" class="last">
        <AppIcon name="check" :size="16" :stroke="2.2" class="last-icon" />
        지난번에 <strong>{{ lastLabel }}</strong>로 로그인했어요
      </div>

      <button type="button" class="btn kakao" :disabled="busy" @click="social('kakao')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#191600" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7l-1 3.6c-.1.4.3.7.6.5l4.3-2.8c.5.1 1 .1 1.4.1 5.5 0 10-3.6 10-8.1S17.5 3 12 3z" /></svg>
        카카오로 시작하기
      </button>
      <button type="button" class="btn google" :disabled="busy" @click="social('google')">
        <span class="g" aria-hidden="true">G</span>
        구글로 계속하기
      </button>

      <!-- 개발용: 소셜 로그인 설정 전에 테스트할 때만 보임 -->
      <form v-if="isDev" class="dev" @submit.prevent="emailLogin">
        <label for="dev-email">개발용 이메일 로그인 (링크 받기)</label>
        <div class="row">
          <input id="dev-email" v-model="email" type="email" required placeholder="me@example.com" autocomplete="email">
          <button type="submit" :disabled="busy">보내기</button>
        </div>
        <span v-if="sent" class="ok">메일함에서 로그인 링크를 눌러 주세요.</span>
      </form>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p class="note">카카오·구글은 서로 다른 가계부예요</p>
      <p class="note"><a href="/privacy.html">개인정보처리방침</a></p>
    </div>
  </main>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import { auth, signInWith, signInWithEmail, lastProvider, PROVIDER_LABEL, ProviderDisabledError } from '@/lib/auth'

export default {
  name: 'LoginView',
  components: { AppIcon },
  data() {
    return {
      busy: false,
      error: auth.returnError || '',
      email: '',
      sent: false,
      last: lastProvider(),
      isDev: import.meta.env.DEV,
      stripes: ['#FFE6DA', '#FFF1C7', '#DCF1E6', '#DFECFB', '#E9E3FA']
    }
  },
  computed: {
    auth() { return auth },
    lastLabel() { return PROVIDER_LABEL[this.last] || this.last }
  },
  watch: {
    // 이메일 링크로 돌아와 로그인되면 원래 가려던 화면으로
    'auth.user': {
      immediate: true,
      handler(user) { if (user) this.$router.replace(this.$route.query.next || '/') }
    }
  },
  methods: {
    async social(provider) {
      this.busy = true; this.error = ''
      try {
        await signInWith(provider)
      } catch (e) {
        const name = PROVIDER_LABEL[provider]
        this.error = e instanceof ProviderDisabledError
          ? `${name} 로그인이 아직 켜져 있지 않아요.` + (this.isDev ? ' 아래 개발용 이메일 로그인을 쓰거나, README의 "소셜 로그인 켜기"를 확인해 주세요.' : '')
          : `${name} 로그인을 시작하지 못했어요. 잠시 뒤 다시 해 주세요.`
        console.error(e)
      } finally {
        this.busy = false
      }
    },
    async emailLogin() {
      this.busy = true; this.error = ''; this.sent = false
      try {
        await signInWithEmail(this.email)
        this.sent = true
      } catch (e) {
        this.error = '메일을 보내지 못했어요. 잠시 뒤 다시 해 주세요.'
        console.error(e)
      } finally {
        this.busy = false
      }
    }
  }
}
</script>

<style scoped>
.login {
  min-height: 100dvh; display: flex; flex-direction: column; justify-content: space-between;
  padding: 100px 24px calc(40px + env(safe-area-inset-bottom)) 24px; gap: 32px;
}
.intro { display: flex; flex-direction: column; gap: 20px; }
.logo {
  width: 64px; height: 64px; border-radius: 18px; background: var(--primary); color: var(--on-primary);
  display: flex; align-items: center; justify-content: center;
}
h1 { margin: 0; font-size: 30px; line-height: 40px; letter-spacing: -0.5px; }
.intro p { margin: 0; font-size: 16px; line-height: 26px; color: var(--text-sub); }
.stripes { display: flex; gap: 8px; }
.stripes span { height: 10px; width: 28px; border-radius: 5px; }

.actions { display: flex; flex-direction: column; gap: 12px; }
.last {
  align-self: center; display: flex; align-items: center; gap: 6px; padding: 6px 14px;
  background: var(--surface); border: 1px solid var(--line); border-radius: 999px;
  font-size: 13px; color: var(--text-sub);
}
.last strong { color: var(--text); }
.last-icon { color: #4E9A75; }
.btn {
  height: 56px; border-radius: var(--radius-md); font-size: 16px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 10px;
}
.btn:disabled { opacity: 0.6; }
.kakao { border: 0; background: #FEE500; color: #191600; }
.google { border: 1px solid var(--border); background: var(--surface); }
.g {
  width: 22px; height: 22px; border-radius: 11px; border: 1.5px solid var(--text);
  font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center;
}
.dev { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1.5px dashed var(--border); border-radius: var(--radius-md); }
.dev label { font-size: 12px; color: var(--text-sub); }
.dev .row { display: flex; gap: 8px; }
.dev input { flex: 1; min-width: 0; height: 40px; border: 1px solid var(--border); border-radius: var(--radius); padding: 0 10px; font-size: 14px; }
.dev button { height: 40px; padding: 0 14px; border: 0; border-radius: var(--radius); background: var(--surface-sunken); font-size: 14px; }
.ok { font-size: 12px; color: #2E6A4E; }
.error { margin: 0; font-size: 13px; color: var(--expense); text-align: center; }
.note { margin: 4px 0 0 0; text-align: center; font-size: 12px; line-height: 18px; color: var(--text-sub); }
</style>
