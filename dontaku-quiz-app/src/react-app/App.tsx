import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import "./vendor-pattern.css";
import "./App.css";
import { QuestionScreen } from "./components/QuestionScreen";
import { StartScreen } from "./components/StartScreen";
import { sampleQuestions } from "./data/sampleQuestions";

function App() {
	const [hasStarted, setHasStarted] = useState(false);

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
						key={hasStarted ? "quiz" : "start"}
						initial={{ opacity: 0, y: 18 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -18 }}
						transition={{ duration: 0.35, ease: "easeOut" }}
					>
						{hasStarted ? (
							<QuestionScreen
								questions={sampleQuestions}
								onRestart={() => setHasStarted(false)}
							/>
						) : (
							<StartScreen onStart={() => setHasStarted(true)} />
						)}
					</motion.div>
				</AnimatePresence>
			</main>
		</div>
	);
}

export default App;
