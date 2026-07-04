// app/screen-balance.jsx — Balance vote experience (the main attraction)

// Catalog of balance games — exposed by id
const BALANCE_DATA = {
  'goat': {
    title: '평생 한 팀의 감독으로 데려간다면?',
    sub: '메시 한 명 vs 호날두 한 명. 영혼을 걸어야 해요.',
    tag: 'GOAT',
    deadline: 'D-8',
    a: {
      key: 'messi', name: '메시', nameLatin: 'L. Messi',
      meta: '37 · LW · 좌발', tone: '#0a0a0a', text: '#fff', accent: 'var(--primary)',
      stats: [['통산 골', '850+'], ['발롱도르', '8회'], ['우승컵', '46개']],
      blurb: '왼발로 시간을 멈춘다. 패스, 드리블, 마무리 — 한 발에 다 들어 있음.',
      votes: 16284,
    },
    b: {
      key: 'cr7', name: '호날두', nameLatin: 'C. Ronaldo',
      meta: '40 · ST · 우발', tone: '#fff', text: '#171717', accent: 'var(--accent-crimson)',
      stats: [['통산 골', '900+'], ['발롱도르', '5회'], ['우승컵', '34개']],
      blurb: '점프와 자기 통제의 끝판왕. 마흔에도 골을 넣고 있다.',
      votes: 12128,
    },
    comments: [
      { name: '북런던러버', tag: '아스널 팬', time: '8분 전', text: '메시. 한 발에 다 끝나는 선수는 메시밖에 없다.', up: 67 },
      { name: 'CR7Forever',  tag: '맨유 팬',   time: '14분 전', text: '40에 뛰는 선수가 이긴다. 자기관리=실력', up: 42 },
      { name: '한남동소령',   tag: '토트넘 팬', time: '32분 전', text: '둘 다 데려가면 안되나요...', up: 21 },
      { name: 'TT',          tag: '',          time: '1시간 전', text: '메시는 시 같은 축구를 함. 호날두는 산업', up: 88 },
    ],
  },
  'mbappe-haaland': {
    title: '리그 한 시즌만 우리 팀 영입',
    sub: '내년 시즌 단 한 명, 누구를 데려올까?',
    tag: 'EPL vs LaLiga',
    deadline: 'D-3',
    a: { key: 'mbappe', name: '음바페', nameLatin: 'K. Mbappé', meta: '26 · LW · 우발', tone: '#1c1c1c', text: '#fff', stats: [['지난 시즌 골','44'],['도움','11'],['평점','8.4']], blurb: '단거리는 그가 가장 빠르다. 결정적 순간의 차분함.', votes: 5021 },
    b: { key: 'haaland', name: '홀란드', nameLatin: 'E. Haaland', meta: '24 · ST · 양발', tone: '#fafafa', text: '#171717', stats: [['지난 시즌 골','52'],['도움','9'],['평점','8.1']], blurb: '박스 안의 짐승. 한 시즌 60골 도전 중.', votes: 4091 },
    comments: [
      { name: '치킨먹는하스', tag: '맨시티 팬', time: '5분 전', text: '득점왕은 홀란드인 듯', up: 12 },
      { name: '빠리지엔',     tag: '', time: '20분 전', text: '음바페는 시즌 통째로 다 함', up: 9 },
    ],
  },
  'sangam-westham': {
    title: '11 vs 11, 90분이면 누가 이길까?',
    sub: '상암 동네 조기축구 vs EPL 하위권 풀스쿼드',
    tag: '스쿼드 대결',
    deadline: 'D-12',
    a: { key: 'sangam', name: '상암 동호회', nameLatin: 'Sangam FC', meta: '평균 38세 · 한국', tone: '#0047a0', text: '#fff', stats: [['평균 연령','38'],['역사','12년'],['주말마다','출석']], blurb: '한 명도 안빠지는 출석률. 골키퍼 친구가 좀 잘 막음.', votes: 2412 },
    b: { key: 'westham', name: '웨스트햄', nameLatin: 'West Ham U.', meta: 'EPL · 잉글랜드', tone: '#7a263a', text: '#fff', stats: [['리그 순위','13위'],['평균 연령','27'],['연봉','다름']], blurb: '아무리 못해도 EPL은 EPL이다. 근데 운동장은 진흙이에요.', votes: 1809 },
    comments: [
      { name: '동네축구왕', tag: '', time: '1시간 전', text: '운동장이 진흙이면 상암이 이긴다', up: 31 },
    ],
  },
  'kit-vs': {
    title: '25/26 더 예쁜 홈 유니폼은?',
    sub: '디자인만 가지고 골라봐.',
    tag: '유니폼',
    deadline: 'D-5',
    a: { key: 'mu', name: '맨유', nameLatin: 'Manchester Utd.', meta: '홈 · 25/26', tone: '#da291c', text: '#fff', stats: [['컬러','클래식 레드'],['패턴','삼바 텍스처'],['스폰서','snap.']], blurb: '오랜만에 단정한 디자인. 칼라가 호불호.', votes: 3098 },
    b: { key: 'ars', name: '아스널', nameLatin: 'Arsenal FC', meta: '홈 · 25/26', tone: '#ef0107', text: '#fff', stats: [['컬러','EF0107 레드'],['패턴','퍼지 그라데이션'],['스폰서','Emirates']], blurb: '소매 트림이 화이트 풀+체크. 90년대 향수.', votes: 3011 },
    comments: [
      { name: '북런던러버', tag: '아스널 팬', time: '7분 전', text: '소매 디테일 진짜 미쳤다', up: 18 },
    ],
  },
};

// === ENTRY: detail modal ===
const BalanceDetail = ({ id, onClose }) => {
  useLucide();
  const data = BALANCE_DATA[id] || BALANCE_DATA['goat'];
  const [vote, setVote] = React.useState(null); // null | 'a' | 'b'
  const [reveal, setReveal] = React.useState(false);

  const totalVotes = data.a.votes + data.b.votes;
  const pctA = data.a.votes / totalVotes;
  const pctB = 1 - pctA;

  const handleVote = (side) => {
    setVote(side);
    setTimeout(() => setReveal(true), 380);
  };

  return (
    <div className="otb-result" style={{ background: '#fff' }}>
      <SubHeader title={data.tag} onBack={onClose} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 122 }}>
        {!reveal && <BalanceVoteView data={data} vote={vote} onVote={handleVote} />}
        {reveal && <BalanceRevealView data={data} myVote={vote} pctA={pctA} pctB={pctB} totalVotes={totalVotes} />}
      </div>
    </div>
  );
};

// === VOTE VIEW (pre-vote) ===
const BalanceVoteView = ({ data, vote, onVote }) => (
  <div style={{ padding: '12px 20px 24px' }}>
    {/* meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <Pill variant="green" dot="#171717">진행 중</Pill>
        <span style={{ fontSize: 12, color: 'var(--ink-mute)', whiteSpace: 'nowrap' }}>
          <span className="otb-mono" style={{ color: 'var(--ink)' }}>{(data.a.votes + data.b.votes).toLocaleString()}</span>명 투표
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-mute-2)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--ink-mute)', whiteSpace: 'nowrap' }}>
          마감 {data.deadline}
        </span>
      </div>
    <h1 style={{
      fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600,
      letterSpacing: '-0.5px', lineHeight: 1.2, color: 'var(--ink)', margin: '0 0 6px',
    }}>{data.title}</h1>
    <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '0 0 18px', lineHeight: 1.45 }}>
      {data.sub}
    </p>

    {/* The split */}
    <DiagonalSplit a={data.a} b={data.b} vote={vote} onVote={onVote} />

    <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-mute-2)', textAlign: 'center' }}>
      한쪽 카드를 탭하면 즉시 한 표 반영돼요.
    </div>

    {/* Tip strip */}
    <div style={{
      marginTop: 18, background: 'var(--canvas-soft)',
      border: '1px solid var(--hairline-cool)', borderRadius: 12,
      padding: 14, display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <Icon name="info" size={16} color="var(--ink-mute)" style={{ marginTop: 2 }} />
      <div style={{ fontSize: 12, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
        결과 그래프는 투표한 사람만 볼 수 있어요. 댓글은 결과 공개 후에 열려요.
      </div>
    </div>
  </div>
);

const DiagonalSplit = ({ a, b, vote, onVote }) => {
  // Vertical halves (clean & legible on mobile), with the chrome
  // accent being a tilted "VS" badge in the middle and a hairline
  // diagonal that suggests the burger-style split without clipping text.
  const isAPicked = vote === 'a';
  const isBPicked = vote === 'b';
  return (
    <div style={{
      position: 'relative', borderRadius: 18, overflow: 'hidden',
      boxShadow: '0 10px 28px rgba(0,0,0,0.08)',
      aspectRatio: '3 / 4',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* TOP HALF — Option A */}
      <SideHalf side="a" data={a} onPick={() => onVote('a')}
        picked={isAPicked} dim={isBPicked} cornerCut="bl" />
      {/* BOTTOM HALF — Option B */}
      <SideHalf side="b" data={b} onPick={() => onVote('b')}
        picked={isBPicked} dim={isAPicked} cornerCut="tr" />
      {/* hairline diagonal — purely decorative */}
      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="0" y1="42" x2="100" y2="58" stroke="rgba(255,255,255,0.18)" strokeWidth="0.4" />
      </svg>
      <div className="otb-vs-badge"
        style={{ animation: 'otb-vs-pop .5s cubic-bezier(0.2,0,0,1) both' }}>VS</div>
    </div>
  );
};

// Half — top or bottom. The diagonal is faked by clipping
// a corner off the half, so the seam zig-zags like the burger image.
const SideHalf = ({ side, data, onPick, picked, dim, cornerCut }) => {
  const isA = side === 'a';
  // The clip-path: chop off the inner corner of each half so the
  // boundary between them forms a diagonal.
  const clip = cornerCut === 'bl'
    ? 'polygon(0 0, 100% 0, 100% 100%, 0 58%)'   // top half, slope down-right
    : 'polygon(0 42%, 100% 0, 100% 100%, 0 100%)'; // bottom half, slope down-right
  return (
    <div
      onClick={onPick}
      style={{
        flex: 1,
        background: data.tone,
        color: data.text,
        position: 'relative',
        cursor: 'pointer',
        transition: 'transform .35s cubic-bezier(0.2,0,0,1), opacity .25s ease',
        transform: picked ? (isA ? 'translateY(-2px) scale(1.01)' : 'translateY(2px) scale(1.01)') : 'translateY(0)',
        opacity: dim ? 0.42 : 1,
        zIndex: picked ? 3 : 1,
        clipPath: clip,
        WebkitClipPath: clip,
        overflow: 'hidden',
      }}
    >
      {/* portrait silhouette as a backdrop in the opposite corner from the text */}
      <div style={{
        position: 'absolute',
        bottom: isA ? 0 : 'auto',
        top: isA ? 'auto' : 0,
        right: isA ? 4 : 'auto',
        left: isA ? 'auto' : 4,
        width: '40%',
        opacity: 0.1,
        pointerEvents: 'none',
        transform: isA ? 'none' : 'scaleX(-1)',
      }}>
        <PlayerSilhouette tone={data.text === '#fff' ? '#fff' : '#171717'} />
      </div>

      {/* Content anchored to the wide side */}
      <div style={{
        position: 'absolute',
        top: isA ? 22 : 'auto',
        bottom: isA ? 'auto' : 32,
        left: 22, right: 22,
        textAlign: isA ? 'left' : 'right',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: isA ? 'flex-start' : 'flex-end',
          marginBottom: 8,
        }}>
          <span style={{
            width: 24, height: 24, borderRadius: 5,
            background: data.text === '#fff' ? 'rgba(255,255,255,0.18)' : 'rgba(23,23,23,0.08)',
            color: data.text,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12,
          }}>{isA ? 'A' : 'B'}</span>
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 0.6,
          opacity: 0.55, textTransform: 'uppercase', marginBottom: 4,
        }}>{data.nameLatin}</div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 56, fontWeight: 700, letterSpacing: '-2px',
          lineHeight: 0.95,
        }}>
          {data.name}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
          {data.meta}
        </div>
        {picked && (
          <div className="otb-anim-fade-up" style={{
            marginTop: 12,
            display: 'inline-flex', gap: 6, alignItems: 'center',
            background: 'var(--primary)', color: 'var(--on-primary)',
            padding: '6px 12px', borderRadius: 9999,
            fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600,
          }}>
            <Icon name="check" size={13} /> 한 표 던졌어요
          </div>
        )}
      </div>
    </div>
  );
};

// === REVEAL VIEW (post-vote) ===
const BalanceRevealView = ({ data, myVote, pctA, pctB, totalVotes }) => {
  const winner = pctA > pctB ? 'a' : 'b';
  const wd = data[winner];
  const myChoice = data[myVote];
  return (
    <div style={{ padding: '12px 20px 24px' }} className="otb-anim-fade-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <Pill variant="green" dot="#171717">결과 공개</Pill>
        <span style={{ fontSize: 12, color: 'var(--ink-mute)', whiteSpace: 'nowrap' }}>
          <span className="otb-mono">{totalVotes.toLocaleString()}</span>명 투표
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-mute-2)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--ink-mute)', whiteSpace: 'nowrap' }}>
          마감 {data.deadline}
        </span>
      </div>
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600,
        letterSpacing: '-0.5px', lineHeight: 1.2, color: 'var(--ink)', margin: '0 0 14px',
      }}>{data.title}</h1>

      {/* My vote chip */}
      {myVote && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--canvas-soft)', border: '1px solid var(--hairline-cool)',
          padding: '6px 10px', borderRadius: 9999,
          fontSize: 12, color: 'var(--ink-mute)', marginBottom: 14,
        }}>
          <Icon name="check-circle-2" size={14} color="var(--primary-deep)" />
          내 선택은 <strong style={{ color: 'var(--ink)', fontWeight: 500, marginLeft: 2 }}>{myChoice.name}</strong>
        </div>
      )}

      {/* RATIO BAR — the centerpiece */}
      <RatioBar a={data.a} b={data.b} pctA={pctA} pctB={pctB} myVote={myVote} />

      {/* Stats compare */}
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 0, alignItems: 'stretch' }}>
        {[0, 1, 2].map(i => (
          <React.Fragment key={i}>
            <StatCell stat={data.a.stats[i]} side="a" />
            <div style={{ width: 1, background: 'var(--hairline-cool)' }} />
            <StatCell stat={data.b.stats[i]} side="b" />
          </React.Fragment>
        ))}
      </div>

      {/* Blurbs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
        <SideBlurb data={data.a} side="a" pct={pctA} won={winner === 'a'} />
        <SideBlurb data={data.b} side="b" pct={pctB} won={winner === 'b'} />
      </div>

      {/* Demographic / breakdown teaser */}
      <div style={{ marginTop: 24 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
          color: 'var(--ink)', marginBottom: 10,
        }}>응답자 분석</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Breakdown label="20대 이하" pctA={0.42} pctB={0.58} aLabel={data.a.name} bLabel={data.b.name} />
          <Breakdown label="30대" pctA={0.58} pctB={0.42} aLabel={data.a.name} bLabel={data.b.name} />
          <Breakdown label="40대 이상" pctA={0.66} pctB={0.34} aLabel={data.a.name} bLabel={data.b.name} />
        </div>
      </div>

      {/* Comments */}
      <div style={{ marginTop: 28 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600,
          color: 'var(--ink)', marginBottom: 4,
        }}>한 줄 거들기 <span style={{ color: 'var(--ink-mute-2)', fontWeight: 400, fontSize: 13 }}>{data.comments.length}</span></div>

        <div style={{
          border: '1px solid var(--hairline)', borderRadius: 12,
          padding: 12, marginBottom: 14,
        }}>
          <textarea
            placeholder="결과 보고 한 줄 거들고 가요."
            style={{
              border: 0, outline: 'none', resize: 'none',
              width: '100%', minHeight: 50, fontSize: 13,
              fontFamily: 'var(--font-body)', color: 'var(--ink)',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-mute-2)' }}>24h 안에 수정 가능</span>
            <Btn variant="dark" size="sm" style={{ marginLeft: 'auto' }}>남기기</Btn>
          </div>
        </div>

        {data.comments.map((c, i) => (
          <div className="otb-comment" key={i}>
            <div className="otb-avatar" style={{ background: `hsl(${(i*60)%360},35%,92%)` }}>{c.name[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{c.name}</span>
                {c.tag && <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 9999,
                  background: 'var(--canvas-soft)', color: 'var(--ink-mute)',
                  border: '1px solid var(--hairline-cool)',
                }}>{c.tag}</span>}
                <span style={{ fontSize: 11, color: 'var(--ink-mute-2)' }}>· {c.time}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{c.text}</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--ink-mute)' }}>
                <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}><Icon name="arrow-up" size={11} />동감 {c.up}</span>
                <span>답글</span>
                <span>신고</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RatioBar = ({ a, b, pctA, pctB, myVote }) => {
  const aPctStr = (pctA * 100).toFixed(1) + '%';
  const bPctStr = (pctB * 100).toFixed(1) + '%';
  const winner = pctA > pctB ? 'a' : 'b';
  return (
    <div>
      {/* names + percentages above bar */}
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{a.name}</span>
          {winner === 'a' && <Pill variant="green" style={{ fontSize: 9, padding: '2px 6px' }}>WIN</Pill>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {winner === 'b' && <Pill variant="green" style={{ fontSize: 9, padding: '2px 6px' }}>WIN</Pill>}
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{b.name}</span>
        </div>
      </div>

      {/* The bar itself: two halves of varying width */}
      <div style={{
        display: 'flex', height: 56, borderRadius: 12, overflow: 'hidden',
        border: '1px solid var(--hairline)',
      }}>
        <div style={{
          width: `${pctA * 100}%`,
          background: a.tone, color: a.text,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '0 14px',
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.6px',
          transition: 'width .8s cubic-bezier(0.2,0,0,1)',
        }}>{aPctStr}</div>
        <div style={{
          width: `${pctB * 100}%`,
          background: b.tone, color: b.text,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 14px',
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.6px',
          transition: 'width .8s cubic-bezier(0.2,0,0,1)',
        }}>{bPctStr}</div>
      </div>

      {/* Vote counts */}
      <div style={{ display: 'flex', marginTop: 6, fontSize: 11, color: 'var(--ink-mute)' }}>
        <span className="otb-mono" style={{ whiteSpace: 'nowrap' }}>{a.votes.toLocaleString()}표</span>
        <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }} className="otb-mono">{b.votes.toLocaleString()}표</span>
      </div>

      {/* My vote indicator */}
      {myVote && (
        <div style={{
          position: 'relative', height: 8, marginTop: 2,
        }}>
          <div style={{
            position: 'absolute',
            left: myVote === 'a' ? `calc(${pctA * 100}% - 1px - 30px)` : `calc(${pctA * 100}% + 1px + 6px)`,
            top: -2,
            fontSize: 10, color: 'var(--primary-deep)', fontFamily: 'var(--font-mono)',
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            <Icon name="arrow-up" size={10} />내 표
          </div>
        </div>
      )}
    </div>
  );
};

const StatCell = ({ stat, side }) => (
  <div style={{
    padding: '10px 0',
    textAlign: side === 'a' ? 'left' : 'right',
    paddingLeft: side === 'a' ? 0 : 12,
    paddingRight: side === 'a' ? 12 : 0,
  }}>
    <div style={{ fontSize: 11, color: 'var(--ink-mute-2)' }}>{stat[0]}</div>
    <div style={{
      fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600,
      color: 'var(--ink)', marginTop: 2,
    }}>{stat[1]}</div>
  </div>
);

const SideBlurb = ({ data, side, pct, won }) => (
  <div style={{
    background: data.tone, color: data.text,
    padding: 14, borderRadius: 12,
    border: won ? '2px solid var(--primary)' : '1px solid var(--hairline-cool)',
  }}>
    <div style={{
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17,
      letterSpacing: '-0.4px', marginBottom: 4,
    }}>{data.name}</div>
    <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>{data.meta}</div>
    <div style={{ fontSize: 11.5, lineHeight: 1.45, opacity: 0.85 }}>{data.blurb}</div>
  </div>
);

const Breakdown = ({ label, pctA, pctB, aLabel, bLabel }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)' }}>
        {(pctA * 100).toFixed(0)}% / {(pctB * 100).toFixed(0)}%
      </span>
    </div>
    <div style={{
      display: 'flex', height: 8, borderRadius: 9999, overflow: 'hidden',
      background: 'var(--canvas-soft)',
    }}>
      <div style={{ width: `${pctA * 100}%`, background: '#171717' }} />
      <div style={{ width: `${pctB * 100}%`, background: '#dfdfdf' }} />
    </div>
  </div>
);

// ===== BALANCE LIST SCREEN (tab) =====
const BalanceListScreen = ({ openDetail }) => {
  useLucide();
  const items = Object.entries(BALANCE_DATA).map(([id, d]) => ({ id, ...d, total: d.a.votes + d.b.votes }));
  const [filter, setFilter] = React.useState('전체');
  const filters = ['전체', 'GOAT', '이적', '유니폼', '스쿼드 대결', '리그'];
  return (
    <div>
      <div style={{ paddingTop: 56, paddingBottom: 8, padding: '56px 20px 14px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
          letterSpacing: '-0.6px', color: 'var(--ink)', margin: 0,
        }}>밸런스 게임</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '6px 0 0' }}>
          둘 중 하나만. 영혼을 걸 시간.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '0 20px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {filters.map(f => (
          <span key={f}
            onClick={() => setFilter(f)}
            className={`otb-pill ${filter === f ? 'otb-pill-dark' : 'otb-pill-outline'}`}
            style={{ cursor: 'pointer', flexShrink: 0 }}>{f}</span>
        ))}
      </div>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map(it => (
          <BalanceListItem key={it.id} data={it} onTap={() => openDetail({ type: 'balance', id: it.id })} />
        ))}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
};

const BalanceListItem = ({ data, onTap }) => {
  const pctA = data.a.votes / data.total;
  return (
    <div onClick={onTap} style={{
      background: '#fff', border: '1px solid var(--hairline)',
      borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
    }}>
      {/* tiny VS row */}
      <div style={{ display: 'flex', position: 'relative', height: 70 }}>
        <div style={{
          flex: 1, background: data.a.tone, color: data.a.text,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          padding: '0 14px',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.5px',
        }}>{data.a.name}</div>
        <div style={{
          flex: 1, background: data.b.tone, color: data.b.text,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '0 14px',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.5px',
        }}>{data.b.name}</div>
        <div style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: 30, height: 30, borderRadius: '50%',
          background: 'var(--primary)', color: 'var(--on-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
          border: '2px solid #fff',
        }}>VS</div>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <Pill variant="soft">{data.tag}</Pill>
          <Pill variant="outline">{data.deadline}</Pill>
        </div>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15,
          letterSpacing: '-0.3px', color: 'var(--ink)', lineHeight: 1.35, marginBottom: 8,
        }}>{data.title}</div>
        <div style={{
          display: 'flex', height: 4, borderRadius: 9999, overflow: 'hidden',
          background: 'var(--canvas-soft)',
        }}>
          <div style={{ width: `${pctA * 100}%`, background: '#171717' }} />
        </div>
        <div style={{ display: 'flex', marginTop: 6, fontSize: 11, color: 'var(--ink-mute)' }}>
          <span className="otb-mono">{data.a.votes.toLocaleString()}</span>
          <span style={{ marginLeft: 'auto' }} className="otb-mono">{data.b.votes.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, {
  BALANCE_DATA, BalanceDetail, BalanceVoteView, BalanceRevealView,
  BalanceListScreen, BalanceListItem, DiagonalSplit, SideHalf,
});
