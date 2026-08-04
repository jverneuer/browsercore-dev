import { definePackageConfig } from "./src/vitest.js";

// Dogfood the shared config factory so dev's own test gate exercises the same
// code path consumers use. Tests live in tests/; the shared factory points
// include there by default.
export default definePackageConfig({ name: "@browsercore/dev" });
