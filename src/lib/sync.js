/*
 * 화면 사이 데이터 맞추기
 *  · 기록·분류·결제수단·고정 항목·예산 등을 저장/삭제하면 version 이 1 올라간다 (api.js 에서)
 *  · 메뉴 화면(캘린더·내역·통계)은 닫지 않고 기억해 두었다가, 다시 볼 때
 *    version 이 바뀌었거나 1분이 지났거나 날짜가 바뀌었으면 뒤에서 조용히 새로 받는다
 *  · 분류·결제수단처럼 거의 안 바뀌는 목록은 한 번 받아 두고 같이 쓴다 (저장하면 비움)
 */
import { reactive } from 'vue'
import { todayKST } from './date'

export const dataState = reactive({ version: 0 })
const cache = new Map()

/** 무언가 저장·삭제됨 → 모든 화면에 '새로 받아' 표시, 기억해 둔 목록 비움 */
export function bump() {
  dataState.version++
  cache.clear()
}

/** 로그아웃 등: 기억해 둔 목록 비움 */
export function clearCache() { cache.clear() }

/** 한 번 받아 두고 같이 쓰기. 화면이 고쳐도 서로 영향 없게 한 줄씩 복사해서 준다 */
export function cachedList(key, fetcher) {
  if (!cache.has(key)) {
    const p = fetcher().catch((e) => { cache.delete(key); throw e })
    cache.set(key, p)
  }
  return cache.get(key).then((rows) => rows.map((r) => ({ ...r })))
}

const STALE_MS = 60 * 1000

/**
 * 메뉴 화면용: 다시 보일 때(activated) 새로 받아야 하는지
 *  화면은 불러오기에 성공하면 markFresh(받기 시작할 때의 version) 를 부른다
 */
export const freshness = {
  data() { return { freshVer: -1, freshAt: 0, freshDay: '' } },
  methods: {
    markFresh(ver) { this.freshVer = ver; this.freshAt = Date.now(); this.freshDay = todayKST() },
    needsRefresh() {
      return this.freshVer !== dataState.version || Date.now() - this.freshAt > STALE_MS || this.freshDay !== todayKST()
    }
  }
}
