import type { SampleQuestion } from "../data/sampleQuestions";

type QuestionCardProps = {
	onChoiceSelect: (choice: string) => void;
	question: SampleQuestion;
	questionNumber: number;
	totalQuestions: number;
};

export function QuestionCard({
	onChoiceSelect,
	question,
	questionNumber,
	totalQuestions,
}: QuestionCardProps) {
	return (
		<section className="question-card">
			<div className="question-progress">
				<span>
					第{questionNumber}問 / 全{totalQuestions}問
				</span>
				<span>{question.category}</span>
			</div>

			<h1>{question.question}</h1>

			<div className="choice-grid">
				{question.choices.map((choice) => (
					<button
						key={choice}
						type="button"
						className="choice-button"
						onClick={() => onChoiceSelect(choice)}
					>
						{choice}
					</button>
				))}
			</div>
		</section>
	);
}
