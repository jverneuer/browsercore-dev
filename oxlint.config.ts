import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

// Standalone house config. We intentionally do NOT import from ./src/oxlint.js
// here: that file is emitted by `npm run build`, which runs AFTER lint in the
// CI gate (typecheck → lint → test → build), so the import would fail at lint
// time. The rules below match src/oxlint.ts (the @browsercore/dev/oxlint base
// that consumers extend); keep them in sync.
const config: OxlintConfig = {
    plugins: ["typescript", "unicorn", "import", "promise", "node"],
    env: {
        node: true,
    },
    categories: {
        correctness: "error",
        suspicious: "error",
        pedantic: "error",
        perf: "warn",
        style: "off",
    },
    rules: {
        "no-console": "warn",
        "no-debugger": "error",
        eqeqeq: "error",
        "no-var": "error",
        "prefer-const": "error",
        "object-shorthand": "error",
        curly: "error",
        "no-duplicate-imports": "error",
        "no-useless-constructor": "error",
        "no-unreachable": "error",
        "no-constant-condition": "error",
        "no-self-compare": "error",
        "no-template-curly-in-string": "error",
        "no-unneeded-ternary": "error",
        "typescript/no-explicit-any": "error",
        "typescript/no-non-null-assertion": "error",
        "typescript/no-namespace": "error",
        "typescript/consistent-type-imports": "error",
        "typescript/ban-ts-comment": "error",
        "unicorn/prefer-node-protocol": "error",
        "unicorn/prefer-array-find": "error",
        "unicorn/prefer-array-flat": "error",
        "unicorn/prefer-structured-clone": "error",
        "unicorn/no-array-reduce": "off",
        "unicorn/no-process-exit": "error",
        "unicorn/no-array-sort": "off",
        "unicorn/prefer-event-target": "off",
        "no-inline-comments": "off",
        "max-lines": "off",
        "max-lines-per-function": "off",
        "import/no-cycle": "error",
        "import/no-duplicates": "error",
        "import/no-self-import": "error",
        "promise/no-return-wrap": "error",
        "promise/no-nesting": "warn",
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/no-unnecessary-type-assertion": "off",
        "max-classes-per-file": "off",
        "prefer-readonly-parameter-types": "off",
    },
    ignorePatterns: ["dist", "coverage", "node_modules", "*.config.js"],
};

export default defineConfig(config);
