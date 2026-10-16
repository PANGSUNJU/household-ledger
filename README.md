# 내 가계부 (household-ledger)

입력이 귀찮지 않아서 계속 쓰게 되는 개인 가계부 웹앱.

- 기술: Vue 3 (Options API) + Vite + Supabase (운영비 0원)
- 디자인: 디자인 캔버스 "가계부 화면 구상" → **기본 + 파스텔 색** 페이지
- 요구사항·결정 기록: `docs/` (SPEC.md, PROJECT-BRIEF.md, adr/)

## 지금 상태: ① 최소 버전의 뼈대

| 구분 | 상태 |
|---|---|
| 프로젝트 구조, 색 토큰, 라우터 | ✅ |
| DB 표·보안 규칙·기본값 SQL + 규칙 테스트 25개 | ✅ |
| 로그인 (카카오·구글 버튼, 개발용 이메일 로그인, "지난번 로그인" 표시) | ✅ |
| 캘린더 (월 이동, 날짜별 가게·금액, 그날 내역, 이번 달 합계) | ✅ 실제 데이터 |
| 하단 메뉴, 설정 메뉴, 로그아웃, 인터넷 끊김 안내 | ✅ |
| 기록 입력 (금액 계산기, 빠른 입력, 분류 버튼, 결제수단 바로 등록, 가게별 기본값, 수정·삭제) | ✅ |
| 환불 입력 (원래 구매 찾기 → 원래 금액·돌려받은 돈·수수료, 못 찾으면 분류 직접 선택) | ✅ |
| 구글·카카오 로그인이 꺼져 있을 때 로그인 화면 안에서 안내 | ✅ |
| 내역 (월별 목록, 날짜별 묶음, 전체/지출/수입, 가게·메모·금액 검색, 환불 수수료 표시) | ✅ |
| 통계 (이번 달 쓴 돈·환불 반영, 지난달 같은 기간 대비, 저축/투자 따로, 분류별·가게별·결제수단별) | ✅ |
| 결제수단·분류·자주 쓰는 내역 관리 (추가, 이름·색 바꾸기, 숨기기, 순서 바꾸기) | ✅ |
| 화면 잠금 (설정에서 켜기, 비밀번호 두 번 입력, 다시 묻는 시간, 잊으면 다시 로그인) | ✅ |
| 캡처로 입력 (카드 앱 화면 분석) | ⬜ ③ 단계 |

---

## 처음 실행하기

### 1. 필요한 것
- Node.js 20 이상 (`node -v` 로 확인)

### 2. 설치
```bash
npm install
```

### 3. Supabase 프로젝트 만들기
1. https://supabase.com 에 가입하고 **New project** 를 눌러요.
   - Region: **Northeast Asia (Seoul)** 추천
   - Database password 는 따로 적어 두세요 (앱에서는 안 써요)
2. 왼쪽 메뉴 **SQL Editor** → **New query**
3. `supabase/migrations/0001_init.sql` 내용을 전부 붙여넣고 **Run**
   - "Success. No rows returned" 가 나오면 성공

### 4. 연결 정보 넣기
1. Supabase 왼쪽 메뉴 **Project Settings → API**
2. `.env.example` 을 복사해서 `.env.local` 로 이름을 바꾸고 아래 두 값을 넣어요.
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = `anon` `public` 키
   - ⚠️ `service_role` 키는 절대 넣지 마세요.

### 5. 실행
```bash
npm run dev
```
- PC: http://localhost:5173
- 폰(같은 와이파이): 터미널에 나오는 `Network:` 주소

### 6. 개발용 로그인 (소셜 로그인 설정 전)
로그인 화면 아래 **개발용 이메일 로그인** 칸에 이메일을 넣고 받은 링크를 누르면 돼요.
(`npm run dev` 에서만 보여요.)

Supabase **Authentication → URL Configuration** 의 **Site URL** 을 `http://localhost:5173` 으로 해 두세요.
가입하면 현금 결제수단과 기본 분류(지출 9개, 수입 급여·환불)가 자동으로 만들어져요.

---

## 소셜 로그인 켜기 (배포 전에 해도 돼요)

### 먼저 Supabase에서
- **Authentication → URL Configuration**
  - **Site URL**: `http://localhost:5173` (기본값 `localhost:3000` 그대로면 로그인 후 3000번으로 가서 안 열려요)
  - **Redirect URLs**: `http://localhost:5173/**`, 폰 테스트용 `http://<PC 내부 IP>:5173/**`
- **Sign In / Providers → Kakao·Google** 의 **Callback URL** (`https://<프로젝트ID>.supabase.co/auth/v1/callback`) 을 복사해 둔다

### 카카오 (무료, 로그인 API는 사용량 한도에도 안 잡힘)
1. https://developers.kakao.com → 앱 만들기
2. **앱 → 일반**: 앱 아이콘 올리기 → **개인 개발자 비즈 앱 전환** (무료, 사업자 등록 필요 없음. 이메일 동의항목 때문에 필요)
3. **앱 → 플랫폼 키 → REST API 키** (JavaScript 키 아님)
   - **카카오 로그인 리다이렉트 URI**: 위 Callback URL
   - **클라이언트 시크릿** 코드 복사, 사용함 확인
4. **카카오 로그인 → 일반**: 상태 ON
5. **카카오 로그인 → 동의항목**: 닉네임(필수), 프로필 사진(선택), 카카오계정 이메일(선택)
   - Supabase가 이 세 가지를 항상 요청해서, 하나라도 꺼져 있으면 `KOE205`
6. Supabase **Providers → Kakao**: REST API 키, Client Secret Code 입력, **Allow users without an email** 켜기, Kakao enabled 켜고 **Save**
   - Client Secret 칸이 비어 있으면 Save가 안 돼서 꺼진 채로 남는다

자주 보는 오류: `KOE004` 로그인 OFF · `KOE006` 리다이렉트 URI 미등록·오타 · `KOE205` 동의항목 꺼짐

### 구글
1. Google Cloud Console → 새 프로젝트 → **Google 인증 플랫폼**
2. 브랜딩 입력, 대상은 "외부" + **테스트 사용자에 내 Gmail 추가** (혼자 쓰면 테스트 상태 그대로 OK)
3. 클라이언트 → 웹 애플리케이션
   - 승인된 자바스크립트 원본: `http://localhost:5173`
   - 승인된 리디렉션 URI: 위 Callback URL
4. Supabase **Providers → Google** 에 Client ID / Secret 입력 후 켜고 **Save**

> 카카오와 구글은 서로 다른 가계부로 저장돼요 (계정 묶기 안 함 — SPEC 결정).

---

## 명령어

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 배포용 빌드 (`dist/`) |
| `npm run test:db` | DB 규칙 테스트 (인터넷 없이 내 컴퓨터에서 실행) |

`test:db` 가 확인하는 것: 기본값 자동 생성, 다른 사람 데이터 차단, 환불 연결 시 분류 자동 지정, 환불 분류 보호, 잠금 비밀번호(원래 숫자 저장 안 함) 등 25개.

---

## 폴더 구조

```
src/
  styles/tokens.css    색·모양 값 (디자인과 같은 값, 화면에서는 변수만 사용)
  lib/
    supabase.js        Supabase 연결
    auth.js            로그인 상태, 카카오·구글·이메일 로그인
    api.js             데이터 읽기·저장 (저장은 반드시 여기를 거친다)
    date.js            한국 날짜 계산 (toISOString 쓰지 말 것)
    money.js           금액 표시, 금액 칸 계산기 (36000/3)
    stats.js           통계 계산 (환불 차감, 저축/투자 분리)
  components/          하단 메뉴, 화면 머리, 아이콘, 인터넷 끊김 안내
  views/               화면별 파일
  router/index.js      화면 주소, 로그인 확인
supabase/
  migrations/0001_init.sql   DB 표·보안 규칙·기본값
  tests/db-rules.test.mjs    DB 규칙 테스트
docs/                  SPEC, 브리프, 결정 기록
```

## 지켜야 할 규칙 (SPEC에서)
- 날짜는 `src/lib/date.js` 함수로만 다룬다. 한국 시간 0~9시에 하루 밀리는 실수 방지.
- 금액은 원 단위 정수.
- 카드번호·계좌번호는 저장하지 않는다.
- 결제수단·분류는 지우지 않고 숨긴다 (`is_active`).
- 데이터 저장은 `src/lib/api.js` 한곳에서 (나중에 오프라인 입력 붙이기 쉽게).
