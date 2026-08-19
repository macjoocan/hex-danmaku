---
paths:
  - "app.jsx"
  - "screens.jsx"
---

# UI 코드 규칙

- 게임 상태는 엔진(`window.HX`)이 소유한다 — UI는 `tick` 호출과 표시만 담당하고,
  상태를 직접 변형하거나 밸런스 수치를 재정의하지 마라.
- 스크립트 로드 순서(engine → stages → resources → sprites → screens → app)를 깨는
  참조를 만들지 마라 — 각 파일은 `window.*` export로만 통신한다.
- 진행도 저장은 localStorage 경유(기존 패턴 유지).
- 연출(파티클·셰이크·사운드)은 로드맵 Phase 1-2(P1 폴리싱) 스코프 — 게임 로직과
  분리해 CSS/SVG 레이어로 얹는다(번들리스 유지).
