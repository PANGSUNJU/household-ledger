<template>
  <main class="page settings">
    <h1 class="page-title">설정</h1>

    <section class="card account" aria-label="계정">
      <span class="avatar" :class="provider" aria-hidden="true">{{ providerInitial }}</span>
      <div>
        <strong>{{ displayName }}</strong>
        <span class="muted">{{ providerLabel }}로 로그인됨</span>
      </div>
    </section>

    <section v-if="showInstall" class="card menu" aria-label="앱 설치">
      <div class="row">
        <span class="row-icon" style="background: #FFE6DA; color: #8E3F33"><AppIcon name="plus" :size="16" /></span>
        <span class="row-label two-line">
          <span>앱으로 설치</span>
          <span class="muted small">{{ installHint }}</span>
        </span>
        <button v-if="pwa.installEvent" type="button" class="mini-btn install" @click="install">설치</button>
      </div>
    </section>

    <section class="card menu" aria-label="가계부 관리">
      <h2>가계부 관리</h2>
      <router-link v-for="item in menu" :key="item.to" :to="item.to" class="row">
        <span class="row-icon" :style="{ background: item.bg, color: item.fg }"><AppIcon :name="item.icon" :size="16" /></span>
        <span class="row-label">{{ item.label }}</span>
        <AppIcon name="next" :size="18" class="chev" />
      </router-link>
    </section>

    <section class="card menu" aria-label="보안">
      <h2>보안</h2>
      <div class="row">
        <span class="row-icon" style="background: #FFE6DA; color: #8E3F33"><AppIcon name="lock" :size="16" /></span>
        <span class="row-label two-line">
          <label for="lock-switch">화면 잠금</label>
          <span class="muted small">앱을 열 때 숫자 4자리를 물어봐요</span>
        </span>
        <button
          id="lock-switch" type="button" role="switch" class="switch" :class="{ on: lock.enabled }"
          :aria-checked="lock.enabled" :disabled="busy" @click="toggleLock"
        ><span class="knob" /></button>
      </div>
      <div class="row timeout" :class="{ disabled: !lock.enabled }">
        <span class="row-label">다시 묻는 시간</span>
        <div v-if="lock.enabled" class="times" role="radiogroup" aria-label="다시 묻는 시간">
          <button
            v-for="t in TIMEOUTS" :key="t.v" type="button" role="radio"
            :aria-checked="lock.timeout === t.v" :class="{ on: lock.timeout === t.v }" @click="chooseTimeout(t.v)"
          >{{ t.t }}</button>
        </div>
        <span v-else class="muted small">잠금을 켜면 고를 수 있어요</span>
      </div>
      <p v-if="lockError" class="lock-error" role="alert">{{ lockError }}</p>
    </section>

    <section class="card menu" aria-label="알림">
      <h2>알림</h2>
      <p v-if="remindMissing" class="row muted small pad">주간 정리 알림을 쓰려면 Supabase에서 <code>0003_budget_store_remind.sql</code>을 실행해 주세요.</p>
      <template v-else-if="remind">
        <div class="row">
          <span class="row-icon" style="background: #FFF1C7; color: #5E4710"><AppIcon name="calendar" :size="16" /></span>
          <span class="row-label two-line">
            <label for="remind-switch">주간 정리 알림</label>
            <span class="muted small">정한 요일·시간에 일주일 치를 정리하자고 알려줘요</span>
          </span>
          <button
            id="remind-switch" type="button" role="switch" class="switch" :class="{ on: remind.remind_enabled }"
            :aria-checked="remind.remind_enabled" :disabled="remindBusy" @click="toggleRemind"
          ><span class="knob" /></button>
        </div>
        <div v-if="remind.remind_enabled" class="row remind-opts">
          <div class="days" role="radiogroup" aria-label="요일">
            <button
              v-for="(w, i) in WEEKDAYS" :key="w" type="button" role="radio" :aria-checked="remind.remind_weekday === i"
              :class="{ on: remind.remind_weekday === i }" @click="saveRemind({ remind_weekday: i })"
            >{{ w }}</button>
          </div>
          <label class="time-row">
            <span>시간</span>
            <input type="time" :value="remind.remind_time.slice(0, 5)" step="600" @change="$event.target.value ? saveRemind({ remind_time: $event.target.value }) : ($event.target.value = remind.remind_time.slice(0, 5))">
          </label>
          <!-- 폰 푸시 알림 -->
          <div class="push" role="group" aria-label="폰 알림">
            <template v-if="push.on">
              <p class="push-on">✓ 이 폰({{ push.device }})으로 알림을 받고 있어요</p>
              <div class="cal-btns">
                <button type="button" class="mini-btn" :disabled="push.busy" @click="testPush">시험 알림 보내기</button>
                <button type="button" class="mini-btn plain" :disabled="push.busy" @click="offPush">이 폰 알림 끄기</button>
              </div>
            </template>
            <template v-else-if="push.state === 'ready'">
              <button type="button" class="btn-push" :disabled="push.busy" @click="onPush">이 폰으로 알림 받기</button>
              <p class="muted tiny">누르면 폰이 알림을 허용할지 물어봐요. 정한 시간에 폰 알림으로 알려줘요.</p>
            </template>
            <p v-else class="muted small">{{ pushHelp }}</p>
            <p v-if="push.msg" class="small" :class="{ 'lock-error': push.err }" role="status">{{ push.msg }}</p>
          </div>
          <p class="muted tiny">알림을 못 받아도, 정한 시간이 지나 앱을 열면 앱 안에서 "이번 주 정리할까요?"를 보여줘요.</p>
          <details class="cal-alt">
            <summary>알림 대신 폰 캘린더에 넣기</summary>
            <div class="cal-btns">
              <button type="button" class="mini-btn" @click="downloadIcs">폰 캘린더에 추가 (.ics)</button>
              <a class="mini-btn" :href="googleUrl" target="_blank" rel="noopener">구글 캘린더에 추가</a>
            </div>
          </details>
        </div>
      </template>
    </section>

    <section class="card menu" aria-label="데이터">
      <h2>데이터</h2>
      <button type="button" class="row" @click="openCsv">
        <span class="row-icon" style="background: #DCF1E6; color: #2E6A4E"><AppIcon name="list" :size="16" /></span>
        <span class="row-label two-line">
          <span>CSV로 내보내기</span>
          <span class="muted small">엑셀에서 열 수 있어요. 백업용으로도 좋아요</span>
        </span>
        <AppIcon name="next" :size="18" class="chev" />
      </button>
    </section>

    <section class="card menu" aria-label="기타">
      <button type="button" class="row logout" @click="logout">로그아웃</button>
    </section>

    <!-- CSV 내보내기 -->
    <BottomSheet :open="csv.open" title="CSV로 내보내기" @close="csv.open = false">
      <div class="sheet-body">
        <div class="chips" role="radiogroup" aria-label="기간">
          <button
            v-for="p in CSV_RANGES" :key="p.v" type="button" role="radio" class="chip"
            :aria-checked="csv.kind === p.v" :class="{ on: csv.kind === p.v }" @click="csv.kind = p.v"
          >{{ p.t }}</button>
        </div>
        <div v-if="csv.kind === 'custom'" class="dates">
          <input v-model="csv.from" type="date" aria-label="시작 날짜"><span>~</span><input v-model="csv.to" type="date" aria-label="끝 날짜">
        </div>
        <p class="muted small">열: 날짜, 종류(지출/수입/환불), 금액, 가게, 분류, 결제수단, 메모, 상태</p>
        <p v-if="csv.msg" class="small" :class="{ 'lock-error': csv.err }" role="status">{{ csv.msg }}</p>
        <button type="button" class="btn-primary" :disabled="csv.busy" @click="exportCsv">{{ csv.busy ? '만드는 중…' : '내려받기' }}</button>
      </div>
    </BottomSheet>

    <!-- 잠금 비밀번호 정하기: 두 번 입력 -->
    <BottomSheet :open="pinSheet" :title="pinStep === 1 ? '잠금 비밀번호 정하기' : '한 번 더 입력해 주세요'" @close="pinSheet = false">
      <PinPad
        :key="pinStep" ref="pad" :hint="pinStep === 1 ? '숫자 4자리' : '확인을 위해 같은 숫자를 한 번 더'"
        :error="pinError" :disabled="busy" @complete="onPin"
      />
      <p class="muted small center">잊어버리면 로그아웃 후 다시 로그인해서 새로 정할 수 있어요.</p>
    </BottomSheet>
  </main>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import PinPad from '@/components/PinPad.vue'
import { auth, signOut, PROVIDER_LABEL } from '@/lib/auth'
import { lock, TIMEOUTS } from '@/lib/lock'
import { setLockPin, disableLock, setLockTimeout, listTransactions, getRemindSettings, saveRemindSettings } from '@/lib/api'
import { WEEKDAYS, buildIcs, googleCalendarUrl } from '@/lib/remind'
import { pwa, isIos, isStandalone, promptInstall, pushSupport, currentSubscription, enablePush, disablePush, sendTestPush } from '@/lib/pwa'
import { toCsv, downloadText } from '@/lib/csv'
import { todayKST, parse, format } from '@/lib/date'

export default {
  name: 'SettingsView',
  components: { AppIcon, BottomSheet, PinPad },
  data() {
    return {
      TIMEOUTS, busy: false, lockError: '',
      WEEKDAYS, remind: null, remindMissing: false, remindBusy: false,
      push: { state: pushSupport(), on: false, device: '', busy: false, msg: '', err: false },
      CSV_RANGES: [{ v: 'month', t: '이번 달' }, { v: 'year', t: '올해' }, { v: 'all', t: '전체' }, { v: 'custom', t: '직접 선택' }],
      csv: { open: false, kind: 'month', from: '', to: '', busy: false, msg: '', err: false },
      pinSheet: false, pinStep: 1, firstPin: '', pinError: '',
      menu: [
        { to: '/settings/recurring', label: '고정 수입·지출', icon: 'repeat', bg: '#E9E3FA', fg: '#4F3F86' },
        { to: '/settings/payment-methods', label: '결제수단 관리', icon: 'card', bg: '#FFE6DA', fg: '#8E3F33' },
        { to: '/settings/categories', label: '분류 관리', icon: 'grid', bg: '#DCF1E6', fg: '#2E6A4E' },
        { to: '/settings/quick', label: '자주 쓰는 내역', icon: 'bolt', bg: '#FFF1C7', fg: '#5E4710' }
      ]
    }
  },
  computed: {
    lock() { return lock },
    provider() { return auth.provider },
    providerLabel() { return PROVIDER_LABEL[auth.provider] || '계정' },
    providerInitial() { return { kakao: 'K', google: 'G' }[auth.provider] || '@' },
    appUrl() { return window.location.origin },
    pwa() { return pwa },
    showInstall() { return !pwa.installed && (pwa.installEvent || isIos()) },
    installHint() {
      return pwa.installEvent
        ? '홈 화면·앱 서랍에 아이콘이 생기고 주소창 없이 열려요'
        : '사파리 아래 공유 버튼 → 홈 화면에 추가를 눌러 주세요'
    },
    pushHelp() {
      return {
        'no-key': '폰 알림은 배포할 때 알림 열쇠를 넣으면 켤 수 있어요 (docs/DEPLOY.md 8번).',
        'need-https': '폰 알림은 배포한 https 주소에서만 켤 수 있어요.',
        'ios-install': '아이폰은 사파리 공유 → 홈 화면에 추가 후, 그 아이콘으로 열면 알림을 켤 수 있어요.',
        unsupported: '이 브라우저는 알림을 받을 수 없어요. 갤럭시는 크롬으로 열어 주세요.',
        denied: '알림이 막혀 있어요. 폰 설정 → 애플리케이션(또는 크롬 사이트 설정) → 알림에서 허용해 주세요.'
      }[this.push.state] || ''
    },
    googleUrl() { return this.remind ? googleCalendarUrl(this.remind, this.appUrl) : '#' },
    displayName() {
      const m = auth.user?.user_metadata || {}
      return m.name || m.full_name || m.nickname || auth.user?.email || '내 계정'
    }
  },
  async created() {
    const r = await getRemindSettings()
    if (r) this.remind = r
    else this.remindMissing = true
    const sub = await currentSubscription()
    this.push.on = !!sub
    this.push.device = this.deviceLabel()
  },
  methods: {
    async saveRemind(patch) {
      const before = { ...this.remind }
      Object.assign(this.remind, patch)
      this.remindBusy = true; this.lockError = ''
      try { await saveRemindSettings(patch) } catch (e) {
        this.remind = before
        this.lockError = '알림 설정을 저장하지 못했어요.'
        console.error(e)
      } finally { this.remindBusy = false }
    },
    toggleRemind() {
      // 켤 때는 '이번 주는 확인함'으로 두어 바로 안내가 뜨지 않게
      const on = !this.remind.remind_enabled
      this.saveRemind(on ? { remind_enabled: true, remind_done_on: todayKST() } : { remind_enabled: false })
    },
    deviceLabel() {
      return /SamsungBrowser/.test(navigator.userAgent) ? '삼성 인터넷' : /Android/.test(navigator.userAgent) ? '안드로이드' : isIos() ? '아이폰' : '이 기기'
    },
    async install() {
      if (await promptInstall()) this.push.msg = ''
    },
    async onPush() {
      this.push.busy = true; this.push.msg = ''; this.push.err = false
      try {
        await enablePush()
        this.push.on = true
        this.push.msg = '알림을 켰어요. 시험 알림으로 잘 오는지 확인해 보세요.'
      } catch (e) {
        this.push.state = pushSupport()
        this.push.err = true
        this.push.msg = e.state === 'denied' ? '알림을 허용하지 않았어요.' : '알림을 켜지 못했어요. 잠시 뒤 다시 해 주세요.'
        console.error(e)
      } finally { this.push.busy = false }
    },
    async offPush() {
      this.push.busy = true; this.push.msg = ''; this.push.err = false
      try { await disablePush(); this.push.on = false; this.push.msg = '이 폰 알림을 껐어요.' } catch (e) {
        this.push.err = true; this.push.msg = '끄지 못했어요.'; console.error(e)
      } finally { this.push.busy = false }
    },
    async testPush() {
      this.push.busy = true; this.push.msg = ''; this.push.err = false
      try {
        await sendTestPush()
        this.push.msg = '보냈어요. 몇 초 안에 알림이 와요.'
      } catch (e) {
        this.push.err = true
        this.push.msg = e.userMessage || '보내지 못했어요. 알림 보내기 기능(Edge Function) 설정을 확인해 주세요.'
        console.error(e)
      } finally { this.push.busy = false }
    },
    downloadIcs() {
      downloadText('ledger-weekly-reminder.ics', buildIcs(this.remind, this.appUrl), 'text/calendar;charset=utf-8')
    },
    async toggleLock() {
      this.lockError = ''
      if (!lock.enabled) {
        this.pinStep = 1; this.firstPin = ''; this.pinError = ''; this.pinSheet = true
        return
      }
      this.busy = true
      try {
        await disableLock()
        lock.enabled = false
      } catch (e) {
        this.lockError = '잠금을 끄지 못했어요. 다시 해 주세요.'
        console.error(e)
      } finally { this.busy = false }
    },
    async onPin(pin) {
      this.pinError = ''
      if (this.pinStep === 1) {
        this.firstPin = pin
        this.pinStep = 2
        return
      }
      if (pin !== this.firstPin) {
        this.pinError = '두 번 입력한 숫자가 달라요. 처음부터 다시 해 주세요.'
        this.pinStep = 1; this.firstPin = ''
        return
      }
      this.busy = true
      try {
        await setLockPin(pin)
        lock.enabled = true
        this.pinSheet = false
      } catch (e) {
        this.pinError = '저장하지 못했어요. 다시 해 주세요.'
        this.pinStep = 1; this.firstPin = ''
        console.error(e)
      } finally { this.busy = false }
    },
    async chooseTimeout(sec) {
      const before = lock.timeout
      lock.timeout = sec
      try { await setLockTimeout(sec) } catch (e) {
        lock.timeout = before
        this.lockError = '바꾸지 못했어요.'
        console.error(e)
      }
    },
    openCsv() {
      const t = todayKST()
      this.csv = { ...this.csv, open: true, from: t.slice(0, 8) + '01', to: t, msg: '', err: false }
    },
    csvRange() {
      const t = todayKST()
      const { y } = parse(t)
      if (this.csv.kind === 'month') return [t.slice(0, 8) + '01', t]
      if (this.csv.kind === 'year') return [format(y, 1, 1), t]
      if (this.csv.kind === 'all') return ['2000-01-01', '2100-12-31']
      return this.csv.from <= this.csv.to ? [this.csv.from, this.csv.to] : [this.csv.to, this.csv.from]
    },
    async exportCsv() {
      const [from, to] = this.csvRange()
      if (!from || !to) { this.csv.msg = '기간을 골라 주세요.'; this.csv.err = true; return }
      this.csv.busy = true; this.csv.msg = ''; this.csv.err = false
      try {
        const txs = await listTransactions(from, to)
        if (!txs.length) { this.csv.msg = '이 기간에는 기록이 없어요.'; return }
        const name = this.csv.kind === 'all' ? `ledger_all_${todayKST()}.csv` : `ledger_${from}_${to}.csv`
        downloadText(name, toCsv(txs))
        this.csv.msg = `${txs.length}건을 내려받았어요.`
      } catch (e) {
        this.csv.msg = '만들지 못했어요. 다시 해 주세요.'; this.csv.err = true
        console.error(e)
      } finally { this.csv.busy = false }
    },
    async logout() {
      await signOut()
      this.$router.replace({ name: 'login' })
    }
  }
}
</script>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 14px; }
.account { padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
.account div { display: flex; flex-direction: column; }
.account strong { font-size: 16px; }
.account .muted { font-size: 13px; }
.avatar {
  width: 44px; height: 44px; border-radius: 22px; background: var(--surface-sunken);
  display: flex; align-items: center; justify-content: center; font-weight: 700;
}
.avatar.kakao { background: #FEE500; color: #191600; }
.avatar.google { background: var(--surface); border: 1.5px solid var(--text); }
.menu { display: flex; flex-direction: column; }
.menu h2 { margin: 0; padding: 14px 16px 4px 16px; font-size: 13px; font-weight: 600; color: var(--text-sub); }
.row {
  display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 0 16px;
  color: var(--text); text-decoration: none; font-size: 15px;
}
.row + .row { border-top: 1px solid var(--line-soft); }
.row-icon { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; }
.row-label { flex: 1; }
.chev { color: #B8A69C; }
.small { font-size: 12px; }
.logout { border: 0; background: transparent; text-align: left; color: var(--expense); width: 100%; }
.two-line { display: flex; flex-direction: column; }
.switch { position: relative; width: 52px; height: 32px; flex-shrink: 0; border: 0; border-radius: 16px; background: var(--border); transition: background 0.15s; }
.switch.on { background: #E8806A; }
.switch .knob { position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 13px; background: #FFFFFF; box-shadow: 0 1px 3px rgba(120, 90, 70, 0.25); transition: left 0.15s; }
.switch.on .knob { left: 23px; }
.timeout { flex-wrap: wrap; padding-top: 8px; padding-bottom: 8px; }
.timeout.disabled .row-label { color: var(--text-faint); }
.times { display: flex; gap: 6px; }
.times button { height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); font-size: 13px; }
.times button.on { border-color: #E8806A; background: #FFE6DA; color: #8E3F33; font-weight: 600; }
.lock-error { margin: 0; padding: 0 16px 12px 16px; font-size: 13px; color: var(--expense); }
.center { text-align: center; margin: 0; }
button.row { width: 100%; border: 0; background: transparent; text-align: left; }
.sheet-body { display: flex; flex-direction: column; gap: 12px; }
.sheet-body p { margin: 0; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { height: 36px; padding: 0 14px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); font-size: 13px; }
.chip.on { border: 1.5px solid #C96A55; background: #FFE6DA; color: #8E3F33; font-weight: 600; }
.dates { display: flex; align-items: center; gap: 6px; }
.dates input { flex: 1; min-width: 0; height: 44px; border: 1px solid var(--border); border-radius: 10px; padding: 0 8px; font-size: 15px; background: var(--surface); }
.pad { padding: 10px 16px 14px; line-height: 18px; }
.pad code { font-size: 11px; }
.remind-opts { flex-direction: column; align-items: stretch; gap: 10px; padding-top: 10px; padding-bottom: 14px; }
.remind-opts p { margin: 0; line-height: 18px; }
.days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.days button { height: 36px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); font-size: 13px; }
.days button.on { border-color: #E8806A; background: #FFE6DA; color: #8E3F33; font-weight: 700; }
.time-row { display: flex; align-items: center; justify-content: space-between; font-size: 14px; }
.time-row input { height: 38px; border: 1px solid var(--border); border-radius: 10px; padding: 0 10px; font-size: 15px; background: var(--surface); }
.cal-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.mini-btn { height: 38px; padding: 0 12px; border: 0; border-radius: 10px; background: #FFF1C7; color: #5E4710; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; text-decoration: none; }
.tiny { font-size: 11px; }
.push { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--surface-sunken); }
.push p { margin: 0; }
.push-on { font-size: 14px; font-weight: 600; color: #2E6A4E; }
.btn-push { height: 44px; border: 0; border-radius: 12px; background: var(--primary); color: var(--on-primary); font-size: 15px; font-weight: 700; }
.mini-btn.plain { background: var(--surface); color: #5A4E48; }
.mini-btn.install { background: var(--primary); color: var(--on-primary); }
.cal-alt summary { font-size: 13px; color: var(--text-sub); cursor: pointer; padding: 4px 0; }
.cal-alt .cal-btns { padding-top: 8px; }
</style>
