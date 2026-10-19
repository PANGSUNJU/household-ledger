import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initAuth } from './lib/auth'
import { initPwa } from './lib/pwa'
import { commaDirective } from './lib/comma'
import sortable from './lib/sortable'
import './styles/tokens.css'

// 세션을 먼저 확인해야 첫 화면에서 로그인 여부를 판단할 수 있다
// 설치형 앱(서비스 워커)·설치 버튼 준비
initPwa()

// (확인이 실패해도 화면은 띄운다 — 로그인 화면으로 간다)
initAuth()
  .catch((e) => console.error('로그인 확인 실패', e))
  .finally(() => {
    createApp(App).use(router).directive('comma', commaDirective).directive('sortable', sortable).mount('#app')
  })
