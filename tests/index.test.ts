import { describe, it, expect } from "vitest";
// Import through the root public path consumers actually use: "@browsercore/dev"
import { definePackageConfig, oxlintBase } from "../src/index.js";
import { definePackageConfig as directDefinePackageConfig } from "../src/vitest.js";
import { default as directOxlintBase } from "../src/oxlint.js";

describe("index re-exports", () => {
    it("re-exports definePackageConfig as a function", () => {
        expect(typeof definePackageConfig).toBe("function");
    });

    it("re-exports oxlintBase as an object", () => {
        expect(typeof oxlintBase).toBe("object");
        expect(oxlintBase).not.toBeNull();
    });

    it("the re-exported definePackageConfig is the same function as the direct import", () => {
        // Re-exports resolve to the same runtime reference — proves the wiring is correct
        expect(definePackageConfig).toBe(directDefinePackageConfig);
    });

    it("the re-exported oxlintBase is the same object as the direct import", () => {
        expect(oxlintBase).toBe(directOxlintBase);
    });

    it("the re-exported definePackageConfig behaves identically to the direct import", () => {
        const a = definePackageConfig({ name: "test" });
        const b = directDefinePackageConfig({ name: "test" });
        expect(a).toEqual(b);
        expect(a.test?.name).toBe("test");
    });

    it("the re-exported oxlintBase has the same shape as the direct import", () => {
        expect(Object.keys(oxlintBase!)).toEqual(Object.keys(directOxlintBase!));
    });
});
