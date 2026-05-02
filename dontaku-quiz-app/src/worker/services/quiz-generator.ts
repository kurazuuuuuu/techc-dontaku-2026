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

type PromptInstructionOption = {
	id: string;
	label: string;
	instruction: string;
};

type SearchKeywordOption = {
	id: string;
	label: string;
	terms: string[];
};

type AngleOption = {
	id: string;
	label: string;
};

type QuestionFormOption = {
	id: string;
	label: string;
	instruction: string;
};

type QueryPlan = {
	promptInstruction: PromptInstructionOption;
	searchKeyword: SearchKeywordOption;
	angle: AngleOption;
	questionForm: QuestionFormOption;
	searchQuery: string;
};

const PROMPT_INSTRUCTIONS: PromptInstructionOption[] = [
	{
		id: "origin-history",
		label: "起源と歴史",
		instruction:
			"起源や歴史を扱う場合でも、年号暗記ではなく、行事がどう始まり、どう変わってきたかに注目してください。",
	},
	{
		id: "parade-performance",
		label: "パレードと演舞",
		instruction:
			"パレードや演舞の流れ、楽しみ方、参加団体ごとの特徴が伝わる切り口を優先してください。",
	},
	{
		id: "festival-structure",
		label: "祭りの構成",
		instruction:
			"祭り全体の流れや催しの種類を、初めて知る人にもイメージしやすい形で扱ってください。",
	},
	{
		id: "costume-symbols",
		label: "衣装とシンボル",
		instruction:
			"衣装や道具、象徴的なモチーフの役割や意味が分かりやすく伝わる問題を優先してください。",
	},
	{
		id: "food-culture",
		label: "食と文化",
		instruction:
			"祭りと食、地域文化とのつながりを、親しみやすい話題から扱ってください。",
	},
	{
		id: "sightseeing-city",
		label: "街と観光",
		instruction:
			"会場周辺の街や観光の楽しみ方、見どころがイメージできる内容を優先してください。",
	},
	{
		id: "access-mobility",
		label: "アクセスと移動",
		instruction:
			"会場へのアクセスや移動手段を、来場者目線で分かりやすく扱ってください。",
	},
	{
		id: "participation-rules",
		label: "参加方法とルール",
		instruction:
			"参加方法、観覧マナー、注意点を、現地で役立つやさしい言葉で扱ってください。",
	},
	{
		id: "local-community",
		label: "地域とのつながり",
		instruction:
			"地元の人々や地域コミュニティとのつながりを、あたたかさが伝わる内容で扱ってください。",
	},
	{
		id: "festival-trivia",
		label: "祭りの豆知識",
		instruction:
			"豆知識を扱う場合も、細かすぎる雑学ではなく、祭りらしさが伝わる事実を優先してください。",
	},
];

const SEARCH_KEYWORDS: SearchKeywordOption[] = [
	{
		id: "history-roots",
		label: "歴史",
		terms: ["起源", "歴史", "由来", "変遷"],
	},
	{
		id: "parade-events",
		label: "パレード",
		terms: ["パレード", "演舞", "どんたく隊", "ステージ"],
	},
	{
		id: "schedule-flow",
		label: "行事の流れ",
		terms: ["行事", "流れ", "スケジュール", "催し"],
	},
	{
		id: "costume-tools",
		label: "衣装と道具",
		terms: ["衣装", "しゃもじ", "シンボル", "持ち物"],
	},
	{
		id: "food-local-culture",
		label: "食と文化",
		terms: ["食", "屋台", "名物", "地域文化"],
	},
	{
		id: "city-sightseeing",
		label: "観光",
		terms: ["観光", "会場", "見どころ", "周辺スポット"],
	},
	{
		id: "access-guide",
		label: "アクセス",
		terms: ["アクセス", "交通", "移動", "公共交通"],
	},
	{
		id: "manners-rules",
		label: "参加とマナー",
		terms: ["参加方法", "観覧", "マナー", "注意点"],
	},
	{
		id: "community",
		label: "地域交流",
		terms: ["地域", "市民", "地元", "交流"],
	},
	{
		id: "features-trivia",
		label: "特色",
		terms: ["特色", "特徴", "面白い", "豆知識"],
	},
];

const ANGLE_OPTIONS: AngleOption[] = [
	{ id: "roots", label: "ルーツ" },
	{ id: "changes", label: "変化" },
	{ id: "role", label: "役割" },
	{ id: "how-to-enjoy", label: "楽しみ方" },
	{ id: "flow", label: "流れ" },
	{ id: "differences", label: "違い" },
	{ id: "symbols", label: "象徴" },
	{ id: "participant-view", label: "参加者目線" },
	{ id: "visitor-view", label: "来場者目線" },
	{ id: "local-connection", label: "地域とのつながり" },
];

const QUESTION_FORMS: QuestionFormOption[] = [
	{
		id: "purpose",
		label: "目的・理由を問う型",
		instruction:
			"問題文は『〜は何のために行われるでしょう？』『〜の理由として正しいのはどれでしょう？』のように、目的や理由を問う形にしてください。正解は根拠に書かれている目的・理由から取り、不正解は根拠にある別の事実か、明らかに博多どんたくと無関係な目的から作ってください。",
	},
	{
		id: "feature",
		label: "特徴を問う型",
		instruction:
			"問題文は『〜の特徴として正しいのはどれでしょう？』のように、ものや行事の特徴を1つ問う形にしてください。正解は根拠に書かれている特徴から取り、不正解は根拠にある別の特徴か、明らかに無関係な特徴から作ってください。",
	},
	{
		id: "name",
		label: "呼び方・名称を問う型",
		instruction:
			"問題文は『〜のことを何と呼ぶでしょう？』のように、名称や呼び方を問う形にしてください。正解は根拠に書かれている名称から取り、不正解は他の祭りや無関係な名称から作ってください。",
	},
	{
		id: "role",
		label: "役割を問う型",
		instruction:
			"問題文は『〜はどんな役割を持っているでしょう？』のように、役割や働きを問う形にしてください。正解は根拠に書かれている役割から取り、不正解は根拠にある別の役割か、明らかに無関係な役割から作ってください。",
	},
	{
		id: "scene",
		label: "場面を選ぶ型",
		instruction:
			"問題文は『〜が見られるのはどんな場面でしょう？』のように、場面・タイミングを問う形にしてください。正解は根拠に書かれている場面から取り、不正解は根拠にある別の場面か、明らかに無関係な場面から作ってください。",
	},
	{
		id: "fill-in",
		label: "空欄補充型",
		instruction:
			"問題文は『博多どんたくでは〜が（　）役割を担っています。』のように、文中の空欄に当てはまる言葉を選ばせる形にしてください。空欄に入る正解は根拠から取り、不正解は根拠にある別の語か、明らかに無関係な語から作ってください。",
	},
	{
		id: "what-is",
		label: "何かを問う型",
		instruction:
			"問題文は『〜とは何でしょう？』『〜にあたるのはどれでしょう？』のように、対象そのものを問う形にしてください。正解は根拠に書かれている事実から取り、不正解は根拠にある別の事実か、明らかに無関係なものから作ってください。",
	},
	{
		id: "when-where",
		label: "いつ・どこを問う型",
		instruction:
			"問題文は『〜はいつ行われるでしょう？』『〜はどこで見られるでしょう？』のように、時期・場所を問う形にしてください。正解は根拠に書かれている時期・場所から取り、不正解は明らかに違う時期・場所から作ってください。",
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
	const queryPlan = buildQueryPlan(input);
	const runSearch = dependencies.runSearch ?? searchDontakuContext;
	const runStructuredGeneration =
		dependencies.runStructuredGeneration ?? generateStructuredQuiz;

	const searchResult = await runSearch(env, {
		...input,
		queryPlan,
	} as CreateQuizGenerationRequest & { queryPlan: QueryPlan });

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
			queryPlan,
		} as CreateQuizGenerationRequest & { queryPlan: QueryPlan },
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
	input: CreateQuizGenerationRequest & { queryPlan: QueryPlan },
): Promise<SearchResult> {
	const attempts = [
		{
			query: input.queryPlan.searchQuery,
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
			query: input.queryPlan.searchQuery,
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
			search_query: attempts.at(-1)?.query ?? input.queryPlan.searchQuery,
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
				queryPlan: describeQueryPlan(input.queryPlan),
			},
		);
	}
}

async function generateStructuredQuiz(
	env: Env,
	input: CreateQuizGenerationRequest & { queryPlan: QueryPlan },
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
	input: CreateQuizGenerationRequest & { queryPlan: QueryPlan },
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
					queryPlan: describeQueryPlan(input.queryPlan),
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
	input: CreateQuizGenerationRequest & { queryPlan: QueryPlan },
	context: string,
	compactMode = false,
) {
	const recentTopics = input.history.topics.join(" / ");
	const recentQuestions = input.history.questions.join(" / ");
	const plan = input.queryPlan;

	return [
		`今回の出題テーマ: ${plan.promptInstruction.label}`,
		plan.promptInstruction.instruction,
		`今回の検索キーワード群: ${plan.searchKeyword.label}（${plan.searchKeyword.terms.join(" / ")}）`,
		`今回とくに優先する切り口: ${plan.angle.label}`,
		`今回の質問形式: ${plan.questionForm.label}`,
		plan.questionForm.instruction,
		"テーマ候補は幅広く選び、同じ事実の言い換えや数字違いだけの問題は避けてください。",
		"小中学生でも読みやすい語彙を優先し、難しい固有名詞や専門的な言い回しはなるべく避けてください。",
		"年号・人数・正式名称の丸暗記ではなく、『何のため』『どんな特徴』『どう楽しむか』が分かる問題を優先してください。",
		"【再確認】根拠は博多どんたくの全てを網羅していません。根拠に記載がないことを『誤り』として扱わないでください。不正解の3択は、根拠に書かれている別の事実か、明らかに博多どんたくと無関係なもの（他地域の祭り、関係ない季節、関係ない動物・食べ物など）から作ってください。誤りを探させる問題形式（『正しくないのは』『ふさわしくないのは』など）は使わないでください。",
		recentTopics
			? `避ける既出テーマ: ${recentTopics}`
			: "避ける既出テーマ: なし",
		recentQuestions
			? `避ける既出問題: ${recentQuestions}`
			: "避ける既出問題: なし",
		compactMode
			? "以下の根拠を使って、これまでと切り口が重ならない短い4択クイズを1問生成してください。同じ事実の言い換えや年号違いだけの問題は避けてください。"
			: "以下の根拠を使って、これまでと切り口が重ならない短い4択クイズを1問生成してください。同じ事実の言い換えや年号違いだけの問題は避けてください。根拠は守りつつ、細かすぎる事実に寄りすぎないでください。",
		context,
	].join("\n\n");
}

function requestGeminiStructuredQuiz(client: GoogleGenAI, prompt: string) {
	return client.models.generateContent({
		model: "gemini-3.1-flash-lite-preview",
		contents: prompt,
		config: {
			systemInstruction:
				[
					"あなたは与えられた根拠（context）から博多どんたくの4択クイズを1問作成するアシスタントです。",
					"【正解の作り方】正解は必ず根拠に明示的に書かれている事実から取ってください。根拠にない事実を正解にしないでください。",
					"【不正解の作り方・最重要】不正解の3択は『根拠に書かれている別の事実』または『博多どんたく・福岡市・五月の祭りと明らかに無関係な事柄（例：他地域の祭り名、季節違いのもの、関係ない動物や食べ物など）』から作ってください。",
					"【絶対禁止】『根拠に記載がない』ことを理由に『誤り』と判断しないでください。根拠は博多どんたくの全てを網羅していません。記載がないだけで実際は事実かもしれません。例：根拠に『衣装にしゃもじを使う』としか書かれていなくても、『扇子は使われていない』と判断してはいけません。代わりに、根拠にある別の事実（開催時期、参加者、場所など）を使って不正解を作ってください。",
					"【質問形式の禁止】『次のうち誤っているのは？』『正しくないのは？』『ふさわしくないのは？』『当てはまらないのは？』のような、誤りを探させる出題形式は使わないでください。常に『正解は何か』を直接問う形にしてください。",
					"【出題テーマ】出題テーマは幅広く散らし、起源・歴史・由来だけに偏らないでください。既出テーマや既出問題に似た切り口は避け、同じ事実の言い換えや数字だけを変えた問題も避けてください。topic はその回の切り口がわかる簡潔なテーマ名にしてください。",
					"【表現】問題文・選択肢・解説は小中学生向けのやさしい言葉を優先し、難しい固有名詞や専門語を多用しないでください。年号・人数・正式名称の丸暗記問題より、役割・特徴・楽しみ方・流れが分かる問題を優先してください。問題文と解説は簡潔にしてください。",
					"【出力】応答は JSON オブジェクトのみを返し、説明文、Markdown、コードフェンスは含めないでください。",
				].join("\n"),
			temperature: 0.9,
			topP: 0.95,
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

function buildQueryPlan(input: CreateQuizGenerationRequest): QueryPlan {
	const promptInstruction = selectPromptInstruction(input);
	const searchKeyword = selectSearchKeyword(input);
	const angle = selectAngle(input);
	const questionForm = selectQuestionForm(input);

	return {
		promptInstruction,
		searchKeyword,
		angle,
		questionForm,
		searchQuery: buildSearchQuery(searchKeyword, angle),
	};
}

function pickFromShuffled<T>(
	list: readonly T[],
	input: CreateQuizGenerationRequest,
	salt: string,
): T {
	const seed = stableHash(`${input.sessionSeed}:${salt}`);
	const shuffled = deterministicShuffle(list, seed);
	return shuffled[input.history.questions.length % shuffled.length];
}

function selectPromptInstruction(
	input: CreateQuizGenerationRequest,
): PromptInstructionOption {
	return pickFromShuffled(PROMPT_INSTRUCTIONS, input, "prompt");
}

function selectSearchKeyword(
	input: CreateQuizGenerationRequest,
): SearchKeywordOption {
	return pickFromShuffled(SEARCH_KEYWORDS, input, "keyword");
}

function selectAngle(input: CreateQuizGenerationRequest): AngleOption {
	return pickFromShuffled(ANGLE_OPTIONS, input, "angle");
}

function selectQuestionForm(
	input: CreateQuizGenerationRequest,
): QuestionFormOption {
	return pickFromShuffled(QUESTION_FORMS, input, "question-form");
}

function deterministicShuffle<T>(list: readonly T[], seed: number): T[] {
	const result = [...list];
	let state = (seed >>> 0) || 1;
	for (let index = result.length - 1; index > 0; index -= 1) {
		state = (state * 1103515245 + 12345) >>> 0;
		const swapIndex = state % (index + 1);
		[result[index], result[swapIndex]] = [result[swapIndex], result[index]];
	}
	return result;
}

function buildSearchQuery(
	searchKeyword: SearchKeywordOption,
	angle: AngleOption,
): string {
	return [
		"博多どんたく",
		...searchKeyword.terms,
		angle.label,
	].join(" ");
}

function describeQueryPlan(queryPlan: QueryPlan) {
	return {
		promptInstruction: queryPlan.promptInstruction.id,
		searchKeyword: queryPlan.searchKeyword.id,
		angle: queryPlan.angle.id,
		questionForm: queryPlan.questionForm.id,
		searchQuery: queryPlan.searchQuery,
	};
}

function stableHash(value: string): number {
	let hash = 0;

	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
	}

	return hash;
}

function createDebugLabel(
	input: CreateQuizGenerationRequest & { queryPlan?: QueryPlan },
): string {
	return input.queryPlan
		? `${input.queryPlan.promptInstruction.id}:${input.queryPlan.searchKeyword.id}:${input.queryPlan.angle.id}:${input.queryPlan.questionForm.id}:${input.sessionSeed}`
		: input.sessionSeed;
}
