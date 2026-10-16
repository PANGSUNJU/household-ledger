import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initAuth } from './lib/auth'
import './styles/tokens.css'

// 세션을 먼저 확인해야 첫 화면에서 로그인 여부를 판단할 수 있다
initAuth().then(() => {
  createApp(App).use(router).mount('#app')
})
