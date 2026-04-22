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
			{ topic: "博多どんたくの歴史" },
			{
				DONTAKU_SEARCH: {
					search: vi.fn().mockResolvedValue({
						search_query: "博多どんたく 歴史",
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
		expect(payload.meta.retrievedChunkCount).toBe(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://gateway.ai.cloudflare.com/v1/account-id/dontaku-gateway/google-ai-studio/v1beta/models/gemini-2.5-flash:generateContent",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("fails clearly when AI Gateway is not configured", async () => {
		await expect(
			generateQuizFromTopic(
				{ topic: "博多どんたく" },
				{
					DONTAKU_SEARCH: {
						search: vi.fn().mockResolvedValue({
							search_query: "博多どんたく",
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
