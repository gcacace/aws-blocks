// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// ── Config ──────────────────────────────────────────────────

const PROJECT_NUMBER = 141;
const VIEW_NUMBER = 11;
const ORG = "aws-amplify";
const ITERATIONS = 100;
const PERCENTILE = 0.8;
const CACHE_DIR = resolve(import.meta.dirname, "..", ".cache");
const CACHE_FILE = resolve(CACHE_DIR, "gh-project-data.json");

// ── Types ───────────────────────────────────────────────────

interface CacheData {
	fetchedAt: string;
	viewData: {
		name: string;
		filter: string;
		groupBy: { nodes: { name?: string }[] };
	};
	fieldNodes: { name?: string; options?: { name: string }[] }[];
	items: Record<string, unknown>[];
}

interface SimTask {
	title: string;
	status: string;
	minDays: number;
	maxDays: number;
	milestone: string;
}

interface SimResult extends SimTask {
	ecd: string;
}

interface MilestoneReport {
	milestone: string;
	results: SimResult[];
	ecd: string | null;
	devDays: number | null;
	skipped: { title: string; status: string; reason: string }[];
}

// ── GitHub Data ─────────────────────────────────────────────

function gh(cmd: string): string {
	return execSync(`gh ${cmd}`, { encoding: "utf-8" });
}

function fetchFromGitHub(): CacheData {
	const viewQuery = gh(`api graphql -f query='
{
  organization(login: "${ORG}") {
    projectV2(number: ${PROJECT_NUMBER}) {
      view(number: ${VIEW_NUMBER}) {
        name
        filter
        groupBy(first: 10) {
          nodes { ... on ProjectV2Field { name } }
        }
      }
      fields(first: 30) {
        nodes {
          ... on ProjectV2SingleSelectField {
            name
            options { name }
          }
        }
      }
    }
  }
}'`);

	const projectData = JSON.parse(viewQuery).data.organization.projectV2;
	const raw = gh(
		`project item-list ${PROJECT_NUMBER} --owner ${ORG} --format json --limit 1000`,
	);

	return {
		fetchedAt: new Date().toISOString(),
		viewData: projectData.view,
		fieldNodes: projectData.fields.nodes,
		items: JSON.parse(raw).items,
	};
}

function loadOrFetch(useCache: boolean): CacheData {
	if (useCache && existsSync(CACHE_FILE)) {
		const data: CacheData = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
		console.log(`📦 Using cached data from ${data.fetchedAt}`);
		console.log(`   Cache: ${CACHE_FILE}\n`);
		return data;
	}

	console.log("🔄 Fetching from GitHub...\n");
	const data = fetchFromGitHub();
	mkdirSync(CACHE_DIR, { recursive: true });
	writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
	return data;
}

// ── View Filtering ──────────────────────────────────────────

interface FilterRule {
	field: string;
	value: string;
	exclude: boolean;
}

function parseFilter(filter: string): FilterRule[] {
	const rules: FilterRule[] = [];
	const re = /(-?)(\w[\w\s]*):"([^"]+)"/g;
	let m;
	while ((m = re.exec(filter)) !== null) {
		rules.push({ exclude: m[1] === "-", field: m[2], value: m[3] });
	}
	return rules;
}

type Item = Record<string, unknown>;

function applyFilter(items: Item[], rules: FilterRule[]): Item[] {
	return items.filter((item) =>
		rules.every((r) => {
			const key = Object.keys(item).find(
				(k) => k.toLowerCase() === r.field.toLowerCase(),
			);
			const val = key ? item[key] : undefined;
			const matches = val === r.value;
			return r.exclude ? !matches : matches;
		}),
	);
}

function groupAndSort(
	items: Item[],
	groupField: string | undefined,
	fieldOptions: Map<string, string[]>,
): [string, Item[]][] {
	const allKeys = new Set(items.flatMap(Object.keys));
	const groupKey = groupField
		? [...allKeys].find(
				(k) => k.toLowerCase() === groupField.toLowerCase(),
			)
		: undefined;

	const grouped = new Map<string, Item[]>();
	for (const item of items) {
		const g = groupKey
			? (item[groupKey] as string | undefined)
			: undefined;
		if (!g) continue;
		if (!grouped.has(g)) grouped.set(g, []);
		grouped.get(g)!.push(item);
	}

	const optionOrder = groupField
		? fieldOptions.get(groupField.toLowerCase())
		: undefined;

	return optionOrder
		? [...grouped.entries()].sort(
				(a, b) =>
					(optionOrder.indexOf(a[0]) ?? 999) -
					(optionOrder.indexOf(b[0]) ?? 999),
			)
		: [...grouped.entries()];
}

// ── Task Extraction ─────────────────────────────────────────

function extractTasks(sortedGroups: [string, Item[]][]): {
	tasks: SimTask[];
	skippedByMilestone: Map<
		string,
		{ title: string; status: string; reason: string }[]
	>;
} {
	const tasks: SimTask[] = [];
	const skippedByMilestone = new Map<
		string,
		{ title: string; status: string; reason: string }[]
	>();

	for (const [milestone, items] of sortedGroups) {
		const skipped: { title: string; status: string; reason: string }[] =
			[];

		for (const item of items) {
			const title = item.title as string;
			const status = (item.status as string) || "-";
			const name = title.toLowerCase();

			if (
				name.startsWith("concurrency") ||
				name.startsWith("efficiency")
			)
				continue;

			if (status === "Done" || status === "Cancelled") {
				skipped.push({ title, status, reason: "done" });
				continue;
			}

			const minDays = item["min Days"] as number | undefined;
			const maxDays = item["max Days"] as number | undefined;

			if (minDays == null || maxDays == null) {
				skipped.push({ title, status, reason: "no estimate" });
				continue;
			}

			tasks.push({ title, status, minDays, maxDays, milestone });
		}

		skippedByMilestone.set(milestone, skipped);
	}

	return { tasks, skippedByMilestone };
}

// ── Monte Carlo Simulation ──────────────────────────────────

function addBusinessDays(from: Date, days: number): Date {
	const d = new Date(from);
	let added = 0;
	while (added < days) {
		d.setDate(d.getDate() + 1);
		if (d.getDay() !== 0 && d.getDay() !== 6) added++;
	}
	return d;
}

function formatDate(d: Date): string {
	return d.toISOString().split("T")[0];
}

/**
 * Runs a Monte Carlo simulation over an ordered list of tasks.
 *
 * Each iteration randomly samples a duration for every task (uniform between
 * minDays and maxDays), assigns tasks to the earliest-available engineer,
 * and records each task's completion date. After all iterations, the p80
 * completion date and p80 total dev days per milestone are computed.
 */
function runSimulation(
	tasks: SimTask[],
	concurrency: number,
	efficiency: number,
): { results: SimResult[]; devDaysByMilestone: Map<string, number> } {
	const startDate = new Date();
	const taskEndDates: Date[][] = tasks.map(() => []);
	const taskSampledDays: number[][] = tasks.map(() => []);

	for (let i = 0; i < ITERATIONS; i++) {
		const engineers = Array.from(
			{ length: concurrency },
			() => new Date(startDate),
		);

		for (let t = 0; t < tasks.length; t++) {
			const task = tasks[t];
			const duration =
				Math.random() * (task.maxDays - task.minDays) + task.minDays;
			const adjusted = Math.ceil(duration / efficiency);

			taskSampledDays[t].push(duration);

			let earliest = 0;
			for (let e = 1; e < concurrency; e++) {
				if (engineers[e] < engineers[earliest]) earliest = e;
			}

			const endDate = addBusinessDays(engineers[earliest], adjusted);
			engineers[earliest] = endDate;
			taskEndDates[t].push(endDate);
		}
	}

	const p80Idx = Math.floor(ITERATIONS * PERCENTILE);

	const results: SimResult[] = tasks.map((task, idx) => {
		const dates = taskEndDates[idx].sort(
			(a, b) => a.getTime() - b.getTime(),
		);
		return { ...task, ecd: formatDate(dates[p80Idx]) };
	});

	// p80 total dev days per milestone
	const milestoneIndices = new Map<string, number[]>();
	for (let t = 0; t < tasks.length; t++) {
		const ms = tasks[t].milestone;
		if (!milestoneIndices.has(ms)) milestoneIndices.set(ms, []);
		milestoneIndices.get(ms)!.push(t);
	}

	const devDaysByMilestone = new Map<string, number>();
	for (const [ms, indices] of milestoneIndices) {
		const totals: number[] = [];
		for (let i = 0; i < ITERATIONS; i++) {
			let sum = 0;
			for (const t of indices) sum += taskSampledDays[t][i];
			totals.push(Math.round(sum));
		}
		totals.sort((a, b) => a - b);
		devDaysByMilestone.set(ms, totals[p80Idx]);
	}

	return { results, devDaysByMilestone };
}

// ── Report ──────────────────────────────────────────────────

function buildReport(
	sortedGroups: [string, Item[]][],
	results: SimResult[],
	devDaysByMilestone: Map<string, number>,
	skippedByMilestone: Map<
		string,
		{ title: string; status: string; reason: string }[]
	>,
): MilestoneReport[] {
	return sortedGroups.map(([milestone]) => {
		const milestoneResults = results.filter(
			(r) => r.milestone === milestone,
		);
		const skipped = skippedByMilestone.get(milestone) || [];
		const ecd =
			milestoneResults.length > 0
				? milestoneResults.reduce(
						(max, r) => (r.ecd > max ? r.ecd : max),
						milestoneResults[0].ecd,
					)
				: null;

		return {
			milestone,
			results: milestoneResults,
			ecd,
			devDays: devDaysByMilestone.get(milestone) ?? null,
			skipped,
		};
	});
}

function printReport(
	reports: MilestoneReport[],
	config: { concurrency: number; efficiency: number; totalTasks: number },
): void {
	for (const r of reports) {
		if (r.results.length === 0 && r.skipped.length === 0) continue;

		console.log(`\n${"=".repeat(60)}`);
		console.log(`${r.milestone}`);
		console.log(`${"=".repeat(60)}`);

		for (const t of r.results) {
			console.log(
				`  ${t.status.padEnd(14)} ${`[${t.minDays}-${t.maxDays}d]`.padEnd(12)} ${t.ecd}  ${t.title}`,
			);
		}

		if (r.ecd) {
			console.log(
				`\n  📅 Milestone ECD (p${PERCENTILE * 100}): ${r.ecd}  (Assumes ${r.devDays} dev days)`,
			);
		}

		const done = r.skipped.filter((s) => s.reason === "done");
		const noEst = r.skipped.filter((s) => s.reason === "no estimate");
		if (done.length > 0) console.log(`  ✅ ${done.length} completed`);
		if (noEst.length > 0) {
			console.log(`  ⚠️  ${noEst.length} missing estimates:`);
			for (const s of noEst) {
				console.log(`     ${s.status.padEnd(14)} ${s.title}`);
			}
		}
	}

	console.log(`\n${"─".repeat(60)}`);
	console.log(
		`Simulated ${config.totalTasks} tasks | ${ITERATIONS} iterations | p${PERCENTILE * 100} | ${config.concurrency} engineers | ${config.efficiency}x efficiency`,
	);
}

// ── CLI Args ────────────────────────────────────────────────

interface CliArgs {
	useCache: boolean;
	overrideConcurrency: number | null;
	overrideEfficiency: number | null;
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const conc = args.find((a) => a.startsWith("--concurrency="));
	const eff = args.find((a) => a.startsWith("--efficiency="));
	return {
		useCache: args.includes("--cached"),
		overrideConcurrency: conc ? parseInt(conc.split("=")[1]) : null,
		overrideEfficiency: eff ? parseFloat(eff.split("=")[1]) : null,
	};
}

// ── View Config ─────────────────────────────────────────────

function resolveViewConfig(cache: CacheData): {
	filter: string;
	groupByField: string | undefined;
	fieldOptions: Map<string, string[]>;
} {
	const filter = cache.viewData.filter;
	const groupByFields = cache.viewData.groupBy.nodes
		.map((n) => n.name)
		.filter(Boolean) as string[];

	const fieldOptions = new Map<string, string[]>();
	for (const f of cache.fieldNodes) {
		if (f.name && f.options) {
			fieldOptions.set(
				f.name.toLowerCase(),
				f.options.map((o) => o.name),
			);
		}
	}

	console.log(`View: "${cache.viewData.name}"`);
	console.log(`Filter: ${filter}`);
	console.log(`Group by: ${groupByFields.join(", ") || "(none)"}\n`);

	return { filter, groupByField: groupByFields[0], fieldOptions };
}

// ── Simulation Parameters ───────────────────────────────────

function resolveSimParams(
	items: Item[],
	args: CliArgs,
): { concurrency: number; efficiency: number } {
	let concurrency = 1;
	let efficiency = 1.0;

	for (const item of items) {
		const name = ((item.title as string) || "").toLowerCase();
		const concMatch = name.match(/^concurrency\s*=\s*(\d+)/);
		if (concMatch) concurrency = parseInt(concMatch[1]);
		const effMatch = name.match(/^efficiency\s*=\s*([\d.]+)/);
		if (effMatch) efficiency = parseFloat(effMatch[1]);
	}

	if (args.overrideConcurrency != null) {
		concurrency = args.overrideConcurrency;
		console.log(`Concurrency: ${concurrency} engineers (CLI override)`);
	} else {
		console.log(`Concurrency: ${concurrency} engineers (from board)`);
	}

	if (args.overrideEfficiency != null) {
		efficiency = args.overrideEfficiency;
		console.log(`Efficiency: ${efficiency} (CLI override)`);
	} else {
		console.log(`Efficiency: ${efficiency} (from board)`);
	}

	return { concurrency, efficiency };
}

// ── Main ────────────────────────────────────────────────────

function main() {
	const args = parseArgs();
	const cache = loadOrFetch(args.useCache);
	const view = resolveViewConfig(cache);

	const filtered = applyFilter(cache.items, parseFilter(view.filter));
	const sortedGroups = groupAndSort(
		filtered,
		view.groupByField,
		view.fieldOptions,
	);

	const { concurrency, efficiency } = resolveSimParams(filtered, args);
	const { tasks, skippedByMilestone } = extractTasks(sortedGroups);
	const { results, devDaysByMilestone } = runSimulation(
		tasks,
		concurrency,
		efficiency,
	);

	const reports = buildReport(
		sortedGroups,
		results,
		devDaysByMilestone,
		skippedByMilestone,
	);
	printReport(reports, {
		concurrency,
		efficiency,
		totalTasks: tasks.length,
	});
}

main();
