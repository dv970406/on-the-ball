// app/main.jsx — top-level shell

const App = () => {
  const [tab, setTab] = React.useState('home');

  // Detail view state (modal-style screens over the bottom nav)
  // shape: { type: 'balance', id: '...' } | { type: 'quiz', id: '...' } | null
  const [detail, setDetail] = React.useState(null);

  React.useEffect(() => {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  });

  let body;
  if (tab === 'home')         body = <HomeScreen openDetail={setDetail} setTab={setTab} />;
  else if (tab === 'balance') body = <BalanceListScreen openDetail={setDetail} />;
  else if (tab === 'quiz')    body = <QuizListScreen openDetail={setDetail} />;
  else if (tab === 'tmi')     body = <TMIScreen />;
  else if (tab === 'me')      body = <ActivityScreen setTab={setTab} />;

  let modal = null;
  if (detail?.type === 'balance') modal = <BalanceDetail id={detail.id} onClose={() => setDetail(null)} />;
  else if (detail?.type === 'quiz') modal = <QuizDetail id={detail.id} onClose={() => setDetail(null)} />;
  else if (detail?.type === 'ranking') modal = <RankingDetail id={detail.id} onClose={() => setDetail(null)} />;
  else if (detail?.type === 'kit') modal = <KitVoteDetail id={detail.id} onClose={() => setDetail(null)} />;

  return (
    <div className="otb-stage">
      <div className="otb-stage-meta">
        <span className="dot" />
        온더볼 · mobile prototype v1
      </div>
      <IOSDevice>
        <div className="otb-app">
          <div className="otb-scroll" id="otb-scroll">
            {body}
          </div>
          {modal}
          <BottomNav tab={tab} setTab={(t) => { setTab(t); setDetail(null); }} />
        </div>
      </IOSDevice>
    </div>
  );
};

Object.assign(window, { App });
