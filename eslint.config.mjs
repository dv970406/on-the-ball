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
      // `const { omitted, ...rest } = props`처럼 **일부러 걷어내려고** 구조분해한 이름은 미사용이 정상이다
      // (`ignoreRestSiblings`). `_` 접두사는 선언 자체가 검사인 상수(망라성 가드 — `code-quality.md`)다.
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
    // 이적 품질 검증의 로컬 산출물(평가 스냅샷·벤치 원출력) — 소스가 아니다(gitignore)
    ".cache/**",
    // supabase CLI가 생성하는 파일 — 손으로 고쳐도 `pnpm db:types`에 덮인다
    "src/types/database.types.ts",
  ]),
]);

export default eslintConfig;
