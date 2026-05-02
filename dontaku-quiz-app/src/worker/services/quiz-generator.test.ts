import { afterEach, describe, expect, it, vi } from "vitest";
import { generateQuizFromTopic } from "./quiz-generator";

describe("quiz generator", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("generates a quiz through AI Gateway with Gemini", async () => {
		const searchMock = vi.fn().mockImplementation(async ({ query }) => ({
			search_query: query,
			chunks: [
				{
					id: "chunk-1",
					text: "博多どんたく港まつりは毎年5月3日と4日に開催されます。",
					item: { key: "dontaku/history.md" },
				},
			],
		}));
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
					search: searchMock,
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
		expect(payload.meta.searchQuery).toBe(searchMock.mock.calls[0]?.[0]?.query);
		expect(searchMock).toHaveBeenCalledWith(
			expect.objectContaining({
				query: expect.stringContaining("博多どんたく"),
			}),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://gateway.ai.cloudflare.com/v1/account-id/dontaku-gateway/google-ai-studio/v1beta/models/gemini-3.1-flash-lite-preview:generateContent",
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

	it("changes the selected plan as question history grows", async () => {
		const seenQueries: string[] = [];
		const runSearch = vi.fn().mockImplementation(async (_env, input) => {
			seenQueries.push(input.queryPlan.searchQuery);
			return {
				search_query: input.queryPlan.searchQuery,
				chunks: [
					{
						id: "chunk-1",
						text: "博多どんたくではさまざまな催しが行われます。",
					},
				],
			};
		});
		const runStructuredGeneration = vi
			.fn()
			.mockImplementation(async (_env, input) => ({
				id: `quiz-${input.history.questions.length}`,
				topic: input.queryPlan.promptInstruction.label,
				question: "どんな祭りでしょう？",
				choices: ["にぎやか", "静か", "雪まつり", "夜だけ"],
				correctAnswer: "にぎやか",
				explanation: "多くの催しが行われる祭りだからです。",
				generatedAt: new Date("2026-04-29T00:00:00.000Z").toISOString(),
			}));

		await generateQuizFromTopic(
			{
				sessionSeed: "session-3",
				history: {
					topics: [],
					questions: [],
				},
			},
			{} as Env,
			{
				runSearch,
				runStructuredGeneration,
			},
		);

		await generateQuizFromTopic(
			{
				sessionSeed: "session-3",
				history: {
					topics: ["前回テーマ"],
					questions: ["前回問題"],
				},
			},
			{} as Env,
			{
				runSearch,
				runStructuredGeneration,
			},
		);

		expect(seenQueries).toHaveLength(2);
		expect(seenQueries[0]).not.toBe(seenQueries[1]);
		expect(runStructuredGeneration).toHaveBeenCalledTimes(2);
	});
});
