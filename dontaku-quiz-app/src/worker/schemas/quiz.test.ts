import { describe, expect, it } from "vitest";
import {
	createQuizGenerationRequestSchema,
	createQuizGenerationResponseSchema,
} from "./quiz";

describe("quiz schemas", () => {
	it("accepts a request with topic only", () => {
		const parsed = createQuizGenerationRequestSchema.parse({
			topic: "博多どんたく",
		});

		expect(parsed.topic).toBe("博多どんたく");
	});

	it("rejects a quiz whose correct answer is not included in choices", () => {
		expect(() =>
			createQuizGenerationResponseSchema.parse({
				quiz: {
					id: "quiz-1",
					topic: "博多どんたく",
					question: "どの月？",
					choices: ["3月", "5月", "8月", "11月"],
					correctAnswer: "4月",
					explanation: "説明",
					generatedAt: "2026-04-22T00:00:00.000Z",
				},
				meta: {
					searchQuery: "query",
					retrievedChunkCount: 1,
				},
			}),
		).toThrow(/correctAnswer/);
	});
});
