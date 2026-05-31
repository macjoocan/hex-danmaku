/* screens.jsx — menu, stage select, and clear/fail overlays. Exports to window. */

const Stars = ({ n, size = 'sm' }) => (
  <div className={`stars ${size}`}>
    {[0, 1, 2].map(i => (
      <span key={i} className={`st ${i < n ? 'on' : ''}`}>★</span>
    ))}
  </div>
);

// ─── Mode-select menu ──────────────────────────────────────────
const MenuScreen = ({ hi, totalStars, maxStars, onStage, onEndless }) => (
  <div className="screen menu">
    <div className="menu-logo">
      <div className="logo-pips">
        <span style={{ background: 'var(--bullet)' }}></span>
        <span style={{ background: 'var(--gold)' }}></span>
        <span style={{ background: 'var(--mint)' }}></span>
        <span style={{ background: 'var(--player)' }}></span>
        <span style={{ background: 'var(--violet)' }}></span>
      </div>
      <h1 className="logo-title">HEX<br />DANMAKU</h1>
      <div className="logo-sub">육각 탄막 · 회피 액션</div>
    </div>

    <div className="mode-list">
      <button className="mode-btn stage" onClick={onStage}>
        <span className="mb-ico">◈</span>
        <span className="mb-text">
          <span className="mb-name">스테이지</span>
          <span className="mb-desc">{(window.HXS?.STAGES?.length ?? 24)}개 스테이지 · 돌파 · 생존 · 수집 · 보스</span>
        </span>
        <span className="mb-meta">★ {totalStars}/{maxStars}</span>
      </button>
      <button className="mode-btn endless" onClick={onEndless}>
        <span className="mb-ico">∞</span>
        <span className="mb-text">
          <span className="mb-name">엔드리스</span>
          <span className="mb-desc">끝없이 쏟아지는 탄막 · 최고점 도전</span>
        </span>
        <span className="mb-meta">HI {String(hi).padStart(5, '0')}</span>
      </button>
    </div>

    <div className="menu-foot">
      <kbd>Q/E</kbd> <kbd>A/D</kbd> <kbd>Z/X</kbd> 이동 · <kbd>SPC</kbd> 대기 · 셀 탭으로도 이동
    </div>
  </div>
);

// ─── Stage select ──────────────────────────────────────────────
const StageSelect = ({ stars, onPick, onBack }) => {
  const { STAGES, isUnlocked, TYPE_META } = window.HXS;
  return (
    <div className="screen select">
      <div className="select-bar">
        <button className="back-btn" onClick={onBack}>← 메뉴</button>
        <span className="select-title">스테이지 선택</span>
        <span className="select-prog">
          ★ {Object.values(stars).reduce((a, b) => a + b, 0)}/{STAGES.length * 3}
        </span>
      </div>
      <div className="stage-grid">
        {STAGES.map((st, i) => {
          const open = isUnlocked(i, stars);
          const got = stars[st.id] || 0;
          const m = TYPE_META[st.type];
          return (
            <button
              key={st.id}
              className={`stage-tile ${open ? '' : 'locked'} t-${st.type}`}
              disabled={!open}
              onClick={() => open && onPick(i)}
            >
              <span className="st-num">{String(st.id).padStart(2, '0')}</span>
              <span className="st-ico" style={{ color: m.color }}>{m.icon}</span>
              <span className="st-name">{open ? st.name : '？？？'}</span>
              <span className="st-type" style={{ color: m.color }}>{m.label}</span>
              {open
                ? <Stars n={got} />
                : <span className="st-lock">🔒</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Stage clear overlay ───────────────────────────────────────
const ClearOverlay = ({ stage, stars, score, turns, hasNext, onNext, onRetry, onList }) => (
  <div className="go-overlay clear">
    <div className="go-card clear-card">
      <div className="head clear-head">STAGE CLEAR</div>
      <div className="clear-stage">{stage.name}</div>
      <Stars n={stars} size="lg" />
      <div className="row"><span>SCORE</span><span className="v">{String(score).padStart(5, '0')}</span></div>
      <div className="row"><span>TURN</span><span className="v">{String(turns).padStart(3, '0')}</span></div>
      <div className="clear-btns">
        {hasNext
          ? <button className="b-main" onClick={onNext}>다음 ▶</button>
          : <button className="b-main" onClick={onList}>완료 ★</button>}
        <button className="b-sub" onClick={onRetry}>재도전</button>
        <button className="b-sub" onClick={onList}>목록</button>
      </div>
    </div>
  </div>
);

// ─── Stage fail overlay ────────────────────────────────────────
const FailOverlay = ({ stage, score, turns, onRetry, onList }) => (
  <div className="go-overlay">
    <div className="go-card fail-card">
      <div className="head">STAGE FAILED</div>
      <div className="clear-stage" style={{ color: 'var(--tx-2)' }}>{stage.name}</div>
      <div className="row"><span>SCORE</span><span className="v">{String(score).padStart(5, '0')}</span></div>
      <div className="row"><span>TURN</span><span className="v">{String(turns).padStart(3, '0')}</span></div>
      <div className="clear-btns">
        <button className="b-main retry" onClick={onRetry}>↻ 재도전</button>
        <button className="b-sub" onClick={onList}>목록</button>
      </div>
      <div className="tiny-hint">R 키로도 재도전</div>
    </div>
  </div>
);

Object.assign(window, { Stars, MenuScreen, StageSelect, ClearOverlay, FailOverlay });
