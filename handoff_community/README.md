# 온더볼 커뮤니티 — 핸드오프 패키지

```
COMMUNITY_HANDOFF.md   ← 구현 지침. 에이전트에게 이 파일을 먼저 읽히세요.
prototype/             ← 동작하는 참조 프로토타입 (그대로 실행 가능)
  온더볼 커뮤니티.html
  design/              토큰 CSS + Pretendard 폰트
  app/                 화면별 소스 + community.css
```

## 실행

```
cd prototype
python3 -m http.server 8000
# http://localhost:8000/온더볼%20커뮤니티.html
```

`file://` 로 직접 열면 폰트와 JSX 로드가 막힙니다.

## 에이전트 프롬프트 예시

```
handoff_community/COMMUNITY_HANDOFF.md 를 읽고,
handoff_community/prototype/ 의 소스를 참조해서
커뮤니티 4화면(로그인·목록·상세·작성/수정)을 Tailwind CSS 기반으로 구현해줘.

- 지침 0장 "지켜야 할 것 / 하지 말 것"은 예외 없이 따라.
- 색은 6-1의 @theme 매핑으로만 쓰고 arbitrary hex는 금지.
- 카피는 8장 인벤토리를 그대로 사용하고 다시 쓰지 마.
- 끝나면 9장 체크리스트를 항목별로 확인해서 보고해줘.
```

## 플로우

```
로그인 → 목록 → 상세 → (내 글) 수정 → 상세
         목록 → 작성 → 목록
```

프로토타입에서 "겨울에 진짜 움직일 것 같은 선수 5명 정리" 글이 `mine: true` 로 되어 있어, 수정/삭제 UI를 확인할 수 있습니다.
