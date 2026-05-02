import { z } from "zod";

const quizHistorySchema = z.object({
	topics: z.array(z.string().trim().min(1).max(120)).max(24).default([]),
	questions: z.array(z.string().trim().min(1).max(200)).max(24).default([]),
});

export const createQuizGenerationRequestSchema = z.object({
	sessionSeed: z.string().trim().min(1).max(120),
	history: quizHistorySchema.default({
		topics: [],
		questions: [],
	}),
});

export const quizQuestionSchema = z
	.object({
		id: z.string().min(1),
		topic: z.string().min(1),
		question: z.string().min(1),
		choices: z.array(z.string().min(1)).length(4),
		correctAnswer: z.string().min(1),
		explanation: z.string().min(1),
		generatedAt: z.string().datetime(),
	})
	.superRefine((value, ctx) => {
		if (new Set(value.choices).size !== value.choices.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "choices は重複してはいけません。",
				path: ["choices"],
			});
		}

		if (!value.choices.includes(value.correctAnswer)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "correctAnswer は choices に含まれている必要があります。",
				path: ["correctAnswer"],
			});
		}
	});

export const generatedQuizContentSchema = z
	.object({
		topic: z.string().min(1),
		question: z.string().min(1),
		choices: z.array(z.string().min(1)).length(4),
		correctAnswer: z.string().min(1),
		explanation: z.string().min(1),
	})
	.superRefine((value, ctx) => {
		if (new Set(value.choices).size !== value.choices.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "choices は重複してはいけません。",
				path: ["choices"],
			});
		}

		if (!value.choices.includes(value.correctAnswer)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "correctAnswer は choices に含まれている必要があります。",
				path: ["correctAnswer"],
			});
		}
	});

export const createQuizGenerationResponseSchema = z.object({
	quiz: quizQuestionSchema,
	meta: z.object({
		searchQuery: z.string().min(1),
		retrievedChunkCount: z.number().int().nonnegative(),
	}),
});

export const errorResponseSchema = z.object({
	error: z.object({
		code: z.string().min(1),
		message: z.string().min(1),
		details: z.unknown().optional(),
	}),
});

export type CreateQuizGenerationRequest = z.infer<
	typeof createQuizGenerationRequestSchema
>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type GeneratedQuizContent = z.infer<typeof generatedQuizContentSchema>;
export type CreateQuizGenerationResponse = z.infer<
	typeof createQuizGenerationResponseSchema
>;

export const createQuizGenerationRequestJsonSchema = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	type: "object",
	additionalProperties: false,
	properties: {
		sessionSeed: { type: "string", minLength: 1, maxLength: 120 },
		history: {
			type: "object",
			additionalProperties: false,
			properties: {
				topics: {
					type: "array",
					items: { type: "string", minLength: 1, maxLength: 120 },
					maxItems: 24,
				},
				questions: {
					type: "array",
					items: { type: "string", minLength: 1, maxLength: 200 },
					maxItems: 24,
				},
			},
			required: ["topics", "questions"],
		},
	},
	required: ["sessionSeed"],
} as const;

export const quizQuestionJsonSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: { type: "string", minLength: 1 },
		topic: { type: "string", minLength: 1 },
		question: { type: "string", minLength: 1 },
		choices: {
			type: "array",
			items: { type: "string", minLength: 1 },
			minItems: 4,
			maxItems: 4,
			uniqueItems: true,
		},
		correctAnswer: { type: "string", minLength: 1 },
		explanation: { type: "string", minLength: 1 },
		generatedAt: { type: "string", format: "date-time" },
	},
	required: [
		"id",
		"topic",
		"question",
		"choices",
		"correctAnswer",
		"explanation",
		"generatedAt",
	],
} as const;

export const generatedQuizContentJsonSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		topic: { type: "string", minLength: 1 },
		question: { type: "string", minLength: 1 },
		choices: {
			type: "array",
			items: { type: "string", minLength: 1 },
			minItems: 4,
			maxItems: 4,
			uniqueItems: true,
		},
		correctAnswer: { type: "string", minLength: 1 },
		explanation: { type: "string", minLength: 1 },
	},
	required: ["topic", "question", "choices", "correctAnswer", "explanation"],
} as const;

export const createQuizGenerationResponseJsonSchema = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	type: "object",
	additionalProperties: false,
	properties: {
		quiz: quizQuestionJsonSchema,
		meta: {
			type: "object",
			additionalProperties: false,
			properties: {
				searchQuery: { type: "string", minLength: 1 },
				retrievedChunkCount: { type: "integer", minimum: 0 },
			},
			required: ["searchQuery", "retrievedChunkCount"],
		},
	},
	required: ["quiz", "meta"],
} as const;
