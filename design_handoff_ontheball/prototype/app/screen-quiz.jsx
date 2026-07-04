// app/screen-quiz.jsx — Lineup quiz (nationality only) + quiz list

const QUIZ_DATA = {
  'lineup-rm-1718': {
    title: '국적만 보고 맞춰봐. 어느 팀의 어느 시즌?',
    sub: '4-3-3. 챔피언스 리그 결승 선발 11명.',
    formation: [
      [{ pos: 'GK', flag: 'BE' }],
      [{ pos: 'LB', flag: 'BR' }, { pos: 'CB', flag: 'FR' }, { pos: 'CB', flag: 'ES' }, { pos: 'RB', flag: 'PT' }],
      [{ pos: 'LM', flag: 'DE' }, { pos: 'CM', flag: 'HR' }, { pos: 'RM', flag: 'BR' }],
      [{ pos: 'LW', flag: 'PT' }, { pos: 'ST', flag: 'FR' }, { pos: 'RW', flag: 'ES' }],
    ],
    choices: [
      { id: 'rm-1718',  team: 'Real Madrid',  season: '2017/18', correct: true,  pct: 23 },
      { id: 'bcn-1415', team: 'FC Barcelona', season: '2014/15', correct: false, pct: 41 },
      { id: 'rm-1516',  team: 'Real Madrid',  season: '2015/16', correct: false, pct: 28 },
      { id: 'cl-1213',  team: 'Chelsea',      season: '2012/13', correct: false, pct: 8  },
    ],
    accuracy: 27,
    attempts: 5630,
    answer: 'Real Madrid · 2017/18 UCL 결승 선발 11명',
    hint: 'CM은 골든볼 받았던 미드필더예요. 양쪽 윙은 같은 반도 출신.',
  },
};

const QuizDetail = ({ id, onClose }) => {
  useLucide();
  const data = QUIZ_DATA[id] || QUIZ_DATA['lineup-rm-1718'];
  const [state, setState] = React.useState('playing'); // playing | done
  const [picked, setPicked] = React.useState(null);
  const [hintOpen, setHintOpen] = React.useState(false);

  const pick = (cid) => {
    if (state !== 'playing') return;
    setPicked(cid);
    setTimeout(() => setState('done'), 380);
  };

  const reset = () => { setState('playing'); setPicked(null); setHintOpen(false); };

  const correct = state === 'done' && data.choices.find(c => c.id === picked)?.correct;

  return (
    <div className="otb-result" style={{ background: '#fafafa' }}>
      <SubHeader title="오늘의 퀴즈" onBack={onClose} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 122 }}>
        <div style={{ padding: '12px 20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Pill variant="green" dot="#171717">진행 중</Pill>
            <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
              정답률 <strong className="otb-mono" style={{ color: 'var(--ink)' }}>{data.accuracy}%</strong>
              · <span className="otb-mono">{data.attempts.toLocaleString()}</span>명 도전
            </span>
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
            letterSpacing: '-0.4px', lineHeight: 1.2, color: 'var(--ink)', margin: '0 0 6px',
          }}>{data.title}</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '0 0 16px', lineHeight: 1.45 }}>
            {data.sub}
          </p>

          {/* === PITCH === */}
          <Pitch formation={data.formation} reveal={state === 'done'} />

          <div style={{
            display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10,
            fontSize: 11, color: 'var(--ink-mute-2)', fontFamily: 'var(--font-mono)',
          }}>
            <span>4-3-3 · 11 caps · 7 nations</span>
          </div>

          {/* hint */}
          {state === 'playing' && (
            <div style={{ marginTop: 14 }}>
              <button onClick={() => setHintOpen(!hintOpen)}
                style={{
                  background: 'transparent', border: '1px dashed var(--hairline-strong)',
                  borderRadius: 9999, padding: '6px 12px', cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--ink-mute)',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                <Icon name={hintOpen ? 'lightbulb' : 'lightbulb-off'} size={12} />
                힌트 {hintOpen ? '닫기' : '보기'}
              </button>
              {hintOpen && (
                <div className="otb-anim-fade-up" style={{
                  marginTop: 10, padding: 12,
                  background: '#fff8c5', border: '1px solid #fff0a0', borderRadius: 10,
                  fontSize: 12.5, color: '#5a4a00', lineHeight: 1.5,
                }}>
                  💡 {data.hint}
                </div>
              )}
            </div>
          )}

          {/* === CHOICES === */}
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.choices.map(c => {
              const cls = ['otb-choice'];
              if (state === 'done') {
                if (c.correct) cls.push('correct');
                else if (c.id === picked) cls.push('wrong');
                else cls.push('dim');
              }
              return (
                <button key={c.id} className={cls.join(' ')} onClick={() => pick(c.id)}>
                  <div>
                    <div>{c.team}</div>
                    {state === 'done' && (
                      <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 4, fontWeight: 400 }}>
                        <span className="otb-mono">{c.pct}%</span>가 이걸 골랐어요
                      </div>
                    )}
                  </div>
                  <span className="yr">{c.season}</span>
                </button>
              );
            })}
          </div>

          {/* === REVEAL === */}
          {state === 'done' && (
            <div className="otb-anim-fade-up" style={{ marginTop: 24 }}>
              <div style={{
                background: correct ? '#1c1c1c' : '#fff',
                color: correct ? '#fff' : 'var(--ink)',
                border: '1px solid ' + (correct ? '#1c1c1c' : 'var(--hairline)'),
                borderRadius: 16, padding: 18, textAlign: 'center',
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
                  letterSpacing: '-0.4px', marginBottom: 4,
                }}>
                  {correct ? '정답이에요 ⚽' : '아쉽다.'}
                </div>
                <div style={{ fontSize: 13, color: correct ? '#9a9a9a' : 'var(--ink-mute)', lineHeight: 1.45 }}>
                  정답은 <span style={{ color: correct ? 'var(--primary)' : 'var(--ink)', fontWeight: 500 }}>{data.answer}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                  <Btn variant="primary" size="sm" onClick={reset} icon="rotate-cw">다시 도전</Btn>
                  <Btn variant="secondary" size="sm" icon="share-2">결과 공유</Btn>
                </div>
              </div>

              {/* streak teaser */}
              <div style={{
                marginTop: 16, padding: 14,
                background: 'var(--canvas)', border: '1px solid var(--hairline)',
                borderRadius: 12,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 9999,
                  background: 'var(--primary)', color: 'var(--on-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
                }}>{correct ? '13' : '0'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--ink)' }}>
                    {correct ? '연속 정답 13일째' : '연속 정답이 0으로 리셋'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 2 }}>
                    {correct ? '14일째도 가즈아.' : '내일 다시 도전해요.'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===== PITCH (responsive) =====
const Pitch = ({ formation, reveal }) => (
  <div className="otb-pitch" style={{ aspectRatio: '3/4' }}>
    <div className="otb-pitch-frame" />
    <div style={{
      position: 'relative', zIndex: 1, height: '100%',
      display: 'flex', flexDirection: 'column-reverse', justifyContent: 'space-around', gap: 8,
    }}>
      {formation.map((row, ri) => (
        <div className="otb-pitch-row" key={ri}>
          {row.map((p, pi) => (
            <PitchPill key={pi} flag={p.flag} pos={p.pos} reveal={reveal} />
          ))}
        </div>
      ))}
    </div>
  </div>
);

const PitchPill = ({ flag, pos, reveal }) => (
  <div className="otb-pitch-pill" style={{
    transform: reveal ? 'scale(1.04)' : 'scale(1)',
    transition: 'transform .25s cubic-bezier(0.2,0,0,1)',
  }}>
    <FlagSVG kind={flag} w={20} h={14} />
    <span className="pos">{pos}</span>
  </div>
);

// ===== QUIZ LIST SCREEN (tab) =====
const QuizListScreen = ({ openDetail }) => {
  useLucide();
  const today = [
    { id: 'lineup-rm-1718', kind: '라인업', title: '국적만 보고 어느 팀일까?', acc: 27, n: 5630, status: 'today' },
  ];
  const upcoming = [
    { kind: '레전드', title: '경기 영상 30초로 시즌 맞히기', acc: 19, n: 0, status: 'soon', day: '내일' },
    { kind: 'TMI',   title: '벨링엄의 진짜 별명은?',        acc: 44, n: 0, status: 'soon', day: '내일' },
  ];
  const past = [
    { kind: '라인업', title: '이 라인업, 어느 시즌 첼시?', acc: 19, n: 8821, my: 'wrong' },
    { kind: '국적',   title: '월드컵 한 팀의 11인 출신지', acc: 38, n: 6210, my: 'right' },
    { kind: '레전드', title: '레전드 미드필더 3인의 공통점', acc: 31, n: 4090, my: 'right' },
    { kind: '코치',   title: '이 사람이 거쳐간 7팀의 공통점', acc: 12, n: 3017, my: 'wrong' },
  ];

  return (
    <div>
      <div style={{ padding: '56px 20px 12px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
          letterSpacing: '-0.6px', color: 'var(--ink)', margin: 0,
        }}>축구 퀴즈</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '6px 0 0' }}>
          매일 오전 8시, 새 문제가 한 개씩 열려요.
        </p>
      </div>

      {/* Streak header card */}
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{
          background: '#1c1c1c', color: '#fff', borderRadius: 16,
          padding: 18, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 9999,
            background: 'var(--primary)', color: 'var(--on-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22,
          }}>12</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--primary)', fontFamily: 'var(--font-mono)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
              ▸ STREAK
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17 }}>
              연속 정답 12일째
            </div>
            <div style={{ fontSize: 11, color: '#9a9a9a', marginTop: 2 }}>
              상위 4% · 한 번이라도 틀리면 0으로 리셋
            </div>
          </div>
        </div>
      </div>

      <SectionHead title="오늘의 문제" />
      <div style={{ padding: '0 20px', marginBottom: 24 }}>
        {today.map(q => (
          <div key={q.id} onClick={() => openDetail({ type: 'quiz', id: q.id })}
            style={{
              background: '#fff', border: '1px solid var(--hairline)', borderRadius: 14,
              padding: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: 'var(--canvas-soft)', border: '1px solid var(--hairline-cool)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="map" size={22} color="var(--ink)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <Pill variant="green">NEW</Pill>
                <Pill variant="soft">{q.kind}</Pill>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
                {q.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 4 }}>
                정답률 <span className="otb-mono">{q.acc}%</span> · <span className="otb-mono">{q.n.toLocaleString()}</span>명 도전
              </div>
            </div>
            <Icon name="chevron-right" size={18} color="var(--ink-mute-2)" />
          </div>
        ))}
      </div>

      <SectionHead title="예정된 문제" />
      <div style={{ padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {upcoming.map((q, i) => (
          <div key={i} style={{
            border: '1px dashed var(--hairline-strong)', borderRadius: 12,
            padding: 12, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 9, background: 'var(--canvas-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
            }}>{q.day}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--ink)' }}>
                {q.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-mute-2)', marginTop: 2 }}>
                {q.kind} · 예상 정답률 {q.acc}%
              </div>
            </div>
            <Icon name="lock" size={14} color="var(--ink-mute-2)" />
          </div>
        ))}
      </div>

      <SectionHead title="지난 문제 (보관함)" more="전체" />
      <div style={{ padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {past.map((q, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
            borderBottom: '1px solid var(--hairline-cool)',
          }}>
            <span style={{
              width: 26, height: 26, borderRadius: 6,
              background: q.my === 'right' ? 'rgba(62,207,142,0.14)' : 'rgba(226,0,90,0.08)',
              color: q.my === 'right' ? 'var(--primary-deep)' : 'var(--accent-crimson)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon name={q.my === 'right' ? 'check' : 'x'} size={14} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink)' }}>{q.title}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-mute-2)', marginTop: 2 }}>
                <span className="otb-mono">{q.acc}%</span> · {q.kind}
              </div>
            </div>
            <Icon name="chevron-right" size={14} color="var(--ink-mute-2)" />
          </div>
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { QUIZ_DATA, QuizDetail, Pitch, PitchPill, QuizListScreen });
