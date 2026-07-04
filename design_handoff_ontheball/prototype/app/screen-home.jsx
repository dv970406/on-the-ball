// app/screen-home.jsx — Home feed

const HomeScreen = ({ openDetail, setTab }) => {
  useLucide();

  // The featured balance game today
  const featured = {
    id: 'goat',
    tag: '오늘의 밸런스',
    title: '둘 중 한 명만 데려간다면?',
    sub: '평생 한 팀의 감독으로 — 8일 남음',
    a: { name: '메시', sub: 'GOAT, 좌발', tone: '#0a0a0a', text: '#fff', accent: 'var(--primary)' },
    b: { name: '호날두', sub: 'GOAT, 우발', tone: '#fff', text: '#171717', accent: 'var(--accent-crimson)' },
    votes: 28412,
    deadline: 'D-8',
  };

  // Sub balance games carousel
  const subBalance = [
    { id: 'mbappe-haaland', tag: 'EPL vs LaLiga', a: '음바페', b: '홀란드', votes: 9112 },
    { id: 'sangam-westham', tag: '스쿼드', a: '상암 11명', b: '웨스트햄 11명', votes: 4221 },
    { id: 'kit-vs', tag: '유니폼', a: '맨유 25/26', b: '아스널 25/26', votes: 6109 },
  ];

  const polls = [
    { id: 'ballon-2026', kind: 'ranking', title: '올해 발롱도르, 1위는?', tag: 'Ballon d\'Or', votes: 24891, urgent: false, deadline: 'D-8', cover: 'trophy' },
    { id: 'kit-2526',    kind: 'kit',     title: '25/26 시즌 가장 예쁜 유니폼', tag: '유니폼', votes: 8214, urgent: false, deadline: 'D-5', cover: 'kit' },
  ];

  const trending = [
    { rk: 1, title: '메시 vs 호날두, 마지막으로 한 판 더', votes: '28.4k', delta: '+12' },
    { rk: 2, title: '발롱도르 후보 10인 공개', votes: '24.8k', delta: '+3' },
    { rk: 3, title: '맨유 새 유니폼 호불호 논쟁', votes: '9.1k',  delta: '-1' },
    { rk: 4, title: '음바페, 진짜 레알에서 행복할까', votes: '6.2k',  delta: 'new' },
    { rk: 5, title: '벨링엄 폼이 떨어진 이유는?', votes: '5.0k',  delta: '+5' },
  ];

  return (
    <div>
      <AppBar />

      {/* === FEATURED BALANCE === */}
      <div style={{ padding: '14px 20px 4px' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
          color: 'var(--ink-mute)', letterSpacing: 0.8, textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          {featured.tag}
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26, fontWeight: 600, letterSpacing: '-0.6px', lineHeight: 1.2,
          color: 'var(--ink)', margin: '0 0 8px',
        }}>
          {featured.title}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <Pill variant="green" dot="#171717">진행 중</Pill>
          <span style={{ fontSize: 12, color: 'var(--ink-mute)', whiteSpace: 'nowrap' }}>
            <span className="otb-mono" style={{ color: 'var(--ink)' }}>28,412</span>명 투표
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-mute-2)' }}>·</span>
          <span style={{ fontSize: 12, color: 'var(--ink-mute)', whiteSpace: 'nowrap' }}>
            마감 {featured.deadline}
          </span>
        </div>

        <FeatureBalanceCard data={featured} onTap={() => openDetail({ type: 'balance', id: featured.id })} />

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Btn variant="dark" block onClick={() => openDetail({ type: 'balance', id: featured.id })} icon="hand">
            한 표 던지기
          </Btn>
          <Btn variant="secondary" size="sm" icon="bar-chart-3"
            onClick={() => openDetail({ type: 'balance', id: featured.id })}>
            결과
          </Btn>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-mute-2)', textAlign: 'center', marginTop: 8 }}>
          한 번 투표하면 24시간 안에 한 번만 바꿀 수 있어요.
        </div>
      </div>

      <div style={{ height: 32 }} />

      {/* === SUB BALANCE — HORIZONTAL === */}
      <SectionHead title="더 가벼운 양자택일" more="전체" />
      <div style={{
        display: 'flex', gap: 12, overflowX: 'auto', padding: '0 20px 4px',
        scrollbarWidth: 'none',
      }}>
        {subBalance.map(b => (
          <MiniBalanceCard key={b.id} data={b} onTap={() => openDetail({ type: 'balance', id: b.id })} />
        ))}
      </div>

      <div style={{ height: 32 }} />

      {/* === DAILY QUIZ banner — DARK === */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          background: '#1c1c1c', color: '#fff', borderRadius: 18,
          padding: 20, overflow: 'hidden', position: 'relative',
          cursor: 'pointer',
        }} onClick={() => openDetail({ type: 'quiz', id: 'lineup-rm-1718' })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--primary)',
              letterSpacing: 0.8, textTransform: 'uppercase',
            }}>▸ 오늘의 퀴즈</span>
            <span style={{ fontSize: 11, color: '#9a9a9a' }}>정답률 27%</span>
          </div>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 600, letterSpacing: '-0.4px',
            lineHeight: 1.25, margin: '0 0 14px', color: '#fff',
          }}>
            국적만 보고 맞춰봐.<br/>이 라인업, 어느 팀일까?
          </h3>

          {/* preview lineup */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 14,
            display: 'flex', flexDirection: 'column', gap: 10,
            marginBottom: 14,
          }}>
            {[
              ['BE'],
              ['BR','FR','ES','PT'],
              ['DE','HR','BR'],
              ['PT','FR','ES'],
            ].map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                {row.map((f, fi) => <FlagSVG key={fi} kind={f} w={24} h={16} />)}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Btn variant="primary" size="sm">맞춰보기 →</Btn>
            <span style={{ fontSize: 11, color: '#9a9a9a' }}>
              <span className="otb-mono">5,630</span>명 도전 중
            </span>
          </div>
        </div>
      </div>

      <div style={{ height: 32 }} />

      {/* === ONGOING POLLS === */}
      <SectionHead title="진행 중인 투표" more="전체" />
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {polls.map(p => (
          <PollListCard key={p.id} poll={p}
            onTap={() => openDetail({ type: p.kind, id: p.id })} />
        ))}
      </div>

      <div style={{ height: 32 }} />

      {/* === TRENDING === */}
      <SectionHead title="지금 뜨거운 떡밥" />
      <div style={{ borderTop: '1px solid var(--hairline-cool)' }}>
        {trending.map(t => (
          <div key={t.rk} className="otb-trend-row">
            <span className="rk">{t.rk.toString().padStart(2,'0')}</span>
            <span className="ti">{t.title}</span>
            <span className="vt">{t.votes}</span>
            <DeltaPill d={t.delta} />
          </div>
        ))}
      </div>

      <div style={{ height: 32 }} />

      {/* === TMI promo === */}
      <div style={{ padding: '0 20px' }}>
        <div onClick={() => setTab('tmi')}
          style={{
            border: '1px solid var(--hairline)', borderRadius: 16, padding: 18,
            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            background: '#fffdf5',
          }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: '#ffdb13',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
          }}>🔥</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
              선수 TMI · 진실 or 거짓
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 2 }}>
              오늘 12개 떡밥이 들어왔어요. 진위는 다른 팬들이 가립니다.
            </div>
          </div>
          <Icon name="chevron-right" size={18} color="var(--ink-mute-2)" />
        </div>
      </div>

      <div style={{ height: 16 }} />
    </div>
  );
};

const DeltaPill = ({ d }) => {
  if (d === 'new') return <span className="otb-pill otb-pill-green" style={{ fontSize: 9, padding: '3px 5px' }}>NEW</span>;
  const up = d.startsWith('+');
  return (
    <span className="otb-mono" style={{
      fontSize: 10, padding: '2px 5px', borderRadius: 4,
      background: up ? 'rgba(62,207,142,0.14)' : 'rgba(226,0,90,0.08)',
      color: up ? 'var(--primary-deep)' : 'var(--accent-crimson)',
      minWidth: 26, textAlign: 'center',
    }}>{d}</span>
  );
};

// === FEATURE BALANCE CARD ===
// The large hero card with a zig-zag split, inspired by the burger-vote image
// but expressed in the design system's monochrome + emerald.
const FeatureBalanceCard = ({ data, onTap }) => (
  <div onClick={onTap} style={{
    position: 'relative', borderRadius: 18, overflow: 'hidden',
    boxShadow: 'var(--shadow-2)', cursor: 'pointer',
    aspectRatio: '4 / 5',
    display: 'flex', flexDirection: 'column',
  }}>
    {/* TOP — Option A */}
    <FeatureHalf data={data.a} side="a" />
    {/* BOTTOM — Option B */}
    <FeatureHalf data={data.b} side="b" />
    {/* VS badge */}
    <div className="otb-vs-badge">VS</div>
  </div>
);

const FeatureHalf = ({ data, side }) => {
  const isA = side === 'a';
  const clip = isA
    ? 'polygon(0 0, 100% 0, 100% 100%, 0 58%)'
    : 'polygon(0 42%, 100% 0, 100% 100%, 0 100%)';
  return (
    <div style={{
      flex: 1,
      background: data.tone,
      color: data.text,
      position: 'relative',
      clipPath: clip,
      WebkitClipPath: clip,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        top: isA ? 20 : 'auto',
        bottom: isA ? 'auto' : 28,
        left: 20, right: 20,
        textAlign: isA ? 'left' : 'right',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
          background: data.text === '#fff' ? 'rgba(255,255,255,0.15)' : 'rgba(23,23,23,0.08)',
          padding: '3px 7px', borderRadius: 5,
        }}>{isA ? 'A' : 'B'}</span>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 46, fontWeight: 700, letterSpacing: '-1.8px',
          lineHeight: 0.95, marginTop: 10,
        }}>{data.name}</div>
        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>{data.sub}</div>
      </div>
      {/* portrait silhouette in opposite corner */}
      <div style={{
        position: 'absolute',
        bottom: isA ? 0 : 'auto',
        top: isA ? 'auto' : 0,
        right: isA ? 4 : 'auto',
        left: isA ? 'auto' : 4,
        width: '38%',
        opacity: 0.08,
        pointerEvents: 'none',
        transform: isA ? 'none' : 'scaleX(-1)',
      }}>
        <PlayerSilhouette tone={data.text === '#fff' ? '#fff' : '#171717'} />
      </div>
    </div>
  );
};

// === MINI BALANCE CARD (horizontal carousel) ===
const MiniBalanceCard = ({ data, onTap }) => (
  <div onClick={onTap}
    style={{
      flex: '0 0 240px',
      border: '1px solid var(--hairline)',
      borderRadius: 14,
      overflow: 'hidden',
      background: '#fff',
      cursor: 'pointer',
    }}>
    <div style={{
      position: 'relative', height: 110,
      display: 'grid', gridTemplateColumns: '1fr 1fr',
    }}>
      <div style={{
        background: '#171717', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, padding: 8, textAlign: 'center',
      }}>{data.a}</div>
      <div style={{
        background: 'var(--canvas-soft)', color: 'var(--ink)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, padding: 8, textAlign: 'center',
        borderLeft: '1px solid var(--hairline)',
      }}>{data.b}</div>
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        width: 34, height: 34, borderRadius: '50%', background: 'var(--primary)', color: 'var(--on-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, border: '3px solid #fff',
      }}>VS</div>
    </div>
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--ink-mute-2)', fontFamily: 'var(--font-mono)', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>
        {data.tag}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
        <span className="otb-mono" style={{ color: 'var(--ink)' }}>{data.votes.toLocaleString()}</span>명 투표
      </div>
    </div>
  </div>
);

// === LIST POLL CARD (rectangle with mini chart) ===
const PollListCard = ({ poll, onTap }) => {
  useLucide();
  return (
    <div onClick={onTap} className="otb-card" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 14, padding: 16, alignItems: 'flex-start' }}>
        <div style={{
          width: 80, height: 80, borderRadius: 10, flexShrink: 0,
          background: poll.cover === 'trophy' ? '#1c1c1c' : 'var(--canvas-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--hairline-cool)',
          color: poll.cover === 'trophy' ? '#ffdb13' : 'var(--ink-faint)',
        }}>
          {poll.cover === 'trophy' && <Icon name="trophy" size={32} />}
          {poll.cover === 'kit' && (
            <svg viewBox="0 0 80 80" width="56" height="56">
              <path d="M28 14 L36 10 Q40 16 44 10 L52 14 L66 22 L60 36 L54 33 L54 66 Q40 72 26 66 L26 33 L20 36 L14 22 Z"
                fill="var(--primary)" />
            </svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Pill variant="green" dot="#171717">진행 중</Pill>
            <Pill variant="soft">{poll.tag}</Pill>
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, letterSpacing: '-0.3px',
            color: 'var(--ink)', lineHeight: 1.3, marginBottom: 6,
          }}>{poll.title}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
            <span className="otb-mono" style={{ color: 'var(--ink)' }}>{poll.votes.toLocaleString()}</span>명 투표 · 마감 {poll.deadline}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { HomeScreen, FeatureBalanceCard, FeatureHalf, MiniBalanceCard, PollListCard, DeltaPill });
