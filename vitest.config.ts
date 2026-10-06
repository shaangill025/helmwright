import { defineConfig } from "vitest/config";

// The only Vitest config: CI passes it explicitly, so a candidate cannot swap in another one.
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    passWithNoTests: false,
  },
});
