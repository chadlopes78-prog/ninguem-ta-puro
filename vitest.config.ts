import { readFileSync } from "fs";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Os testes usam sempre a base de dados de teste definida em .env.test
const testEnv = Object.fromEntries(
  readFileSync(".env.test", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
Object.assign(process.env, testEnv);

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias: { "server-only": new URL("./tests/server-only-stub.ts", import.meta.url).pathname } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: testEnv,
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
