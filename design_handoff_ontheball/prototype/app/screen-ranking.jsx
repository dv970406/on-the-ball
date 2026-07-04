// app/screen-ranking.jsx — Ranking poll (e.g. Ballon d'Or) + Kit vote
// Both are detail-modal screens, not tabs.

// === RANKING ===
const RANKING_DATA = {
  'ballon-2026': {
    title: '올해 발롱도르, 1위는?',
    sub: '한 명만 골라요. 결과는 투표 즉시 공개돼요.',
    tag: "Ballon d'Or",
    deadline: 'D-8',
    candidates: [
      { id: 'mbappe',   name: '음바페',   club: 'Real Madrid', flag: 'FR', count: 8214, hue: 220 },
      { id: 'haaland',  name: '홀란드',   club: 'Man City',    flag: 'NO', count: 5612, hue: 200 },
      { id: 'bellingham', name: '벨링엄', club: 'Real Madrid', flag: 'EN', count: 4498, hue: 60 },
      { id: 'rodri',    name: '로드리',   club: 'Man City',    flag: 'ES', count: 3120, hue: 30 },
      { id: 'vinicius', name: '비니시우스', club: 'Real Madrid', flag: 'BR', count: 2018, hue: 120 },
      { id: 'palmer',   name: '팔머',     club: 'Chelsea',     flag: 'EN', count: 1429, hue: 280 },
    ],
  },
};

const RankingDetail = ({ id, onClose }) => {
  useLucide();
  const data = RANKING_DATA[id] || RANKING_DATA['ballon-2026'];
  const [picked, setPicked] = React.useState(null);
  const [voted, setVoted] = React.useState(false);

  // Sort: when voted, by count descending; else original order
  const candidates = React.useMemo(() => {
    if (voted) return [...data.candidates].sort((a,b) => b.count - a.count);
    return data.candidates;
  }, [voted]);

  const total = data.candidates.reduce((s,c) => s + c.count, 0);

  return (
    <div className="otb-result" style={{ background: '#fff' }}>
      <SubHeader title={data.tag} onBack={onClose} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 142 }}>
        <div style={{ padding: '12px 20px 24px' }}>
          {/* HERO with trophy */}
          <div style={{
            background: '#1c1c1c', color: '#fff', borderRadius: 18,
            padding: 22, marginBottom: 18, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Pill variant="green" dot="#171717">진행 중</Pill>
              <span style={{ fontSize: 11, color: '#9a9a9a' }}>
                마감 {data.deadline}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ffdb13',
                  letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4,
                }}>BALLON D'OR · 2026</div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
                  letterSpacing: '-0.4px', lineHeight: 1.2, color: '#fff',
                }}>{data.title}</div>
                <div style={{ fontSize: 12, color: '#9a9a9a', marginTop: 6 }}>
                  <span className="otb-mono">{total.toLocaleString()}</span>명이 한 표 던졌어요
                </div>
              </div>
              <Icon name="trophy" size={42} color="#ffdb13" />
            </div>
          </div>

          {/* Vote list */}
          <div style={{
            border: '1px solid var(--hairline)', borderRadius: 14, padding: 6,
          }}>
            {candidates.map((c, i) => {
              const pct = c.count / total;
              const isLead = i === 0;
              const isMine = picked === c.id;
              return (
                <div key={c.id}
                  className={`otb-vote-row${isMine ? ' is-selected' : ''}`}
                  onClick={() => !voted && setPicked(c.id)}>
                  <span className="rk">{(i+1).toString().padStart(2,'0')}</span>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9999,
                    background: `hsl(${c.hue},40%,92%)`,
                    border: '1px solid var(--hairline-cool)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14,
                    color: 'var(--ink)', flexShrink: 0,
                    position: 'relative',
                  }}>
                    {c.name[0]}
                    <span style={{ position: 'absolute', bottom: -2, right: -2 }}>
                      <FlagSVG kind={c.flag} w={14} h={10} />
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span className="nm">{c.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>· {c.club}</span>
                      {voted && (
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                          <span className="otb-mono" style={{ fontSize: 13, color: 'var(--ink)' }}>
                            {(pct * 100).toFixed(1)}%
                          </span>
                        </span>
                      )}
                    </div>
                    {voted && (
                      <>
                        <div className="otb-vote-bar">
                          <i style={{
                            width: `${pct * 100}%`,
                            background: isLead ? 'var(--primary)' : isMine ? 'var(--ink)' : 'var(--ink-mute-2)',
                          }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ink-mute-2)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                          {c.count.toLocaleString()}표
                          {isMine && <span style={{ color: 'var(--primary-deep)', marginLeft: 8 }}>· 내 표</span>}
                        </div>
                      </>
                    )}
                  </div>
                  {!voted && (
                    <span className={`otb-radio${isMine ? ' is-on' : ''}`} />
                  )}
                </div>
              );
            })}
          </div>

          {voted && (
            <div style={{ marginTop: 18 }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
                color: 'var(--ink)', marginBottom: 10,
              }}>지역별 1위</div>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
              }}>
                {[
                  ['유럽', '음바페', '38%'],
                  ['남미', '비니시우스', '52%'],
                  ['아시아', '벨링엄', '34%'],
                  ['북미', '홀란드', '41%'],
                ].map(([reg, n, p]) => (
                  <div key={reg} style={{
                    border: '1px solid var(--hairline-cool)', borderRadius: 10, padding: 10,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--ink-mute-2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{reg}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginTop: 2 }}>{n}</div>
                    <div className="otb-mono" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>{p}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky CTA */}
      {!voted && (
        <div className="otb-cta-strip">
          <Btn variant="dark" block disabled={!picked} onClick={() => setVoted(true)}>
            {picked ? `${data.candidates.find(c => c.id === picked).name}에 한 표` : '한 명을 골라주세요'}
          </Btn>
        </div>
      )}
    </div>
  );
};

// === KIT VOTE ===
const KIT_DATA = {
  'kit-2526': {
    title: '25/26 시즌 가장 예쁜 홈 유니폼',
    sub: '디자인만 봐요. 클럽 호불호 잠시 내려놓고.',
    tag: '유니폼',
    deadline: 'D-5',
    kits: [
      { id: 'mu',  club: '맨유',    tone: '#da291c', stripe: null,    votes: 1844, my: false },
      { id: 'ars', club: '아스널',  tone: '#ef0107', stripe: 'sash',  votes: 2110, my: false },
      { id: 'liv', club: '리버풀',  tone: '#c8102e', stripe: null,    votes: 1392, my: false },
      { id: 'chl', club: '첼시',    tone: '#034694', stripe: 'h',     votes: 1102, my: false },
      { id: 'mci', club: '맨시티',  tone: '#6cabdd', stripe: null,    votes:  892, my: false },
      { id: 'tot', club: '토트넘',  tone: '#ffffff', stripe: 'h',     votes:  874, my: false, dark: true },
    ],
  },
};

const KitVoteDetail = ({ id, onClose }) => {
  useLucide();
  const data = KIT_DATA[id] || KIT_DATA['kit-2526'];
  const [voted, setVoted] = React.useState(null); // id of voted kit
  const total = data.kits.reduce((s,k) => s + k.votes, 0) + (voted ? 1 : 0);

  return (
    <div className="otb-result" style={{ background: '#fff' }}>
      <SubHeader title={data.tag} onBack={onClose} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 122 }}>
        <div style={{ padding: '12px 20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Pill variant="green" dot="#171717">진행 중</Pill>
            <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
              <span className="otb-mono">{total.toLocaleString()}</span>명 투표 · 마감 {data.deadline}
            </span>
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600,
            letterSpacing: '-0.5px', lineHeight: 1.2, color: 'var(--ink)', margin: '0 0 6px',
          }}>{data.title}</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '0 0 18px', lineHeight: 1.45 }}>
            {data.sub}
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
          }}>
            {data.kits.map(k => {
              const isVoted = voted === k.id;
              const myCount = k.votes + (isVoted ? 1 : 0);
              const pct = myCount / total;
              return (
                <div key={k.id}
                  className={`otb-kit-card${isVoted ? ' voted' : ''}`}
                  onClick={() => setVoted(isVoted ? null : k.id)}>
                  <div className="otb-kit-shirt">
                    <ShirtSVG tone={k.tone} stripe={k.stripe} dark={k.dark} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--ink)' }}>
                      {k.club}
                    </div>
                    {voted ? (
                      <div style={{ marginTop: 6 }}>
                        <div className="otb-vote-bar" style={{ marginTop: 0 }}>
                          <i style={{ width: `${pct * 100}%`, background: isVoted ? 'var(--primary)' : 'var(--ink-mute-2)' }} />
                        </div>
                        <div className="otb-mono" style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 4 }}>
                          {(pct * 100).toFixed(1)}% · {myCount.toLocaleString()}표
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        marginTop: 6, display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 11, color: isVoted ? 'var(--primary-deep)' : 'var(--ink-mute)',
                      }}>
                        {isVoted
                          ? <><Icon name="check" size={11} /> 내 한 표</>
                          : '탭해서 한 표'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {voted && (
            <div className="otb-anim-fade-up" style={{ marginTop: 20, padding: 14,
              background: 'var(--canvas-soft)', borderRadius: 12,
              border: '1px solid var(--hairline-cool)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Icon name="check-circle-2" size={16} color="var(--primary-deep)" />
              <div style={{ fontSize: 12, color: 'var(--ink)', flex: 1 }}>
                {data.kits.find(k => k.id === voted).club}에 한 표 던졌어요.
                {' '}<span style={{ color: 'var(--ink-mute)' }}>마음 바뀌면 다시 탭해서 취소.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ShirtSVG = ({ tone, stripe, dark }) => (
  <svg viewBox="0 0 120 120" width="78%" height="78%">
    <defs>
      <clipPath id={`shirt-${tone.replace('#','')}`}>
        <path d="M40 20 L52 14 Q60 24 68 14 L80 20 L100 30 L92 50 L82 46 L82 100 Q60 108 38 100 L38 46 L28 50 L20 30 Z" />
      </clipPath>
    </defs>
    <g clipPath={`url(#shirt-${tone.replace('#','')})`}>
      <rect width="120" height="120" fill={tone} />
      {stripe === 'v' && (
        <g fill="rgba(255,255,255,0.22)">
          <rect x="48" y="0" width="8" height="120" />
          <rect x="64" y="0" width="8" height="120" />
        </g>
      )}
      {stripe === 'h' && (
        <g fill={dark ? 'rgba(13,30,80,0.85)' : 'rgba(255,255,255,0.2)'}>
          <rect x="0" y="40" width="120" height="6" />
          <rect x="0" y="56" width="120" height="6" />
        </g>
      )}
      {stripe === 'sash' && (
        <rect x="-20" y="42" width="180" height="16" fill="rgba(255,255,255,0.32)" transform="rotate(-18 60 60)" />
      )}
    </g>
    <path d="M40 20 L52 14 Q60 24 68 14 L80 20 L100 30 L92 50 L82 46 L82 100 Q60 108 38 100 L38 46 L28 50 L20 30 Z"
      fill="none" stroke={dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)'} strokeWidth="1" />
  </svg>
);

Object.assign(window, { RANKING_DATA, KIT_DATA, RankingDetail, KitVoteDetail, ShirtSVG });
