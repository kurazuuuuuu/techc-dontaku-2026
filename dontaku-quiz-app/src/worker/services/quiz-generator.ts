import { GoogleGenAI } from "@google/genai";
import {
	createQuizGenerationResponseSchema,
	generatedQuizContentSchema,
	type CreateQuizGenerationRequest,
	type CreateQuizGenerationResponse,
	type QuizQuestion,
} from "../schemas/quiz";

const MAX_CONTEXT_CHUNKS = 2;
const MAX_CHUNK_TEXT_LENGTH = 420;
const RETRY_CONTEXT_CHARS = 240;
const QUIZ_CACHE_TTL_MS = 10 * 60 * 1000;
const geminiStructuredQuizSchema = {
	type: "object",
	additionalProperties: false,
	propertyOrdering: ["question", "choices", "correctAnswer", "explanation"],
	properties: {
		question: {
			type: "string",
			description: "4択クイズの問題文。",
			maxLength: 80,
		},
		choices: {
			type: "array",
			description: "必ず4件の選択肢。",
			items: {
				type: "string",
				maxLength: 40,
			},
			minItems: 4,
			maxItems: 4,
		},
		correctAnswer: {
			type: "string",
			description: "choices の中から1件だけ選ぶ正答。",
			maxLength: 40,
		},
		explanation: {
			type: "string",
			description: "正答の根拠説明。",
			maxLength: 140,
		},
	},
	required: ["question", "choices", "correctAnswer", "explanation"],
} as const;

const quizResponseCache = new Map<
	string,
	{ expiresAt: number; response: CreateQuizGenerationResponse }
>();

type GatewayRuntimeEnv = Env & {
	AI_GATEWAY_ID?: string;
	AI_GATEWAY_TOKEN?: string;
};

export type AppErrorStatus = 424 | 502;

type SearchChunk = {
	id: string;
	item?: {
		key?: string;
		metadata?: Record<string, unknown>;
	};
	score?: number;
	text?: string;
};

type SearchResult = {
	search_query: string;
	chunks: SearchChunk[];
};

export class AppError extends Error {
	code: string;
	status: AppErrorStatus;
	details?: unknown;

	constructor(
		code: string,
		message: string,
		status: AppErrorStatus,
		details?: unknown,
	) {
		super(message);
		this.code = code;
		this.status = status;
		this.details = details;
	}
}

export type QuizGenerationDependencies = {
	runSearch: (env: Env, input: CreateQuizGenerationRequest) => Promise<SearchResult>;
	runStructuredGeneration: (
		env: Env,
		input: CreateQuizGenerationRequest,
		searchResult: SearchResult,
	) => Promise<QuizQuestion>;
};

export async function generateQuizFromTopic(
	input: CreateQuizGenerationRequest,
	env: Env,
	dependencies: Partial<QuizGenerationDependencies> = {},
): Promise<CreateQuizGenerationResponse> {
	const cacheKey = createQuizCacheKey(input);
	const cachedResponse = readCachedQuizResponse(cacheKey);
	if (cachedResponse) {
		return cachedResponse;
	}

	const runSearch = dependencies.runSearch ?? searchDontakuContext;
	const runStructuredGeneration =
		dependencies.runStructuredGeneration ?? generateStructuredQuiz;

	const searchResult = await runSearch(env, input);

	if (searchResult.chunks.length === 0) {
		throw new AppError(
			"NO_RELEVANT_CONTEXT",
			"クイズ生成に必要な関連資料が見つかりませんでした。",
			424,
			{ topic: input.topic },
		);
	}

	const quiz = await runStructuredGeneration(env, input, searchResult);

	const response = createQuizGenerationResponseSchema.parse({
		quiz,
		meta: {
			searchQuery: searchResult.search_query,
			retrievedChunkCount: searchResult.chunks.length,
		},
	});

	writeCachedQuizResponse(cacheKey, response);
	return response;
}

async function searchDontakuContext(
	env: Env,
	input: CreateQuizGenerationRequest,
): Promise<SearchResult> {
	const attempts = [
		{
			query: `${input.topic} 博多どんたく`,
			retrieval: {
				retrieval_type: "hybrid" as const,
				match_threshold: 0.08,
				max_num_results: 3,
				context_expansion: 0,
				keyword_match_mode: "or" as const,
				return_on_failure: true,
			},
		},
		{
			query: `${input.topic} 博多どんたく`,
			retrieval: {
				retrieval_type: "vector" as const,
				match_threshold: 0,
				max_num_results: 2,
				context_expansion: 0,
				return_on_failure: true,
			},
		},
	];

	try {
		for (const attempt of attempts) {
			const result = await env.DONTAKU_SEARCH.search({
				query: attempt.query,
				ai_search_options: {
					retrieval: attempt.retrieval,
				},
			});

			if (result.chunks.length > 0) {
				return trimSearchResult(result);
			}
		}

		return {
			search_query: attempts.at(-1)?.query ?? input.topic,
			chunks: [],
		};
	} catch (error) {
		throw new AppError(
			"AI_SEARCH_FAILED",
			"AI Search から資料を取得できませんでした。",
			502,
			{
				cause: normalizeError(error),
				topic: input.topic,
			},
		);
	}
}

async function generateStructuredQuiz(
	env: Env,
	input: CreateQuizGenerationRequest,
	searchResult: SearchResult,
): Promise<QuizQuestion> {
	const context = searchResult.chunks
		.map((chunk, index) => {
			const source = chunk.item?.key ?? `source-${index + 1}`;
			return `[#${index + 1}] source: ${source}\n${chunk.text ?? ""}`;
		})
		.join("\n\n");

	try {
		const result = await runGeminiStructuredQuizGeneration(env, input, context);
		const generatedQuiz = generatedQuizContentSchema.parse(result);

		return createQuizGenerationResponseSchema.shape.quiz.parse({
			...generatedQuiz,
			id: crypto.randomUUID(),
			topic: input.topic,
			generatedAt: new Date().toISOString(),
		});
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError(
			"QUIZ_GENERATION_FAILED",
			"構造化クイズの生成に失敗しました。",
			502,
			{ cause: normalizeError(error) },
		);
	}
}

async function runGeminiStructuredQuizGeneration(
	env: Env,
	input: CreateQuizGenerationRequest,
	context: string,
) {
	const gatewayToken = readOptionalRuntimeString(
		(env as GatewayRuntimeEnv).AI_GATEWAY_TOKEN,
	);
	if (!gatewayToken) {
		throw new AppError(
			"AI_GATEWAY_NOT_CONFIGURED",
			"AI Gateway の設定が見つかりませんでした。",
			502,
			{ missing: ["AI_GATEWAY_TOKEN"] },
		);
	}

	const gatewayId = readOptionalRuntimeString(
		(env as GatewayRuntimeEnv).AI_GATEWAY_ID,
	);
	if (!gatewayId) {
		throw new AppError(
			"AI_GATEWAY_NOT_CONFIGURED",
			"AI Gateway の設定が見つかりませんでした。",
			502,
			{ missing: ["AI_GATEWAY_ID"] },
		);
	}

	const baseUrl = await env.AI.gateway(gatewayId).getUrl();
	const client = new GoogleGenAI({
		apiKey: gatewayToken,
		httpOptions: {
			baseUrl: new URL("google-ai-studio", baseUrl).toString(),
		},
	});

	const response = await requestGeminiStructuredQuiz(
		client,
		buildQuizPrompt(input, context),
	);
	const finishReason = response.candidates?.[0]?.finishReason;
	if (finishReason === "MAX_TOKENS") {
		const compactContext = context.slice(0, RETRY_CONTEXT_CHARS);
		console.warn(
			"[quiz-generator] Retrying Gemini structured JSON with compact prompt after MAX_TOKENS",
			JSON.stringify(
				{
					topic: input.topic,
					firstAttemptDiagnostics: buildGeminiResponseDiagnostics(response),
					compactContextLength: compactContext.length,
				},
				null,
				2,
			),
		);
		const retryResponse = await requestGeminiStructuredQuiz(
			client,
			buildQuizPrompt(input, compactContext, true),
		);
		return parseGeminiQuizPayload(retryResponse, { topic: input.topic });
	}

	return parseGeminiQuizPayload(response, { topic: input.topic });
}

function buildQuizPrompt(
	input: CreateQuizGenerationRequest,
	context: string,
	compactMode = false,
) {
	return [
		`トピック: ${input.topic}`,
		compactMode
			? "以下の根拠を使って、短い4択クイズを1問生成してください。"
			: "以下の根拠を使ってクイズを1問生成してください。",
		context,
	].join("\n\n");
}

function requestGeminiStructuredQuiz(client: GoogleGenAI, prompt: string) {
	return client.models.generateContent({
		model: "gemini-2.5-flash",
		contents: prompt,
		config: {
			systemInstruction:
				"与えられた根拠だけで博多どんたくの4択クイズを1問作成してください。根拠にない内容は禁止です。問題文と解説は簡潔にし、応答は JSON オブジェクトのみを返し、説明文、Markdown、コードフェンスは含めないでください。",
			temperature: 0,
			maxOutputTokens: 1024,
			responseMimeType: "application/json",
			responseJsonSchema: geminiStructuredQuizSchema,
			thinkingConfig: {
				thinkingBudget: 0,
				includeThoughts: false,
			},
		},
	});
}

function parseGeminiQuizPayload(response: {
	candidates?: Array<{
		finishReason?: string;
		finishMessage?: string;
		content?: {
			parts?: Array<{
				text?: string;
				functionCall?: unknown;
				inlineData?: unknown;
			}>;
		};
	}>;
	promptFeedback?: {
		blockReason?: string;
		blockReasonMessage?: string;
		safetyRatings?: unknown[];
	};
	text?: string;
}, context: { topic: string }): Record<string, unknown> {
	const candidateText = response.candidates?.[0]?.content?.parts
		?.map((part) => part.text ?? "")
		.join("")
		.trim();
	const rawText = response.text ?? candidateText;
	if (!rawText) {
		console.error(
			"[quiz-generator] Gemini structured response missing text",
			JSON.stringify(
				{
					topic: context.topic,
					diagnostics: buildGeminiResponseDiagnostics(response),
				},
				null,
				2,
			),
		);
		throw new Error("Gemini response did not include structured text.");
	}

	const jsonText = extractJsonObjectString(rawText);
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText) as unknown;
	} catch (error) {
		console.error(
			"[quiz-generator] Failed to parse Gemini structured JSON",
			JSON.stringify(
				{
					topic: context.topic,
					snippet: rawText.slice(0, 240),
					extractedSnippet: jsonText.slice(0, 240),
					diagnostics: buildGeminiResponseDiagnostics(response),
				},
				null,
				2,
			),
		);
		throw new Error(
			`Failed to parse AI JSON. snippet=${JSON.stringify(rawText.slice(0, 240))}`,
			{ cause: error },
		);
	}
	if (!isRecord(parsed)) {
		throw new Error("Parsed AI response was not an object.");
	}
	return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeError(error: unknown) {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
		};
	}

	return error;
}

function buildGeminiResponseDiagnostics(response: {
	candidates?: Array<{
		finishReason?: string;
		finishMessage?: string;
		content?: {
			parts?: Array<{
				text?: string;
				functionCall?: unknown;
				inlineData?: unknown;
			}>;
		};
	}>;
	promptFeedback?: {
		blockReason?: string;
		blockReasonMessage?: string;
		safetyRatings?: unknown[];
	};
	text?: string;
}) {
	return {
		hasTopLevelText: Boolean(response.text),
		topLevelTextSnippet: response.text?.slice(0, 160),
		candidateCount: response.candidates?.length ?? 0,
		candidates:
			response.candidates?.map((candidate, index) => ({
				index,
				finishReason: candidate.finishReason,
				finishMessage: candidate.finishMessage,
				partCount: candidate.content?.parts?.length ?? 0,
				parts:
					candidate.content?.parts?.map((part) => ({
						hasText: Boolean(part.text),
						textSnippet: part.text?.slice(0, 120),
						hasFunctionCall: Boolean(part.functionCall),
						hasInlineData: Boolean(part.inlineData),
					})) ?? [],
			})) ?? [],
		promptFeedback: response.promptFeedback
			? {
					blockReason: response.promptFeedback.blockReason,
					blockReasonMessage: response.promptFeedback.blockReasonMessage,
					safetyRatingCount: response.promptFeedback.safetyRatings?.length ?? 0,
				}
			: undefined,
	};
}

function extractJsonObjectString(value: string): string {
	const trimmed = value.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	if (fenced?.[1]) {
		return fenced[1].trim();
	}

	const start = findFirstJsonStart(trimmed);
	if (start >= 0) {
		const extracted = extractBalancedJson(trimmed, start);
		if (extracted) {
			return extracted;
		}
	}

	return trimmed;
}

function findFirstJsonStart(value: string): number {
	const objectStart = value.indexOf("{");
	const arrayStart = value.indexOf("[");

	if (objectStart < 0) {
		return arrayStart;
	}

	if (arrayStart < 0) {
		return objectStart;
	}

	return Math.min(objectStart, arrayStart);
}

function extractBalancedJson(value: string, startIndex: number): string | null {
	const open = value[startIndex];
	const close = open === "{" ? "}" : open === "[" ? "]" : null;
	if (!close) {
		return null;
	}

	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = startIndex; index < value.length; index += 1) {
		const char = value[index];

		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}

			if (char === "\\") {
				escaped = true;
				continue;
			}

			if (char === '"') {
				inString = false;
			}

			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}

		if (char === open) {
			depth += 1;
			continue;
		}

		if (char === close) {
			depth -= 1;
			if (depth === 0) {
				return value.slice(startIndex, index + 1);
			}
		}
	}

	return null;
}

function readOptionalRuntimeString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function trimSearchResult(result: SearchResult): SearchResult {
	return {
		search_query: result.search_query,
		chunks: result.chunks.slice(0, MAX_CONTEXT_CHUNKS).map((chunk) => ({
			...chunk,
			text: chunk.text?.slice(0, MAX_CHUNK_TEXT_LENGTH),
		})),
	};
}

function createQuizCacheKey(input: CreateQuizGenerationRequest): string {
	return input.topic;
}

function readCachedQuizResponse(
	key: string,
): CreateQuizGenerationResponse | null {
	const cached = quizResponseCache.get(key);
	if (!cached) {
		return null;
	}

	if (cached.expiresAt <= Date.now()) {
		quizResponseCache.delete(key);
		return null;
	}

	return cached.response;
}

function writeCachedQuizResponse(
	key: string,
	response: CreateQuizGenerationResponse,
) {
	quizResponseCache.set(key, {
		expiresAt: Date.now() + QUIZ_CACHE_TTL_MS,
		response,
	});
}
