import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import "./vendor-pattern.css";
import "./App.css";
import { QuestionScreen } from "./components/QuestionScreen";
import { ResultScreen } from "./components/ResultScreen";
import { StartScreen } from "./components/StartScreen";
import type { SampleQuestion } from "./data/sampleQuestions";

const TOTAL_QUESTIONS = 5;
const MAX_DEDUP_RETRIES = 3;

type Screen = "start" | "quiz" | "result";

type QuizGenerationRequest = {
	sessionSeed: string;
	history: {
		topics: string[];
		questions: string[];
	};
};

function normalizeQuestionText(value: string): string {
	return value
		.toLowerCase()
		.replace(/[\s\u3000.,。、！？・?!…「」『』（）()【】\-―ー]/g, "");
}

function isDuplicateQuestion(
	candidate: SampleQuestion,
	existing: SampleQuestion[],
): boolean {
	const candidateText = normalizeQuestionText(candidate.question);
	if (!candidateText) {
		return false;
	}
	return existing.some((item) => {
		const existingText = normalizeQuestionText(item.question);
		if (!existingText) {
			return false;
		}
		return (
			candidateText === existingText ||
			candidateText.includes(existingText) ||
			existingText.includes(candidateText)
		);
	});
}

function App() {
	const [screen, setScreen] = useState<Screen>("start");
	const [questions, setQuestions] = useState<SampleQuestion[]>([]);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [score, setScore] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sessionSeed, setSessionSeed] = useState(() => crypto.randomUUID());

	const requestQuestionOnce = useCallback(
		async (
			activeSessionSeed: string,
			historyQuestions: SampleQuestion[],
		): Promise<SampleQuestion | null> => {
			try {
				const requestBody: QuizGenerationRequest = {
					sessionSeed: activeSessionSeed,
					history: {
						topics: historyQuestions.slice(-20).map((item) => item.category),
						questions: historyQuestions.slice(-20).map((item) => item.question),
					},
				};
				const res = await fetch("/api/quiz/generate", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(requestBody),
				});
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}
				const data = (await res.json()) as {
					quiz: {
						topic?: string;
						question: string;
						choices: string[];
						correctAnswer: string;
						explanation: string;
					};
				};
				return {
					category: data.quiz.topic || "どんたく",
					question: data.quiz.question,
					choices: data.quiz.choices,
					correctAnswer: data.quiz.correctAnswer,
					explanation: data.quiz.explanation,
				};
			} catch (e) {
				console.error("Failed to fetch question:", e);
				return null;
			}
		},
		[],
	);

	const fetchQuestion = useCallback(
		async (
			activeSessionSeed: string,
			historyQuestions: SampleQuestion[],
		): Promise<SampleQuestion | null> => {
			let lastCandidate: SampleQuestion | null = null;
			for (let attempt = 0; attempt < MAX_DEDUP_RETRIES; attempt++) {
				const candidate = await requestQuestionOnce(
					activeSessionSeed,
					historyQuestions,
				);
				if (!candidate) {
					return lastCandidate;
				}
				if (!isDuplicateQuestion(candidate, historyQuestions)) {
					return candidate;
				}
				lastCandidate = candidate;
				console.warn(
					`[App] Duplicate question detected (attempt ${attempt + 1}/${MAX_DEDUP_RETRIES}), retrying.`,
				);
			}
			return lastCandidate;
		},
		[requestQuestionOnce],
	);

	const handleStart = async () => {
		const nextSessionSeed = crypto.randomUUID();
		setSessionSeed(nextSessionSeed);
		setIsLoading(true);
		setError(null);
		setQuestions([]);
		setCurrentIndex(0);
		setScore(0);

		const question = await fetchQuestion(nextSessionSeed, []);
		if (question) {
			setQuestions([question]);
			setScreen("quiz");
		} else {
			setError(
				"クイズの読み込みに失敗しました。もう一度お試しください。",
			);
		}
		setIsLoading(false);
	};

	const handleNext = async (isCorrect: boolean) => {
		if (isLoading) {
			return;
		}

		const nextScore = score + (isCorrect ? 1 : 0);
		setScore(nextScore);

		if (currentIndex >= TOTAL_QUESTIONS - 1) {
			setScreen("result");
			return;
		}

		if (currentIndex + 1 < questions.length) {
			setCurrentIndex((i) => i + 1);
			return;
		}

		setIsLoading(true);
		const question = await fetchQuestion(sessionSeed, questions);
		setIsLoading(false);

		if (question) {
			setQuestions((prev) => [...prev, question]);
			setCurrentIndex((i) => i + 1);
		} else {
			setError("問題の読み込みに失敗しました。もう一度お試しください。");
		}
	};

	const handleRestart = () => {
		setScreen("start");
		setQuestions([]);
		setCurrentIndex(0);
		setScore(0);
		setError(null);
		setSessionSeed(crypto.randomUUID());
	};

	return (
		<div className="app-shell">
			<div className="app-backdrop" aria-hidden="true" />
			<div
				className="app-festival-pattern pattern-checks-sm"
				aria-hidden="true"
			/>
			<p className="photo-credit">写真提供：福岡市</p>
			<main className="app-content">
				<AnimatePresence mode="wait">
					<motion.div
						key={
							isLoading
								? "loading"
								: error
									? "error"
									: screen
						}
						initial={{ opacity: 0, y: 18 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -18 }}
						transition={{ duration: 0.35, ease: "easeOut" }}
					>
						{isLoading ? (
							<section className="loading-screen">
								<div className="loading-card">
									<div className="loading-spinner" />
									<p className="loading-text">問題を生成中…</p>
								</div>
							</section>
						) : error ? (
							<section className="error-screen">
								<div className="error-card">
									<p className="error-message">{error}</p>
									<motion.button
										type="button"
										className="start-button"
										onClick={() => setError(null)}
										whileHover={{ y: -2 }}
										whileTap={{ scale: 0.98 }}
									>
										もう一度試す
									</motion.button>
								</div>
							</section>
						) : screen === "result" ? (
							<ResultScreen
								score={score}
								totalQuestions={TOTAL_QUESTIONS}
								onBackToTitle={handleRestart}
							/>
						) : screen === "quiz" && questions.length > 0 ? (
							<QuestionScreen
								questions={questions}
								currentIndex={currentIndex}
								totalQuestions={TOTAL_QUESTIONS}
								onNext={handleNext}
								onRestart={handleRestart}
							/>
						) : (
							<StartScreen onStart={handleStart} />
						)}
					</motion.div>
				</AnimatePresence>
			</main>
		</div>
	);
}

export default App;
