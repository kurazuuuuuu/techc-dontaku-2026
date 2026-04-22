import { afterEach, describe, expect, it, vi } from "vitest";
import { generateQuizFromTopic } from "./quiz-generator";

describe("quiz generator", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("generates a quiz through AI Gateway with Gemini", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					candidates: [
						{
							content: {
								parts: [
									{
										text: `Here is the JSON requested:\n\`\`\`json\n${JSON.stringify({
											topic: "開催時期",
											question:
												"博多どんたく港まつりは毎年何月に開催されるでしょう？",
											choices: ["3月", "5月", "8月", "11月"],
											correctAnswer: "5月",
											explanation:
												"博多どんたく港まつりは例年5月3日と4日に開催されます。",
										})}\n\`\`\``,
									},
								],
							},
						},
					],
				}),
				{ status: 200 },
			),
		);

		const payload = await generateQuizFromTopic(
			{
				sessionSeed: "session-1",
				history: {
					topics: [],
					questions: [],
				},
			},
			{
				DONTAKU_SEARCH: {
					search: vi.fn().mockResolvedValue({
						search_query:
							"博多どんたく 歴史 由来 文化 パレード 演舞 福岡 見どころ 名称 行事",
						chunks: [
							{
								id: "chunk-1",
								text: "博多どんたく港まつりは毎年5月3日と4日に開催されます。",
								item: { key: "dontaku/history.md" },
							},
						],
					}),
				},
				AI: {
					gateway: vi.fn().mockReturnValue({
						getUrl: vi
							.fn()
							.mockResolvedValue(
								"https://gateway.ai.cloudflare.com/v1/account-id/dontaku-gateway/",
							),
					}),
				},
				AI_GATEWAY_TOKEN: "cf-aig-token",
				AI_GATEWAY_ID: "dontaku-gateway",
			} as unknown as Env,
		);

		expect(payload.quiz.correctAnswer).toBe("5月");
		expect(payload.quiz.topic).toBe("開催時期");
		expect(payload.meta.retrievedChunkCount).toBe(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://gateway.ai.cloudflare.com/v1/account-id/dontaku-gateway/google-ai-studio/v1beta/models/gemini-2.5-flash-lite:generateContent",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("fails clearly when AI Gateway is not configured", async () => {
		await expect(
			generateQuizFromTopic(
			{
				sessionSeed: "session-2",
				history: {
					topics: [],
					questions: [],
					},
				},
				{
					DONTAKU_SEARCH: {
						search: vi.fn().mockResolvedValue({
							search_query: "query",
							chunks: [
								{
									id: "chunk-1",
									text: "博多どんたくは福岡市の祭りです。",
								},
							],
						}),
					},
					AI: {
						gateway: vi.fn(),
					},
				} as unknown as Env,
			),
		).rejects.toMatchObject({
			code: "AI_GATEWAY_NOT_CONFIGURED",
		});
	});
});
