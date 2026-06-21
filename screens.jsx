/* screens.jsx — menu, stage select, and clear/fail overlays. Exports to window. */

const Stars = ({ n, size = 'sm' }) => (
  <div className={`stars ${size}`}>
    {[0, 1, 2].map(i => (
      <span key={i} className={`st ${i < n ? 'on' : ''}`}>★</span>
    ))}
  </div>
);

// ─── Mode-select menu ──────────────────────────────────────────
const MenuScreen = ({ hi, totalStars, maxStars, onStage, onEndless, onEditor, onDaily, dailyBest, streak }) => (
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
      <button className="mode-btn daily" onClick={onDaily}>
        <span className="mb-ico">🔥</span>
        <span className="mb-text">
          <span className="mb-name">오늘의 도전</span>
          <span className="mb-desc">매일 바뀌는 시드 · 전국 동일 보드</span>
        </span>
        <span className="mb-meta">오늘 {String(dailyBest).padStart(5, '0')} · 🔥{streak}</span>
      </button>
      <button className="mode-btn editor" onClick={onEditor}>
        <span className="mb-ico">✎</span>
        <span className="mb-text">
          <span className="mb-name">에디터</span>
          <span className="mb-desc">스테이지 · 밸런스 · 리소스 편집</span>
        </span>
        <span className="mb-meta">DEV</span>
      </button>
    </div>

    <div className="menu-foot">
      <kbd>Q/E</kbd> <kbd>A/D</kbd> <kbd>Z/X</kbd> 이동 · <kbd>SPC</kbd> 대기 · 셀 탭으로도 이동
    </div>
  </div>
);

// ─── Region map (world select) ─────────────────────────────────
const RegionMap = ({ stars, coins, best, onPick, onBack }) => {
  const { REGIONS, STAGES, regionUnlocked, regionCleared, regionStars, regionMax, regionAchv } = window.HXS;
  const total = Object.values(stars).reduce((a, b) => a + b, 0);
  return (
    <div className="screen select">
      <div className="select-bar">
        <button className="back-btn" onClick={onBack}>← 메뉴</button>
        <span className="select-title">지역 선택</span>
        <span className="select-prog">🪙 {coins} · ★ {total}</span>
      </div>
      <div className="region-list">
        {REGIONS.map((r, ri) => {
          const open = regionUnlocked(ri, stars);
          const cleared = regionCleared(r, stars);
          const got = regionStars(r, stars), max = regionMax(r);
          const prevBoss = ri > 0 ? STAGES[REGIONS[ri - 1].to].name : '';
          const ach = open ? regionAchv(r.id, stars, best || {}) : null;
          return (
            <button
              key={r.id}
              className={`region-card ${open ? '' : 'locked'} ${cleared ? 'cleared' : ''}`}
              disabled={!open}
              onClick={() => open && onPick(ri)}
              style={{ borderColor: open ? r.color : undefined }}
            >
              <span className="rc-id">지역 {r.id}</span>
              <span className="rc-name" style={{ color: open ? r.color : undefined }}>{open ? r.name : '？？？'}</span>
              {open
                ? <span className="rc-prog">★ {got}/{max}{cleared ? ' ✓' : ''} · 업적 {ach.done}/{ach.total}</span>
                : <span className="rc-lock">🔒 {prevBoss} 클리어 시 해금</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Stage select ──────────────────────────────────────────────
const StageSelect = ({ stars, best, region, onPick, onBack }) => {
  const { STAGES, isUnlocked, TYPE_META, regionStars, regionMax } = window.HXS;
  const from = region ? region.from : 0;
  const to = region ? region.to : STAGES.length - 1;
  const got = region ? regionStars(region, stars) : Object.values(stars).reduce((a, b) => a + b, 0);
  const max = region ? regionMax(region) : STAGES.length * 3;
  return (
    <div className="screen select">
      <div className="select-bar">
        <button className="back-btn" onClick={onBack}>← {region ? '지역' : '메뉴'}</button>
        <span className="select-title">{region ? region.name : '스테이지 선택'}</span>
        <span className="select-prog">★ {got}/{max}</span>
      </div>
      {region && (
        <div className="achv-list">
          {window.HXS.ACHIEVEMENTS.filter(a => a.region === region.id).map(a => {
            const done = window.HXS.achvDone(a, stars, best || {});
            return (
              <div key={a.id} className={`achv-item ${done ? 'done' : ''}`}>
                <span className="achv-mark">{done ? '✓' : '○'}</span>
                <span className="achv-name">{a.name}</span>
                <span className="achv-desc">{a.desc}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="stage-grid">
        {STAGES.slice(from, to + 1).map((st, j) => {
          const i = from + j;                 // global index (isUnlocked/onPick use it)
          const open = isUnlocked(i, stars);
          const g = stars[st.id] || 0;
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
              {open ? <Stars n={g} /> : <span className="st-lock">🔒</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Stage clear overlay ───────────────────────────────────────
const ClearOverlay = ({ stage, stars, score, turns, coins, hasNext, onNext, onRetry, onList }) => (
  <div className="go-overlay clear">
    <div className="go-card clear-card">
      <div className="head clear-head">STAGE CLEAR</div>
      <div className="clear-stage">{stage.name}</div>
      <Stars n={stars} size="lg" />
      <div className="row"><span>SCORE</span><span className="v">{String(score).padStart(5, '0')}</span></div>
      <div className="row"><span>TURN</span><span className="v">{String(turns).padStart(3, '0')}</span></div>
      {coins > 0 && <div className="row coin"><span>코인 보상</span><span className="v">+{coins} 🪙</span></div>}
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

Object.assign(window, { Stars, MenuScreen, RegionMap, StageSelect, ClearOverlay, FailOverlay });
