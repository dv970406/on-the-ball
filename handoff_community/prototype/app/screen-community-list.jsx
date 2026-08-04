// app/screen-community-list.jsx — 게시글 목록

const CommunityList = ({ posts, onOpen, onCompose }) => {
  useLucide();
  const [cat, setCat] = React.useState('전체');
  const [sort, setSort] = React.useState('최신');
  const shown = posts.filter(p => cat === '전체' || p.cat === cat);

  return (
    <>
      <AppBar
        left={<Wordmark />}
        right={<>
          <button className="otb-icon-btn"><Icon name="search" size={16} /></button>
          <button className="otb-icon-btn"><Icon name="bell" size={16} /></button>
        </>} />

      <div style={{ padding: '18px 20px 2px' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 26, letterSpacing: '-.9px', color: 'var(--ink)' }}>커뮤니티</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-mute)' }}>오늘 <span className="otb-mono" style={{ color: 'var(--ink)' }}>1,284</span>개의 글이 올라왔어요</p>
      </div>

      <div className="cm-rail">
        {CM_CATS.map(c => (
          <button key={c} className={`cm-chip${cat === c ? ' is-on' : ''}`} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>

      <div className="cm-sort">
        {['최신', '인기', '댓글순'].map(s => (
          <span key={s} className={sort === s ? 'is-on' : ''} onClick={() => setSort(s)}>{s}</span>
        ))}
        <span className="count otb-mono">{shown.length} POSTS</span>
      </div>

      {shown.map(p => (
        <div key={p.id} className="cm-post" onClick={() => onOpen(p.id)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="cm-post-cat">{p.cat}</span>
              {p.hot && <span className="cm-hot"><Icon name="flame" size={11} />HOT</span>}
            </div>
            <h3 className="cm-post-title">{p.title}</h3>
            <p className="cm-post-ex">{p.excerpt}</p>
            <div className="cm-post-meta">
              <span>{p.author}</span>
              <span className="sep" />
              <span>{p.time}</span>
              <span className="sep" />
              <span className="num"><Icon name="heart" size={11} />{p.likes.toLocaleString()}</span>
              <span className="num"><Icon name="message-circle" size={11} />{p.comments}</span>
            </div>
          </div>
          {p.thumb && (
            <div className="cm-post-thumb">
              <Icon name="image" size={18} />
            </div>
          )}
        </div>
      ))}

      <div style={{ padding: '28px 20px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '.4px' }}>
        END OF FEED
      </div>

      <button className="cm-write" onClick={onCompose}>
        <Icon name="pen-line" size={16} />글쓰기
      </button>
    </>
  );
};

Object.assign(window, { CommunityList });
