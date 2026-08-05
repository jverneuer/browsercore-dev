import { defineConfig } from "vitest/config";

/**
 * Options for configuring a package's vitest setup.
 *
 * @since 0.1.0
 */
type PackageOptions = {
    /** Display name for the test run (shown in reporters). */
    name: string;
    /**
     * Test files to run.
     *
     * @defaultValue <code>["tests&#47;**&#47;*.test.ts"]</code>
     */
    include?: string[];
    /**
     * Overrides merged into the <code>coverage</code> block.
     *
     * Use this to add extra <code>exclude</code> patterns — they are appended to the
     * default excludes (<code>**&#47;index.ts</code>, <code>tests&#47;**</code>, <code>node_modules&#47;**</code>).
     */
    coverage?: {
        exclude?: string[];
        [key: string]: unknown;
    };
};

/**
 * Shared vitest config for every @browsercore/* package.
 *
 * One job: kill the reporter/timeout drift that happened when each repo kept its
 * own copy. Every consumer now gets the same reporters (`text`, `html`,
 * `json-summary` — the last is what the coverage gate reads), the same v8
 * coverage over `src/` (all `.ts` files), the same 30s timeouts, and `globals: false`.
 *
 * @param options Configuration options for the package.
 * @param options.name      Display name for the test run.
 * @param options.include   Glob patterns for test files.
 * @param options.coverage  Optional coverage overrides.
 * @returns A fully-formed vitest config object.
 *
 * @example
 * ```ts
 * // vitest.config.ts in a @browsercore/* package
 * import { definePackageConfig } from "@browsercore/dev/vitest";
 * export default definePackageConfig({ name: "crypto" });
 * ```
 *
 * @example
 * ```ts
 * // With custom coverage excludes
 * export default definePackageConfig({
 *   name: "tls",
 *   coverage: { exclude: ["**&#47;handshake-driver.ts"] }
 * });
 * ```
 *
 * @since 0.1.0
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
                // Pure-reexport entrypoints can't be observed by V8's coverage
                // instrumentation: 'export { … } from' compiles to no executable
                // lines, so a file that only re-exports reports 0% even when every
                // re-exported symbol is exercised by tests. The symbols remain
                // fully covered at their origin modules. Append (don't replace)
                // any excludes the consumer passed in via options.coverage.
                ...options.coverage,
                exclude: [
                    "**/index.ts",
                    "tests/**",
                    "node_modules/**",
                    ...(options.coverage?.exclude ?? []),
                ],
            },
        },
    });
}
