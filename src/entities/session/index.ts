// ⚠ 이 배럴은 "use client" 모듈을 포함한다.
//    서버 컴포넌트가 AuthRequired·GuestOnly·AuthProvider를 **렌더**하는 것은 정상이다
//    (클라이언트 컴포넌트를 서버에서 렌더하는 것은 합법 — app/(auth)/layout.tsx 등).
//    금지되는 것은 서버에서 이 모듈의 export를 **함수로 호출**하는 것이다
//    (클라이언트 참조라 "Attempted to call X() from the server"가 난다).
//    서버에서 순수 함수가 필요하면 "@/entities/session/lib/auth-error-message"를 직접 쓴다.
// ⚠ `SessionStatus`·`SessionUser`는 올리지 않는다 — 소비처가 이 슬라이스 안뿐이다
//   (`check:conventions`는 상대 경로 소비를 "현역"으로 세어 이 유형을 못 잡는다).
export { useSessionStore } from "./model/session-store";
export { AuthProvider } from "./model/auth-provider";
export { AuthRequired, GuestOnly } from "./model/guards";
export { authErrorMessageFor, toAuthErrorMessage } from "./lib/auth-error-message";
export { clearSignOutIntent, markSignOutIntent } from "./lib/sign-out-intent";
// ⚠ 순수 함수(read/remember)는 올리지 않는다 — 쓰는 쪽이 이 슬라이스 안뿐이고,
//   읽기는 "렌더 중 호출 금지"라는 함정을 훅이 감싸서 내보낸다.
export { useLastAuthProvider } from "./model/use-last-auth-provider";
export { useLinkedIdentitiesQuery } from "./api/queries";
export { identityKeys } from "./api/keys";
