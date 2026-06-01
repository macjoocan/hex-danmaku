/* editor.jsx — in-game editor UI (Stage / Balance / Resource). Exports EditorScreen.
 * Tab bodies are filled in by later tasks; this is the shell + routing. */
const { useState: useStateE } = React;

// placeholders — replaced by real tabs in later tasks
const EditorIO = () => <span className="ed-io" />;
const BalanceTab = () => <div className="ed-pane">밸런스 — 다음 단계</div>;
const ResourceTab = () => <div className="ed-pane">리소스 — 다음 단계</div>;
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
