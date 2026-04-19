import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Opt-in coverage: only enforce coverage on files we've specifically targeted.
      // As new modules are tested, add them here so their coverage cannot drop below 80%.
      include: [
        "src/lib/crypto.ts",
        "src/lib/stock/service.ts",
        "src/lib/channels/utils.ts",
        "src/lib/validations/products.ts",
        "src/lib/validations/invoices.ts",
        "src/lib/validations/channels.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
