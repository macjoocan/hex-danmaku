/* editor.jsx — in-game editor UI (Stage / Balance / Resource). Exports EditorScreen.
 * Tab bodies are filled in by later tasks; this is the shell + routing. */
const { useState: useStateE } = React;

// placeholders — replaced by real tabs in later tasks
const EditorIO = ({ flash }) => {
  const [open, setOpen] = useStateE(false);
  const [text, setText] = useStateE('');
  const doExport = () => {
    const json = window.HXE.serializeOverrides();
    setText(json); setOpen(true);
    if (navigator.clipboard) navigator.clipboard.writeText(json).then(() => flash('클립보드 복사됨')).catch(() => {});
  };
  const doImport = () => {
    try { window.HXE.importOverrides(text); flash('가져오기 적용됨 (새로고침 권장)'); setOpen(false); }
    catch (e) { flash('가져오기 실패: ' + e.message); }
  };
  return (
    <div className="ed-io">
      <button className="ed-btn" onClick={doExport}>Export</button>
      <button className="ed-btn" onClick={() => setOpen(o => !o)}>Import</button>
      {open && (
        <div className="ed-io-panel">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="여기에 JSON 붙여넣기" />
          <div className="ed-io-actions">
            <button className="ed-btn primary" onClick={doImport}>적용</button>
            <button className="ed-btn" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
};
// flat field list: [group, key, label, min, max, step]
const BAL_FIELDS = [
  ['skill', 'undoCost', '뒤로가기 비용', 0, 200, 5],
  ['skill', 'bombCost', '폭탄 비용', 0, 200, 5],
  ['skill', 'bombRadius', '폭탄 반경', 1, 4, 1],
  ['skill', 'freezeCost', '정지 비용', 0, 200, 5],
  ['skill', 'freezeTurns', '정지 턴', 1, 6, 1],
  ['score', 'surviveBase', '생존 점수', 0, 50, 1],
  ['score', 'comboCap', '콤보 상한', 0, 30, 1],
  ['score', 'gemBase', '별 점수', 0, 300, 5],
  ['score', 'gemCombo', '별 콤보배수', 0, 20, 1],
  ['score', 'starBase', '점수픽업 기본', 0, 200, 5],
  ['score', 'starCombo', '점수픽업 콤보배수', 0, 20, 1],
  ['item', 'spawnChance', '아이템 확률', 0, 1, 0.01],
  ['item', 'max', '아이템 최대', 0, 6, 1],
  ['item', 'pSc', '확률 점수★', 0, 1, 0.01],
  ['item', 'pBm', '확률 폭탄✸', 0, 1, 0.01],
  ['item', 'pTp', '확률 이동✦', 0, 1, 0.01],
  ['enemy', 'chaseEvery', '추적자 주기', 1, 5, 1],
  ['enemy', 'lungeWindup', '돌격수 예고', 0, 4, 1],
  ['enemy', 'lungeDash', '돌격수 돌진칸', 1, 4, 1],
  ['endless', 'diffEasy', '초급→중급 턴', 1, 60, 1],
  ['endless', 'diffNormal', '중급→고급 턴', 1, 100, 1],
  ['endless', 'diffHard', '고급→극한 턴', 1, 150, 1],
];

const BalanceTab = ({ flash }) => {
  const [bal, setBal] = useStateE(() => window.HXB || window.HX.DEFAULT_BAL);
  const set = (group, key, raw) => {
    const v = Number(raw);
    const patch = window.HXE.readLS(window.HXE.LS.balance, {});
    const next = window.HXE.deepMerge(patch, { [group]: { [key]: v } });
    window.HXE.writeLS(window.HXE.LS.balance, next);
    window.HXE.applyOverrides();
    setBal({ ...window.HXB });
  };
  const reset = () => {
    window.HXE.writeLS(window.HXE.LS.balance, {});
    window.HXE.applyOverrides();
    setBal({ ...window.HXB });
    flash('밸런스 기본값 복원');
  };
  const pSum = bal.item.pSc + bal.item.pBm + bal.item.pTp;
  return (
    <div className="ed-pane bal-pane">
      <div className="ed-row-head"><span>밸런스 파라미터</span><button className="ed-btn" onClick={reset}>기본값 복원</button></div>
      {pSum > 1 && <div className="ed-warn">아이템 확률 합({pSum.toFixed(2)}) {'>'} 1 — ht가 음수가 됩니다.</div>}
      <div className="bal-grid">
        {BAL_FIELDS.map(([group, key, label, min, max, step]) => (
          <label key={`${group}.${key}`} className="bal-field">
            <span className="bal-label">{label}</span>
            <input type="range" min={min} max={max} step={step}
              value={bal[group][key]} onChange={(e) => set(group, key, e.target.value)} />
            <input type="number" min={min} max={max} step={step} className="bal-num"
              value={bal[group][key]} onChange={(e) => set(group, key, e.target.value)} />
          </label>
        ))}
      </div>
    </div>
  );
};
const ResourceTab = ({ flash }) => {
  const keys = Object.keys(window.HXR.RES);
  const [sel, setSel] = useStateE(keys[0]);
  const [, setTick] = useStateE(0); // force refresh after edits
  const entry = window.HXR.RES[sel];

  const savePatch = (patch) => {
    const cur = window.HXE.readLS(window.HXE.LS.res, {});
    const next = window.HXE.deepMerge(cur, { [sel]: patch });
    window.HXE.writeLS(window.HXE.LS.res, next);
    window.HXE.applyOverrides();
    setTick(t => t + 1);
  };
  const reset = () => {
    const cur = window.HXE.readLS(window.HXE.LS.res, {});
    delete cur[sel];
    window.HXE.writeLS(window.HXE.LS.res, cur);
    window.HXE.applyOverrides();
    setTick(t => t + 1);
    flash(`${sel} 원본 복원`);
  };

  const isPixel = entry.kind === 'pixel';
  const [paintCh, setPaintCh] = useStateE(null);

  const paintCell = (r, c) => {
    if (!isPixel || !entry.grid) return;
    const grid = entry.grid.map(row => row.split(''));
    grid[r][c] = paintCh || '.';
    savePatch({ grid: grid.map(row => row.join('')) });
  };

  return (
    <div className="ed-pane res-pane">
      <div className="res-list">
        {keys.map(k => (
          <button key={k} className={`res-item ${sel === k ? 'on' : ''}`} onClick={() => setSel(k)}>{k}</button>
        ))}
      </div>
      <div className="res-edit">
        <div className="ed-row-head"><span>{sel} · {entry.kind}</span><button className="ed-btn" onClick={reset}>복원</button></div>

        <div className="res-kind">
          {/* pixel kind requires grid data; a vector (or vector→image) resource has none, so
              forcing kind:'pixel' would render an empty grid and crash drawArt. Gate on entry.grid. */}
          <button className={entry.kind === 'pixel' ? 'on' : ''} disabled={!entry.grid}
            onClick={() => savePatch({ kind: 'pixel' })}>픽셀</button>
          <button className={entry.kind === 'image' ? 'on' : ''}
            onClick={() => savePatch({ kind: 'image', src: entry.src || 'assets/.png', w: entry.w || 34, h: entry.h || 34 })}>이미지</button>
        </div>

        {isPixel && entry.grid && (
          <>
            <div className="res-palette">
              <button className={paintCh === null ? 'on' : ''} onClick={() => setPaintCh(null)}>지움(.)</button>
              {Object.entries(entry.map || {}).map(([ch, color]) => (
                <button key={ch} className={paintCh === ch ? 'on' : ''} style={{ background: color }}
                  onClick={() => setPaintCh(ch)}>{ch}</button>
              ))}
            </div>
            <div className="res-grid">
              {entry.grid.map((row, r) => (
                <div key={r} className="res-grid-row">
                  {row.split('').map((ch, c) => (
                    <button key={c} className="res-px"
                      style={{ background: ch === '.' || ch === ' ' ? '#0e0f23' : (entry.map[ch] || '#f0f') }}
                      onClick={() => paintCell(r, c)} />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {entry.kind === 'image' && (
          <div className="res-image-form">
            {['src', 'w', 'h', 'dx', 'dy'].map(f => (
              <label key={f} className="res-imgf"><span>{f}</span>
                <input value={entry[f] ?? ''} onChange={(e) => savePatch({ [f]: f === 'src' ? e.target.value : Number(e.target.value) || 0 })} />
              </label>
            ))}
            <label className="res-imgf"><span>smooth</span>
              <input type="checkbox" checked={!!entry.smooth} onChange={(e) => savePatch({ smooth: e.target.checked })} /></label>
          </div>
        )}

        {entry.kind === 'vector' && <div className="ed-warn">벡터 아트는 이미지로만 스왑 가능합니다.</div>}
      </div>
    </div>
  );
};
const PALETTE = [
  ['erase', '지우개'], ['wall', '벽'], ['crack', '발판'], ['pad', '컨베이어'],
  ['spike', '가시'], ['turret', '포대'], ['beam', '레이저'], ['gem', '별'], ['goal', '게이트'],
  ['start', '시작'], ['enemy:chase', '추적자'], ['enemy:bounce', '반사체'], ['enemy:lunge', '돌격수'],
];
const STAGE_TYPES = ['normal', 'survive', 'collect', 'boss'];
const BOSS_ATKS = ['rain', 'aimed', 'pincer', 'sweep', 'sweepGap', 'full', 'converge', 'alternate', 'spread', 'laser', 'spiral', 'summon', 'mark', 'drift'];

const cloneDef = (def) => JSON.parse(JSON.stringify(def));
const blankDef = () => ({
  id: 1000, type: 'survive', name: '커스텀', sub: '', tip: '',
  interval: 2, surviveTurns: 12, pool: [],
  walls: [], cracks: [], pads: [], spikes: [], turrets: [], beams: [], enemies: [], gems: [],
  goal: null, start: null,
});
// pool membership compared by value (JSON clone breaks PAT reference identity)
const patKey = (p) => (p ? `${p.n}|${(p.c || []).join(',')}|${(p.laser || []).join(',')}` : '');

// editable board: draws the hex grid + current def occupants; click → onCell(r,c)
const EditorBoard = ({ def, onCell }) => {
  const { hc, hp, SW, SH, R, C } = window.HX;
  const keyset = (arr) => new Set((arr || []).map(o => `${o.r},${o.c}`));
  const W = keyset(def.walls), CR = keyset(def.cracks), PD = keyset(def.pads),
        SP = keyset(def.spikes), TT = keyset(def.turrets), GM = keyset(def.gems),
        BM = keyset(def.beams),
        EN = new Map((def.enemies || []).map(e => [`${e.r},${e.c}`, e.kind]));
  const cells = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const k = `${r},${c}`; const { x, y } = hc(r, c);
    let fill = '#1c1f3e';
    if (W.has(k)) fill = '#3a3f6e'; else if (CR.has(k)) fill = '#2a2440';
    else if (PD.has(k)) fill = '#13402c'; else if (SP.has(k)) fill = '#2e1217';
    else if (TT.has(k)) fill = '#23264a'; else if (BM.has(k)) fill = '#0b2e3a';
    else if (GM.has(k)) fill = '#3a2a18';
    else if (def.goal && def.goal.r === r && def.goal.c === c) fill = '#1e1442';
    else if (def.start && def.start.r === r && def.start.c === c) fill = '#0c2942';
    else if (EN.has(k)) fill = EN.get(k) === 'bounce' ? '#0c2a3a' : EN.get(k) === 'lunge' ? '#3a1a0a' : '#3b0a1a';
    cells.push(<path key={k} d={hp(x, y)} fill={fill} stroke="#2a2e58" strokeWidth="1.2"
      style={{ cursor: 'pointer' }} onClick={() => onCell(r, c)} />);
  }
  return <svg className="ed-board" width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}>{cells}</svg>;
};

const StageProps = ({ def, setDef }) => {
  const upd = (patch) => setDef({ ...def, ...patch });
  const phases = def.phases || [];
  const total = (ph) => ph.reduce((a, p) => a + (p.turns || 0), 0);
  const setPhase = (i, patch) => { const next = phases.map((p, j) => (j === i ? { ...p, ...patch } : p)); upd({ phases: next, bossTotal: total(next) }); };
  const addPhase = () => { const next = [...phases, { type: 'rain', turns: 4, name: '산탄' }]; upd({ phases: next, bossTotal: total(next) }); };
  const delPhase = (i) => { const next = phases.filter((_, j) => j !== i); upd({ phases: next, bossTotal: total(next) }); };
  const poolHas = (k) => (def.pool || []).some(p => patKey(p) === patKey(window.HX.PAT[k]));
  const togglePool = (k) => {
    const cur = def.pool || [];
    upd({ pool: poolHas(k) ? cur.filter(p => patKey(p) !== patKey(window.HX.PAT[k])) : [...cur, window.HX.PAT[k]] });
  };
  const PATTERN_KEYS = Object.keys(window.HX.PAT);

  return (
    <div className="stage-props">
      <label className="pf"><span>이름</span><input value={def.name || ''} onChange={(e) => upd({ name: e.target.value })} /></label>
      <label className="pf"><span>설명(sub)</span><input value={def.sub || ''} onChange={(e) => upd({ sub: e.target.value })} /></label>
      <label className="pf"><span>팁</span><input value={def.tip || ''} onChange={(e) => upd({ tip: e.target.value })} /></label>
      <label className="pf"><span>타입</span>
        <select value={def.type} onChange={(e) => upd({ type: e.target.value })}>
          {STAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select></label>
      <label className="pf"><span>소환주기</span><input type="number" min="1" max="6" value={def.interval || 2} onChange={(e) => upd({ interval: Number(e.target.value) })} /></label>

      {def.type === 'survive' && (
        <label className="pf"><span>생존 턴</span><input type="number" min="1" value={def.surviveTurns || 12} onChange={(e) => upd({ surviveTurns: Number(e.target.value) })} /></label>
      )}

      {def.type !== 'boss' && (
        <div className="pf-pool">
          <span>패턴 풀</span>
          <div className="pool-keys">
            {PATTERN_KEYS.map(k => (
              <button key={k} className={poolHas(k) ? 'on' : ''} onClick={() => togglePool(k)}>{window.HX.PAT[k].n}</button>
            ))}
          </div>
        </div>
      )}

      {def.type === 'boss' && (
        <div className="pf-phases">
          <div className="ed-row-head"><span>보스 페이즈 (총 {def.bossTotal || 0})</span><button className="ed-btn" onClick={addPhase}>+ 페이즈</button></div>
          {phases.map((p, i) => (
            <div key={i} className="phase-row">
              <select value={p.type} onChange={(e) => setPhase(i, { type: e.target.value })}>
                {BOSS_ATKS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <input className="ph-name" value={p.name || ''} onChange={(e) => setPhase(i, { name: e.target.value })} placeholder="이름" />
              <input className="ph-turns" type="number" min="1" value={p.turns || 1} onChange={(e) => setPhase(i, { turns: Number(e.target.value) })} />
              <button className="ph-del" onClick={() => delPhase(i)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StageTab = ({ flash, onTestPlay }) => {
  const { STAGES } = window.HXS;
  const mkList = () => STAGES.map((s, i) => ({ idx: i, id: s.id, name: s.name, custom: s.id >= 1000 }));
  const [list, setList] = useStateE(mkList);
  const [def, setDef] = useStateE(null);
  const [tool, setTool] = useStateE('wall');

  const loadStage = (idx) => setDef({ ...cloneDef(STAGES[idx]), stageIdx: idx });
  const newCustom = () => {
    const maxId = Math.max(999, ...STAGES.map(s => s.id));
    setDef({ ...blankDef(), id: maxId + 1, stageIdx: STAGES.length });
  };

  const place = (r, c) => {
    if (!def) return;
    const d = cloneDef(def);
    const removeAt = (arr) => (arr || []).filter(o => !(o.r === r && o.c === c));
    d.walls = removeAt(d.walls); d.cracks = removeAt(d.cracks); d.pads = removeAt(d.pads);
    d.beams = removeAt(d.beams);
    d.spikes = removeAt(d.spikes); d.turrets = removeAt(d.turrets); d.enemies = removeAt(d.enemies);
    d.gems = removeAt(d.gems);
    if (d.goal && d.goal.r === r && d.goal.c === c) d.goal = null;
    if (d.start && d.start.r === r && d.start.c === c) d.start = null;

    if (tool === 'erase') { /* removed above */ }
    else if (tool === 'wall') (d.walls = d.walls || []).push({ r, c });
    else if (tool === 'crack') (d.cracks = d.cracks || []).push({ r, c });
    else if (tool === 'pad') (d.pads = d.pads || []).push({ r, c, dir: 1 });
    else if (tool === 'spike') (d.spikes = d.spikes || []).push({ r, c });
    else if (tool === 'turret') (d.turrets = d.turrets || []).push({ r, c, period: 3, phase: 0 });
    else if (tool === 'beam') (d.beams = d.beams || []).push({ r, c, period: 4 });
    else if (tool === 'gem') (d.gems = d.gems || []).push({ r, c });
    else if (tool === 'goal') d.goal = { r, c };
    else if (tool === 'start') d.start = { r, c };
    else if (tool.startsWith('enemy:')) (d.enemies = d.enemies || []).push({ r, c, kind: tool.split(':')[1], dir: 1 });
    setDef(d);
  };

  const save = () => {
    const cur = window.HXE.readLS(window.HXE.LS.stages, { overrides: {}, custom: [] });
    const clean = cloneDef(def); delete clean.stageIdx;
    if (def.id >= 1000) {
      const i = cur.custom.findIndex(s => s.id === def.id);
      if (i >= 0) cur.custom[i] = clean; else cur.custom.push(clean);
    } else {
      cur.overrides = cur.overrides || {};
      cur.overrides[def.id] = clean;
    }
    window.HXE.writeLS(window.HXE.LS.stages, cur);
    window.HXE.applyOverrides();
    setList(mkList());
    flash('스테이지 저장됨');
  };
  const validate = () => {
    const res = window.HXE.validateStage(def);
    flash(res.ok ? '검증 통과 — 안전 이동 항상 존재' : res.warnings[0]);
  };

  return (
    <div className="ed-pane stage-pane">
      <div className="stage-list">
        <button className="ed-btn" onClick={newCustom}>+ 새 커스텀</button>
        {list.map(s => (
          <button key={s.id} className={`stage-litem ${def && def.id === s.id ? 'on' : ''}`} onClick={() => loadStage(s.idx)}>
            {String(s.id).padStart(2, '0')} {s.name}{s.custom ? ' ·C' : ''}
          </button>
        ))}
      </div>

      {def && (
        <div className="stage-canvas">
          <div className="ed-palette">
            {PALETTE.map(([t, label]) => (
              <button key={t} className={`ed-tool ${tool === t ? 'on' : ''}`} onClick={() => setTool(t)}>{label}</button>
            ))}
          </div>
          <EditorBoard def={def} onCell={place} />
          <div className="stage-actions">
            <button className="ed-btn" onClick={validate}>검증</button>
            <button className="ed-btn" onClick={() => onTestPlay(def)}>테스트 ▶</button>
            <button className="ed-btn primary" onClick={save}>저장</button>
          </div>
        </div>
      )}

      {def && <StageProps def={def} setDef={setDef} />}
    </div>
  );
};

const EditorScreen = ({ onExit, onTestPlay }) => {
  const [tab, setTab] = useStateE('balance'); // balance | resource | stage
  const [msg, setMsg] = useStateE('');
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 1500); };

  return (
    <div className="screen editor">
      <div className="ed-bar">
        <button className="back-btn" onClick={onExit}>← 메뉴</button>
        <span className="ed-title">에디터</span>
        <div className="ed-tabs">
          {['balance', 'resource', 'stage'].map(t => (
            <button key={t} className={`ed-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {t === 'balance' ? '밸런스' : t === 'resource' ? '리소스' : '스테이지'}
            </button>
          ))}
        </div>
        <EditorIO flash={flash} />
      </div>
      {msg && <div className="ed-flash">{msg}</div>}
      <div className="ed-body">
        {tab === 'balance' && <BalanceTab flash={flash} />}
        {tab === 'resource' && <ResourceTab flash={flash} />}
        {tab === 'stage' && <StageTab flash={flash} onTestPlay={onTestPlay} />}
      </div>
    </div>
  );
};

Object.assign(window, { EditorScreen });
