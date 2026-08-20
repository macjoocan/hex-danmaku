/* ════════════════════════════════════════════════════════════════════════
 *  sprites.jsx — sprite COMPONENTS (shadow + animation + warning wrappers).
 *
 *  These no longer hold any artwork. The pixels/images come from the ART
 *  REGISTRY in resources.jsx — edit a resource THERE, not here.
 *  A component only adds the stuff that isn't art: drop-shadows, the
 *  hop/hover/spin/bob animations, facing flip, dead pose, and the gem ring.
 * ════════════════════════════════════════════════════════════════════════ */

const { drawArt } = window.HXR;

// ─── Hero (humanoid player) ───────────────────────────────────
const PlayerSprite = ({ x, y, dead, face = 1, hopKey = 0, moved = false }) => {
  const art = drawArt('player');
  if (dead) {
    return (
      <g transform={`translate(${x},${y})`}>
        <ellipse cx="0" cy="12" rx="9" ry="2.4" fill="#06121f" opacity="0.45" />
        <g className="hero-dead" transform={`scale(${face},1)`}>{art}</g>
      </g>
    );
  }
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx="0" cy="13" rx="8" ry="2.1" fill="#06121f" opacity="0.4" />
      <g transform={`scale(${face},1)`}>
        <g className="hero-idle">
          <g className={moved ? 'hero-hop' : undefined} key={hopKey}>{art}</g>
        </g>
      </g>
    </g>
  );
};

// ─── Drone (enemy "bullet") ───────────────────────────────────
const BulletSprite = ({ x, y, fz }) => {
  const art = drawArt(fz ? 'droneFz' : 'drone');
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx="0" cy="8" rx="5.5" ry="1.4" fill={fz ? '#1e3a8a' : '#3a0a14'} opacity="0.35" />
      <g className="drone-hover">{art}</g>
    </g>
  );
};

// ─── Pickups (warning-capable) ────────────────────────────────
const StarSprite = ({ x, y, warn }) => <g transform={`translate(${x},${y})`}>{drawArt('star', { warn })}</g>;
const BombSprite = ({ x, y, warn }) => <g transform={`translate(${x},${y})`}>{drawArt('bomb', { warn })}</g>;
const TpSprite   = ({ x, y, warn }) => <g transform={`translate(${x},${y})`}>{drawArt('tp',   { warn })}</g>;
const HintSprite = ({ x, y, warn }) => <g transform={`translate(${x},${y})`}>{drawArt('hint', { warn })}</g>;
const CoinSprite = ({ x, y, warn }) => <g transform={`translate(${x},${y})`}>{drawArt('coin', { warn })}</g>;

// ─── Explosion burst ──────────────────────────────────────────
const ExplodeSprite = ({ x, y }) => (
  <g transform={`translate(${x},${y})`}>
    <g className="xboom">{drawArt('explode')}</g>
  </g>
);

// ─── Portal / warp gate (goal) — animated swirl ───────────────
const PortalSprite = ({ x, y }) => (
  <g transform={`translate(${x},${y})`}>
    <g className="portal-spin">{drawArt('portal')}</g>
  </g>
);

// ─── Static wall block — fills the hex (vector) or swapped image ──
const WallSprite = ({ x, y }) => {
  const { hp, SZ } = window.HX;
  // honour an image swap from the registry
  if (window.HXR.isImage('wall')) {
    return <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>{window.HXR.drawArt('wall')}</g>;
  }
  return (
    <g style={{ pointerEvents: 'none' }}>
      <path d={hp(x, y, SZ - 2)} fill="#434a85" stroke="#6b74b8" strokeWidth="2" strokeLinejoin="miter" />
      <path d={hp(x, y, SZ - 6)} fill="url(#wall-hatch)" opacity="0.6" />
    </g>
  );
};

// ─── Gem (required collectible) — art + gold ring + bob ───────
const GemSprite = ({ x, y, warn }) => (
  <g transform={`translate(${x},${y})`}>
    <g className="gem-bob">
      {!window.HXR.isImage('gem') && <circle cx="0" cy="0" r="13" fill="none" stroke="#fde68a" strokeWidth="1" opacity="0.5" />}
      {drawArt('gem', { warn })}
    </g>
  </g>
);

// ─── Chaser enemy — pixel blob + shadow + pulse ───────────────
const ChaserSprite = ({ x, y }) => (
  <g transform={`translate(${x},${y})`}>
    <ellipse cx="0" cy="9" rx="7" ry="2" fill="#3b0a1a" opacity="0.4" />
    <g className="chaser-pulse">{drawArt('chaser')}</g>
  </g>
);

// ─── Spike / hazard — lethal floor, does not block ────────────
const SpikeSprite = ({ x, y }) => (
  <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>{drawArt('spike')}</g>
);

// ─── Turret — static cannon, fires down its column ────────────
const TurretSprite = ({ x, y, warn }) => (
  <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>{drawArt('turret', { warn })}</g>
);

// Bouncer — pixel diamond + shadow + spin
const BouncerSprite = ({ x, y }) => (
  <g transform={`translate(${x},${y})`}>
    <ellipse cx="0" cy="9" rx="7" ry="2" fill="#06121f" opacity="0.4" />
    <g className="chaser-pulse">{drawArt('bouncer')}</g>
  </g>
);

// Lunger — pixel + shadow; charging class when about to dash
const LungerSprite = ({ x, y, charging }) => (
  <g transform={`translate(${x},${y})`}>
    <ellipse cx="0" cy="9" rx="7" ry="2" fill="#2a1206" opacity="0.4" />
    <g className={charging ? 'lunger-charge' : undefined}>{drawArt('lunger')}</g>
  </g>
);

// Conveyor pad — arrow rotated to its direction
// dir index [W,E,NW,NE,SW,SE] -> approx degrees (art points east=0deg)
const PAD_DEG = [180, 0, -120, -60, 120, 60];
const PadSprite = ({ x, y, dir = 1 }) => (
  <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
    <g transform={`rotate(${PAD_DEG[dir] || 0})`}>{drawArt('pad')}</g>
  </g>
);

// Fuse mine telegraph
const MineSprite = ({ x, y, armed }) => (
  <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
    <g className={armed ? 'mine-armed' : 'mine-pulse'}>{drawArt('mine', { warn: armed })}</g>
  </g>
);

// Breakable floor — intact (cracked lines) vs broken (hole)
const CrackSprite = ({ x, y, broken }) => {
  const { hp, SZ } = window.HX;
  if (broken) {
    return (
      <g style={{ pointerEvents: 'none' }}>
        <path d={hp(x, y, SZ - 2)} fill="#0a0c1c" stroke="#2a2e58" strokeWidth="2" strokeLinejoin="miter" />
        <path d={hp(x, y, SZ - 7)} fill="#05060f" />
      </g>
    );
  }
  return (
    <g style={{ pointerEvents: 'none' }}>
      <path d={hp(x, y, SZ - 3)} fill="#332b4d" stroke="#8a7a4d" strokeWidth="1.5" strokeDasharray="3 2" strokeLinejoin="miter" />
      <path d={`M${x - 8},${y - 6} L${x + 2},${y + 1} L${x - 3},${y + 8}`} fill="none" stroke="#8a7a4d" strokeWidth="1" />
    </g>
  );
};

// Beam emitter — pixel device + shadow; pulses while telegraphing
const BeamSprite = ({ x, y, warn }) => (
  <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
    <ellipse cx="0" cy="9" rx="7" ry="2" fill="#06121f" opacity="0.4" />
    <g className={warn ? 'mine-armed' : undefined}>{drawArt('beam')}</g>
  </g>
);

// Boss bomb zone — telegraph (warn pulse) vs armed (solid lethal tile)
const BombZoneSprite = ({ x, y, armed }) => (
  <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
    <g className={armed ? 'mine-armed' : 'mine-pulse'}>{drawArt('bombZone', { warn: !armed })}</g>
  </g>
);

// Boss avatar — board-top presence; idle bob + phase-escalation glow; swap/fallback via RES
const BossAvatarSprite = ({ x, y, sprite, phaseLevel = 0, defeated = false }) => {
  const key = (sprite && window.HXR.RES[sprite]) ? sprite : 'bossDefault';
  const cls = defeated ? 'boss-defeated' : `boss-bob boss-glow-${Math.min(phaseLevel, 4)}`;
  return (
    <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
      <g className={`boss-avatar ${cls}`}>{window.HXR.drawArt(key)}</g>
    </g>
  );
};


// ─── 탄막게임식 총알 (ShotSprite) — 아트 레지스트리와 무관한 기하 글로우 오브 ───
// kind: std(주홍) · zig(보라) · slow(하늘) · drift(호박). fz(프리즈)면 청색 감쇠.
const SHOT_COLORS = {
  std:   { core: '#fff7ed', rim: '#f87171', glow: 'rgba(248,113,113,0.55)' },
  zig:   { core: '#faf5ff', rim: '#c084fc', glow: 'rgba(192,132,252,0.55)' },
  slow:  { core: '#f0f9ff', rim: '#7dd3fc', glow: 'rgba(125,211,252,0.55)' },
  drift: { core: '#fffbeb', rim: '#fbbf24', glow: 'rgba(251,191,36,0.55)' },
  fx:    { core: '#fff7ed', rim: '#fb923c', glow: 'rgba(251,146,60,0.6)' }, // 부유 탄막(연출 전용)
};
const ShotSprite = ({ x = 0, y = 0, kind = 'std', fz = false }) => {
  const c = SHOT_COLORS[kind] || SHOT_COLORS.std;
  const rim = fz ? '#60a5fa' : c.rim;
  return (
    <g transform={`translate(${x},${y})`} className="shot">
      <circle r="9" fill={fz ? 'rgba(96,165,250,0.35)' : c.glow} className="shot-halo" />
      <circle r="6" fill={rim} />
      <circle r="3.2" fill={fz ? '#dbeafe' : c.core} />
    </g>
  );
};

Object.assign(window, {
  PlayerSprite, BulletSprite, StarSprite, BombSprite, TpSprite, HintSprite, CoinSprite,
  ExplodeSprite, PortalSprite, WallSprite, GemSprite, ChaserSprite,
  SpikeSprite, TurretSprite,
  BouncerSprite, LungerSprite, PadSprite, MineSprite, CrackSprite,
  BeamSprite, BombZoneSprite, BossAvatarSprite, ShotSprite,
});
