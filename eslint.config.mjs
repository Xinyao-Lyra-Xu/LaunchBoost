import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    // Build output, deps, and the local-only eval preview harness are not linted.
    ignores: ["dist/**", "node_modules/**", "eval-server.cjs"],
  },

  // TypeScript / React source — the code we keep and grow.
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      // Migration-era debt: the existing (tested, working) hooks call setState
      // inside effects. react-hooks v7 flags this as an error by default; we
      // keep it visible as a warning and will resolve it during the
      // architecture-migration phase rather than risk behavior changes here.
      "react-hooks/set-state-in-effect": "warn",
    },
  },

  // Electron main-process / preload — Node + CommonJS.
  {
    files: ["main.js", "preload.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
