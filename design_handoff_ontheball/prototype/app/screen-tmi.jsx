// app/screen-tmi.jsx — TMI true/false swipe deck

const TMI_DECK = [
  { player: '손흥민', club: 'Tottenham', flag: 'KR',
    text: '경기 전 정확히 같은 음식을 12년째 먹고 있다.',
    detail: '아버지 손웅정 코치가 직접 정한 식단이라는 설',
    truePct: 78, n: 4421, my: null },
  { player: '홀란드', club: 'Man City', flag: 'NO',
    text: '시즌 중에는 매일 새벽 4시 30분에 일어난다.',
    detail: '명상 → 안약 → 단백질 음료 → 가벼운 산책 루틴',
    truePct: 64, n: 3812, my: null },
  { player: '벨링엄', club: 'Real Madrid', flag: 'EN',
    text: '드레싱룸에서 가장 노래를 잘 부른다고 인정받았다.',
    detail: '루카 모드리치가 비공식 평가위원장이라는 주장',
    truePct: 51, n: 2103, my: null },
  { player: '음바페', club: 'Real Madrid', flag: 'FR',
    text: '라리가 선수 절반 이름을 아직 외우지 못한다.',
    detail: '익명의 동료 인터뷰 — 본인은 부인',
    truePct: 22, n: 5612, my: null },
  { player: '데헤아', club: '은퇴', flag: 'ES',
    text: '맨유 시절 컨디션에 따라 GK 장갑 색을 바꿨다.',
    detail: '7가지 색을 로테이션. 평일 빨강, 빅매치는 검정',
    truePct: 71, n: 1842, my: null },
];

const TMIScreen = () => {
  useLucide();
  const [idx, setIdx] = React.useState(0);
  const [votes, setVotes] = React.useState({}); // { 0: 'true' | 'false' }
  const [overlay, setOverlay] = React.useState(null); // 'true' | 'false' | null

  const vote = (val) => {
    if (overlay) return;
    setOverlay(val);
    setTimeout(() => {
      setVotes(v => ({ ...v, [idx]: val }));
      setOverlay(null);
      setIdx(i => Math.min(i + 1, TMI_DECK.length));
    }, 600);
  };

  const card = TMI_DECK[idx];
  const done = idx >= TMI_DECK.length;
  const decided = votes[idx] != null;

  return (
    <div>
      <div style={{ padding: '56px 20px 12px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
          letterSpacing: '-0.6px', color: 'var(--ink)', margin: 0,
        }}>선수 TMI</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '6px 0 0' }}>
          진짜? 거짓? 한 장씩 넘기면서 가려요.
        </p>
      </div>

      {/* Progress dots */}
      <div style={{
        display: 'flex', gap: 4, padding: '0 20px 12px',
      }}>
        {TMI_DECK.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 9999,
            background: i < idx ? '#171717' : i === idx ? 'var(--primary)' : 'var(--hairline-cool)',
            transition: 'background .2s ease',
          }} />
        ))}
      </div>

      {done ? (
        <TMIDone votes={votes} reset={() => { setIdx(0); setVotes({}); }} />
      ) : (
        <div className="otb-tmi-stack" style={{ minHeight: 460, height: 'auto' }}>
          {/* Next card (peek) */}
          {TMI_DECK[idx + 1] && (
            <TMICard
              card={TMI_DECK[idx + 1]}
              shadow="back"
              style={{ transform: 'translateY(12px) scale(0.96)', opacity: 0.6, zIndex: 1 }}
              idx={idx + 1}
              total={TMI_DECK.length}
            />
          )}
          {/* Current card */}
          <TMICard
            card={card}
            shadow="front"
            style={{
              transform: overlay
                ? overlay === 'true'
                  ? 'translateX(120%) rotate(14deg)'
                  : 'translateX(-120%) rotate(-14deg)'
                : 'translateY(0) scale(1)',
              opacity: overlay ? 0 : 1,
              zIndex: 2,
            }}
            idx={idx}
            total={TMI_DECK.length}
            decided={decided}
            myVote={votes[idx]}
          />
        </div>
      )}

      {!done && (
        <div style={{
          padding: '16px 20px 12px', display: 'flex', gap: 12, justifyContent: 'center',
        }}>
          <button onClick={() => vote('false')}
            style={{
              flex: 1, padding: '14px 18px',
              border: '1px solid var(--accent-crimson)', borderRadius: 12,
              background: '#fff', color: 'var(--accent-crimson)',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: 'pointer',
            }}>
            <Icon name="x" size={16} /> 거짓
          </button>
          <button onClick={() => vote('true')}
            style={{
              flex: 1, padding: '14px 18px',
              border: '1px solid var(--primary-deep)', borderRadius: 12,
              background: 'var(--primary)', color: 'var(--on-primary)',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: 'pointer',
            }}>
            <Icon name="check" size={16} /> 진실
          </button>
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
};

const TMICard = ({ card, style, idx, total, decided, myVote, shadow }) => {
  const showResult = decided;
  const truePct = card.truePct;
  const falsePct = 100 - truePct;
  const myWins = myVote === 'true'
    ? truePct >= falsePct
    : falsePct >= truePct;
  return (
    <div className="otb-tmi-card" style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 9999,
          background: 'var(--canvas-soft)', border: '1px solid var(--hairline-cool)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16,
        }}>{card.player[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FlagSVG kind={card.flag} w={16} h={11} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>
              {card.player}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 2 }}>{card.club}</div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute-2)' }}>
          {idx + 1}/{total}
        </span>
      </div>

      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 0.6,
        color: 'var(--ink-mute-2)', textTransform: 'uppercase', marginBottom: 8,
      }}>TMI · 떡밥</div>

      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22,
        letterSpacing: '-0.4px', lineHeight: 1.3, color: 'var(--ink)', marginBottom: 14,
      }}>
        {card.text}
      </div>

      <div style={{
        background: 'var(--canvas-soft)', border: '1px solid var(--hairline-cool)',
        padding: 12, borderRadius: 10,
        fontSize: 12, color: 'var(--ink-mute)', lineHeight: 1.5, marginBottom: 'auto',
      }}>
        <span style={{ color: 'var(--ink)', fontWeight: 500 }}>출처 미상 — </span>
        {card.detail}
      </div>

      {/* Result */}
      {showResult ? (
        <div className="otb-anim-fade-up" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', height: 38, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--hairline)' }}>
            <div style={{
              width: `${truePct}%`,
              background: 'var(--primary)', color: 'var(--on-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '0 12px',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
            }}>진실 {truePct}%</div>
            <div style={{
              width: `${falsePct}%`,
              background: '#171717', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
            }}>{falsePct}% 거짓</div>
          </div>
          <div style={{
            marginTop: 8, fontSize: 11, color: 'var(--ink-mute)',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span><span className="otb-mono">{card.n.toLocaleString()}</span>명이 가렸어요</span>
            <span style={{ color: myWins ? 'var(--primary-deep)' : 'var(--accent-crimson)' }}>
              내 선택: {myVote === 'true' ? '진실' : '거짓'} ({myWins ? '다수 의견' : '소수 의견'})
            </span>
          </div>
        </div>
      ) : (
        <div style={{
          marginTop: 16,
          fontSize: 11, color: 'var(--ink-mute-2)', textAlign: 'center',
        }}>
          ← 거짓 · 진실 →
        </div>
      )}
    </div>
  );
};

const TMIDone = ({ votes, reset }) => {
  useLucide();
  const right = Object.entries(votes).filter(([i, v]) => {
    const c = TMI_DECK[i];
    return (v === 'true' && c.truePct >= 50) || (v === 'false' && c.truePct < 50);
  }).length;
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{
        width: 72, height: 72, borderRadius: 9999,
        background: 'var(--primary)', color: 'var(--on-primary)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28,
        margin: '0 auto 16px',
      }}>{right}</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', margin: '0 0 6px' }}>
        다수 의견과 {right}개 일치
      </h2>
      <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '0 0 20px' }}>
        총 {TMI_DECK.length}개 중. 다른 사람 결과도 살펴봐요.
      </p>
      <Btn variant="dark" onClick={reset} icon="rotate-cw">다시 풀기</Btn>
    </div>
  );
};

Object.assign(window, { TMI_DECK, TMIScreen, TMICard, TMIDone });
