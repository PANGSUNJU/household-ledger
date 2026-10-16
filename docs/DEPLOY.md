# 배포하기 (폰에서 언제든 쓰기)

> 지금은 `npm run dev`로 내 PC에서만 열려요. 배포하면 `https://내가계부.pages.dev` 같은 주소가 생겨서
> 밖에서도 폰으로 열 수 있고, 홈 화면에 앱처럼 추가할 수 있어요. 비용은 0원이에요.

## 1. 어디에 올릴지 (추천: Cloudflare Pages)

| 서비스 | 무료로 되는 것 | 메모 |
|---|---|---|
| **Cloudflare Pages** (추천) | 한 달 빌드 500번, 파일 2만 개, 파일 하나 25MB까지 | 개인·상업 구분 없이 무료. 이 앱의 가장 큰 파일(글자 읽기 엔진)이 약 5MB라 넉넉해요 |
| Vercel (Hobby) | 개인 비상업 용도 무료 | 설정 파일 `vercel.json` 이미 있음 |
| Netlify | 무료 요금제 | 설정 파일 `public/_redirects` 이미 있음 |

요금제는 바뀔 수 있으니 가입할 때 한 번 확인하세요.

## 2. Cloudflare Pages에 올리기
1. https://dash.cloudflare.com 가입 → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. GitHub 저장소 `household-ledger` 선택
3. 빌드 설정
   - Framework preset: **Vue** (또는 None)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables** 에 두 개 추가 (`.env.local` 과 같은 값)
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - ⚠️ `service_role` 키는 절대 넣지 않아요.
5. **Save and Deploy** → 몇 분 뒤 `https://<이름>.pages.dev` 주소가 나와요.
6. 이후엔 GitHub `main`에 올릴 때마다 자동으로 다시 배포돼요.

## 3. 배포 주소를 로그인에 등록 (안 하면 로그인 후 localhost로 가요)
배포 주소를 `https://<이름>.pages.dev` 라고 할 때:

| 어디 | 무엇을 |
|---|---|
| Supabase → Authentication → URL Configuration | **Site URL** 을 배포 주소로 바꾸기 (PC 개발용 localhost 는 Redirect URLs 에 남겨 두기) |
| 같은 곳 → Redirect URLs | `https://<이름>.pages.dev` 와 `https://<이름>.pages.dev/**` 추가 |
| Google Cloud → 클라이언트 → 승인된 JavaScript 원본 | `https://<이름>.pages.dev` 추가 |
| 카카오 | 바꿀 것 없음 (Supabase Callback URL 하나로 충분) |

## 4. 폰 홈 화면에 추가
- **아이폰(사파리)**: 배포 주소 열기 → 공유 버튼 → **홈 화면에 추가**
- **안드로이드(크롬)**: 배포 주소 열기 → 메뉴(⋮) → **홈 화면에 추가** 또는 **앱 설치**
- 아이콘·이름(가계부)·배경색은 `public/manifest.webmanifest` 에 있어요.

## 5. 주간 정리 알림 켜기
설정 → 알림 → 주간 정리 알림 켜기 → 요일·시간 고르기 → **폰 캘린더에 추가** (아이폰) 또는 **구글 캘린더에 추가** (안드로이드).
폰 캘린더가 매주 그 시간에 알려주고, 그 뒤 앱을 열면 앱 안에서도 "이번 주 정리할까요?"가 보여요.

## 6. 데이터 보관 (0원 요금제에서 챙길 것)
- Supabase 무료 프로젝트는 **일주일 넘게 아무도 쓰지 않으면 일시 정지**될 수 있어요. 가계부를 매일 쓰면 걱정 없고, 정지 경고 메일이 오면 대시보드에 한 번 들어가면 돼요.
- 정지돼도 데이터는 남아 있지만, 안심용으로 **설정 → CSV로 내보내기 → 전체** 를 한 달에 한 번 받아 두면 좋아요.
- 무료 요금제 DB 용량(500MB)은 기록 수십만 건까지 넉넉해요. 이미지는 저장하지 않아서 용량을 쓰지 않아요.

## 7. SQL 실행 순서 (새 Supabase 프로젝트로 옮길 때)
SQL Editor 에서 번호 순서대로 한 번씩:
1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_recurring.sql`
3. `supabase/migrations/0003_budget_store_remind.sql`
