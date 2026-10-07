# web-baseball-sim

Chrome에서 바로 실행되는 경량 3D 야구 **타격** 프로토타입입니다. (Three.js + Rapier, 외부 에셋 없음)

> 투수가 공을 던지고 → Space로 스윙 → 배트와 공이 충돌 → 타구가 필드로 날아가고 → 결과(EV / 발사각 / 비거리)가 표시됩니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
```

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입체크 + 프로덕션 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm test` | 헤드리스 코어 루프 테스트 (투구 → 스윙 → 컨택 → 타구) |

### 팀원 공유 (GitHub Pages)

`main`에 push하면 `.github/workflows/deploy.yml`이 테스트 → 빌드 → GitHub Pages 배포를 수행합니다.
최초 1회 저장소 **Settings → Pages → Source: GitHub Actions** 로 설정하세요.
주소: `https://<github-user>.github.io/web-baseball-sim/` (빌드가 `base: './'`라 어떤 경로에서도 동작)

## 조작

| 입력 | 동작 |
|---|---|
| **Space** / 화면 클릭·탭 | 스윙 |
| **R** | 리셋 / 새 투구 |
| **M** | 음소거 |
| **C** | 배트 충돌 볼륨 표시 (디버그) |

URL 옵션: `?pitches=fastball,curveball,slider,changeup` (구종 활성화, 기본은 직구만), `?debug` (충돌 볼륨 표시)

콘솔: `wbs.telemetry.download()` (세션 기록 JSON), `wbs.perf.snapshot()` (성능 스냅샷)

## 디렉터리 구조

```
src/
  main.ts                  부트스트랩 (로딩 화면, URL 옵션, window.wbs 디버그 핸들)
  config.ts                모든 튜닝 값 (물리·스윙·타이밍·카메라·연출)
  core/
    Game.ts                컴포지션 루트 + 투구 1회의 게임 규칙
    GameLoop.ts            고정 타임스텝(120Hz) 루프 + timeScale(히트스톱)
    GameState.ts           상태 머신 READY→PITCHING→BALL_IN_FLIGHT→SWING→CONTACT|MISS→RESULT
  baseball/
    Baseball.ts            Rapier 강체 + 공 메시 + 궤적 트레일
    Pitch.ts               구종 데이터(속도·회전수·회전축·자이로) / PitchPlan
    PitchManager.ts        구종·코스 선택 + 궤적 솔버 (투수 AI 확장 지점)
  batter/
    BatPhysics.ts          스윙 운동학, 스윕 충돌 판정, 타구 계산 (순수 함수)
    Bat.ts                 배트 메시 (BatPhysics 포즈를 그대로 표시)
    Batter.ts              타자 피규어 + 스윙 상태
    BatterController.ts    "스윙" 의도 → 실제 스윙 (자동 조준; 입력 장치 확장 지점)
  physics/
    BaseballPhysics.ts     항력 + 마그누스 + 오프라인 궤적 시뮬레이터 (순수 함수)
    PhysicsWorld.ts        Rapier 월드 (동적 import로 첫 화면 빠르게)
  input/
    InputManager.ts        장치 독립 액션 큐
    KeyboardInput.ts       키보드
    PointerInput.ts        마우스/터치 (모바일 탭 스윙)
  camera/
    CameraRig.ts           CameraDirector: 지수 스무딩 전환 + 화면 흔들림
    BattingCamera.ts       포수 뒤 타격 시점
    BallCamera.ts          타구 추적 시점
  players/                 프리미티브 투수·포수·인체 피규어 (GLB로 교체 예정)
  world/
    Stadium.ts             프리미티브 야구장 + 바닥/펜스 콜라이더 (Ballpark 인터페이스)
    Environment.ts         하늘·안개·조명·그림자
    FieldDimensions.ts     펜스 거리, 페어/파울, 베이스 좌표 (순수 함수)
  gameplay/
    TimingJudge.ts         타이밍 판정
    HitResult.ts           타구 분류, 스트라이크존, PlayRecord
    Telemetry.ts           투구별 기록 + 세션 통계
  performance/
    PerformanceMonitor.ts  FPS, 프레임타임(p95), 구간별 CPU, Draw Calls, Triangles, 메모리
  audio/SoundFX.ts         WebAudio 합성 효과음 (파일 없음)
  ui/HUD.ts                DOM HUD (변경 시에만 갱신)
tests/core-loop.test.ts    헤드리스 코어 루프 테스트
```

## 라이브러리

| 패키지 | 용도 |
|---|---|
| `three` | 렌더링 |
| `@dimforge/rapier3d-compat` | 물리 (WASM 내장 빌드라 Vite 설정 불필요, 동적 로딩) |
| `vite`, `typescript` | 개발 서버 / 빌드 |
| `vitest` | 테스트 |

## 투구 물리

- 좌표계: 홈플레이트 원점, +Y 위, 투수는 −Z, 포수는 +Z, 우타자는 −X 쪽.
- 공은 Rapier **dynamic rigid body** (중력, CCD, 바닥/펜스 충돌, 반발). 매 스텝 전에 `BaseballPhysics.aeroAcceleration`으로 **항력** `-k|v|v`와 **마그누스** `S(ω×v)`를 속도에 더합니다.
- 구종은 회전수 / 회전축 기울기(tilt) / 자이로 비율로 정의 → 회전 벡터 ω.
- `solvePitchVelocity`: 실시간 루프와 **같은 적분기**로 오프라인 시뮬레이션하며 슈팅 방식으로 초기 속도를 보정 → 변화구도 목표 코스에 정확히 도착(오차 < 2cm, 테스트로 검증). Rapier 실제 궤적과의 차이는 약 1mm 수준.
- 같은 시뮬레이터로 "공이 이상적 컨택 지점에 도착하는 시각"을 미리 계산해 타이밍 판정에 사용합니다.

## 타격 물리

- 스윙은 해석적 함수: 배트 각 θ(t)가 가속(θ ∝ t²)으로 컨택 각(플레이트와 수직)에 0.16초에 도달한 뒤 감속하는 팔로스루. `batPoseAt`이 **화면의 배트와 충돌 판정을 동시에** 만듭니다.
- 충돌: 공(~40 m/s)과 배트 끝(~25 m/s)이 빨라 한 스텝 안에서 터널링되므로, 각 물리 스텝을 10개 구간으로 나눠 **구-캡슐 스윕 테스트**를 합니다(`sweepBatBall`).
- 타구 속도: `EV = (q·v_pitch + (1+q)·v_bat) × 스윗스팟 × 상하 중심 × 타이밍` (q=0.2, 실제 야구 충돌 공식 기반 아케이드 보정)
  - v_bat: 컨택 순간 각속도 × 손에서의 거리
  - 스윗스팟: 손에서 0.74m, 멀어질수록 감소 (몸쪽 볼은 먹히고 끝에 맞으면 약함)
  - 발사각: 공 중심이 배트 축보다 위/아래인 정도 (밑을 치면 뜬공, 위를 치면 땅볼)
  - 방향: 컨택 순간 배트 진행 방향 → **빠르면 당겨치기, 늦으면 밀어치기**
  - 스윙 평면이 각도에 따라 살짝 올라가서 빠른 스윙은 땅볼, 늦은 스윙은 뜬공 경향
- 아케이드 보정: 스윙 높이와 손 위치를 예측 투구 위치로 자동 조준(작은 무작위 오차 포함). 플레이어는 **타이밍**에 집중합니다.
- 결과: 펜스를 펜스 높이 이상으로 넘으면 홈런, 페어/파울은 낙구 지점 각도(±45°), 페어는 발사각으로 분류(땅볼 <10°, 라인드라이브 <25°, 뜬공 <50°, 팝업). 비거리는 첫 낙구 지점(땅볼은 굴러간 거리 포함, 홈런은 예상 비거리).

## 타이밍 판정

`Δ = (배트가 이상적 컨택 각에 도달하는 시각) − (공이 이상적 컨택 평면 z=−0.3m에 도달하는 시각)`

| \|Δ\| | 판정 | 타구 계수 |
|---|---|---|
| ≤ 16ms | Perfect | 1.00 |
| ≤ 34ms | Early / Late | 0.90 |
| 그 외 | Too Early / Too Late | 0.74 |

기하학적으로 맞출 수 있는 범위는 대략 ±50~60ms이고, 그 밖은 헛스윙입니다. 화면 하단 타이밍 미터가 스윙 위치를 보여줍니다.

## 측정 기준 (헤드리스 Chrome, 자동 타자)

| 타이밍 | 결과 예시 |
|---|---|
| Perfect | 150~167 km/h, 22~34°, 109~126 m (일부 홈런) |
| Early (−20ms) | 131~141 km/h, 당겨친 방향, 98~109 m |
| Late (+30ms) | 99~129 km/h, 밀어친 방향, 67~97 m |

장면 비용: Draw Calls 약 45~110, Triangles 약 6k~12k.

## 주요 클래스

| 클래스 | 역할 |
|---|---|
| `Game` | 시스템 조립, 투구 1회의 규칙(투구·스윙·컨택·포구·결과) |
| `GameStateMachine` | 허용된 상태 전이만 수행, 상태 변화 이벤트 |
| `GameLoop` | 고정 스텝 누산기, 렌더 보간, 히트스톱 |
| `PitchManager` | 구종·코스 결정 → `PitchPlan` (솔브된 속도, 도착 시각, 컨택 지점) |
| `Baseball` | Rapier 강체 + 공기역학 적용 + 시각화 |
| `BatPhysics` | 스윙 운동학 / 스윕 충돌 / 타구 계산 (DOM·Rapier 의존 없음 → 테스트 가능) |
| `Batter` / `BatterController` | 스윙 상태·시각화 / 입력 의도 → 스윙 |
| `InputManager` | 장치 → 액션 큐 (키보드, 포인터; 게임패드·자이로·MediaPipe 확장 지점) |
| `CameraDirector` | 리그(타격/타구) 간 지수 스무딩 전환, 흔들림 |
| `PerformanceMonitor` | 게임과 독립된 성능 측정 |
| `Telemetry` | 투구별 기록, 세션 통계, JSON 내보내기 |

## 오피스 아워 원칙 적용

YC 오피스 아워(Garry Tan) 방식으로 범위를 점검하고 다음을 반영했습니다.

1. **핵심 루프 하나만** — 9이닝·주자·수비는 만들지 않음. 접속 2초 안에 첫 투구, 메뉴 없음.
2. **손맛이 제품** — 히트스톱, 화면 흔들림, 합성 타격음, 큰 판정 문구, 공 궤적 트레일.
3. **실패 이유를 보여주기** — 타이밍 미터(ms 단위), 투구 위치 마커, 스트라이크존.
4. **측정** — 투구별 텔레메트리(타이밍 오차, EV, 발사각, 비거리)와 세션 통계, 성능 패널.
5. **빠른 튜닝 루프** — 모든 수치는 `config.ts` 한 곳에.
6. **공유 가능한 링크** — GitHub Pages 자동 배포, 모바일은 탭으로 스윙.
7. **코어 루프 회귀 방지** — 투구→스윙→컨택→타구를 헤드리스로 검증하는 테스트.
8. **확장은 인터페이스로만** — 미래 기능은 구현하지 않고 연결 지점만(`Ballpark`, `InputSource`, `CameraRig`, `PitchManager`, `BatterController`).

## 현재 한계

- 선수는 프리미티브 도형이고 애니메이션이 단순합니다(IK 없음).
- 조준이 자동이라 코스 공략이나 어퍼·다운스윙을 선택할 수 없습니다.
- 수비·주루·카운트·이닝이 없습니다(결과는 타구 분류까지만).
- 배트-공 반응은 Rapier 접촉이 아닌 아케이드 모델입니다(충돌 검출은 스윕 기반).
- 관중석에는 콜라이더가 없습니다(홈런 공은 관중석 표면에 "착지" 처리).
- 오디오는 합성음이고, 그림자는 내야 주변만 덮습니다.
- 입력은 다음 고정 스텝에서 처리되어 최대 약 8ms 양자화가 있습니다.

## 다음 개발 우선순위

1. **실제 플레이테스트 5명** → 텔레메트리로 타이밍 창과 투구 속도 튜닝
2. 카운트(스트라이크/볼/아웃)와 짧은 게임 모드(예: 홈런 더비 10구)로 반복 동기 만들기
3. 구종 혼합 + 간단한 투수 AI(카운트별 구종/코스)
4. 조준 입력(마우스/자이로)으로 코스 공략 추가 → 이후 MediaPipe 스윙
5. GLB 타자 모델 + 스윙 애니메이션, GLB 야구장(`Ballpark` 구현)
6. 성능 실험 시작: Instancing(관중/라인), KTX2/Meshopt, WebGPU 렌더러 비교
