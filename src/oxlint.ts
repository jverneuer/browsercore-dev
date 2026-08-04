import type { OxlintConfig } from "oxlint";

/**
 * Base oxlint config shared by every @browsercore/* package.
 *
 * Consumers extend it in an `oxlint.config.ts` (which replaces `.oxlintrc.json`).
 *
 * @remarks
 * Why a TS import rather than `.oxlintrc.json` `extends`: oxlint's JSON
 * `extends` resolves only relative file paths, not `node_modules` (see
 * oxc-project/oxc#15538). The `oxlint.config.ts` form imports the config object
 * directly, which does resolve through `node_modules`.
 *
 * @example
 * ```ts
 * // oxlint.config.ts in a @browsercore/* package
 * import { defineConfig } from "oxlint";
 * import base from "@browsercore/dev/oxlint";
 * export default defineConfig({ extends: [base] });
 * ```
 *
 * @defaultValue
 * Enables `typescript`, `unicorn`, `import`, `promise`, and `node` plugins with
 * `correctness`, `suspicious`, and `pedantic` set to `"error"`.
 *
 * @see {@link https://oxc.rs/docs/guide/linting/ oxlint documentation}
 * @since 0.1.0
 */
const base: OxlintConfig = {
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
        // Transport extends node:EventEmitter — its .emit()/.on() contract is the
        // wire-level primitive; EventTarget is not a behavioral substitute.
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

export default base;
