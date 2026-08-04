// app/screen-community-editor.jsx — 게시글 생성 / 수정

const CommunityEditor = ({ post, onCancel, onSubmit }) => {
  useLucide();
  const editing = !!post;
  const [cat, setCat] = React.useState(post?.cat || '');
  const [title, setTitle] = React.useState(post?.title || '');
  const [body, setBody] = React.useState(post ? (post.body || []).join('\n\n') : '');
  const [slots, setSlots] = React.useState(post?.thumb ? ['s1'] : []);
  const [saved, setSaved] = React.useState('');
  const [askLeave, setAskLeave] = React.useState(false);
  const ta = React.useRef(null);

  const dirty = title.trim() || body.trim() || slots.length;
  const ready = cat && title.trim().length >= 2 && body.trim().length >= 5;

  React.useEffect(() => {
    const el = ta.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, [body]);

  React.useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => setSaved('임시저장됨 · 방금'), 900);
    return () => clearTimeout(t);
  }, [title, body, slots.length]);

  const addSlot = () => setSlots(s => s.length < 6 ? [...s, 's' + Date.now()] : s);

  return (
    <>
      <div className="cm-head">
        <button className="cm-text-btn" onClick={() => dirty && !editing ? setAskLeave(true) : onCancel()}>취소</button>
        <div className="cm-head-title" style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
          {editing ? '글 수정' : '글쓰기'}
        </div>
        <div style={{ marginLeft: 'auto', zIndex: 1 }}>
          <Btn size="sm" disabled={!ready} onClick={() => onSubmit({ cat, title, body, hasImage: slots.length > 0 })}>
            {editing ? '수정 완료' : '등록'}
          </Btn>
        </div>
      </div>

      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CM_CATS.filter(c => c !== '전체').map(c => (
            <button key={c} className={`cm-chip${cat === c ? ' is-on' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        {!cat && <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--ink-faint)' }}>말머리를 하나 골라 주세요</p>}

        <div style={{ marginTop: 22 }}>
          <input className="cm-ed-title" placeholder="제목을 입력하세요"
            value={title} onChange={e => setTitle(e.target.value.slice(0, 60))} />
        </div>
        <hr className="otb-rule" style={{ margin: '16px 0' }} />

        <textarea ref={ta} className="cm-ed-body"
          placeholder={'무슨 얘기를 나눌까요?\n소문이면 출처를 같이 적어주면 좋아요.'}
          value={body} onChange={e => setBody(e.target.value)} />

        {slots.length > 0 && (
          <div className="cm-slots" style={{ marginTop: 18 }}>
            {slots.map(id => (
              <div key={id} className="cm-slot">
                <button className="cm-slot-x" onClick={() => setSlots(s => s.filter(x => x !== id))}>
                  <Icon name="x" size={12} />
                </button>
                <image-slot id={`cm-ed-${id}`} shape="rounded" radius="8" placeholder="사진 올리기"></image-slot>
              </div>
            ))}
            {slots.length < 6 && (
              <div className="cm-slot-add" onClick={addSlot}>
                <Icon name="plus" size={16} />
                {slots.length}/6
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 20, paddingBottom: 120 }}>
          <span className="cm-save">{saved}</span>
        </div>
      </div>

      <div className="cm-toolbar">
        <button className="cm-tool" onClick={addSlot}><Icon name="image" size={20} /></button>
        <button className="cm-tool"><Icon name="bar-chart-2" size={20} /></button>
        <button className="cm-tool"><Icon name="link" size={20} /></button>
        <button className="cm-tool"><Icon name="hash" size={20} /></button>
        <span className="cm-count">{body.length} / 2,000</span>
      </div>

      {askLeave && (
        <>
          <div className="cm-scrim" onClick={() => setAskLeave(false)} />
          <div className="cm-dialog">
            <h4>작성을 그만둘까요?</h4>
            <p>지금까지 쓴 내용은 임시저장함에 남겨둘게요.</p>
            <div className="cm-dialog-row">
              <button onClick={() => setAskLeave(false)}>계속 쓰기</button>
              <button style={{ background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff' }} onClick={onCancel}>나가기</button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

Object.assign(window, { CommunityEditor });
