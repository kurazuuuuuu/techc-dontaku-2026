import { GoogleGenAI } from "@google/genai";
import {
	createQuizGenerationResponseSchema,
	generatedQuizContentSchema,
	type CreateQuizGenerationRequest,
	type QuizQuestion,
} from "../schemas/quiz";

const MAX_CONTEXT_CHUNKS = 2;
const MAX_CHUNK_TEXT_LENGTH = 420;
const RETRY_CONTEXT_CHARS = 240;

type QueryProfile = {
	id: string;
	label: string;
	searchQuery: string;
	promptInstruction: string;
	variationAngles: string[];
};

const QUERY_PROFILES: QueryProfile[] = [
	{
		id: "origin-history",
		label: "起源と歴史",
		searchQuery: "博多どんたく 起源 歴史 博多松囃子 由来 変遷",
		promptInstruction: "起源や歴史の中でも、年代暗記だけでなく行事の成り立ちや変化に注目してください。",
		variationAngles: ["ルーツ", "名称の変化", "受け継がれ方", "時代ごとの変化"],
	},
	{
		id: "parade-performance",
		label: "パレードと演舞",
		searchQuery: "博多どんたく パレード 演舞 どんたく隊 ステージ 参加団体",
		promptInstruction: "パレードや演舞の流れ、見方、参加団体の特徴に注目してください。",
		variationAngles: ["パレード", "演舞", "どんたく隊", "ステージイベント"],
	},
	{
		id: "festival-structure",
		label: "祭りの構成",
		searchQuery: "博多どんたく 行事 流れ スケジュール 催し 構成",
		promptInstruction: "祭り全体の流れや構成要素、どのような催しがあるかに注目してください。",
		variationAngles: ["開催日程", "行事の流れ", "催しの種類", "祭りの構成"],
	},
	{
		id: "costume-symbols",
		label: "衣装とシンボル",
		searchQuery: "博多どんたく 衣装 しゃもじ シンボル 持ち物 装い",
		promptInstruction: "衣装や道具、象徴的なモチーフに注目してください。",
		variationAngles: ["しゃもじ", "衣装", "持ち物", "象徴"],
	},
	{
		id: "food-culture",
		label: "食と文化",
		searchQuery: "博多どんたく 食 文化 屋台 福岡 名物 地域文化",
		promptInstruction: "祭りと食、地域文化とのつながりに注目してください。",
		variationAngles: ["屋台", "福岡名物", "地域文化", "食の楽しみ方"],
	},
	{
		id: "sightseeing-city",
		label: "街と観光",
		searchQuery: "博多どんたく 福岡 観光 会場 見どころ 街並み 周辺スポット",
		promptInstruction: "会場周辺の街や観光の楽しみ方、見どころに注目してください。",
		variationAngles: ["会場周辺", "観光スポット", "街との関係", "見どころ"],
	},
	{
		id: "access-mobility",
		label: "アクセスと移動",
		searchQuery: "博多どんたく アクセス 交通 会場 移動 公共交通",
		promptInstruction: "会場へのアクセスや移動手段、混雑時の移動に注目してください。",
		variationAngles: ["アクセス", "公共交通", "移動", "会場間の回り方"],
	},
	{
		id: "participation-rules",
		label: "参加方法とルール",
		searchQuery: "博多どんたく 参加方法 ルール マナー 観覧 注意点",
		promptInstruction: "参加方法、観覧マナー、注意点に注目してください。",
		variationAngles: ["参加方法", "観覧マナー", "注意点", "ルール"],
	},
	{
		id: "local-community",
		label: "地域とのつながり",
		searchQuery: "博多どんたく 地域 市民 福岡 地元 交流 伝統",
		promptInstruction: "地元の人々や地域コミュニティとのつながりに注目してください。",
		variationAngles: ["市民参加", "地域交流", "地元との関係", "受け継がれ方"],
	},
	{
		id: "festival-trivia",
		label: "祭りの豆知識",
		searchQuery: "博多どんたく 豆知識 特徴 面白い 雑学 特色",
		promptInstruction: "祭りの特色や意外性のある事実、豆知識に注目してください。",
		variationAngles: ["特色", "雑学", "意外な事実", "ユニークさ"],
	},
];
const geminiStructuredQuizSchema = {
	type: "object",
	additionalProperties: false,
	propertyOrdering: ["topic", "question", "choices", "correctAnswer", "explanation"],
	properties: {
		topic: {
			type: "string",
			description: "今回の問題テーマ名。短く簡潔にする。",
			maxLength: 40,
		},
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
	required: ["topic", "question", "choices", "correctAnswer", "explanation"],
} as const;

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
) {
	const queryProfile = selectQueryProfile(input);
	const runSearch = dependencies.runSearch ?? searchDontakuContext;
	const runStructuredGeneration =
		dependencies.runStructuredGeneration ?? generateStructuredQuiz;

	const searchResult = await runSearch(env, {
		...input,
		queryProfile,
	} as CreateQuizGenerationRequest & { queryProfile: QueryProfile });

	if (searchResult.chunks.length === 0) {
		throw new AppError(
			"NO_RELEVANT_CONTEXT",
			"クイズ生成に必要な関連資料が見つかりませんでした。",
			424,
			{ history: input.history },
		);
	}

	const quiz = await runStructuredGeneration(
		env,
		{
			...input,
			queryProfile,
		} as CreateQuizGenerationRequest & { queryProfile: QueryProfile },
		searchResult,
	);

	const response = createQuizGenerationResponseSchema.parse({
		quiz,
		meta: {
			searchQuery: searchResult.search_query,
			retrievedChunkCount: searchResult.chunks.length,
		},
	});
	return response;
}

async function searchDontakuContext(
	env: Env,
	input: CreateQuizGenerationRequest & { queryProfile: QueryProfile },
): Promise<SearchResult> {
	const attempts = [
		{
			query: input.queryProfile.searchQuery,
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
			query: input.queryProfile.searchQuery,
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
			search_query: attempts.at(-1)?.query ?? input.queryProfile.searchQuery,
			chunks: [],
		};
	} catch (error) {
		throw new AppError(
			"AI_SEARCH_FAILED",
			"AI Search から資料を取得できませんでした。",
			502,
			{
				cause: normalizeError(error),
				history: input.history,
				queryProfile: input.queryProfile.id,
			},
		);
	}
}

async function generateStructuredQuiz(
	env: Env,
	input: CreateQuizGenerationRequest & { queryProfile: QueryProfile },
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
	input: CreateQuizGenerationRequest & { queryProfile: QueryProfile },
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
					history: input.history,
					queryProfile: input.queryProfile.id,
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
		return parseGeminiQuizPayload(retryResponse, {
			debugLabel: createDebugLabel(input),
		});
	}

	return parseGeminiQuizPayload(response, {
		debugLabel: createDebugLabel(input),
	});
}

function buildQuizPrompt(
	input: CreateQuizGenerationRequest & { queryProfile: QueryProfile },
	context: string,
	compactMode = false,
) {
	const recentTopics = input.history.topics.join(" / ");
	const recentQuestions = input.history.questions.join(" / ");
	const preferredAngle = selectVariationAngle(input);

	return [
		`今回の出題軸: ${input.queryProfile.label}`,
		input.queryProfile.promptInstruction,
		`今回とくに優先する切り口: ${preferredAngle}`,
		"テーマ候補は幅広く選び、同じ事実の言い換えや数字違いだけの問題は避けてください。",
		recentTopics
			? `避ける既出テーマ: ${recentTopics}`
			: "避ける既出テーマ: なし",
		recentQuestions
			? `避ける既出問題: ${recentQuestions}`
			: "避ける既出問題: なし",
		compactMode
			? "以下の根拠を使って、これまでと切り口が重ならない短い4択クイズを1問生成してください。同じ事実の言い換えや年号違いだけの問題は避けてください。"
			: "以下の根拠を使って、これまでと切り口が重ならない4択クイズを1問生成してください。同じ事実の言い換えや年号違いだけの問題は避けてください。",
		context,
	].join("\n\n");
}

function requestGeminiStructuredQuiz(client: GoogleGenAI, prompt: string) {
	return client.models.generateContent({
		model: "gemini-2.5-flash-lite",
		contents: prompt,
		config: {
			systemInstruction:
				"与えられた根拠だけで博多どんたくの4択クイズを1問作成してください。根拠にない内容は禁止です。出題テーマは幅広く散らし、起源・歴史・由来だけに偏らないでください。既出テーマや既出問題に似た切り口は避け、同じ事実の言い換えや数字だけを変えた問題も避けてください。topic はその回の切り口がわかる簡潔なテーマ名にしてください。問題文と解説は簡潔にし、応答は JSON オブジェクトのみを返し、説明文、Markdown、コードフェンスは含めないでください。",
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
}, context: { debugLabel: string }): Record<string, unknown> {
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
					debugLabel: context.debugLabel,
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
					debugLabel: context.debugLabel,
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

function selectQueryProfile(input: CreateQuizGenerationRequest): QueryProfile {
	const startIndex = stableHash(input.sessionSeed) % QUERY_PROFILES.length;
	const questionIndex = input.history.questions.length % QUERY_PROFILES.length;
	return QUERY_PROFILES[(startIndex + questionIndex) % QUERY_PROFILES.length];
}

function selectVariationAngle(
	input: CreateQuizGenerationRequest & { queryProfile: QueryProfile },
): string {
	const angleIndex =
		stableHash(
			`${input.sessionSeed}:${input.history.questions.length}:${input.queryProfile.id}`,
		) % input.queryProfile.variationAngles.length;
	return input.queryProfile.variationAngles[angleIndex];
}

function stableHash(value: string): number {
	let hash = 0;

	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
	}

	return hash;
}

function createDebugLabel(
	input: CreateQuizGenerationRequest & { queryProfile?: QueryProfile },
): string {
	return input.queryProfile
		? `${input.queryProfile.id}:${input.sessionSeed}`
		: input.sessionSeed;
}
