// app/screen-login.jsx — social-first passwordless login

const KakaoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#171717" d="M12 3C6.9 3 2.8 6.2 2.8 10.2c0 2.5 1.7 4.7 4.2 6L6 20.3c-.1.4.3.7.6.5l4.8-3.2c.2 0 .4 0 .6 0 5.1 0 9.2-3.2 9.2-7.4S17.1 3 12 3z"/></svg>
);
const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#171717" d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.6 2.3 2.8 2.3 1.1 0 1.6-.7 2.9-.7 1.3 0 1.7.7 2.9.7 1.2 0 2-1.1 2.7-2.2.9-1.2 1.2-2.4 1.2-2.5 0 0-2.4-.9-2.4-3.7zM14.2 5.7c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-.9 2.8 1 .1 2-.5 2.6-1.3z"/></svg>
);
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z"/></svg>
);

const LoginScreen = ({ onDone }) => {
  useLucide();
  const [step, setStep] = React.useState('main'); // main | email | code
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');

  if (step === 'code') {
    return (
      <div className="cm-login">
        <div className="cm-head is-flat" style={{ margin: '0 -28px', padding: '60px 8px 10px', background: 'transparent' }}>
          <button className="cm-ghost" onClick={() => setStep('email')}><Icon name="chevron-left" size={22} /></button>
        </div>
        <div className="cm-login-top" style={{ paddingTop: 0, justifyContent: 'flex-start' }}>
          <h1 className="cm-login-h" style={{ marginTop: 8 }}>인증 코드를<br />입력해 주세요</h1>
          <p className="cm-login-s"><span style={{ color: 'var(--ink)' }}>{email || 'you@example.com'}</span> 으로<br />6자리 코드를 보냈어요.</p>
          <div className="cm-code" style={{ marginTop: 28 }}>
            {[0,1,2,3,4,5].map(i => (
              <i key={i} className={code.length === i ? 'on' : ''}>{code[i] || ''}</i>
            ))}
          </div>
          <input
            autoFocus inputMode="numeric" value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>04:52</span>
            <button className="cm-text-btn" style={{ padding: 0, fontSize: 13 }}>코드 다시 받기</button>
          </div>
        </div>
        <Btn block disabled={code.length < 6} onClick={onDone}>확인</Btn>
      </div>
    );
  }

  if (step === 'email') {
    return (
      <div className="cm-login">
        <div className="cm-head is-flat" style={{ margin: '0 -28px', padding: '60px 8px 10px', background: 'transparent' }}>
          <button className="cm-ghost" onClick={() => setStep('main')}><Icon name="chevron-left" size={22} /></button>
        </div>
        <div className="cm-login-top" style={{ paddingTop: 0, justifyContent: 'flex-start' }}>
          <h1 className="cm-login-h" style={{ marginTop: 8 }}>이메일로<br />계속하기</h1>
          <p className="cm-login-s">비밀번호는 없어요. 코드로 로그인합니다.</p>
          <div className="cm-email-row" style={{ marginTop: 26 }}>
            <input className="cm-input" autoFocus type="email" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
        </div>
        <Btn block disabled={!email.includes('@')} onClick={() => setStep('code')}>인증 코드 받기</Btn>
      </div>
    );
  }

  return (
    <div className="cm-login">
      <div className="cm-login-top">
        <Wordmark />
        <h1 className="cm-login-h">축구 얘기는<br />여기서 끝까지.</h1>
        <p className="cm-login-s">이적설부터 유니폼 취향까지,<br />거들 자리를 만들어 뒀어요.</p>
      </div>
      <div className="cm-social">
        <button onClick={onDone} style={{ background: '#FEE500', borderColor: '#FEE500' }}>
          <span className="ic"><KakaoIcon /></span>카카오로 계속하기
          <span className="last">최근 사용</span>
        </button>
        <button onClick={onDone}><span className="ic"><AppleIcon /></span>Apple로 계속하기</button>
        <button onClick={onDone}><span className="ic"><GoogleIcon /></span>Google로 계속하기</button>
      </div>
      <div className="cm-or">또는</div>
      <button className="cm-input" onClick={() => setStep('email')}
        style={{ textAlign: 'left', color: 'var(--ink-mute)', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        이메일로 계속하기
        <Icon name="arrow-right" size={16} />
      </button>
      <div className="cm-guest">
        <button onClick={onDone}>먼저 둘러볼게요</button>
      </div>
      <div className="cm-legal">
        계속하면 <a href="#">이용약관</a>과 <a href="#">개인정보 처리방침</a>에<br />동의하는 것으로 봅니다.
      </div>
    </div>
  );
};

Object.assign(window, { LoginScreen });
