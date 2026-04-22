import { useState } from "react";
import type { SampleQuestion } from "../data/sampleQuestions";
import { Modal } from "./Modal";
import { QuestionCard } from "./QuestionCard";

type QuestionScreenProps = {
	onRestart: () => void;
	questions: SampleQuestion[];
};

export function QuestionScreen({
	onRestart,
	questions,
}: QuestionScreenProps) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

	const currentQuestion = questions[currentIndex];
	const isLastQuestion = currentIndex === questions.length - 1;

	const handleNext = () => {
		if (isLastQuestion) {
			onRestart();
			return;
		}

		setCurrentIndex((index) => index + 1);
		setSelectedChoice(null);
	};

	return (
		<div className="quiz-layout">
			<header className="quiz-header">
				<div>
					<p className="eyebrow">Hakata Dontaku Quiz</p>
					<h2>博多どんたくクイズ</h2>
				</div>
				<button type="button" className="ghost-button" onClick={onRestart}>
					タイトルに戻る
				</button>
			</header>

			<QuestionCard
				question={currentQuestion}
				questionNumber={currentIndex + 1}
				totalQuestions={questions.length}
				onChoiceSelect={setSelectedChoice}
			/>

			{selectedChoice ? (
				<Modal title="回答を確認" onClose={() => setSelectedChoice(null)}>
					<p className="modal-lead">選んだ答え</p>
					<p className="modal-choice">{selectedChoice}</p>
					<p className="modal-text">
						この画面はクイズの流れを確認するための表示です。次の問題へ進めます。
					</p>
					<div className="modal-actions">
						<button
							type="button"
							className="secondary-button"
							onClick={() => setSelectedChoice(null)}
						>
							選び直す
						</button>
						<button type="button" className="primary-button" onClick={handleNext}>
							{isLastQuestion ? "タイトルへ戻る" : "次の問題へ"}
						</button>
					</div>
				</Modal>
			) : null}
		</div>
	);
}
