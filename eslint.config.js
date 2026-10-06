// @ts-check
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    linterOptions: {
      // Ring 0: suppressions supplied by a candidate are ignored, not honored.
      noInlineConfig: true,
    },
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    // X1: generated Ajv validators are covered by the drift check and tests, not lint.
    ignores: ["packages/*/generated/*.validate.js"],
  },
  {
    rules: {
      // Ring 0: TypeScript directive comments are candidate suppressions too.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": true,
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
        },
      ],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
