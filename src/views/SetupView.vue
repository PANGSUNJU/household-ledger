<template>
  <main class="page setup">
    <h1 class="page-title">처음 설정이 필요해요</h1>
    <div class="card box">
      <p>Supabase 연결 정보가 아직 없어요. 아래 순서대로 하면 돼요.</p>
      <ol>
        <li>Supabase에서 새 프로젝트를 만들어요.</li>
        <li><code>supabase/migrations/0001_init.sql</code> 내용을 SQL Editor에 붙여넣고 실행해요.</li>
        <li>프로젝트 폴더의 <code>.env.example</code> 을 복사해 <code>.env.local</code> 로 바꾸고, URL과 anon key를 넣어요.</li>
        <li>개발 서버를 다시 켜요 (<code>npm run dev</code>).</li>
      </ol>
      <p class="muted">자세한 방법은 README.md 에 있어요.</p>
    </div>
  </main>
</template>

<script>
export default { name: 'SetupView' }
</script>

<style scoped>
.box { padding: 16px 18px; font-size: 15px; line-height: 24px; }
.box p { margin: 0 0 8px 0; }
ol { margin: 0 0 8px 0; padding-left: 20px; }
code { background: var(--surface-sunken); border-radius: 6px; padding: 1px 6px; font-size: 13px; }
</style>
