import { motion } from "motion/react";

type StartScreenProps = {
	onStart: () => void;
};

export function StartScreen({ onStart }: StartScreenProps) {
	return (
		<section className="start-screen">
			<motion.div
				className="start-card"
				initial={{ opacity: 0, scale: 0.98 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.4, ease: "easeOut" }}
			>
				<div className="start-pattern pattern-diagonal-stripes-sm" aria-hidden="true" />
				<p className="eyebrow">Hakata Dontaku Quiz</p>
				<h1>博多どんたく</h1>
				<h2>クイズアプリ</h2>
				<p className="start-description">
					博多どんたくの歴史や見どころを、クイズで楽しく体験しましょう。
				</p>
				<p className="ai-disclaimer">
					※ 一部の問題・解説には AI 生成の内容を含みます。
				</p>
				<motion.button
					type="button"
					className="start-button"
					onClick={onStart}
					whileHover={{ y: -2 }}
					whileTap={{ scale: 0.98 }}
				>
					スタート
				</motion.button>
			</motion.div>
		</section>
	);
}
