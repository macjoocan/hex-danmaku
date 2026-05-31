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
      <path d={hp(x, y, SZ - 2)} fill="#3a3f6e" stroke="#565c98" strokeWidth="2" strokeLinejoin="miter" />
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

Object.assign(window, {
  PlayerSprite, BulletSprite, StarSprite, BombSprite, TpSprite, HintSprite,
  ExplodeSprite, PortalSprite, WallSprite, GemSprite, ChaserSprite,
  SpikeSprite, TurretSprite,
});
