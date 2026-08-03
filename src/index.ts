/**
 * Public entrypoint for @browsercore/dev.
 *
 * Re-exports the convenience helpers; consumers normally import the subpaths
 * directly (`@browsercore/dev/vitest`, `@browsercore/dev/oxlint`), but the root
 * export is here for `import { definePackageConfig, oxlintBase } from "@browsercore/dev"`.
 */
export { definePackageConfig } from "./vitest.js";
export { default as oxlintBase } from "./oxlint.js";
