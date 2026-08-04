import { describe, it, expect } from "vitest";
import oxlintBase from "../src/oxlint.js";

describe("oxlintBase", () => {
    it("is a non-null object", () => {
        expect(typeof oxlintBase).toBe("object");
        expect(oxlintBase).not.toBeNull();
    });

    it("enables the typescript plugin", () => {
        expect(oxlintBase.plugins).toContain("typescript");
    });

    it("enables the unicorn plugin", () => {
        expect(oxlintBase.plugins).toContain("unicorn");
    });

    it("enables the import plugin", () => {
        expect(oxlintBase.plugins).toContain("import");
    });

    it("enables the promise plugin", () => {
        expect(oxlintBase.plugins).toContain("promise");
    });

    it("enables the node plugin", () => {
        expect(oxlintBase.plugins).toContain("node");
    });

    it("sets node env to true", () => {
        expect(oxlintBase.env?.node).toBe(true);
    });

    it("sets correctness category to error", () => {
        expect(oxlintBase.categories?.correctness).toBe("error");
    });

    it("sets suspicious category to error", () => {
        expect(oxlintBase.categories?.suspicious).toBe("error");
    });

    it("sets pedantic category to error", () => {
        expect(oxlintBase.categories?.pedantic).toBe("error");
    });

    it("sets perf category to warn", () => {
        expect(oxlintBase.categories?.perf).toBe("warn");
    });

    it("sets style category to off", () => {
        expect(oxlintBase.categories?.style).toBe("off");
    });

    it("forbids explicit any", () => {
        expect(oxlintBase.rules?.["typescript/no-explicit-any"]).toBe("error");
    });

    it("forbids non-null assertions", () => {
        expect(oxlintBase.rules?.["typescript/no-non-null-assertion"]).toBe("error");
    });

    it("requires eqeqeq", () => {
        expect(oxlintBase.rules?.eqeqeq).toBe("error");
    });

    it("disables style rules that would conflict with oxlint defaults", () => {
        expect(oxlintBase.rules?.["no-inline-comments"]).toBe("off");
        expect(oxlintBase.rules?.["max-lines"]).toBe("off");
        expect(oxlintBase.rules?.["max-lines-per-function"]).toBe("off");
    });

    it("ignores dist, coverage, node_modules, and config files", () => {
        expect(oxlintBase.ignorePatterns).toEqual(["dist", "coverage", "node_modules", "*.config.js"]);
    });

    it("disables unicorn/no-array-reduce and unicorn/no-array-sort (used by consumers)", () => {
        expect(oxlintBase.rules?.["unicorn/no-array-reduce"]).toBe("off");
        expect(oxlintBase.rules?.["unicorn/no-array-sort"]).toBe("off");
    });

    it("enables import cycle/self-import/duplicates detection", () => {
        expect(oxlintBase.rules?.["import/no-cycle"]).toBe("error");
        expect(oxlintBase.rules?.["import/no-self-import"]).toBe("error");
        expect(oxlintBase.rules?.["import/no-duplicates"]).toBe("error");
    });

    it("enables promise rules (no-return-wrap error, no-nesting warn)", () => {
        expect(oxlintBase.rules?.["promise/no-return-wrap"]).toBe("error");
        expect(oxlintBase.rules?.["promise/no-nesting"]).toBe("warn");
    });
});
