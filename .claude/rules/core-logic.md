---
paths:
  - "engine.jsx"
  - "stages.jsx"
---

# 코어 로직 규칙 (헤드리스 시뮬의 전제)

- 이 두 파일은 **DOM/React 무참조를 유지**한다 — tests/harness.mjs가 vm 샌드박스로
  헤드리스 로드하며, 여기에 `document`/JSX가 들어가면 시뮬·테스트 전체가 깨진다.
- 밸런스 수치(코스트·확률·계수)는 `DEFAULT_BAL`에 모은다(`window.HXB` 오버라이드 지원).
  로직 중간에 새 매직 넘버를 넣지 마라.
- 난수는 `rnd()`만 사용한다. `Math.random()` 직접 호출 금지 — 일일 도전 시드와
  시뮬 재현성이 깨진다.
- 밸런스 수치 변경은 기획 게이트 소관 — 근거(기획/시뮬 결과) 없이 바꾸지 말고,
  변경 시 fairness·regression 테스트 영향을 확인한다(`npm test`).
