import { describe, expect, it, vi } from "vitest";
import { createApp } from "./server";

describe("quiz generation api", () => {
	it("returns a structured quiz response", async () => {
		const app = createApp({
			dependencies: {
				runSearch: vi.fn().mockResolvedValue({
					search_query: "博多どんたく 歴史",
					chunks: [
						{
							id: "chunk-1",
							text: "博多どんたく港まつりは毎年5月3日と4日に開催されます。",
							item: { key: "dontaku/history.md" },
						},
					],
				}),
				runStructuredGeneration: vi.fn().mockResolvedValue({
					id: "quiz-1",
					topic: "博多どんたくの歴史",
					question: "博多どんたく港まつりは毎年おもに何月に開催されるでしょう？",
					choices: ["3月", "5月", "8月", "11月"],
					correctAnswer: "5月",
					explanation: "博多どんたく港まつりは例年5月に開催されます。",
					generatedAt: "2026-04-22T00:00:00.000Z",
				}),
			},
		});

		const response = await app.request("/api/quiz/generate", {
			method: "POST",
			body: JSON.stringify({
				sessionSeed: "session-1",
				history: {
					topics: [],
					questions: [],
				},
			}),
			headers: {
				"content-type": "application/json",
			},
		});

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			quiz: { correctAnswer: string };
			meta: { retrievedChunkCount: number };
		};
		expect(json.quiz.correctAnswer).toBe("5月");
		expect(json.meta.retrievedChunkCount).toBe(1);
	});

	it("returns 400 for invalid body", async () => {
		const app = createApp();

		const response = await app.request("/api/quiz/generate", {
			method: "POST",
			body: JSON.stringify({
				sessionSeed: "session-2",
				history: {
					topics: ["", "", "", "", ""],
					questions: [],
				},
			}),
			headers: {
				"content-type": "application/json",
			},
		});

		expect(response.status).toBe(400);
	});

	it("returns 424 when no context is found", async () => {
		const app = createApp({
			dependencies: {
				runSearch: vi.fn().mockResolvedValue({
					search_query: "空",
					chunks: [],
				}),
			},
		});

		const response = await app.request("/api/quiz/generate", {
			method: "POST",
			body: JSON.stringify({
				sessionSeed: "session-3",
				history: {
					topics: ["歴史"],
					questions: ["前の問題"],
				},
			}),
			headers: {
				"content-type": "application/json",
			},
		});

		expect(response.status).toBe(424);
	});

	it("allows CORS from the local dev origin", async () => {
		const app = createApp();

		const response = await app.request("/api/health", {
			headers: {
				origin: "http://localhost:5173",
			},
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("access-control-allow-origin")).toBe(
			"http://localhost:5173",
		);
	});

	it("handles CORS preflight for production origin", async () => {
		const app = createApp();

		const response = await app.request("/api/quiz/generate", {
			method: "OPTIONS",
			headers: {
				origin: "https://dontaku-quiz-app.krz-tech.workers.dev",
				"access-control-request-method": "POST",
				"access-control-request-headers": "content-type",
			},
		});

		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe(
			"https://dontaku-quiz-app.krz-tech.workers.dev",
		);
		expect(response.headers.get("access-control-allow-methods")).toContain(
			"POST",
		);
	});
});
