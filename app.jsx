/* app.jsx — orchestrates menu / stage-select / play, renders board + HUD. */

const { useState, useEffect, useRef, useCallback, useMemo } = React;
const HX = window.HX;
const HXS = window.HXS;

// 치트 토글(개발·테스트용): URL #cheat=1 로 켜고 #cheat=0 으로 끈다 (?cheat=도 지원).
// 해시를 기본으로 쓰는 이유: serve의 cleanUrls 301 리다이렉트가 쿼리스트링을 버린다.
// 잠금 판정만 우회 — 별·업적·기록은 그대로다 (stages.jsx cheatOn 참조).
try {
  const q = new URLSearchParams(location.search).get('cheat')
    ?? new URLSearchParams(location.hash.replace(/^#/, '')).get('cheat');
  if (q === '1') localStorage.setItem('hex_cheat', '1');
  else if (q === '0') localStorage.removeItem('hex_cheat');
} catch { /* file:// 등에서 실패해도 무시 */ }
const {
  PlayerSprite, BulletSprite, StarSprite, BombSprite, TpSprite, HintSprite, CoinSprite,
  ExplodeSprite, PortalSprite, WallSprite, GemSprite, ChaserSprite,
  SpikeSprite, TurretSprite,
  BouncerSprite, LungerSprite, PadSprite, MineSprite, CrackSprite, BeamSprite,
  BombZoneSprite,
  BossAvatarSprite,
  MenuScreen, RegionMap, StageSelect, ClearOverlay, FailOverlay, Stars, EditorScreen, ShopScreen,
} = window;

// ─── Hex cell ─────────────────────────────────────────────────
const Cell = ({ r, c, state, onClick }) => {
  const { hc, hp, SZ } = HX;
  const { x, y } = hc(r, c);

  let fill = '#1c1f3e', stroke = '#2a2e58', strokeW = 1.5;
  if (state.wall || state.turret) { fill = '#23264a'; stroke = '#3a3f6e'; strokeW = 1.5; }
  else if (state.exploding) { fill = '#ff7a3d'; stroke = '#7c2d12'; strokeW = 2; }
  else if (state.player) { fill = state.dead ? '#5b1d2d' : '#0c2942'; stroke = state.dead ? '#fb7185' : '#38bdf8'; strokeW = 2.5; }
  else if (state.laser1) { fill = '#3a1418'; stroke = '#f87171'; strokeW = 2; }
  else if (state.goal) { fill = '#1e1442'; stroke = '#a78bfa'; strokeW = 2.5; }
  else if (state.bullet) { fill = '#3a1822'; stroke = '#fb7185'; strokeW = 2; }
  else if (state.spike) { fill = '#2e1217'; stroke = '#b91c1c'; strokeW = 1.8; }
  else if (state.crack) { fill = '#05060f'; stroke = '#2a2e58'; strokeW = 1.8; }
  else if (state.pad) { fill = '#13402c'; stroke = '#34d399'; strokeW = 1.6; }
  else if (state.beam) { fill = '#0b2e3a'; stroke = '#67e8f9'; strokeW = 1.8; }
  else if (state.danger && state.preview) { fill = '#3a2a18'; stroke = '#fbbf24'; strokeW = 2; }
  else if (state.danger) { fill = '#3a1d18'; stroke = '#fb7185'; strokeW = 1.8; }
  else if (state.preview) { fill = '#3a2a18'; stroke = '#fbbf24'; strokeW = 1.5; }
  else if (state.laser2) { fill = '#2a2438'; stroke = '#67e8f9'; strokeW = 1.6; }
  else if (state.turretWarn) { fill = '#3a2a18'; stroke = '#fbbf24'; strokeW = 1.8; }
  else if (state.move) { fill = '#1f3a48'; stroke = '#38bdf8'; strokeW = 1.5; }

  return (
    <g onClick={onClick} style={{ cursor: (state.move || state.player) ? 'pointer' : 'default' }}>
      <path d={hp(x, y)} fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinejoin="miter" />
      {state.laser1 && <path d={hp(x, y, SZ - 3)} fill="url(#stripes-danger)" opacity="0.7" />}
      {state.danger && !state.bullet && !state.player && !state.wall && !state.turret && (
        <path d={hp(x, y, SZ - 4)} fill="url(#stripes-danger)" opacity="0.55" />
      )}
      {state.preview && !state.player && !state.bullet && !state.wall && !state.turret && (
        <path d={hp(x, y, SZ - 5)} fill="url(#stripes-preview)" opacity="0.45" />
      )}
      {state.move && !state.bullet && !state.item && !state.wall && !state.turret && !state.spike && (
        <circle cx={x} cy={y} r="1.7" fill="#38bdf8" opacity="0.8" />
      )}
      {state.beamWarn && <path d={hp(x, y, SZ - 4)} fill="none" stroke="#67e8f9" strokeWidth="1.6" strokeDasharray="3 3" />}
    </g>
  );
};

const SkillBtn3 = ({ cls, icon, name, cost, budget, unit, left, disabled, onClick }) => {
  const canUse = !disabled && budget >= cost && (left === undefined || left > 0);
  return (
    <button className={`skill3 ${cls} ${canUse ? 'ready' : ''}`} disabled={!canUse} onClick={onClick}>
      <span className="ico">{icon}</span>
      <span className="lbl">{name}{left !== undefined ? ` ${left}` : ''}</span>
      <span className="cost">{cost}{unit}</span>
    </button>
  );
};

// ─── Stage HUD ────────────────────────────────────────────────
const StageHUD = ({ g }) => {
  const st = g.stage;
  const m = HXS.TYPE_META[st.type];
  const o = HXS.objText(g);
  return (
    <div className="stage-hud">
      <div className="sh-top">
        <span className="sh-badge" style={{ borderColor: m.color, color: m.color }}>
          STAGE {String(st.id).padStart(2, '0')}
        </span>
        <span className="sh-name">{st.name}</span>
        <span className="sh-type" style={{ color: m.color }}>{m.icon} {m.label}</span>
        <span className="hud-coin">🪙 {g.coins || 0}</span>
      </div>
      <div className="sh-obj">
        {st.type === 'boss' ? (
          <>
            <span className="sh-obj-label">버티기 · {o.label}</span>
            <div className="sh-bar boss-endure">
              <div className="sh-fill" style={{ width: `${Math.round((1 - Math.max(0, Math.min(1, o.frac))) * 100)}%`, background: m.color }}></div>
            </div>
            <span className="sh-val" style={{ color: m.color }}>남은 {o.left}</span>
          </>
        ) : (
          <>
            <span className="sh-obj-label">{o.label}</span>
            {o.frac != null && (
              <div className="sh-bar">
                <div className="sh-fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, o.frac)) * 100)}%`, background: m.color }}></div>
              </div>
            )}
            <span className="sh-val" style={{ color: m.color }}>{o.hp ? `${o.left}/${o.total}` : o.value}</span>
          </>
        )}
      </div>
      <div className="sh-stats">
        <span>턴 <b>{g.t}</b></span>
        <span>점수 <b>{g.sc}</b></span>
        <span>콤보 <b style={{ color: g.combo >= 10 ? 'var(--bullet)' : 'var(--gold)' }}>x{g.combo}</b></span>
      </div>
    </div>
  );
};

// ═══ Game view (mounted only while playing) ═══════════════════
function GameView({ g, setG, stars, setStars, hi, setHi, setDaily, onRetry, onNext, onList, onMenu }) {
  const [xCells, setXC] = useState(new Set());
  const [floats, setFl] = useState([]);
  const [waveTxt, setWave] = useState('');
  // 보스 발사 연출: 발사 열 머즐 플래시 + 강공(5열+) 화면 흔들림
  const [muzzle, setMuzzle] = useState(null);
  const [shakeOn, setShakeOn] = useState(false);
  const [newRec, setNewRec] = useState(false);
  const [earned, setEarned] = useState(0);
  const [coinGain, setCoinGain] = useState(0);
  const [beams, setBeams] = useState([]);
  const [phaseBanner, setPhaseBanner] = useState('');
  const fid = useRef(0);
  const gRef = useRef(g); gRef.current = g;
  const pfxRef = useRef({ t: -1, r: g.pl.r, c: g.pl.c, face: 1, moved: false });
  const phaseRef = useRef(-1);

  const isStage = g.mode === 'stage';

  // high score (normal endless only — daily score goes to hex_daily, not hex_hi)
  useEffect(() => {
    if (isStage || !g.ov) return;
    if (g.seed != null) {                      // daily run
      setDaily(HXS.saveDailyScore(String(g.seed), g.sc));
    } else if (g.sc > hi) {                    // normal endless
      setHi(g.sc); setNewRec(true);
      try { localStorage.setItem('hex_hi', String(g.sc)); } catch {}
    }
  }, [g.ov]);

  // stage clear → save stars + coin reward (first-clear judged before saveStars)
  useEffect(() => {
    if (isStage && g.win && !g._test) {
      const sNum = HXS.rateStage(g);
      const first = !stars[g.stage.id];
      setEarned(sNum);
      setStars(HXS.saveStars(g.stage.id, sNum));
      const reward = HXS.coinReward(sNum, first);
      setCoinGain(reward);
      HXS.saveCoins((g.coins || 0) + reward);
      HXS.saveBest(g.stage.id, g.t);
    }
  }, [g.win]);

  // 스킬/픽업으로 변한 코인을 즉시 지갑에 반영 (사망·이탈에도 유지).
  // !g.win 가드: 클리어 효과가 보상을 더해 저장한 값을 덮어쓰지 않기 위함.
  useEffect(() => {
    if (isStage && !g._test && typeof g.coins === 'number' && !g.win) HXS.saveCoins(g.coins);
  }, [g.coins]);

  // 엔드리스 사망 시 메타 환원(C3): 점수 일부가 코인으로 지갑에 들어간다.
  // g는 runId 키로 런마다 새 인스턴스라 ov 전이당 1회만 실행된다.
  useEffect(() => {
    if (!isStage && !g._test && g.ov && g.cv > 0) HXS.saveCoins(HXS.loadCoins() + g.cv);
  }, [g.ov]);

  // visual effects from events
  useEffect(() => {
    (g.evts || []).forEach(ev => {
      if (ev.ty === 'laser') { flashBeam(ev.c); return; }
      if (ev.ty === 'beam')  { flashBeam(ev.c); return; }
      if (ev.ty === 'wave') { // 보스 발사: 머즐 플래시 + 강공 시 화면 흔들림
        setMuzzle({ cols: ev.cols || [], key: Date.now() });
        setTimeout(() => setMuzzle(null), 450);
        if (ev.big) {
          setShakeOn(false);
          requestAnimationFrame(() => setShakeOn(true));
          setTimeout(() => setShakeOn(false), 350);
        }
        return;
      }
      const { x, y } = HX.hc(ev.r, ev.c);
      if (ev.ty === 'sc') addFloat(`+${ev.val}`, x, y - 6, '#fbbf24');
      else if (ev.ty === 'gem') addFloat(`+${ev.val}`, x, y - 6, '#fde68a');
      else if (ev.ty === 'bm') { boom(ev.cells); addFloat('BOOM!', x, y - 6, '#34d399'); }
      else if (ev.ty === 'tp') addFloat('WARP!', x, y - 6, '#c084fc');
      else if (ev.ty === 'ht') addFloat('+예지', x, y - 6, '#f97316');
      else if (ev.ty === 'idel') addFloat('✕', x, y - 4, '#7a82b0');
      else if (ev.ty === 'cn') addFloat(`+${ev.val}🪙`, x, y - 6, '#fbbf24');
      else if (ev.ty === 'graze') addFloat(`스침 x${ev.n}`, x, y - 6, '#34d399');
      else if (ev.ty === 'cv') addFloat(`전리품 +${ev.val}🪙`, x, y - 6, '#fbbf24');
    });
  }, [g.evts]);

  // wave flash
  useEffect(() => {
    if (g.ln) {
      setWave(g.ln);
      const t = setTimeout(() => setWave(''), 800);
      return () => clearTimeout(t);
    }
  }, [g.ln, g.t]);

  // phase banner
  useEffect(() => {
    if (!isStage || g.stage.type !== 'boss' || g.win || g.ov) return;
    const ph = HXS.phaseFor(g.stage, g.bossWaves);
    if (ph !== phaseRef.current) {
      phaseRef.current = ph;
      setPhaseBanner(`PHASE ${ph + 1} · ${HXS.bossPhaseName(g.stage, g.bossWaves)}`);
    }
  }, [g.bossWaves]);

  function addFloat(text, x, y, color) {
    const id = ++fid.current;
    setFl(f => [...f, { id, text, x, y, color }]);
    setTimeout(() => setFl(f => f.filter(p => p.id !== id)), 1100);
  }
  function boom(cells) { setXC(new Set(cells)); setTimeout(() => setXC(new Set()), 700); }
  function flashBeam(c) {
    const id = ++fid.current;
    setBeams(b => [...b, { id, c }]);
    setTimeout(() => setBeams(b => b.filter(p => p.id !== id)), 280);
  }

  const moveTo = useCallback((nr, nc) => setG(s => (s ? HX.tick(s, nr, nc) : s)), [setG]);

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      const cur = gRef.current;
      if (k === 'r') { e.preventDefault(); onRetry(); return; }
      if (!cur || cur.ov || cur.win) return;
      setG(s => {
        if (!s || s.ov || s.win) return s;
        const dirs = HX.D(s.pl.r); // [W,E,NW,NE,SW,SE]
        let idx = -1;
        if (k === 'a' || e.key === 'ArrowLeft') idx = 0;
        else if (k === 'd' || e.key === 'ArrowRight') idx = 1;
        else if (k === 'q') idx = 2;
        else if (k === 'e') idx = 3;
        else if (k === 'z') idx = 4;
        else if (k === 'x') idx = 5;
        else if (e.key === ' ' || k === 's' || k === 'w') { e.preventDefault(); return HX.tick(s, s.pl.r, s.pl.c); }
        if (idx < 0) return s;
        e.preventDefault();
        const [dr, dc] = dirs[idx];
        const nr = s.pl.r + dr, nc = s.pl.c + dc;
        if (nr < 0 || nr >= HX.R || nc < 0 || nc >= HX.C) return s;
        return HX.tick(s, nr, nc);
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setG, onRetry]);

  const { R: ROWS, C: COLS, SW, SH, hc, hp, D } = HX;

  const wallSet = useMemo(() => new Set((g.walls || []).map(w => `${w.r},${w.c}`)), [g.walls]);
  const turretSet = useMemo(() => new Set((g.turrets || []).map(t => `${t.r},${t.c}`)), [g.turrets]);
  const spikeSet = useMemo(() => new Set((g.spikes || []).map(sp => `${sp.r},${sp.c}`)), [g.spikes]);
  const crackSet = useMemo(() => new Set((g.cracks || []).filter(c => c.broken).map(c => `${c.r},${c.c}`)), [g.cracks]);
  const padSet = useMemo(() => new Set((g.pads || []).map(p => `${p.r},${p.c}`)), [g.pads]);
  const blockSet = useMemo(() => { const s = new Set(wallSet); turretSet.forEach(k => s.add(k)); crackSet.forEach(k => s.add(k)); return s; }, [wallSet, turretSet, crackSet]);
  // laser telegraph: column -> charge (1 = imminent, 2 = warning)
  const laserCols = useMemo(() => { const m = new Map(); (g.lasers || []).forEach(l => m.set(l.c, Math.min(m.get(l.c) ?? 9, l.charge))); return m; }, [g.lasers]);
  const beamSet = useMemo(() => new Set((g.beams || []).map(b => `${b.r},${b.c}`)), [g.beams]);
  // columns telegraphing this turn (cd===1 -> fires next turn): dotted full column
  const beamWarnCols = useMemo(() => new Set((g.beams || []).filter(b => b.cd === 1).map(b => b.c)), [g.beams]);
  // turret muzzle: cell that fires NEXT turn
  const turretWarnSet = useMemo(() => {
    const set = new Set();
    (g.turrets || []).forEach(t => {
      const per = t.period || 3, ph = t.phase || 0;
      if ((g.t + 1) % per === ph && t.r + 1 < ROWS && !blockSet.has(`${t.r + 1},${t.c}`)) set.add(`${t.r + 1},${t.c}`);
    });
    return set;
  }, [g.turrets, g.t, blockSet]);

  const moveSet = useMemo(() => {
    const set = new Set();
    set.add(`${g.pl.r},${g.pl.c}`);
    D(g.pl.r).forEach(([dr, dc]) => {
      const r = g.pl.r + dr, c = g.pl.c + dc;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && !blockSet.has(`${r},${c}`)) set.add(`${r},${c}`);
    });
    // dash(엔드리스 전용): 게이지가 충분하면 2칸 도약 칸도 이동 후보로
    if (g.mode !== 'stage' && (g.gz || 0) >= HX.effDashCost(g)) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (HX.hd(r, c, g.pl.r, g.pl.c) === HX.bal().dash.range && !blockSet.has(`${r},${c}`)) set.add(`${r},${c}`);
      }
    }
    return set;
  }, [g.pl.r, g.pl.c, blockSet, g.mode, g.gz]);

  const dangerSet = useMemo(() => {
    const set = new Set();
    // 엔진의 이동 예측 함수를 그대로 사용 — 변칙탄(zig/slow)도 정확히 예고된다
    if (g.ht > 0 && g.fz === 0) g.bl.forEach(b => {
      const p = HX.nextBulletPos(b);
      if (p.r < ROWS && p.c >= 0 && p.c < COLS && !(p.r === b.r && p.c === b.c)) set.add(`${p.r},${p.c}`);
    });
    return set;
  }, [g.bl, g.fz, g.ht]);

  // 1945식 활공 렌더: 각 탄이 직전 턴 어느 칸에서 왔는지 역추적 — 엔진 무변경.
  // 이동이 결정론적이라 nextBulletPos(이전 탄) == 현재 위치 매칭으로 복원 가능하다.
  const prevBlRef = useRef({ t: -1, bl: [] });
  const flightFrom = useMemo(() => {
    const prev = prevBlRef.current;
    const usable = (prev.t === g.t - 1 && g.fz <= 0) ? [...prev.bl] : null;
    return g.bl.map(b => {
      if (!usable || b.fuse != null) return null;
      // 같은 자리(홀드) 우선 소진 — 오매칭 방지
      let idx = usable.findIndex(p => p && p.fuse == null && p.r === b.r && p.c === b.c
        && !!p.zig === !!b.zig && !!p.slow === !!b.slow);
      let same = idx >= 0;
      if (idx < 0) {
        idx = usable.findIndex(p => {
          if (!p || p.fuse != null || !!p.zig !== !!b.zig || !!p.slow !== !!b.slow) return false;
          const n = HX.nextBulletPos(p);
          return !n.hold && n.r === b.r && n.c === b.c;
        });
      }
      if (idx < 0) return null;
      const p = usable[idx]; usable[idx] = null;
      return same ? null : { r: p.r, c: p.c };
    });
  }, [g.bl, g.t, g.fz]);
  useEffect(() => { prevBlRef.current = { t: g.t, bl: g.bl }; }, [g.t, g.bl]);

  const previewSet = useMemo(() => {
    const set = new Set();
    if (g.ht > 0 && g.fz === 0 && g.si === 1) g.np.c.forEach(c => set.add(`0,${c}`));
    return set;
  }, [g.np, g.si, g.fz, g.ht]);

  const bulletSet = useMemo(() => { const m = new Map(); g.bl.forEach(b => m.set(`${b.r},${b.c}`, b)); return m; }, [g.bl]);
  // fuse mines live inside g.bl; map cell -> fuse (0 = armed/lethal this turn, >0 = telegraph)
  const mineMap = useMemo(() => { const m = new Map(); g.bl.forEach(b => { if (b.fuse != null) m.set(`${b.r},${b.c}`, b.fuse); }); return m; }, [g.bl]);
  // lunge dash lanes (warning) from enemies about to dash
  const lungeWarn = useMemo(() => {
    const set = new Set();
    (g.enemies || []).forEach(e => {
      if (e.kind === 'lunge') (HX.ENEMY_KINDS.lunge.telegraph(e) || []).forEach(p => set.add(`${p.r},${p.c}`));
    });
    return set;
  }, [g.enemies]);
  const itemMap = useMemo(() => { const m = new Map(); g.its.forEach(i => m.set(`${i.r},${i.c}`, i)); return m; }, [g.its]);
  const goalKey = g.goal ? `${g.goal.r},${g.goal.c}` : null;

  const cellsEls = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = `${r},${c}`;
    const player = g.pl.r === r && g.pl.c === c;
    const lc = laserCols.get(c);
    const mineFuse = mineMap.get(k);   // undefined | 0 (armed) | >0 (telegraph)
    const isTeleMine = mineFuse > 0;
    const st = {
      player, dead: player && g.ov,
      bullet: bulletSet.has(k) && !isTeleMine,
      item: itemMap.has(k),
      danger: dangerSet.has(k) || lungeWarn.has(k) || isTeleMine,
      preview: previewSet.has(k),
      move: !player && moveSet.has(k),
      exploding: xCells.has(k),
      wall: wallSet.has(k),
      turret: turretSet.has(k),
      spike: spikeSet.has(k),
      crack: crackSet.has(k),
      pad: padSet.has(k),
      beam: beamSet.has(k),
      beamWarn: beamWarnCols.has(c),
      turretWarn: turretWarnSet.has(k),
      laser1: lc === 1,
      laser2: lc === 2,
      goal: goalKey === k,
    };
    cellsEls.push(<Cell key={k} r={r} c={c} state={st} onClick={() => !g.ov && !g.win && moveTo(r, c)} />);
  }

  const diff = HX.DL(g.t);
  const stageIntro = isStage && g.t === 0 && !g.ov && !g.win;

  // player facing + hop (recomputed only when the turn advances, stable across other re-renders)
  if (g.t !== pfxRef.current.t) {
    const mv = g.pl.r !== pfxRef.current.r || g.pl.c !== pfxRef.current.c;
    let face = pfxRef.current.face;
    if (g.pl.c > pfxRef.current.c) face = 1;
    else if (g.pl.c < pfxRef.current.c) face = -1;
    pfxRef.current = { t: g.t, r: g.pl.r, c: g.pl.c, face, moved: mv };
  }
  const playerFace = pfxRef.current.face;
  const playerMoved = pfxRef.current.moved;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="pip"></span>
          <span className="brand-name">HEX DANMAKU</span>
          <span className="brand-sub">{isStage ? '스테이지' : (g.seed != null ? '오늘의 도전' : '엔드리스')}</span>
        </div>
        <button className="exit-btn" onClick={isStage ? onList : onMenu}>
          {isStage ? '← 목록' : '← 메뉴'}
        </button>
      </header>

      {/* HUD */}
      {isStage ? <StageHUD g={g} /> : (
        <div className="stats3">
          <div className="stat3">
            <span className="lbl">턴</span><span className="val">{g.t}</span>
            <span className="sub" style={{ color: diff.c }}>{diff.sub}</span>
          </div>
          <div className="stat3 center">
            <span className="lbl">탄막</span>
            <span className="val">{g.bl.length}<span className="unit">발</span></span>
            <span className="sub">
              {g.fz > 0 ? <span style={{ color: 'var(--player)' }}>❄ 정지 {g.fz}턴</span>
                : (g.si === 1 ? <span style={{ color: 'var(--bullet)' }}>⚠ 다음 턴 소환</span>
                  : <span style={{ color: 'var(--tx-3)' }}>{g.si}턴 뒤 소환</span>)}
            </span>
          </div>
          <div className="stat3 right">
            <span className="lbl">점수</span><span className="val">{g.sc}</span>
            <span className="sub">콤보 <span style={{ color: g.combo >= 10 ? 'var(--bullet)' : 'var(--gold)' }}>x{g.combo}</span></span>
            <span className="sub">대시 <span style={{ color: (g.gz || 0) >= HX.effDashCost(g) ? '#34d399' : 'var(--tx-3)' }}>⚡{g.gz || 0}/{HX.effGaugeMax(g)}</span></span>
          </div>
        </div>
      )}

      {/* Pattern preview */}
      <div className="pat-grid">
        <div className={`pat-card now ${g.si === 1 && g.fz === 0 ? 'imminent' : ''}`}>
          <div className="cap">다음 소환 {g.si === 1 && g.fz === 0 && <span className="dot">●</span>}</div>
          <div className="pat-cells">
            {Array.from({ length: HX.C }, (_, i) => <div key={i} className={`pat-cell ${g.np.c.includes(i) ? 'on' : ''}`} />)}
          </div>
          <div className="pat-name">{g.fz > 0 ? '— 정지 중 —' : g.np.n}</div>
        </div>
        <div className="pat-card then">
          <div className="cap">그 다음</div>
          <div className="pat-cells">
            {Array.from({ length: HX.C }, (_, i) => <div key={i} className={`pat-cell ${g.np2.c.includes(i) ? 'on' : ''}`} />)}
          </div>
          <div className="pat-name">{g.np2.n}</div>
        </div>
      </div>

      {/* Grid */}
      <div className={`grid-wrap${shakeOn ? ' board-shake' : ''}`}>
        <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}>
          <defs>
            <pattern id="stripes-danger" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="3" height="6" fill="#f87171" /></pattern>
            <pattern id="stripes-preview" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="3" height="6" fill="#fbbf24" /></pattern>
            <pattern id="wall-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><rect width="2.5" height="5" fill="#565c98" /></pattern>
          </defs>

          {cellsEls}

          <g style={{ pointerEvents: 'none' }}>
            {g.stage && g.stage.type === 'boss' && (() => {
              const b = g.stage.boss || {};
              // key=bossWaves: 웨이브마다 리마운트되어 발사 애니메이션(boss-fire)이 재생된다
              return (
                <g key={`bf-${g.bossWaves}`} className={g.bossWaves > 0 && !g.win ? 'boss-fire' : ''}>
                  <BossAvatarSprite x={SW / 2} y={HX.SZ * 1.4} sprite={b.sprite} phaseLevel={HXS.phaseFor(g.stage, g.bossWaves)} defeated={g.win} />
                </g>
              );
            })()}

            {/* 보스 발사 머즐 플래시 */}
            {muzzle && (muzzle.cols || []).map(c => {
              const { x, y } = hc(0, c);
              return <circle key={`mz-${muzzle.key}-${c}`} className="muzzle" cx={x} cy={y} r={HX.SZ * 0.95} />;
            })}

            {(g.walls || []).map((w, i) => { const { x, y } = hc(w.r, w.c); return <WallSprite key={`w-${i}`} x={x} y={y} />; })}

            {(g.cracks || []).map((cr, i) => { const { x, y } = hc(cr.r, cr.c); return <CrackSprite key={`cr-${i}`} x={x} y={y} broken={cr.broken} />; })}

            {(g.pads || []).map((p, i) => { const { x, y } = hc(p.r, p.c); return <PadSprite key={`pad-${i}`} x={x} y={y} dir={p.dir} />; })}

            {(g.spikes || []).map((sp, i) => { const { x, y } = hc(sp.r, sp.c); return <SpikeSprite key={`sp-${i}`} x={x} y={y} />; })}

            {(g.turrets || []).map((t, i) => { const { x, y } = hc(t.r, t.c); return <TurretSprite key={`tt-${i}`} x={x} y={y} warn={turretWarnSet.has(`${t.r + 1},${t.c}`)} />; })}

            {(g.beams || []).map((b, i) => { const { x, y } = hc(b.r, b.c); return <BeamSprite key={`beam-${i}`} x={x} y={y} warn={b.cd === 1} />; })}

            {(g.bombs || []).map((b, i) => {
              const { x, y } = hc(b.r, b.c);
              return <BombZoneSprite key={`bz${i}`} x={x} y={y} armed={b.armed} />;
            })}

            {g.goal && (() => { const { x, y } = hc(g.goal.r, g.goal.c); return <PortalSprite x={x} y={y} />; })()}

            {(g.gems || []).map((gm, i) => {
              const { x, y } = hc(gm.r, gm.c); const k = `${gm.r},${gm.c}`;
              return <GemSprite key={`g-${i}`} x={x} y={y} warn={dangerSet.has(k) || previewSet.has(k)} />;
            })}

            {g.its.map((it, i) => {
              const { x, y } = hc(it.r, it.c); const k = `${it.r},${it.c}`;
              const warn = dangerSet.has(k) || previewSet.has(k);
              if (it.ty === 'sc') return <StarSprite key={`i-${i}`} x={x} y={y} warn={warn} />;
              if (it.ty === 'bm') return <BombSprite key={`i-${i}`} x={x} y={y} warn={warn} />;
              if (it.ty === 'tp') return <TpSprite key={`i-${i}`} x={x} y={y} warn={warn} />;
              if (it.ty === 'ht') return <HintSprite key={`i-${i}`} x={x} y={y} warn={warn} />;
              if (it.ty === 'cn') return <CoinSprite key={`i-${i}`} x={x} y={y} warn={warn} />;
              return null;
            })}

            {g.bl.map((b, i) => {
              const k = `${b.r},${b.c}`; if (xCells.has(k)) return null;
              const { x, y } = hc(b.r, b.c);
              if (b.fuse != null) return <MineSprite key={`b-${i}`} x={x} y={y} armed={b.fuse === 0} />;
              const cls = [b.zig ? 'blt-zig' : b.slow ? 'blt-slow' : ''].join(' ').trim();
              const from = flightFrom[i]; // 직전 턴 위치 (없으면 신규 스폰)
              if (from) {
                // 1945식 활공: 이전 칸 → 현재 칸으로 부드럽게 날아오고, 탄도 트레일이 잔상으로 남는다
                const p0 = hc(from.r, from.c);
                const vars = { '--x0': `${p0.x}px`, '--y0': `${p0.y}px`, '--x1': `${x}px`, '--y1': `${y}px` };
                return (
                  <React.Fragment key={`bf-${i}-${g.t}`}>
                    <line className="trail" x1={p0.x} y1={p0.y} x2={x} y2={y} />
                    <g className={`fly ${cls}`} style={vars}>
                      <BulletSprite x={0} y={0} fz={g.fz > 0} />
                    </g>
                  </React.Fragment>
                );
              }
              const el = <BulletSprite key={`b-${i}`} x={x} y={y} fz={g.fz > 0} />;
              const cls2 = [cls, b.r === 0 ? 'spawn-pop' : ''].join(' ').trim();
              return cls2 ? <g key={`bw-${i}-${g.t}`} className={cls2}>{el}</g> : el;
            })}

            {(g.enemies || []).map((en, i) => {
              const { x, y } = hc(en.r, en.c);
              if (en.kind === 'bounce') return <BouncerSprite key={`e-${i}`} x={x} y={y} />;
              if (en.kind === 'lunge') return <LungerSprite key={`e-${i}`} x={x} y={y} charging={en.cd === 0} />;
              return <ChaserSprite key={`e-${i}`} x={x} y={y} />;
            })}

            {(() => { const { x, y } = hc(g.pl.r, g.pl.c); return <PlayerSprite x={x} y={y} dead={g.ov} face={playerFace} moved={playerMoved} hopKey={g.t} />; })()}

            {Array.from(xCells).map(k => { const [r, c] = k.split(',').map(Number); const { x, y } = hc(r, c); return <ExplodeSprite key={`x-${k}`} x={x} y={y} />; })}

            {/* laser beam flash — full column */}
            {beams.map(bm => (
              <g key={`bm-${bm.id}`} className="laser-beam">
                {Array.from({ length: ROWS }, (_, r) => { const { x, y } = hc(r, bm.c); return <path key={r} d={hp(x, y, HX.SZ - 1)} fill="#67e8f9" stroke="#ecfeff" strokeWidth="1.5" />; })}
              </g>
            ))}

            {floats.map(f => (
              <text key={f.id} x={f.x} y={f.y} fill={f.color} textAnchor="middle" className="float-text" stroke="#0e0f23" strokeWidth="3" paintOrder="stroke">{f.text}</text>
            ))}
          </g>
        </svg>

        {waveTxt && <div className="wave-flash">{waveTxt}!</div>}

        {phaseBanner && <div className="phase-banner" key={phaseBanner}>{phaseBanner}</div>}

        {g.ht > 0 && <div className="hint-badge"><span className="eye">◉</span> 예지 {g.ht}턴</div>}

        {stageIntro && (
          <div className="stage-intro">
            <div className="si-tag" style={{ color: HXS.TYPE_META[g.stage.type].color }}>
              {HXS.TYPE_META[g.stage.type].icon} STAGE {String(g.stage.id).padStart(2, '0')}
            </div>
            <div className="si-name">{g.stage.name}</div>
            <div className="si-tip">{g.stage.tip}</div>
            <div className="si-go">이동하면 시작 ▶</div>
          </div>
        )}

        {isStage && g.win && (
          <ClearOverlay
            stage={g.stage} stars={earned} score={g.sc} turns={g.t} coins={coinGain}
            hasNext={g.stageIdx < HXS.STAGES.length - 1}
            onNext={() => onNext(g.stageIdx + 1)}
            onRetry={onRetry} onList={onList}
          />
        )}

        {isStage && g.ov && (
          <FailOverlay stage={g.stage} score={g.sc} turns={g.t} onRetry={onRetry} onList={onList} />
        )}

        {!isStage && g.ov && (
          <div className="go-overlay">
            <div className="go-card">
              <div className="head">GAME OVER</div>
              {newRec && <div className="new-record">★ NEW RECORD ★</div>}
              <div className="row"><span>SCORE</span><span className="v">{String(g.sc).padStart(5, '0')}</span></div>
              <div className="row"><span>TURN</span><span className="v">{String(g.t).padStart(3, '0')}</span></div>
              {g.cv > 0 && <div className="row"><span>전리품</span><span className="v" style={{ color: 'var(--gold)' }}>🪙 +{g.cv}</span></div>}
              <div className="row hi"><span>HI</span><span className="v">{String(hi).padStart(5, '0')}</span></div>
              <div className="clear-btns">
                <button className="b-main retry" onClick={onRetry}>↻ 재시작</button>
                <button className="b-sub" onClick={onMenu}>메뉴</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="skills-panel">
        <div className="skills-head">
          <span className="line"></span>
          <span className="cap">{isStage ? '스킬 — 코인 소모' : '스킬 — 점수 소모'}</span>
          <span className="line"></span>
        </div>
        {(() => {
          const k = HX.bal().skill;
          const lim = k.usesPerRun;
          const leftOf = (key) => (lim > 0 && isStage) ? ((g.skillLeft && key in g.skillLeft) ? g.skillLeft[key] : lim) : undefined;
          const budget = isStage ? (g.coins || 0) : g.sc;
          const unit = isStage ? '🪙' : '점';
          return (
            <div className="skills-row">
              <SkillBtn3 cls="undo" icon="↶" name="뒤로가기" cost={isStage ? k.undoCoin : k.undoCost} budget={budget} unit={unit} left={leftOf('undo')} disabled={!g.hist || g.ov || g.win} onClick={() => setG(s => HX.doUndo(s))} />
              <SkillBtn3 cls="bomb" icon="✸" name="폭탄" cost={isStage ? k.bombCoin : k.bombCost} budget={budget} unit={unit} left={leftOf('bomb')} disabled={g.ov || g.win} onClick={() => setG(s => HX.doBomb(s))} />
              <SkillBtn3 cls="frz" icon="❄" name="정지" cost={isStage ? k.freezeCoin : k.freezeCost} budget={budget} unit={unit} left={leftOf('freeze')} disabled={g.ov || g.win || g.fz > 0} onClick={() => setG(s => HX.doFreeze(s))} />
            </div>
          );
        })()}
      </div>

      {/* Footer */}
      <div className="footer">
        <div className="ctrls-hint">
          <kbd>Q/E</kbd> · <kbd>A/D</kbd> · <kbd>Z/X</kbd> · <kbd>SPC</kbd> 대기 · 그리드 탭 이동 · <kbd>R</kbd> {isStage ? '재도전' : '재시작'}
        </div>
        <div className="legend">
          <div className="item"><span className="sw" style={{ background: '#38bdf8' }}></span>나 (용사)</div>
          <div className="item"><span className="sw" style={{ background: '#fb7185' }}></span>적 드론</div>
          {isStage && g.goal && <div className="item"><span className="sw" style={{ background: '#a78bfa' }}></span>포탈</div>}
          {isStage && (g.gems || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#fbbf24' }}></span>별 ★</div>}
          {isStage && (g.enemies || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#c026d3' }}></span>추적자</div>}
          {isStage && (g.walls || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#565c98' }}></span>벽</div>}
          {isStage && (g.spikes || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#b91c1c' }}></span>가시 ◆</div>}
          {isStage && (g.cracks || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#2a2440' }}></span>부서지는 발판</div>}
          {isStage && (g.pads || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#34d399' }}></span>컨베이어</div>}
          {isStage && (g.turrets || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#94a3b8' }}></span>포대 ▲</div>}
          {isStage && (g.beams || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#0e7490' }}></span>레이저 방출기</div>}
          {isStage && (g.bombs || []).length > 0 && <div className="item"><span className="sw" style={{ background: '#dc2626' }}></span>폭탄 장판</div>}
          {isStage && <div className="item"><span className="sw" style={{ background: '#fbbf24' }}></span>코인</div>}
          {isStage && (g.stage.type === 'boss' || (g.lasers || []).length > 0) && <div className="item"><span className="sw" style={{ background: '#67e8f9' }}></span>광선 ✦</div>}
          {!isStage && <div className="item"><span className="sw" style={{ background: '#34d399' }}></span>폭탄 ✸</div>}
          {!isStage && <div className="item"><span className="sw" style={{ background: '#c084fc' }}></span>이동 ✦</div>}
        </div>
      </div>
    </div>
  );
}

// ═══ App (screen orchestration) ═══════════════════════════════
function App() {
  const [screen, setScreen] = useState('menu');   // menu | regions | select | editor | play
  const [g, setG] = useState(null);
  const [stars, setStars] = useState(() => HXS.loadStars());
  const [hi, setHi] = useState(() => { try { return Number(localStorage.getItem('hex_hi') || 0); } catch { return 0; } });
  const [runId, setRunId] = useState(0);
  const [curRegion, setCurRegion] = useState(0);
  const [coins, setCoins] = useState(() => HXS.loadCoins());
  const [best, setBest] = useState(() => HXS.loadBest());

  const dayKey = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const todayKey = () => dayKey(new Date());
  const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
  const [daily, setDaily] = useState(() => HXS.loadDaily());
  const [streak, setStreak] = useState(() => HXS.loadStreak());

  const startStage = useCallback((idx) => {
    const ri = HXS.REGIONS.findIndex(r => idx >= r.from && idx <= r.to);
    if (ri >= 0) setCurRegion(ri);
    setG(HXS.initStage(idx)); setScreen('play'); setRunId(n => n + 1);
  }, []);
  const startEndless = useCallback(() => { setG(HX.initState()); setScreen('play'); setRunId(n => n + 1); }, []);
  const startDaily = useCallback(() => {
    const today = todayKey();
    const st = HXS.saveStreak(HXS.bumpStreak(HXS.loadStreak(), today, yesterdayKey()));
    setStreak(st);
    setDaily(HXS.loadDaily());
    setG(HX.initState(Number(today)));   // seed = YYYYMMDD; g.seed marks daily
    setScreen('play'); setRunId(n => n + 1);
  }, []);
  const toMenu = useCallback(() => { setG(null); setScreen('menu'); setStars(HXS.loadStars()); setCoins(HXS.loadCoins()); }, []);
  const [ups, setUps] = useState(() => HX.loadUp());
  const toShop = useCallback(() => { setG(null); setScreen('shop'); setCoins(HXS.loadCoins()); setUps(HX.loadUp()); }, []);
  const buyUp = useCallback((k, cost) => {
    const wallet = HXS.loadCoins();
    if (wallet < cost) return;
    HXS.saveCoins(wallet - cost);
    const next = HX.saveUp({ ...HX.loadUp(), [k]: (HX.loadUp()[k] || 0) + 1 });
    setCoins(HXS.loadCoins()); setUps(next);
  }, []);
  const toSelect = useCallback(() => { setG(null); setScreen('select'); setStars(HXS.loadStars()); setBest(HXS.loadBest()); }, []);
  const toRegions = useCallback(() => { setG(null); setScreen('regions'); setStars(HXS.loadStars()); setCoins(HXS.loadCoins()); setBest(HXS.loadBest()); }, []);
  const enterRegion = useCallback((ri) => { setCurRegion(ri); setStars(HXS.loadStars()); setBest(HXS.loadBest()); setScreen('select'); }, []);
  const toEditor = useCallback(() => { setG(null); setScreen('editor'); }, []);
  const testPlay = useCallback((def) => { setG({ ...HXS.initStageDef(def, def.stageIdx ?? 0), _test: true }); setScreen('play'); setRunId(n => n + 1); }, []);
  const retry = useCallback(() => {
    // initStageReplay rebuilds a test-play run from its own def (preserving _test) and a real
    // stage from STAGES — so retrying an unsaved custom stage neither crashes nor saves stars.
    setG(cur => (cur ? (cur.mode === 'stage' ? HXS.initStageReplay(cur) : HX.initState(cur.seed)) : cur));
    setRunId(n => n + 1);
  }, []);

  const totalStars = Object.values(stars).reduce((a, b) => a + b, 0);

  if (screen === 'menu') {
    return <MenuScreen hi={hi} totalStars={totalStars} maxStars={HXS.STAGES.length * 3} onStage={toRegions} onEndless={startEndless} onEditor={toEditor} onDaily={startDaily} onShop={toShop} coins={coins} dailyBest={daily.day === todayKey() ? daily.best : 0} streak={streak.streak} />;
  }
  if (screen === 'shop') {
    return <ShopScreen coins={coins} ups={ups} onBuy={buyUp} onBack={toMenu} />;
  }
  if (screen === 'regions') {
    return <RegionMap stars={stars} coins={coins} best={best} onPick={enterRegion} onBack={toMenu} />;
  }
  if (screen === 'select') {
    return <StageSelect stars={stars} best={best} region={HXS.REGIONS[curRegion]} onPick={startStage} onBack={toRegions} />;
  }
  if (screen === 'editor') {
    return <EditorScreen onExit={toMenu} onTestPlay={testPlay} />;
  }
  return (
    <GameView
      key={runId}
      g={g} setG={setG}
      stars={stars} setStars={setStars}
      hi={hi} setHi={setHi}
      setDaily={setDaily}
      onRetry={retry} onNext={g && g._test ? toEditor : startStage}
      onList={g && g._test ? toEditor : toSelect}
      onMenu={g && g._test ? toEditor : toMenu}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
