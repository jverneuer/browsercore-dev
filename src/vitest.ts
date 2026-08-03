import { defineConfig } from "vitest/config";

type PackageOptions = {
    name: string;
    /** Test files to run; defaults to the `tests/` directory. */
    include?: string[];
    /** Overrides merged into the `coverage` block (e.g. extra `exclude`). */
    coverage?: Record<string, unknown>;
};

/**
 * Shared vitest config for every @browsercore/* package.
 *
 * One job: kill the reporter/timeout drift that happened when each repo kept its
 * own copy. Every consumer now gets the same reporters (`text`, `html`,
 * `json-summary` — the last is what the coverage gate reads), the same v8
 * coverage over `src/` (all `.ts` files), the same 30s timeouts, and `globals: false`.
 *
 * Consumers opt in with just their name:
 *
 * ```ts
 * import { definePackageConfig } from "@browsercore/dev/vitest";
 * export default definePackageConfig({ name: "crypto" });
 * ```
 */
export function definePackageConfig(options: PackageOptions) {
    return defineConfig({
        test: {
            name: options.name,
            root: ".",
            include: options.include ?? ["tests/**/*.test.ts"],
            environment: "node",
            globals: false,
            testTimeout: 30_000,
            hookTimeout: 30_000,
            coverage: {
                provider: "v8",
                include: ["src/**/*.ts"],
                reporter: ["text", "html", "json-summary"],
                ...options.coverage,
            },
        },
    });
}
