import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { SampleQuestion } from "../data/sampleQuestions";
import { Modal } from "./Modal";
import { QuestionCard } from "./QuestionCard";

type QuestionScreenProps = {
	onNext: (isCorrect: boolean) => Promise<void>;
	onRestart: () => void;
	questions: SampleQuestion[];
	currentIndex: number;
	totalQuestions: number;
};

export function QuestionScreen({
	onNext,
	onRestart,
	questions,
	currentIndex,
	totalQuestions,
}: QuestionScreenProps) {
	const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
	const [isAdvancing, setIsAdvancing] = useState(false);

	const currentQuestion = questions[currentIndex] ?? questions[questions.length - 1];
	const isLastQuestion = currentIndex === totalQuestions - 1;
	const isCorrect = selectedChoice === currentQuestion.correctAnswer;

	const handleNext = async () => {
		if (isAdvancing) {
			return;
		}

		setSelectedChoice(null);
		setIsAdvancing(true);

		try {
			await onNext(isCorrect);
		} finally {
			setIsAdvancing(false);
		}
	};

	return (
		<div className="quiz-layout">
			<motion.header
				className="quiz-header"
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3, ease: "easeOut" }}
			>
				<div>
					<p className="eyebrow">Hakata Dontaku Quiz</p>
					<h2>博多どんたくクイズ</h2>
				</div>
				<motion.button
					type="button"
					className="ghost-button"
					onClick={onRestart}
					whileHover={{ y: -2 }}
					whileTap={{ scale: 0.98 }}
				>
					タイトルに戻る
				</motion.button>
			</motion.header>

			<QuestionCard
				question={currentQuestion}
				questionNumber={currentIndex + 1}
				totalQuestions={totalQuestions}
				onChoiceSelect={setSelectedChoice}
			/>

			<AnimatePresence>
				{selectedChoice ? (
					<Modal title="回答を確認" onClose={() => setSelectedChoice(null)}>
						<p className="modal-lead">選んだ答え</p>
						<p className="modal-choice">{selectedChoice}</p>
						<p className={`modal-result ${isCorrect ? "correct" : "incorrect"}`}>
							{isCorrect ? "正解！🎉" : "不正解…"}
						</p>
						{!isCorrect && (
							<p className="modal-answer">
								正解: <strong>{currentQuestion.correctAnswer}</strong>
							</p>
						)}
						<p className="modal-text">{currentQuestion.explanation}</p>
						<div className="modal-actions">
							<motion.button
								type="button"
								className="secondary-button"
								onClick={() => setSelectedChoice(null)}
								disabled={isAdvancing}
								whileHover={{ y: -2 }}
								whileTap={{ scale: 0.98 }}
							>
								選び直す
							</motion.button>
							<motion.button
								type="button"
								className="primary-button"
								onClick={handleNext}
								disabled={isAdvancing}
								whileHover={{ y: -2 }}
								whileTap={{ scale: 0.98 }}
							>
								{isAdvancing
									? "読み込み中..."
									: isLastQuestion
										? "結果を見る"
										: "次の問題へ"}
							</motion.button>
						</div>
					</Modal>
				) : null}
			</AnimatePresence>
		</div>
	);
}
