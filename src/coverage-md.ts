/**
 * Pure rendering logic for the coverage-md bin, extracted from bin/coverage-md.mjs
 * so it can be unit-tested without touching the filesystem. The bin imports these
 * helpers and handles I/O; everything here is deterministic given a coverage summary.
 */

export interface MetricTotals {
    total: number;
    covered: number;
    pct: number;
}

export interface CoverageSummary {
    total: {
        statements: MetricTotals;
        branches: MetricTotals;
        functions: MetricTotals;
        lines: MetricTotals;
    };
}

export interface Metric {
    label: string;
    key: keyof CoverageSummary["total"];
}

export const METRICS: Metric[] = [
    { label: "Statements", key: "statements" },
    { label: "Branches", key: "branches" },
    { label: "Functions", key: "functions" },
    { label: "Lines", key: "lines" },
];

export const renderMetric = (m: MetricTotals): string => `${m.pct}% (${m.covered}/${m.total})`;

export const badgeColor = (pct: number): string =>
    pct >= 90 ? "brightgreen" : pct >= 75 ? "green" : pct >= 50 ? "yellow" : "red";

export const renderCoverageMarkdown = (
    data: CoverageSummary,
    fileEntries: Array<{ file: string; m: CoverageSummary["total"] }>,
): string => {
    const total = data.total;

    const totalRows: string[] = METRICS.map(({ label, key }) => `| ${label} | ${renderMetric(total[key])} |`);
    const header = `| File | ${METRICS.map((m) => m.label).join(" | ")} |`;
    const sep = `| --- | ${METRICS.map(() => "---").join(" | ")} |`;
    const fileRows: string[] = fileEntries.map(
        ({ file, m }) => `| \`${file}\` | ${METRICS.map((met) => renderMetric(m[met.key])).join(" | ")} |`,
    );

    return [
        "# Coverage report",
        "",
        "Generated from `coverage-summary.json` by `coverage-md` (@browsercore/dev).",
        "",
        "## Total",
        "",
        "| Metric | Coverage |",
        "| --- | --- |",
        ...totalRows,
        "",
        "## Per-file",
        "",
        header,
        sep,
        ...fileRows,
        "",
    ].join("\n");
};

export const renderBadge = (
    statementsPct: number,
): { schemaVersion: number; label: string; message: string; color: string; namedLogo: string } => ({
    schemaVersion: 1,
    label: "coverage",
    message: `${statementsPct}%`,
    color: badgeColor(statementsPct),
    namedLogo: "vitest",
});
