// app/screen-community-detail.jsx — 게시글 상세 + 댓글/답글 + 삭제

const CommentItem = ({ c, reply, onLike, onReply, onDelete }) => (
  <div className={`cm-cmt${reply ? ' is-reply' : ''}`}>
    <div className="cm-cmt-row">
      <div className="otb-avatar" style={{ width: reply ? 24 : 28, height: reply ? 24 : 28, fontSize: reply ? 11 : 12 }}>{c.avatar}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="cm-cmt-nm">{c.author}</span>
          {c.op && <span className="cm-cmt-mine" style={{ color: 'var(--ink-mute)', borderColor: 'var(--hairline)' }}>작성자</span>}
          {c.mine && <span className="cm-cmt-mine">내 댓글</span>}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{c.time}</span>
        </div>
        <p className="cm-cmt-tx">{c.text}</p>
        <div className="cm-cmt-bar">
          <button className={c.liked ? 'is-on' : ''} onClick={() => onLike(c.id)}>
            <Icon name="heart" size={12} /><b>{c.likes}</b>
          </button>
          {!reply && <button onClick={() => onReply(c)}><Icon name="corner-down-right" size={12} />답글</button>}
          {c.mine && <button style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }} onClick={() => onDelete(c.id)}>삭제</button>}
        </div>
      </div>
    </div>
  </div>
);

const CommunityDetail = ({ post, onBack, onEdit, onDelete, toast }) => {
  useLucide();
  const [liked, setLiked] = React.useState(false);
  const [likes, setLikes] = React.useState(post.likes);
  const [saved, setSaved] = React.useState(false);
  const [sheet, setSheet] = React.useState(false);
  const [askDel, setAskDel] = React.useState(false);
  const [comments, setComments] = React.useState(() => JSON.parse(JSON.stringify(CM_COMMENTS)));
  const [draft, setDraft] = React.useState('');
  const [replyTo, setReplyTo] = React.useState(null);

  const total = comments.reduce((n, c) => n + 1 + c.replies.length, 0);
  const body = post.body || [post.excerpt];

  const toggleLike = () => { setLiked(v => !v); setLikes(n => liked ? n - 1 : n + 1); };

  const likeComment = (id) => setComments(cs => cs.map(c => {
    if (c.id === id) return { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) };
    return { ...c, replies: c.replies.map(r => r.id === id ? { ...r, liked: !r.liked, likes: r.likes + (r.liked ? -1 : 1) } : r) };
  }));

  const delComment = (id) => {
    setComments(cs => cs.filter(c => c.id !== id).map(c => ({ ...c, replies: c.replies.filter(r => r.id !== id) })));
    toast('댓글을 삭제했어요');
  };

  const send = () => {
    if (!draft.trim()) return;
    const item = { id: 'n' + Date.now(), author: '온더볼', avatar: '온', time: '방금', likes: 0, liked: false, mine: true, text: draft.trim(), replies: [] };
    if (replyTo) {
      setComments(cs => cs.map(c => c.id === replyTo.id ? { ...c, replies: [...c.replies, item] } : c));
    } else {
      setComments(cs => [...cs, item]);
    }
    setDraft(''); setReplyTo(null);
  };

  return (
    <>
      <div className="cm-head">
        <button className="cm-ghost" onClick={onBack}><Icon name="chevron-left" size={22} /></button>
        <div className="cm-head-title" style={{ marginLeft: 2 }}>{post.cat}</div>
        <div style={{ marginLeft: 'auto', display: 'flex' }}>
          <button className="cm-ghost"><Icon name="share-2" size={18} /></button>
          <button className="cm-ghost" onClick={() => setSheet(true)}><Icon name="more-horizontal" size={20} /></button>
        </div>
      </div>

      <div style={{ padding: '18px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill variant="soft">{post.cat}</Pill>
          {post.hot && <span className="cm-hot"><Icon name="flame" size={11} />HOT</span>}
        </div>
        <h1 className="cm-d-title">{post.title}</h1>
        <div className="cm-d-author">
          <div className="otb-avatar" style={{ width: 34, height: 34, fontSize: 13 }}>{post.avatar}</div>
          <div>
            <div className="nm">{post.author}</div>
            <div className="mt">{post.time} · 조회 {post.views.toLocaleString()}</div>
          </div>
          <button className="otb-btn otb-btn-secondary otb-btn-sm" style={{ marginLeft: 'auto' }}>팔로우</button>
        </div>

        <div className="cm-d-body">
          {body.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        {post.thumb && (
          <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--hairline)', aspectRatio: '16/9', marginTop: 4 }}>
            <image-slot id={`cm-detail-${post.id}`} shape="rect" placeholder="본문 이미지"></image-slot>
          </div>
        )}

        {post.tags && (
          <div className="cm-tags">
            {post.tags.map(t => <span key={t} className="cm-tag">#{t}</span>)}
          </div>
        )}
      </div>

      <div className="cm-actions">
        <button className={`cm-act${liked ? ' is-on' : ''}`} onClick={toggleLike}>
          <Icon name="heart" size={15} />{likes.toLocaleString()}
        </button>
        <button className="cm-act"><Icon name="message-circle" size={15} />{total}</button>
        <button className="cm-act mini" onClick={() => { setSaved(v => !v); toast(saved ? '저장을 취소했어요' : '저장했어요'); }}>
          <Icon name={saved ? 'bookmark-check' : 'bookmark'} size={17} />
        </button>
      </div>

      <div className="cm-cmt-head">
        <h3>댓글</h3><span className="n otb-mono">{total}</span>
      </div>

      {comments.map(c => (
        <React.Fragment key={c.id}>
          <CommentItem c={c} onLike={likeComment} onReply={setReplyTo} onDelete={delComment} />
          {c.replies.map(r => (
            <CommentItem key={r.id} c={r} reply onLike={likeComment} onReply={setReplyTo} onDelete={delComment} />
          ))}
        </React.Fragment>
      ))}

      <div style={{ height: 120 }} />

      <div className="cm-cmt-input">
        {replyTo && (
          <div className="cm-replying">
            <Icon name="corner-down-right" size={12} />
            <span><b style={{ color: 'var(--ink)', fontWeight: 500 }}>{replyTo.author}</b> 에게 답글</span>
            <button style={{ marginLeft: 'auto', background: 0, border: 0, cursor: 'pointer', color: 'var(--ink-mute)', display: 'flex' }} onClick={() => setReplyTo(null)}>
              <Icon name="x" size={13} />
            </button>
          </div>
        )}
        <input placeholder={replyTo ? '답글을 남겨보세요' : '한 줄 거들기'} value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()} />
        <button className="cm-send" disabled={!draft.trim()} onClick={send}>
          <Icon name="arrow-up" size={18} />
        </button>
      </div>

      {sheet && (
        <>
          <div className="cm-scrim" onClick={() => setSheet(false)} />
          <div className="cm-sheet">
            {post.mine ? (
              <>
                <button className="cm-sheet-item" onClick={() => { setSheet(false); onEdit(); }}><Icon name="pencil" size={17} />수정하기</button>
                <button className="cm-sheet-item danger" onClick={() => { setSheet(false); setAskDel(true); }}><Icon name="trash-2" size={17} />삭제하기</button>
              </>
            ) : (
              <>
                <button className="cm-sheet-item"><Icon name="bell-off" size={17} />이 글 알림 끄기</button>
                <button className="cm-sheet-item"><Icon name="user-x" size={17} />{post.author} 차단하기</button>
                <button className="cm-sheet-item danger"><Icon name="flag" size={17} />신고하기</button>
              </>
            )}
            <button className="cm-sheet-item" style={{ justifyContent: 'center', color: 'var(--ink-mute)' }} onClick={() => setSheet(false)}>닫기</button>
          </div>
        </>
      )}

      {askDel && (
        <>
          <div className="cm-scrim" onClick={() => setAskDel(false)} />
          <div className="cm-dialog">
            <h4>이 글을 삭제할까요?</h4>
            <p>댓글 {total}개도 같이 사라져요. 되돌릴 수 없습니다.</p>
            <div className="cm-dialog-row">
              <button onClick={() => setAskDel(false)}>취소</button>
              <button className="danger" onClick={onDelete}>삭제</button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

Object.assign(window, { CommunityDetail, CommentItem });
