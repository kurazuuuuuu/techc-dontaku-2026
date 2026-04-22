import { motion } from "motion/react";
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
					<motion.button
						key={choice}
						type="button"
						className="choice-button"
						onClick={() => onChoiceSelect(choice)}
						whileHover={{ y: -2 }}
						whileTap={{ scale: 0.99 }}
					>
						{choice}
					</motion.button>
				))}
			</div>
		</section>
	);
}
