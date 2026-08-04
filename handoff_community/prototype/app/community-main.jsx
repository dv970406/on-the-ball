// app/community-main.jsx — community shell

const CommunityNav = ({ onTab }) => {
  useLucide();
  const items = [
    { id: 'home', label: '홈', icon: 'home' },
    { id: 'balance', label: '밸런스', icon: 'split-square-vertical' },
    { id: 'community', label: '커뮤니티', icon: 'messages-square' },
    { id: 'tmi', label: 'TMI', icon: 'flame' },
    { id: 'me', label: '내 활동', icon: 'user' },
  ];
  return (
    <div className="otb-tabbar">
      {items.map(it => (
        <div key={it.id} className={`otb-tab${it.id === 'community' ? ' is-active' : ''}`} onClick={onTab}>
          <span className="otb-tab-icon"><Icon name={it.icon} size={20} /></span>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
};

const CommunityApp = () => {
  const [screen, setScreen] = React.useState('login'); // login | list | detail | editor
  const [posts, setPosts] = React.useState(CM_POSTS);
  const [openId, setOpenId] = React.useState(null);
  const [editId, setEditId] = React.useState(null);
  const [toastMsg, setToastMsg] = React.useState('');
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  });
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [screen, openId]);

  const toast = (m) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 1800); };
  const post = posts.find(p => p.id === openId);
  const editing = posts.find(p => p.id === editId);

  const submit = ({ cat, title, body, hasImage }) => {
    if (editId) {
      setPosts(ps => ps.map(p => p.id === editId ? { ...p, cat, title, excerpt: body.split('\n')[0], body: body.split('\n\n'), thumb: hasImage } : p));
      setEditId(null); setScreen('detail'); toast('수정했어요');
    } else {
      const np = {
        id: 'n' + Date.now(), cat, title, author: '온더볼', avatar: '온', time: '방금',
        excerpt: body.split('\n')[0], body: body.split('\n\n'),
        likes: 0, comments: 0, views: 1, thumb: hasImage, mine: true, tags: [],
      };
      setPosts(ps => [np, ...ps]);
      setScreen('list'); toast('글을 올렸어요');
    }
  };

  let body = null, showNav = false, pad = 122;
  if (screen === 'login') { body = <LoginScreen onDone={() => setScreen('list')} />; pad = 0; }
  else if (screen === 'detail' && post) { body = <CommunityDetail post={post} toast={toast} onBack={() => setScreen('list')} onEdit={() => { setEditId(post.id); setScreen('editor'); }} onDelete={() => { setPosts(ps => ps.filter(p => p.id !== post.id)); setScreen('list'); toast('글을 삭제했어요'); }} />; pad = 0; }
  else if (screen === 'editor') { body = <CommunityEditor post={editing} onCancel={() => setScreen(editId ? 'detail' : 'list')} onSubmit={submit} />; pad = 0; }
  else { body = <CommunityList posts={posts} onOpen={id => { setOpenId(id); setScreen('detail'); }} onCompose={() => { setEditId(null); setScreen('editor'); }} />; showNav = true; }

  return (
    <div className="otb-stage">
      <div className="otb-stage-meta">
        <span className="dot" />
        온더볼 · 커뮤니티 v1
      </div>
      <IOSDevice>
        <div className="otb-app">
          <div className="otb-scroll" ref={scrollRef} style={{ paddingBottom: pad }}>
            {body}
          </div>
          {showNav && <CommunityNav onTab={() => setScreen('list')} />}
          {toastMsg && <div className="cm-toast" style={{ bottom: showNav ? 112 : 40 }}>{toastMsg}</div>}
        </div>
      </IOSDevice>
    </div>
  );
};

Object.assign(window, { CommunityApp, CommunityNav });
