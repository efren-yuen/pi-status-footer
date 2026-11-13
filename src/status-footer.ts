import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExtensionAPI, SessionEntry, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
};

function formatTokens(count: number): string {
	if (count < 1000) return String(count);
	if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

function formatCwd(cwd: string): string {
	const home = process.env.HOME || process.env.USERPROFILE;
	if (!home) return cwd;
	const resolvedCwd = resolve(cwd);
	const relativeToHome = relative(resolve(home), resolvedCwd);
	const insideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." &&
			!relativeToHome.startsWith(`..${sep}`) &&
			!isAbsolute(relativeToHome));
	return insideHome ? (relativeToHome ? `~${sep}${relativeToHome}` : "~") : cwd;
}

function addUsage(totals: UsageTotals, usage: unknown): void {
	if (!usage || typeof usage !== "object") return;
	const value = usage as {
		input?: unknown;
		output?: unknown;
		cacheRead?: unknown;
		cacheWrite?: unknown;
		cost?: { total?: unknown };
	};
	for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
		const amount = value[key];
		if (typeof amount === "number" && Number.isFinite(amount)) totals[key] += amount;
	}
	if (typeof value.cost?.total === "number" && Number.isFinite(value.cost.total)) {
		totals.cost += value.cost.total;
	}
}

/** 用主题语义色映射 Gruvbox 的 provider、模型和思考等级。 */
function modelLabel(
	provider: string,
	modelName: string,
	thinkingLevel: string | undefined,
	reasoning: boolean | undefined,
	theme: Theme,
): string {
	let label = `${provider ? theme.fg("muted", provider) : ""}${theme.fg("accent", modelName)}`;
	if (!reasoning) return label;

	const level = thinkingLevel || "off";
	const color =
		level === "minimal"
			? "thinkingMinimal"
			: level === "low"
				? "thinkingLow"
				: level === "medium"
					? "thinkingMedium"
					: level === "high"
						? "thinkingHigh"
						: level === "xhigh"
							? "thinkingXhigh"
							: level === "max"
								? "thinkingMax"
								: "thinkingOff";
	label += ` ${theme.fg(color, `• ${level}`)}`;
	return label;
}

function collectUsage(entries: readonly SessionEntry[]) {
	const totals: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
	let latestCacheHitRate: number | null = null;
	// 按整个会话的文件顺序累计，不随当前分支裁剪。
	for (const entry of entries) {
		if (entry.type === "usage") {
			addUsage(totals, entry.usage);
		} else if (entry.type === "message" && entry.message.role === "assistant") {
			const usage = entry.message.usage;
			addUsage(totals, usage);
			const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
			latestCacheHitRate = promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : null;
		} else if (entry.type === "message" && entry.message.role === "toolResult") {
			addUsage(totals, entry.message.usage);
		} else if (entry.type === "branch_summary" || entry.type === "compaction") {
			addUsage(totals, entry.usage);
		}
	}
	return { totals, latestCacheHitRate };
}

export default function statusFooter(pi: ExtensionAPI): void {
	let invalidateFooter: (() => void) | undefined;
	pi.on("session_tree", () => invalidateFooter?.());

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			let cache: {
				sessionId: string;
				leafId: string | null;
				model: typeof ctx.model;
				contextWindow: number | undefined;
				usage: ReturnType<typeof collectUsage>;
				contextUsage: ReturnType<typeof ctx.getContextUsage>;
			} | undefined;
			const invalidate = () => {
				cache = undefined;
			};
			const refresh = () => {
				invalidate();
				tui.requestRender();
			};
			invalidateFooter = refresh;
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
			const getStats = () => {
				const sessionId = ctx.sessionManager.getSessionId();
				const leafId = ctx.sessionManager.getLeafId();
				const model = ctx.model;
				const contextWindow = model?.contextWindow;
				if (
					!cache || cache.sessionId !== sessionId || cache.leafId !== leafId ||
					cache.model !== model || cache.contextWindow !== contextWindow
				) {
					// 追加条目会移动叶节点；树导航另行清缓存，避免返回同一叶节点时漏算。
					cache = {
						sessionId, leafId, model, contextWindow,
						usage: collectUsage(ctx.sessionManager.getEntries()),
						contextUsage: ctx.getContextUsage(),
					};
				}
				return cache;
			};

			return {
				dispose() {
					unsubscribe();
					if (invalidateFooter === refresh) invalidateFooter = undefined;
				},
				invalidate,
				render(width: number): string[] {
					const { usage: { totals, latestCacheHitRate }, contextUsage } = getStats();

					const pwd = formatCwd(ctx.cwd);
					const branch = footerData.getGitBranch();
					const sessionName = pi.getSessionName();
					const pwdLine =
						theme.fg("dim", pwd) +
						(branch ? theme.fg("accent", ` (${branch})`) : "") +
						(sessionName ? theme.fg("dim", ` • ${sessionName}`) : "");

					const modelName = ctx.model?.id || "no-model";
					const provider = footerData.getAvailableProviderCount() > 1 && ctx.model
						? `(${ctx.model.provider}) `
						: "";
					let model = modelLabel(
						provider,
						modelName,
						ctx.thinkingLevel,
						ctx.model?.reasoning,
						theme,
					);
					const firstLine = truncateToWidth(pwdLine, width, theme.fg("dim", "..."));

					const stats: string[] = [];
					const metric = (text: string): string => theme.fg("dim", text);
					if (totals.input) stats.push(metric(`↑${formatTokens(totals.input)}`));
					if (totals.output) stats.push(metric(`↓${formatTokens(totals.output)}`));
					if (totals.cacheRead) stats.push(metric(`R${formatTokens(totals.cacheRead)}`));
					if (totals.cacheWrite) stats.push(metric(`W${formatTokens(totals.cacheWrite)}`));
					if ((totals.cacheRead || totals.cacheWrite) && latestCacheHitRate !== null) {
						stats.push(metric(`CH${latestCacheHitRate.toFixed(1)}%`));
					}
					if (totals.cost) stats.push(metric(`$${totals.cost.toFixed(3)}`));

					const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const contextPercent = contextUsage?.percent;
					const contextText = metric(
						contextPercent === null || contextPercent === undefined
							? `?/${formatTokens(contextWindow)}`
							: `${contextPercent.toFixed(1)}%/${formatTokens(contextWindow)}`,
					);
					// 先为上下文留位；窄屏省略 provider，再截模型，最后按空间添加次要指标。
					const modelWidth = Math.max(0, width - visibleWidth(contextText) - 1);
					if (visibleWidth(model) > modelWidth) {
						model = modelLabel("", modelName, ctx.thinkingLevel, ctx.model?.reasoning, theme);
					}
					let line = [truncateToWidth(model, modelWidth), contextText].filter(Boolean).join(" ");
					for (const stat of stats) {
						if (visibleWidth(`${line} ${stat}`) > width) break;
						line += ` ${stat}`;
					}
					const lines = [firstLine, truncateToWidth(line, width, theme.fg("dim", "..."))];
					const statuses = [...footerData.getExtensionStatuses()]
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([, text]) => text.replace(/[\r\n\t]+/g, " ").replace(/ +/g, " ").trim())
						.filter(Boolean);
					if (statuses.length) {
						lines.push(truncateToWidth(statuses.join(" "), width, theme.fg("dim", "...")));
					}
					return lines;
				},
			};
		});
	});
}
