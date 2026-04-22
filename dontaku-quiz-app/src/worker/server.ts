import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import {
	createQuizGenerationRequestSchema,
	createQuizGenerationResponseSchema,
	errorResponseSchema,
	type CreateQuizGenerationRequest,
} from "./schemas/quiz";
import {
	AppError,
	generateQuizFromTopic,
	type QuizGenerationDependencies,
} from "./services/quiz-generator";

type CreateAppOptions = {
	dependencies?: Partial<QuizGenerationDependencies>;
};

const allowedOrigins = [
	"https://dontaku-quiz-app.krz-tech.workers.dev",
];

export function createApp(options: CreateAppOptions = {}) {
	const app = new Hono<{ Bindings: Env }>();

	app.use(
		"/api/*",
		cors({
			origin: (origin) => {
				if (isAllowedOrigin(origin)) {
					return origin;
				}

				return null;
			},
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"cf-aig-authorization",
			],
			maxAge: 86400,
		}),
	);

	app.get("/api/health", (c) =>
		c.json({
			ok: true,
			service: "dontaku-quiz-api",
		}),
	);

	app.post("/api/quiz/generate", async (c) => {
		const body = await c.req.json().catch(() => null);
		const parsedBody = createQuizGenerationRequestSchema.safeParse(body);

		if (!parsedBody.success) {
			return c.json(
				{
					error: {
						code: "INVALID_REQUEST",
						message: "リクエストボディが不正です。",
						details: parsedBody.error.flatten(),
					},
				},
				400,
			);
		}

		try {
			const payload = await generateQuizFromTopic(
				parsedBody.data,
				c.env,
				options.dependencies,
			);

			return c.json(createQuizGenerationResponseSchema.parse(payload), 200);
		} catch (error) {
			if (error instanceof AppError) {
				return c.json(
					{
						error: {
							code: error.code,
							message: error.message,
							details: error.details,
						},
					},
					error.status,
				);
			}

			throw error;
		}
	});

	app.onError((error, c) => {
		if (error instanceof HTTPException) {
			return error.getResponse();
		}

		return c.json(
			errorResponseSchema.parse({
				error: {
					code: "INTERNAL_SERVER_ERROR",
					message: "サーバー内部で予期しないエラーが発生しました。",
				},
			}),
			500,
		);
	});

	return app;
}

export type { CreateQuizGenerationRequest };

function isAllowedOrigin(origin: string): boolean {
	if (!origin) {
		return false;
	}

	if (allowedOrigins.includes(origin)) {
		return true;
	}

	try {
		const url = new URL(origin);
		return (
			url.protocol === "http:" &&
			["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
		);
	} catch {
		return false;
	}
}
