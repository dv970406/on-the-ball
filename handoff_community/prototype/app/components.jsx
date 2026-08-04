// app/components.jsx — shared UI pieces for 온더볼

const useLucide = (dep) => {
  React.useEffect(() => {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  });
};

const Icon = ({ name, size = 16, color, style }) => (
  <i data-lucide={name} style={{ width: size, height: size, color: color || 'currentColor', display: 'inline-flex', ...style }} />
);

const Pill = ({ children, variant = 'soft', dot, style }) => {
  const cls = `otb-pill otb-pill-${variant}`;
  return (
    <span className={cls} style={style}>
      {dot ? <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, display: 'inline-block', marginRight: 2 }} /> : null}
      {children}
    </span>
  );
};

const LiveDot = ({ color = 'var(--primary)' }) => (
  <span style={{
    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
    background: color, boxShadow: `0 0 0 4px ${color === 'var(--primary)' ? 'rgba(62,207,142,0.18)' : 'rgba(0,0,0,0.06)'}`,
  }} />
);

const Wordmark = () => (
  <span className="otb-wm">
    <span className="otb-wm-ball" />
    온더볼
  </span>
);

// Player silhouette SVG — a placeholder portrait
const PlayerSilhouette = ({ tone = 'rgba(255,255,255,0.85)' }) => (
  <svg viewBox="0 0 120 160" style={{ width: '100%', display: 'block' }}>
    {/* head */}
    <circle cx="60" cy="34" r="20" fill={tone} />
    {/* shoulders + torso */}
    <path
      d="M16 160 L16 96 Q16 64 60 60 Q104 64 104 96 L104 160 Z"
      fill={tone}
    />
  </svg>
);

// Compact crest (square)
const CrestPH = ({ tone = '#dfdfdf', letter = '?', size = 18, ring }) => (
  <span style={{
    width: size, height: size, borderRadius: 3,
    background: tone, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: Math.round(size * 0.55),
    flexShrink: 0,
    border: ring ? `1px solid ${ring}` : undefined,
  }}>{letter}</span>
);

// Inline flag SVGs — small set covering common football nations
const FlagSVG = ({ kind, w = 20, h = 14 }) => {
  const flags = {
    KR: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="4.5" fill="#cd2e3a"/><path d="M10.5 10 A 4.5 4.5 0 0 1 19.5 10 A 2.25 2.25 0 0 1 15 10 A 2.25 2.25 0 0 0 10.5 10 Z" fill="#0047a0"/></svg>,
    EN: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="20" fill="#fff"/><rect x="13" width="4" height="20" fill="#ce1124"/><rect y="8" width="30" height="4" fill="#ce1124"/></svg>,
    GB: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="20" fill="#012169"/><path d="M0 0 L30 20 M30 0 L0 20" stroke="#fff" strokeWidth="3"/><path d="M0 0 L30 20 M30 0 L0 20" stroke="#c8102e" strokeWidth="1.5"/><path d="M15 0 V20 M0 10 H30" stroke="#fff" strokeWidth="5"/><path d="M15 0 V20 M0 10 H30" stroke="#c8102e" strokeWidth="3"/></svg>,
    BR: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="20" fill="#009b3a"/><path d="M15 2.5 L27 10 L15 17.5 L3 10 Z" fill="#fedf00"/><circle cx="15" cy="10" r="3.2" fill="#002776"/></svg>,
    AR: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="20" fill="#74acdf"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><circle cx="15" cy="10" r="1.6" fill="#fcbf49"/></svg>,
    FR: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="10" height="20" fill="#0055a4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ef4135"/></svg>,
    ES: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/></svg>,
    DE: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="6.67" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#dd0000"/><rect y="13.33" width="30" height="6.67" fill="#ffce00"/></svg>,
    NL: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="6.67" fill="#ae1c28"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#21468b"/></svg>,
    PT: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="12" height="20" fill="#006600"/><rect x="12" width="18" height="20" fill="#ff0000"/><circle cx="12" cy="10" r="2.8" fill="#fcd116" stroke="#fff" strokeWidth="0.4"/></svg>,
    BE: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="10" height="20" fill="#000"/><rect x="10" width="10" height="20" fill="#fdda24"/><rect x="20" width="10" height="20" fill="#ef3340"/></svg>,
    IT: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce2b37"/></svg>,
    HR: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="6.67" fill="#ff0000"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#171796"/><rect x="12" y="4" width="6" height="8" fill="#fff" stroke="#171796" strokeWidth="0.4"/></svg>,
    NO: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="20" fill="#ef2b2d"/><rect x="10" width="4" height="20" fill="#fff"/><rect y="8" width="30" height="4" fill="#fff"/><rect x="11" width="2" height="20" fill="#002868"/><rect y="9" width="30" height="2" fill="#002868"/></svg>,
    UY: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="20" fill="#fff"/><rect y="2.22" width="30" height="2.22" fill="#0038a8"/><rect y="6.66" width="30" height="2.22" fill="#0038a8"/><rect y="11.11" width="30" height="2.22" fill="#0038a8"/><rect y="15.55" width="30" height="2.22" fill="#0038a8"/><rect width="12" height="11" fill="#fff"/><circle cx="6" cy="5.5" r="1.8" fill="#fcd116"/></svg>,
    SN: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="10" height="20" fill="#00853f"/><rect x="10" width="10" height="20" fill="#fdef42"/><rect x="20" width="10" height="20" fill="#e31b23"/><polygon points="15,8 15.8,10.5 18.5,10.5 16.4,12 17.2,14.5 15,13 12.8,14.5 13.6,12 11.5,10.5 14.2,10.5" fill="#00853f"/></svg>,
    EG: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="6.67" fill="#ce1126"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#000"/></svg>,
    PL: <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#dc143c"/></svg>,
  };
  return (
    <span className="otb-flag-sq" style={{ width: w, height: h }}>
      {flags[kind] || <svg viewBox="0 0 30 20" width={w} height={h}><rect width="30" height="20" fill="#dfdfdf"/></svg>}
    </span>
  );
};

// Bottom tab bar
const BottomNav = ({ tab, setTab }) => {
  useLucide(tab);
  const items = [
    { id: 'home',     label: '홈',     icon: 'home' },
    { id: 'balance',  label: '밸런스',  icon: 'split-square-vertical' },
    { id: 'quiz',     label: '퀴즈',    icon: 'puzzle' },
    { id: 'tmi',      label: 'TMI',    icon: 'flame' },
    { id: 'me',       label: '내 활동', icon: 'user' },
  ];
  return (
    <div className="otb-tabbar">
      {items.map(it => (
        <div key={it.id}
          className={`otb-tab${tab === it.id ? ' is-active' : ''}`}
          onClick={() => setTab(it.id)}>
          <span className="otb-tab-icon">
            <Icon name={it.icon} size={20} />
          </span>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
};

// Top app bar (sticky)
const AppBar = ({ left, right, transparent }) => {
  useLucide();
  return (
    <div className="otb-bar" style={transparent ? { background: 'transparent', borderBottom: 0 } : {}}>
      {left || <Wordmark />}
      <div className="otb-bar-icons">
        {right || (
          <>
            <span className="otb-streak">
              <span className="otb-streak-dot">🔥</span>
              12일 연속
            </span>
            <button className="otb-icon-btn"><Icon name="search" size={16} /></button>
            <button className="otb-icon-btn"><Icon name="bell" size={16} /></button>
          </>
        )}
      </div>
    </div>
  );
};

// Detail "screen" header for sub-pages
const SubHeader = ({ title, onBack, dark = false }) => {
  useLucide();
  return (
    <div style={{
      paddingTop: 60, paddingLeft: 8, paddingRight: 8, paddingBottom: 10,
      display: 'flex', alignItems: 'center', gap: 4,
      background: dark ? 'rgba(23,23,23,0.85)' : 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      position: 'sticky', top: 0, zIndex: 15,
      borderBottom: '1px solid ' + (dark ? 'rgba(255,255,255,0.08)' : 'var(--hairline-cool)'),
    }}>
      <button onClick={onBack}
        style={{
          width: 36, height: 36, borderRadius: 9999,
          background: 'transparent', border: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          color: dark ? '#fff' : 'var(--ink)',
        }}>
        <Icon name="chevron-left" size={22} />
      </button>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15,
        color: dark ? '#fff' : 'var(--ink)',
      }}>{title}</div>
      <button style={{
        marginLeft: 'auto', width: 36, height: 36, borderRadius: 9999,
        background: 'transparent', border: 0, cursor: 'pointer',
        color: dark ? 'rgba(255,255,255,0.7)' : 'var(--ink-mute)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="share-2" size={18} />
      </button>
    </div>
  );
};

const Btn = ({ variant = 'primary', size, block, children, onClick, style, icon, disabled }) => {
  const cls = `otb-btn otb-btn-${variant}${size === 'sm' ? ' otb-btn-sm' : ''}${block ? ' otb-btn-block' : ''}`;
  return (
    <button type="button" className={cls} onClick={onClick}
      style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto', ...style }}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
};

// SectionHead used in screens
const SectionHead = ({ title, more, onMore }) => (
  <div className="otb-section">
    <h2>{title}</h2>
    {more && <span className="more" onClick={onMore}>{more}</span>}
  </div>
);

Object.assign(window, {
  useLucide, Icon, Pill, LiveDot, Wordmark, PlayerSilhouette, CrestPH, FlagSVG,
  BottomNav, AppBar, SubHeader, Btn, SectionHead,
});
