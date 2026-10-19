# 배포하기 (폰에서 언제든 쓰기)

> 지금은 `npm run dev`로 내 PC에서만 열려요. 배포하면 `https://household-ledger.○○.workers.dev` 같은 주소가 생겨서
> 밖에서도 폰으로 열 수 있고, 홈 화면에 앱처럼 추가할 수 있어요. 비용은 0원이에요.

## 1. 어디에 올릴지 (추천: Cloudflare)

| 서비스 | 무료로 되는 것 | 메모 |
|---|---|---|
| **Cloudflare (Workers & Pages)** (추천) | 정적 파일 무료, 파일 하나 25MB까지 | 개인·상업 구분 없이 무료. 이 앱의 가장 큰 파일(글자 읽기 엔진)이 약 5MB라 넉넉해요 |
| Vercel (Hobby) | 개인 비상업 용도 무료 | 설정 파일 `vercel.json` 이미 있음 |

요금제는 바뀔 수 있으니 가입할 때 한 번 확인하세요.

## 2. Cloudflare 에 올리기 (Workers & Pages)
1. https://dash.cloudflare.com 가입 → **Workers & Pages** → **Create** → **Import a repository** → GitHub 저장소 `household-ledger` 선택
2. 빌드 설정
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy` (기본값 그대로)
   - 저장소의 `wrangler.jsonc` 가 "빌드된 `dist` 폴더를 올리고, 없는 주소도 앱 화면을 보여줘" 라고 알려줘요.
3. **빌드할 때 쓰는 변수** 두 개 추가 — 프로젝트 → **Settings → Build → Variables and secrets** (`.env.local` 과 같은 값)
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - **Encrypt(암호화)는 누르지 않아요.** 원래 공개되는 값이고, 빌드 때 읽혀야 해요.
   - ⚠️ `service_role` 키는 절대 넣지 않아요.
   - 변수를 넣거나 바꾼 뒤에는 **Deployments → 다시 배포(Retry)** 해야 반영돼요.
4. 몇 분 뒤 `https://household-ledger.<계정이름>.workers.dev` 같은 주소가 나와요.
5. 이후엔 GitHub `main`에 올릴 때마다 자동으로 다시 배포돼요.

> 배포 주소를 열었는데 로그인 화면 대신 "연결 정보를 넣어 주세요" 화면이 나오면, 3번 변수가 **Build** 쪽에 들어갔는지 확인하세요.

## 3. 배포 주소를 로그인에 등록 (안 하면 로그인 후 localhost로 가요)
배포 주소를 `https://<배포 주소>` 라고 할 때:

| 어디 | 무엇을 |
|---|---|
| Supabase → Authentication → URL Configuration | **Site URL** 을 배포 주소로 바꾸기 (PC 개발용 localhost 는 Redirect URLs 에 남겨 두기) |
| 같은 곳 → Redirect URLs | `https://<배포 주소>` 와 `https://<배포 주소>/**` 추가 |
| Google Cloud → 클라이언트 → 승인된 JavaScript 원본 | `https://<배포 주소>` 추가 |
| 카카오 | 바꿀 것 없음 (Supabase Callback URL 하나로 충분) |

## 4. 폰에 앱으로 설치
- **갤럭시(크롬)**: 배포 주소 열기 → 앱 **설정 → 앱으로 설치 → 설치** (또는 크롬 메뉴 ⋮ → **앱 설치**). 앱 서랍에 아이콘이 생기고 주소창 없이 열려요.
- **아이폰(사파리)**: 배포 주소 열기 → 공유 버튼 → **홈 화면에 추가**
- 아이콘·이름(가계부)·배경색은 `public/manifest.webmanifest` 에 있어요.

## 5. 주간 정리 알림 켜기
설정 → 알림 → 주간 정리 알림 켜기 → 요일·시간 고르기 → **이 폰으로 알림 받기** (8번 설정을 마친 뒤).
정한 시간이 되면 폰 알림이 오고, 그 뒤 앱을 열면 앱 안에서도 "이번 주 정리할까요?"가 보여요.
(알림을 못 쓰는 경우 '알림 대신 폰 캘린더에 넣기'도 있어요.)

## 6. 데이터 보관 (0원 요금제에서 챙길 것)
- Supabase 무료 프로젝트는 **일주일 넘게 아무도 쓰지 않으면 일시 정지**될 수 있어요. 가계부를 매일 쓰면 걱정 없고, 정지 경고 메일이 오면 대시보드에 한 번 들어가면 돼요.
- 정지돼도 데이터는 남아 있지만, 안심용으로 **설정 → CSV로 내보내기 → 전체** 를 한 달에 한 번 받아 두면 좋아요.
- 무료 요금제 DB 용량(500MB)은 기록 수십만 건까지 넉넉해요. 이미지는 저장하지 않아서 용량을 쓰지 않아요.

## 7. SQL 실행 순서 (새 Supabase 프로젝트로 옮길 때)
SQL Editor 에서 번호 순서대로 한 번씩:
1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_recurring.sql`
3. `supabase/migrations/0003_budget_store_remind.sql`
4. `supabase/migrations/0004_push.sql`
5. `supabase/migrations/0005_weekend_same.sql`
6. `supabase/migrations/0006_no_fixed_category.sql`
7. `supabase/migrations/0007_quick_memo.sql`
8. (8번을 마친 뒤) `supabase/cron-send-reminders.sql`

## 8. 폰 푸시 알림 켜기 (0원, 한 번만)
알림은 **https 배포 주소**에서만 동작해요. 2~3번(배포)을 먼저 해 주세요.

**① 알림 열쇠 한 쌍 만들기** — 내 PC 터미널에서:
```bash
npx web-push generate-vapid-keys
```
`Public Key` 와 `Private Key` 두 줄이 나와요. (비밀 열쇠는 어디에도 적어 두지 말고 아래에만 넣어요)

**② 공개 열쇠를 앱에 넣기**
- Cloudflare → 프로젝트 → Settings → Build → Variables and secrets 에 `VITE_VAPID_PUBLIC_KEY` = Public Key 추가 → 다시 배포
- (PC에서 시험하려면 `.env.local` 에도 같은 줄 추가)

**③ 비밀값을 Supabase 에 넣기** — Supabase → **Edge Functions → Secrets** → Add:
| 이름 | 값 |
|---|---|
| `VAPID_PUBLIC_KEY` | Public Key |
| `VAPID_PRIVATE_KEY` | Private Key |
| `VAPID_SUBJECT` | `mailto:내이메일` |
| `CRON_SECRET` | 아무도 모를 긴 글자 (예: 비밀번호 생성기로 40자) |

**④ 알림 보내기 함수 올리기** — Supabase → **Edge Functions → Deploy a new function → Via Editor**
- 이름: `send-reminders`
- 내용: `supabase/functions/send-reminders/index.ts` 전체 붙여넣기 → **Deploy**
- 올린 뒤 함수 **Settings** 에서 **Enforce JWT verification(JWT 확인)** 을 **끄기** → Save
  (10분마다 예약 실행이 로그인 없이 부르기 때문. 함수 안에서 `CRON_SECRET` 또는 로그인 사용자를 직접 확인해요)
- CLI 를 쓴다면: `npx supabase functions deploy send-reminders` (설정은 `supabase/config.toml`)

**⑤ 10분마다 확인하도록 예약** — SQL Editor 에 `supabase/cron-send-reminders.sql` 을 붙여넣고
`<프로젝트ID>`, `<CRON_SECRET>` 두 군데를 바꿔서 **Run** (파일에는 진짜 값을 저장하지 마세요)

**⑥ 폰에서 확인**
1. 갤럭시 크롬으로 배포 주소 열기 → 설정 → **앱으로 설치**
2. 설치한 앱에서 설정 → 알림 → 주간 정리 알림 켜기 → **이 폰으로 알림 받기** → 허용
3. **시험 알림 보내기** → 몇 초 안에 폰 알림이 오면 끝

**안 될 때**
| 보이는 것 | 확인할 곳 |
|---|---|
| "폰 알림은 배포할 때 알림 열쇠를…" | ② `VITE_VAPID_PUBLIC_KEY` 넣고 다시 배포했는지 |
| 시험 알림 "보내지 못했어요" | ③ 비밀값 4개, ④ 함수 이름 `send-reminders`, JWT 확인 끔 |
| 시험 알림은 오는데 정한 시간에 안 옴 | ⑤ 예약: `select * from cron.job_run_details order by start_time desc limit 5;` |
| 알림이 막혀 있어요 | 폰 설정 → 애플리케이션 → 가계부(또는 크롬) → 알림 허용 |
| 갤럭시 절전 때문에 늦게 옴 | 설정 → 배터리 → 백그라운드 사용 제한에서 크롬/가계부를 '제한 없음' |

비용: Edge Function 은 한 달 50만 번까지 무료인데, 10분마다 확인하면 한 달 약 4,300번이라 넉넉해요.
