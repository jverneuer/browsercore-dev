import { describe, it, expect } from "vitest";
import {
    renderMetric,
    badgeColor,
    renderCoverageMarkdown,
    renderBadge,
    METRICS,
    type CoverageSummary,
    type MetricTotals,
} from "../src/coverage-md.js";

const makeSummary = (overrides: Partial<Record<keyof CoverageSummary["total"], MetricTotals>> = {}): CoverageSummary => ({
    total: {
        statements: { total: 100, covered: 90, pct: 90 },
        branches: { total: 50, covered: 40, pct: 80 },
        functions: { total: 20, covered: 18, pct: 90 },
        lines: { total: 200, covered: 180, pct: 90 },
        ...overrides,
    },
});

describe("renderMetric", () => {
    it("formats pct, covered, and total", () => {
        expect(renderMetric({ pct: 95, covered: 19, total: 20 })).toBe("95% (19/20)");
    });

    it("renders 0% correctly", () => {
        expect(renderMetric({ pct: 0, covered: 0, total: 10 })).toBe("0% (0/10)");
    });

    it("renders 100% correctly", () => {
        expect(renderMetric({ pct: 100, covered: 5, total: 5 })).toBe("100% (5/5)");
    });
});

describe("badgeColor", () => {
    it("returns brightgreen for pct >= 90", () => {
        expect(badgeColor(90)).toBe("brightgreen");
        expect(badgeColor(100)).toBe("brightgreen");
    });

    it("returns green for 75 <= pct < 90", () => {
        expect(badgeColor(75)).toBe("green");
        expect(badgeColor(89)).toBe("green");
    });

    it("returns yellow for 50 <= pct < 75", () => {
        expect(badgeColor(50)).toBe("yellow");
        expect(badgeColor(74)).toBe("yellow");
    });

    it("returns red for pct < 50", () => {
        expect(badgeColor(49)).toBe("red");
        expect(badgeColor(0)).toBe("red");
    });
});

describe("METRICS", () => {
    it("lists all four coverage metrics", () => {
        expect(METRICS).toHaveLength(4);
        expect(METRICS.map((m) => m.key)).toEqual(["statements", "branches", "functions", "lines"]);
    });

    it("assigns human-readable labels", () => {
        expect(METRICS.map((m) => m.label)).toEqual(["Statements", "Branches", "Functions", "Lines"]);
    });
});

describe("renderCoverageMarkdown", () => {
    it("emits a markdown heading", () => {
        const md = renderCoverageMarkdown(makeSummary(), []);
        expect(md.startsWith("# Coverage report")).toBe(true);
    });

    it("includes a Total section with a table", () => {
        const md = renderCoverageMarkdown(makeSummary(), []);
        expect(md).toContain("## Total");
        expect(md).toContain("| Metric | Coverage |");
        expect(md).toContain("| Statements | 90% (90/100) |");
        expect(md).toContain("| Branches | 80% (40/50) |");
        expect(md).toContain("| Functions | 90% (18/20) |");
        expect(md).toContain("| Lines | 90% (180/200) |");
    });

    it("includes a Per-file section with a table", () => {
        const md = renderCoverageMarkdown(makeSummary(), [
            { file: "src/foo.ts", m: makeSummary().total },
        ]);
        expect(md).toContain("## Per-file");
        expect(md).toContain("| File | Statements | Branches | Functions | Lines |");
        expect(md).toContain("| `src/foo.ts` |");
    });

    it("renders multiple files", () => {
        const md = renderCoverageMarkdown(makeSummary(), [
            { file: "src/a.ts", m: makeSummary().total },
            { file: "src/b.ts", m: makeSummary().total },
        ]);
        expect(md).toContain("`src/a.ts`");
        expect(md).toContain("`src/b.ts`");
    });

    it("renders no per-file rows when given empty entries", () => {
        const md = renderCoverageMarkdown(makeSummary(), []);
        expect(md).not.toContain("| `src/");
    });
});

describe("renderBadge", () => {
    it("returns a shields.io endpoint payload", () => {
        const badge = renderBadge(92);
        expect(badge).toEqual({
            schemaVersion: 1,
            label: "coverage",
            message: "92%",
            color: "brightgreen",
            namedLogo: "vitest",
        });
    });

    it("uses green for 80%", () => {
        expect(renderBadge(80).color).toBe("green");
    });

    it("uses yellow for 60%", () => {
        expect(renderBadge(60).color).toBe("yellow");
    });

    it("uses red for 30%", () => {
        expect(renderBadge(30).color).toBe("red");
    });
});
