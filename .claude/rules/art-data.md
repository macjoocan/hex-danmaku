---
paths:
  - "art-data.js"
  - "resources.jsx"
  - "sprites.jsx"
---

# 아트 데이터 규칙

- `art-data.js`는 **순수 데이터만**(RES 테이블) — 함수·렌더 로직 금지.
  resources-art.test.mjs가 이를 강제한다(픽셀 grid 직사각형, map 색상 존재 포함).
- 렌더 로직(px/drawArt)은 `resources.jsx`에만 둔다. 스프라이트 컴포넌트(`sprites.jsx`)는
  아트를 갖지 않는다(그림자/애니메이션 래퍼만).
- 새 스프라이트 추가 시: RES 테이블에 등록 → 필요하면 assets/ 이미지 참조
  (가이드: assets/README.md). 아트 교체는 resources.jsx/art-data.js에서만 이뤄져야 한다.
