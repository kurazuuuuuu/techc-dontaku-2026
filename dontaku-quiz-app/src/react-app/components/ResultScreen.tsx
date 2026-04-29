import { motion } from "motion/react";

type ResultScreenProps = {
	score: number;
	totalQuestions: number;
	onBackToTitle: () => void;
};

const CELEBRATION_PARTICLES = [
	{ id: 1, left: "8%", size: 14, delay: 0, duration: 3.4, drift: -32, rotate: -160, color: "#c81d25" },
	{ id: 2, left: "16%", size: 10, delay: 0.2, duration: 3.1, drift: 18, rotate: 140, color: "#f5b400" },
	{ id: 3, left: "24%", size: 12, delay: 0.5, duration: 3.6, drift: -20, rotate: -180, color: "#1f3a5f" },
	{ id: 4, left: "31%", size: 9, delay: 0.1, duration: 2.9, drift: 22, rotate: 150, color: "#ff7b54" },
	{ id: 5, left: "39%", size: 16, delay: 0.35, duration: 3.7, drift: -14, rotate: -120, color: "#f15bb5" },
	{ id: 6, left: "48%", size: 11, delay: 0.7, duration: 3.2, drift: 28, rotate: 180, color: "#00a6a6" },
	{ id: 7, left: "56%", size: 13, delay: 0.15, duration: 3.5, drift: -26, rotate: -150, color: "#c81d25" },
	{ id: 8, left: "64%", size: 10, delay: 0.55, duration: 3.3, drift: 12, rotate: 110, color: "#5c7cfa" },
	{ id: 9, left: "72%", size: 15, delay: 0.25, duration: 3.8, drift: -18, rotate: -170, color: "#f5b400" },
	{ id: 10, left: "81%", size: 9, delay: 0.45, duration: 3.05, drift: 24, rotate: 150, color: "#2e7d32" },
	{ id: 11, left: "89%", size: 12, delay: 0.05, duration: 3.25, drift: -16, rotate: -140, color: "#ff7b54" },
	{ id: 12, left: "94%", size: 8, delay: 0.8, duration: 2.95, drift: 10, rotate: 120, color: "#f15bb5" },
] as const;

function getResultMessage(score: number, totalQuestions: number) {
	const ratio = score / totalQuestions;

	if (ratio === 1) {
		return "全問正解です！ 博多どんたく博士ですね！";
	}

	if (ratio >= 0.6) {
		return "とてもいい結果です！ どんたくの見どころをしっかりつかめています。";
	}

	return "ここまでよく頑張りました！ タイトルに戻って、もう一度挑戦できます。";
}

export function ResultScreen({
	score,
	totalQuestions,
	onBackToTitle,
}: ResultScreenProps) {
	return (
		<section className="result-screen">
			<div className="result-celebration" aria-hidden="true">
				{CELEBRATION_PARTICLES.map((particle) => (
					<motion.span
						key={particle.id}
						className="result-particle"
						style={{
							left: particle.left,
							width: particle.size,
							height: particle.size * 1.8,
							backgroundColor: particle.color,
						}}
						initial={{ y: -80, x: 0, opacity: 0, rotate: 0 }}
						animate={{
							y: [-80, 30, 380],
							x: [0, particle.drift, particle.drift * 0.35],
							opacity: [0, 1, 1, 0],
							rotate: [0, particle.rotate],
						}}
						transition={{
							duration: particle.duration,
							delay: particle.delay,
							repeat: Number.POSITIVE_INFINITY,
							repeatDelay: 0.45,
							ease: "easeIn",
						}}
					/>
				))}
			</div>
			<motion.div
				className="result-card"
				initial={{ opacity: 0, scale: 0.98 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.35, ease: "easeOut" }}
			>
				<p className="eyebrow">Quiz Result</p>
				<h1>リザルト</h1>
				<p className="result-score-label">正解数</p>
				<p className="result-score">
					<span>{score}</span>
					<span className="result-score-total"> / {totalQuestions}</span>
				</p>
				<p className="result-message">
					{getResultMessage(score, totalQuestions)}
				</p>
				<motion.button
					type="button"
					className="start-button"
					onClick={onBackToTitle}
					whileHover={{ y: -2 }}
					whileTap={{ scale: 0.98 }}
				>
					タイトルへ戻る
				</motion.button>
			</motion.div>
		</section>
	);
}
