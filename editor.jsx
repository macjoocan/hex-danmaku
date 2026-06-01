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
          <button className={entry.kind === 'pixel' ? 'on' : ''} disabled={entry.kind === 'vector'}
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
const StageTab = () => <div className="ed-pane">스테이지 — 다음 단계</div>;

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
