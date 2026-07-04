// app/screen-activity.jsx — "내 활동" tab

const ActivityScreen = ({ setTab }) => {
  useLucide();

  const me = {
    name: '북런던러버',
    tag: '아스널 팬',
    joined: '2024.03',
    votes: 217,
    quizzes: 89,
    streak: 12,
    rightPct: 67,
  };

  const recentVotes = [
    { tag: 'GOAT',    kind: '밸런스', title: '메시 vs 호날두',          pick: '메시',   when: '12분 전',  agree: 57 },
    { tag: 'EPL',     kind: '랭킹',   title: '올해 EPL 최고의 선수',     pick: '손흥민', when: '1시간 전', agree: 42 },
    { tag: '유니폼',  kind: '밸런스', title: '맨유 vs 아스널 25/26 홈',  pick: '아스널', when: '어제',     agree: 49 },
    { tag: '퀴즈',    kind: '퀴즈',   title: '이 라인업, 어느 팀?',      pick: 'Real Madrid 17/18', when: '어제', agree: 27, right: true },
    { tag: 'TMI',     kind: 'TMI',    title: '벨링엄, 노래 1등?',         pick: '진실',   when: '2일 전',   agree: 51 },
  ];

  const badges = [
    { id: 'streak10', label: '연속 10일', sub: '퀴즈', got: true, color: 'var(--primary)' },
    { id: 'first100', label: '첫 100표', sub: '투표',  got: true, color: '#171717' },
    { id: 'derbyguy', label: '북런던 더비러', sub: '아스널 vs 토트넘 5표', got: true, color: '#9c0d1e' },
    { id: 'streak30', label: '연속 30일', sub: '퀴즈', got: false, color: 'var(--hairline-strong)' },
    { id: 'top1pct',  label: '상위 1%',  sub: '주간',  got: false, color: 'var(--hairline-strong)' },
    { id: 'kit-curator', label: '유니폼 큐레이터', sub: '50표', got: false, color: 'var(--hairline-strong)' },
  ];

  return (
    <div>
      <div style={{ padding: '56px 20px 20px' }}>
        {/* Profile header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 62, height: 62, borderRadius: 9999,
            background: 'linear-gradient(135deg, #9c0d1e 0%, #ef0107 100%)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24,
          }}>북</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, color: 'var(--ink)' }}>
                {me.name}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <Pill variant="soft">{me.tag}</Pill>
              <Pill variant="outline">{me.joined} 가입</Pill>
            </div>
          </div>
          <button className="otb-icon-btn">
            <Icon name="settings" size={16} />
          </button>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
          border: '1px solid var(--hairline)', borderRadius: 14, padding: '14px 0',
          marginBottom: 22,
        }}>
          {[
            ['투표', me.votes],
            ['퀴즈', me.quizzes],
            ['연속', `${me.streak}일`],
            ['정답', `${me.rightPct}%`],
          ].map(([k, v], i) => (
            <div key={k} style={{
              textAlign: 'center',
              borderLeft: i === 0 ? 0 : '1px solid var(--hairline-cool)',
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>{v}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 2 }}>{k}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Badges */}
      <SectionHead title="뱃지" more="전체" />
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        }}>
          {badges.map(b => (
            <div key={b.id} style={{
              border: '1px solid var(--hairline)', borderRadius: 12,
              padding: 12, textAlign: 'center', opacity: b.got ? 1 : 0.55,
              background: b.got ? '#fff' : 'var(--canvas-soft)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: b.color, color: b.got ? '#fff' : 'var(--ink-mute)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
                margin: '0 auto 8px',
              }}>
                {b.got ? '✓' : '?'}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--ink)' }}>
                {b.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 2 }}>
                {b.sub}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent votes */}
      <SectionHead title="최근 한 표" more="전체" />
      <div style={{ borderTop: '1px solid var(--hairline-cool)' }}>
        {recentVotes.map((v, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 20px',
            borderBottom: '1px solid var(--hairline-cool)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              background: 'var(--canvas-soft)', border: '1px solid var(--hairline-cool)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={
                v.kind === '밸런스' ? 'split-square-vertical' :
                v.kind === '랭킹'   ? 'list-ordered' :
                v.kind === '퀴즈'   ? 'puzzle' :
                v.kind === 'TMI'    ? 'flame' : 'circle'
              } size={16} color="var(--ink)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 2 }}>
                <Pill variant="outline" style={{ fontSize: 9, padding: '2px 6px' }}>{v.tag}</Pill>
                <span style={{ fontSize: 11, color: 'var(--ink-mute-2)' }}>· {v.when}</span>
              </div>
              <div style={{ fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35 }}>
                {v.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 4 }}>
                내 선택: <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{v.pick}</strong>
                {' '}· 다수 의견과 <span className="otb-mono">{v.agree}%</span> 일치
                {v.right != null && (
                  <span style={{
                    marginLeft: 6, color: v.right ? 'var(--primary-deep)' : 'var(--accent-crimson)',
                  }}>· {v.right ? '정답' : '오답'}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Personality summary */}
      <div style={{ padding: '24px 20px' }}>
        <div style={{
          background: '#1c1c1c', color: '#fff', borderRadius: 16, padding: 18,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--primary)',
            letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
          }}>▸ 나의 축구 성향</div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600,
            letterSpacing: '-0.3px', lineHeight: 1.35, marginBottom: 12,
          }}>
            "낭만파 — 메시·티키타카·작은 골키퍼를 좋아함"
          </div>
          <div style={{ fontSize: 11, color: '#9a9a9a', lineHeight: 1.55 }}>
            지난 60일 동안 217표를 분석한 결과예요. 한 달에 한 번 갱신.
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { ActivityScreen });
