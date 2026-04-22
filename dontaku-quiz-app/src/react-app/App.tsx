import { useState } from "react";
import "./App.css";
import { QuestionScreen } from "./components/QuestionScreen";
import { StartScreen } from "./components/StartScreen";
import { sampleQuestions } from "./data/sampleQuestions";

function App() {
	const [hasStarted, setHasStarted] = useState(false);

	return (
		<div className="app-shell">
			<div className="app-backdrop" aria-hidden="true" />
			<p className="photo-credit">写真提供：福岡市</p>
			<main className="app-content">
				{hasStarted ? (
					<QuestionScreen
						questions={sampleQuestions}
						onRestart={() => setHasStarted(false)}
					/>
				) : (
					<StartScreen onStart={() => setHasStarted(true)} />
				)}
			</main>
		</div>
	);
}

export default App;
