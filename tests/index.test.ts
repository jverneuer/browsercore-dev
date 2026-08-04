import { describe, it, expect } from "vitest";
import { definePackageConfig } from "../src/vitest.js";
import oxlintBase from "../src/oxlint.js";

describe("@browsercore/dev", () => {
    it("exports definePackageConfig as a function", () => {
        expect(typeof definePackageConfig).toBe("function");
    });

    it("definePackageConfig returns a vitest config object", () => {
        const config = definePackageConfig({ name: "example" });
        expect(config).toBeDefined();
        expect(config.test?.name).toBe("example");
    });

    it("exports oxlintBase as an object", () => {
        expect(oxlintBase).toBeDefined();
        expect(typeof oxlintBase).toBe("object");
    });
});
