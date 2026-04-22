import {
	createQuizGenerationResponseSchema,
	generatedQuizContentSchema,
	type CreateQuizGenerationRequest,
	type CreateQuizGenerationResponse,
	type QuizQuestion,
} from "../schemas/quiz";

const DEFAULT_MODEL = "google-ai-studio/gemini-2.5-flash";
const MAX_CONTEXT_CHUNKS = 2;
const MAX_CHUNK_TEXT_LENGTH = 420;
const QUIZ_CACHE_TTL_MS = 10 * 60 * 1000;

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
		const messages = [
			{
				role: "system" as const,
				content:
					"与えられた根拠だけで博多どんたくの4択クイズを1問作成してください。根拠にない内容は禁止です。",
			},
			{
				role: "developer" as const,
				content:
					"先頭の1文字を必ず { にしてください。question, choices[4], correctAnswer, explanation を持つJSONオブジェクトだけを1行で返してください。question は35文字以内、choices は各12文字以内、explanation は45文字以内。前置き・後書き・コードブロック・改行は禁止です。",
			},
			{
				role: "user" as const,
				content: [
					`トピック: ${input.topic}`,
					"以下の根拠を使ってクイズを1問生成してください。",
					context,
				].join("\n\n"),
			},
		];

		const result = await runGenerationWithFallback(env, messages);
		const normalized = normalizeAiResponse(result);
		const generatedQuiz = generatedQuizContentSchema.parse(normalized);

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

async function runGenerationWithFallback(
	env: Env,
	messages: Array<{ role: "system" | "developer" | "user"; content: string }>,
) {
	return runAiGatewayChatCompletion(env, messages);
}

async function runAiGatewayChatCompletion(
	env: Env,
	messages: Array<{ role: "system" | "developer" | "user"; content: string }>,
) {
	const gatewayUrl = await getAiGatewayChatCompletionsUrl(env);
	const gatewayToken = readOptionalRuntimeString(
		(env as GatewayRuntimeEnv).AI_GATEWAY_TOKEN,
	);

	const response = await fetch(gatewayUrl, {
		method: "POST",
		headers: buildAiGatewayHeaders(gatewayToken),
		body: JSON.stringify({
			model: DEFAULT_MODEL,
			messages,
			max_tokens: 2048,
			temperature: 0.2,
			response_format: { type: "json_object" },
		}),
	});

	if (!response.ok) {
		throw new Error(
			`AI Gateway request failed: ${response.status} ${await response.text()}`,
		);
	}

	return (await response.json()) as unknown;
}

async function getAiGatewayChatCompletionsUrl(env: Env): Promise<string> {
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
	const url = new URL("compat/chat/completions", baseUrl).toString();
	console.log("[quiz-generator] AI Gateway URL:", url);
	return url;
}

function buildAiGatewayHeaders(gatewayToken?: string): HeadersInit {
	const headers: HeadersInit = {
		"content-type": "application/json",
		"cf-aig-cache-ttl": "300",
	};

	if (gatewayToken) {
		headers["cf-aig-authorization"] = `Bearer ${gatewayToken}`;
	}

	return headers;
}

function normalizeAiResponse(result: unknown): Record<string, unknown> {
	if (isRecord(result)) {
		const openAiCompatibleContent = extractOpenAiCompatibleContent(result);
		if (openAiCompatibleContent) {
			return parseJsonRecord(openAiCompatibleContent);
		}

		if (isRecord(result.response)) {
			return result.response;
		}

		if (typeof result.response === "string") {
			return parseJsonRecord(result.response);
		}

		if (typeof result.result === "string") {
			return parseJsonRecord(result.result);
		}

		return result;
	}

	throw new Error("AI response was not an object.");
}

function parseJsonRecord(value: string): Record<string, unknown> {
	const jsonText = extractJsonObjectString(value);
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText) as unknown;
	} catch (error) {
		throw new Error(
			`Failed to parse AI JSON. snippet=${JSON.stringify(value.slice(0, 240))}`,
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

function extractJsonObjectString(value: string): string {
	const trimmed = value.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	if (fenced?.[1]) {
		return fenced[1].trim();
	}

	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start >= 0 && end > start) {
		return trimmed.slice(start, end + 1);
	}

	return trimmed;
}

function extractOpenAiCompatibleContent(
	result: Record<string, unknown>,
): string | null {
	const choices = result.choices;
	if (!Array.isArray(choices) || choices.length === 0) {
		return null;
	}

	const firstChoice = choices[0];
	if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
		return null;
	}

	return extractMessageContent(firstChoice.message.content);
}

function extractMessageContent(content: unknown): string | null {
	if (typeof content === "string") {
		return content;
	}

	if (!Array.isArray(content)) {
		return null;
	}

	const textParts = content
		.map((part) => {
			if (!isRecord(part)) {
				return null;
			}

			if (typeof part.text === "string") {
				return part.text;
			}

			if (
				part.type === "output_text" &&
				typeof part.text === "string"
			) {
				return part.text;
			}

			return null;
		})
		.filter((value): value is string => Boolean(value));

	return textParts.length > 0 ? textParts.join("\n") : null;
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
