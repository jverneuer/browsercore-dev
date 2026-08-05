/**
 * Public entrypoint for @browsercore/dev.
 *
 * Re-exports the convenience helpers. Consumers normally import the subpath
 * directly (`@browsercore/dev/vitest`, `@browsercore/dev/oxlint`), but the root
 * export is here for `import { definePackageConfig, oxlintBase } from "@browsercore/dev"`.
 *
 * @module
 * @since 0.1.0
 */

export { definePackageConfig } from "./vitest.js";
export { default as oxlintBase } from "./oxlint.js";
