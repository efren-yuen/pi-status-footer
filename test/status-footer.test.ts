import { sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	addUsage,
	formatCwd,
	formatTokens,
	modelLabel,
	type UsageTotals,
} from "../src/status-footer.ts";

/** 最小 Theme stub：把语义色名原样带进输出，便于断言选色分支。 */
const theme = {
	fg: (color: string, text: string) => `[${color}]${text}[/]`,
} as unknown as Theme;

function emptyTotals(): UsageTotals {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}

describe("formatTokens", () => {
	it("小于 1000 原样输出", () => {
		expect(formatTokens(0)).toBe("0");
		expect(formatTokens(999)).toBe("999");
	});

	it("千位区间保留一位小数", () => {
		expect(formatTokens(1000)).toBe("1.0k");
		expect(formatTokens(9999)).toBe("10.0k");
	});

	it("万位区间取整为 k", () => {
		expect(formatTokens(10_000)).toBe("10k");
		expect(formatTokens(999_999)).toBe("1000k");
	});

	it("百万区间保留一位小数", () => {
		expect(formatTokens(1_000_000)).toBe("1.0M");
		expect(formatTokens(9_999_999)).toBe("10.0M");
	});

	it("千万以上取整为 M", () => {
		expect(formatTokens(10_000_000)).toBe("10M");
		expect(formatTokens(12_345_678)).toBe("12M");
	});
});

describe("formatCwd", () => {
	const originalHome = process.env.HOME;
	const originalUserProfile = process.env.USERPROFILE;

	beforeEach(() => {
		process.env.HOME = "/home/tester";
		delete process.env.USERPROFILE;
	});

	afterEach(() => {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		if (originalUserProfile === undefined) delete process.env.USERPROFILE;
		else process.env.USERPROFILE = originalUserProfile;
	});

	it("没有 HOME/USERPROFILE 时原样返回", () => {
		delete process.env.HOME;
		expect(formatCwd("/any/where")).toBe("/any/where");
	});

	it("home 本身显示为 ~", () => {
		expect(formatCwd("/home/tester")).toBe("~");
	});

	it("home 内路径折叠为 ~/...", () => {
		expect(formatCwd(`/home/tester/work${sep}proj`)).toBe(`~${sep}work${sep}proj`);
	});

	it("home 的父目录不折叠", () => {
		expect(formatCwd("/home")).toBe("/home");
	});

	it("同前缀但不同名的目录不折叠", () => {
		expect(formatCwd("/home/tester2/work")).toBe("/home/tester2/work");
	});

	it("home 外路径原样返回", () => {
		expect(formatCwd("/opt/data")).toBe("/opt/data");
	});
});

describe("addUsage", () => {
	it("累加四个 token 字段和 cost.total", () => {
		const totals = emptyTotals();
		addUsage(totals, {
			input: 10,
			output: 20,
			cacheRead: 30,
			cacheWrite: 40,
			cost: { total: 0.5 },
		});
		addUsage(totals, { input: 1, cost: { total: 0.25 } });
		expect(totals).toEqual({
			input: 11,
			output: 20,
			cacheRead: 30,
			cacheWrite: 40,
			cost: 0.75,
		});
	});

	it("忽略 null 和非对象", () => {
		const totals = emptyTotals();
		addUsage(totals, null);
		addUsage(totals, undefined);
		addUsage(totals, "input");
		addUsage(totals, 42);
		expect(totals).toEqual(emptyTotals());
	});

	it("忽略 NaN、Infinity 和非数字字段", () => {
		const totals = emptyTotals();
		addUsage(totals, {
			input: Number.NaN,
			output: Number.POSITIVE_INFINITY,
			cacheRead: "12",
			cacheWrite: null,
			cost: { total: Number.NaN },
		});
		expect(totals).toEqual(emptyTotals());
	});

	it("缺少 cost 字段时不报错", () => {
		const totals = emptyTotals();
		addUsage(totals, { input: 7 });
		expect(totals.input).toBe(7);
		expect(totals.cost).toBe(0);
	});
});

describe("modelLabel", () => {
	it("非推理模型只输出 provider 与模型名", () => {
		expect(modelLabel("(opencode-go) ", "deepseek-v4.1-flash", "high", false, theme)).toBe(
			"[muted](opencode-go) [/][accent]deepseek-v4.1-flash[/]",
		);
	});

	it("没有 provider 时首段为空", () => {
		expect(modelLabel("", "gpt", undefined, false, theme)).toBe("[accent]gpt[/]");
	});

	it("推理模型带思考等级", () => {
		expect(modelLabel("", "gpt", "medium", true, theme)).toBe(
			"[accent]gpt[/] [thinkingMedium]• medium[/]",
		);
	});

	it("思考等级缺失时按 off 处理", () => {
		expect(modelLabel("", "gpt", undefined, true, theme)).toBe(
			"[accent]gpt[/] [thinkingOff]• off[/]",
		);
	});

	it.each([
		["minimal", "thinkingMinimal"],
		["low", "thinkingLow"],
		["high", "thinkingHigh"],
		["xhigh", "thinkingXhigh"],
		["max", "thinkingMax"],
		["unknown", "thinkingOff"],
	])("思考等级 %s 映射到 %s", (level, color) => {
		expect(modelLabel("", "gpt", level, true, theme)).toBe(
			`[accent]gpt[/] [${color}]• ${level}[/]`,
		);
	});
});
