import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import "./vendor-pattern.css";
import "./App.css";
import { QuestionScreen } from "./components/QuestionScreen";
import { StartScreen } from "./components/StartScreen";
import type { SampleQuestion } from "./data/sampleQuestions";

const TOTAL_QUESTIONS = 5;
const TOPICS = [
	"博多どんたく 歴史と由来",
	"博多どんたく パレードと演舞",
	"博多どんたく 食べ物と文化",
	"博多どんたく 福岡の見どころ",
	"博多どんたく 祭りの基礎知識",
];

function App() {
	const [hasStarted, setHasStarted] = useState(false);
	const [questions, setQuestions] = useState<SampleQuestion[]>([]);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchQuestion = useCallback(
		async (topicIndex: number): Promise<SampleQuestion | null> => {
			try {
				const res = await fetch("/api/quiz/generate", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ topic: TOPICS[topicIndex % TOPICS.length] }),
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

	const handleStart = async () => {
		setIsLoading(true);
		setError(null);
		setQuestions([]);
		setCurrentIndex(0);

		const question = await fetchQuestion(0);
		if (question) {
			setQuestions([question]);
			setHasStarted(true);
		} else {
			setError(
				"クイズの読み込みに失敗しました。もう一度お試しください。",
			);
		}
		setIsLoading(false);
	};

	const handleNext = async () => {
		if (isLoading) {
			return;
		}

		if (currentIndex >= TOTAL_QUESTIONS - 1) {
			handleRestart();
			return;
		}

		if (currentIndex + 1 < questions.length) {
			setCurrentIndex((i) => i + 1);
			return;
		}

		setIsLoading(true);
		const question = await fetchQuestion(currentIndex + 1);
		setIsLoading(false);

		if (question) {
			setQuestions((prev) => [...prev, question]);
			setCurrentIndex((i) => i + 1);
		} else {
			setError("問題の読み込みに失敗しました。もう一度お試しください。");
		}
	};

	const handleRestart = () => {
		setHasStarted(false);
		setQuestions([]);
		setCurrentIndex(0);
		setError(null);
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
							hasStarted
								? "quiz"
								: isLoading
									? "loading"
									: error
										? "error"
										: "start"
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
						) : hasStarted && questions.length > 0 ? (
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
