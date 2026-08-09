#!/usr/bin/env npx tsx
/**
 * generate-changelog.ts — Generates categorized release notes from git history.
 *
 * Called by the CI publish step to produce formatted GitHub Release notes.
 * Collects commits since the previous tag, groups them by conventional-commit
 * type, and outputs categorized markdown.
 *
 * Usage:
 *   npx tsx scripts/generate-changelog.ts [previous-tag]
 *
 * If no previous tag is provided, all commits on HEAD are included.
 *
 * Output: formatted markdown changelog to stdout.
 */

import { execSync } from "node:child_process";

const prevTag = process.argv[2] ?? "";
const range = prevTag ? `${prevTag}..HEAD` : "HEAD";

const log = execSync(`git log ${range} --pretty=format:"%s" --no-merges`, {
    encoding: "utf8",
});
const lines = log.trim().split("\n").filter(Boolean);

const categories = [
    { prefix: "feat", label: "✨ Features" },
    { prefix: "fix", label: "🐛 Bug Fixes" },
    { prefix: "refactor", label: "♻️ Refactoring" },
    { prefix: "perf", label: "⚡ Performance" },
    { prefix: "docs", label: "📚 Documentation" },
    { prefix: "test", label: "🧪 Tests" },
    { prefix: "ci", label: "🔧 CI" },
    { prefix: "chore", label: "🔧 Chore" },
] as const;

/** Escape @ mentions so GitHub doesn't auto-link @browsercore, @main, etc. */
function escapeMentions(text: string): string {
    return text.replace(/@(browsercore|main|github)/g, "@\u200B$1");
}

const buckets = new Map<string, string[]>();
const uncategorized: string[] = [];

for (const line of lines) {
    const match = line.match(
        /^(feat|fix|refactor|perf|docs|test|ci|chore)(?:\(([^)]+)\))?:\s*(.+)/,
    );
    if (match) {
        const [, type, scope, desc] = match;
        const cat = categories.find((c) => c.prefix === type);
        if (!cat) {
            uncategorized.push(`- ${escapeMentions(line)}`);
            continue;
        }
        const key = cat.label;
        if (!buckets.has(key)) buckets.set(key, []);
        const safeScope = scope ? escapeMentions(scope) : scope;
        const safeDesc = escapeMentions(desc);
        const formatted = safeScope
            ? `**${safeScope}**: ${safeDesc}`
            : safeDesc;
        buckets.get(key)!.push(`- ${formatted}`);
    } else {
        uncategorized.push(`- ${escapeMentions(line)}`);
    }
}

let output = "";
for (const cat of categories) {
    const items = buckets.get(cat.label);
    if (items && items.length > 0) {
        output += `### ${cat.label}\n\n${items.join("\n")}\n\n`;
    }
}
if (uncategorized.length > 0) {
    output += `### Other Changes\n\n${uncategorized.join("\n")}\n\n`;
}
process.stdout.write(output.trim() || "Release published.");
