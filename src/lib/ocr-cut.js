/*
 * 긴 캡처를 자를 자리 고르기 (화면 없이 계산만 해서 시험하기 쉽게 따로 둠)
 */

/** 가로줄마다 밝기 차이(글자 흔적)를 재서, 목표 높이 근처에서 가장 깨끗한 줄을 고른다 */
export function pickCuts(data, aw, ah, ratio, sh, piece) {
  if (sh <= piece * 1.4) return [0, sh]   // 폰 한 화면쯤이면 자르지 않음
  const ink = new Float32Array(ah)
  for (let y = 0; y < ah; y++) {
    let min = 255, max = 0, sum = 0
    for (let x = 0; x < aw; x++) {
      const i = (y * aw + x) * 4
      const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      if (g < min) min = g
      if (g > max) max = g
      sum += g
    }
    const mean = sum / aw
    let dev = 0
    for (let x = 0; x < aw; x++) {
      const i = (y * aw + x) * 4
      dev += Math.abs(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 - mean)
    }
    ink[y] = dev / aw + (max - min) * 0.05
  }
  const cuts = [0]
  const step = piece / ratio, win = step * 0.25
  let at = 0
  while (ah - at > step * 1.4) {
    const target = at + step
    let best = Math.round(target), bestScore = Infinity
    for (let y = Math.round(target - win); y <= Math.round(target + win); y++) {
      if (y <= at + 2 || y >= ah - 2) continue
      // 위아래 한 줄씩도 비어 있어야 깨끗한 틈 (글자 가운데를 자르지 않게)
      const score = ink[y] + ink[y - 1] + ink[y + 1] + Math.abs(y - target) / win * 0.5
      if (score < bestScore) { bestScore = score; best = y }
    }
    cuts.push(Math.round(best * ratio))
    at = best
  }
  cuts.push(sh)
  return cuts
}
