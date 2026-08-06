/**
 * Pure rendering logic for the coverage-md bin.
 *
 * Extracted from `bin/coverage-md.mjs` so it can be unit-tested without
 * touching the filesystem. The bin imports these helpers and handles I/O;
 * everything here is deterministic given a coverage summary.
 *
 * @module
 * @since 0.1.0
 */
import { z } from "zod";

/**
 * Schema for a single metric's totals (statements, branches, functions, lines).
 *
 * @since 0.3.0
 */
const metricTotalsSchema = z.object({
    /** Total number of trackable items. */
    total: z.number(),
    /** Number of items that were covered. */
    covered: z.number(),
    /** Coverage percentage (0–100). */
    pct: z.number(),
});

/**
 * Totals for a single metric (statements, branches, functions, lines).
 *
 * Derived from {@link metricTotalsSchema} so the type and its validator stay
 * in sync.
 *
 * @since 0.1.0
 */
export type MetricTotals = z.infer<typeof metricTotalsSchema>;

/**
 * Schema for one file's coverage entry (or the aggregate `total` entry).
 *
 * @since 0.3.0
 */
const fileCoverageSchema = z.object({
    statements: metricTotalsSchema,
    branches: metricTotalsSchema,
    functions: metricTotalsSchema,
    lines: metricTotalsSchema,
});

/**
 * The shape of v8's `coverage-summary.json` file.
 *
 * `total` holds the aggregate; every other key is an absolute file path with
 * the same per-metric shape. The `.catchall` validates every entry (total and
 * per-file) against {@link fileCoverageSchema} without stripping the arbitrary
 * file-path keys the bin iterates over.
 *
 * This is the single source of truth for the coverage shape: the
 * {@link CoverageSummary} type is derived from it via `z.infer`, so the
 * validated runtime shape and the static type can never drift.
 *
 * @since 0.3.0
 */
export const CoverageSummarySchema = z
    .object({
        total: fileCoverageSchema,
    })
    .catchall(fileCoverageSchema);

/**
 * The shape of v8's `coverage-summary.json` file.
 *
 * `total` holds the aggregate; every other key is an absolute file path with
 * the same per-metric shape.
 *
 * Derived from {@link CoverageSummarySchema} so the type and its validator stay
 * in sync.
 *
 * @since 0.1.0
 */
export type CoverageSummary = z.infer<typeof CoverageSummarySchema>;

/**
 * A single coverage metric with a human-readable label and its key in
 * {@link CoverageSummary}.
 *
 * @since 0.1.0
 */
export interface Metric {
    /** Human-readable label (e.g. `"Statements"`). */
    label: string;
    /** Key into {@link CoverageSummary.total} (e.g. `"statements"`). */
    key: keyof CoverageSummary["total"];
}

/**
 * The canonical ordered list of coverage metrics.
 *
 * Used by both the markdown renderer and the badge renderer so they stay in sync.
 *
 * @since 0.1.0
 */
export const METRICS: Metric[] = [
    { label: "Statements", key: "statements" },
    { label: "Branches", key: "branches" },
    { label: "Functions", key: "functions" },
    { label: "Lines", key: "lines" },
];

/**
 * Render a single metric as a human-readable string.
 *
 * @param m The metric totals to render.
 * @returns A string like `"85% (17/20)"`.
 *
 * @example
 * ```ts
 * renderMetric({ total: 20, covered: 17, pct: 85 });
 * // => "85% (17/20)"
 * ```
 *
 * @since 0.1.0
 */
export const renderMetric = (m: MetricTotals): string => `${m.pct}% (${m.covered}/${m.total})`;

/**
 * Map a coverage percentage to a badge color.
 *
 * Follows the Shields.io color scheme:
 * - `≥ 90%` → `brightgreen`
 * - `≥ 75%` → `green`
 * - `≥ 50%` → `yellow`
 * - `< 50%` → `red`
 *
 * @param pct Coverage percentage (0–100).
 * @returns The Shields.io color name.
 *
 * @example
 * ```ts
 * badgeColor(95); // => "brightgreen"
 * badgeColor(60); // => "yellow"
 * badgeColor(30); // => "red"
 * ```
 *
 * @since 0.1.0
 */
export const badgeColor = (pct: number): string =>
    pct >= 90 ? "brightgreen" : pct >= 75 ? "green" : pct >= 50 ? "yellow" : "red";

/**
 * Render a full coverage report as a Markdown string.
 *
 * Produces a document with a total section and a per-file section, each as
 * a table with columns for statements, branches, functions, and lines.
 *
 * @param data        The aggregate coverage summary.
 * @param fileEntries Per-file breakdown (file path + metric totals).
 * @returns A complete Markdown document.
 *
 * @example
 * ```ts
 * const md = renderCoverageMarkdown(summary, [
 *   { file: "src/index.ts", m: { statements: { total: 10, covered: 8, pct: 80 }, ... } }
 * ]);
 * ```
 *
 * @since 0.1.0
 */
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

/**
 * Render a Shields.io-compatible coverage badge JSON object.
 *
 * The returned object can be written to a JSON file and served as a badge
 * endpoint, or consumed directly by Shields.io's endpoint badge format.
 *
 * @param statementsPct The statements coverage percentage (0–100).
 * @returns A badge object with `schemaVersion`, `label`, `message`, `color`, and `namedLogo`.
 *
 * @example
 * ```ts
 * renderBadge(87);
 * // => { schemaVersion: 1, label: "coverage", message: "87%", color: "green", namedLogo: "vitest" }
 * ```
 *
 * @see {@link https://shields.io/badges Shields.io badge format}
 * @since 0.1.0
 */
export const renderBadge = (
    statementsPct: number,
): { schemaVersion: number; label: string; message: string; color: string; namedLogo: string } => ({
    schemaVersion: 1,
    label: "coverage",
    message: `${statementsPct}%`,
    color: badgeColor(statementsPct),
    namedLogo: "vitest",
});
