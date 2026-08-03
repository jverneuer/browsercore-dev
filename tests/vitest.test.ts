import { describe, it, expect } from "vitest";
import { definePackageConfig } from "../src/vitest.js";

describe("definePackageConfig", () => {
    it("returns a config with the provided package name", () => {
        const config = definePackageConfig({ name: "crypto" });
        expect(config.test?.name).toBe("crypto");
    });

    it("defaults root to '.'", () => {
        const config = definePackageConfig({ name: "crypto" });
        expect(config.test?.root).toBe(".");
    });

    it("defaults include to tests/**/*.test.ts", () => {
        const config = definePackageConfig({ name: "crypto" });
        expect(config.test?.include).toEqual(["tests/**/*.test.ts"]);
    });

    it("allows overriding include", () => {
        const config = definePackageConfig({ name: "crypto", include: ["src/**/*.spec.ts"] });
        expect(config.test?.include).toEqual(["src/**/*.spec.ts"]);
    });

    it("sets environment to node", () => {
        const config = definePackageConfig({ name: "crypto" });
        expect(config.test?.environment).toBe("node");
    });

    it("disables globals", () => {
        const config = definePackageConfig({ name: "crypto" });
        expect(config.test?.globals).toBe(false);
    });

    it("sets testTimeout to 30s", () => {
        const config = definePackageConfig({ name: "crypto" });
        expect(config.test?.testTimeout).toBe(30_000);
    });

    it("sets hookTimeout to 30s", () => {
        const config = definePackageConfig({ name: "crypto" });
        expect(config.test?.hookTimeout).toBe(30_000);
    });

    it("configures v8 coverage provider", () => {
        const config = definePackageConfig({ name: "crypto" });
        const coverage = config.test?.coverage as { provider: string; include: string[]; reporter: string[] };
        expect(coverage.provider).toBe("v8");
    });

    it("covers src/**/*.ts by default", () => {
        const config = definePackageConfig({ name: "crypto" });
        const coverage = config.test?.coverage as { provider: string; include: string[]; reporter: string[] };
        expect(coverage.include).toEqual(["src/**/*.ts"]);
    });

    it("uses text, html, json-summary reporters", () => {
        const config = definePackageConfig({ name: "crypto" });
        const coverage = config.test?.coverage as { provider: string; include: string[]; reporter: string[] };
        expect(coverage.reporter).toEqual(["text", "html", "json-summary"]);
    });

    it("merges coverage overrides without losing defaults", () => {
        const config = definePackageConfig({
            name: "crypto",
            coverage: { exclude: ["tests/**"] },
        });
        const coverage = config.test?.coverage as {
            provider: string;
            include: string[];
            reporter: string[];
            exclude?: string[];
        };
        expect(coverage.exclude).toContain("**/index.ts");
        expect(coverage.exclude).toContain("tests/**");
        expect(coverage.exclude).toContain("node_modules/**");
        expect(coverage.exclude).toContain("tests/**");
        // User-provided exclude is appended after the defaults
        expect(coverage.exclude!.slice(-1)).toEqual(["tests/**"]);
        expect(coverage.include).toEqual(["src/**/*.ts"]);
        expect(coverage.reporter).toEqual(["text", "html", "json-summary"]);
        expect(coverage.provider).toBe("v8");
    });

    it("treats name as an opaque string (matches vitest's test.name)", () => {
        const config = definePackageConfig({ name: "@browsercore/http2" });
        expect(config.test?.name).toBe("@browsercore/http2");
    });
});
