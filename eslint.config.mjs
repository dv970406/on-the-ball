import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 객체 타입 별칭은 interface로 통일 (union·primitive 등은 룰이 자동 제외)
  {
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      // `const { node, ...props } = props`처럼 **일부러 걷어내려고** 구조분해한 이름은
      // 미사용이 정상이다(shared/ui/markdown.tsx가 react-markdown의 hast node를 이렇게 버린다).
      // 그 외의 미사용 변수는 그대로 잡는다.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 디자인 핸드오프 레퍼런스 (구현 대상 아님 — 린트 제외).
    // 프로토타입은 CDN Babel + 전역 스코프(window)로 도는 정적 파일이라
    // 모듈 기준 린트가 통째로 오탐한다.
    "handoff_community/**",
    // supabase CLI가 생성하는 파일 — 손으로 고쳐도 `pnpm db:types`에 덮인다
    "src/types/database.types.ts",
  ]),
]);

export default eslintConfig;
