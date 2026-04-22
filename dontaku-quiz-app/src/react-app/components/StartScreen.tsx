type StartScreenProps = {
	onStart: () => void;
};

export function StartScreen({ onStart }: StartScreenProps) {
	return (
		<section className="start-screen">
			<div className="start-card">
				<p className="eyebrow">Hakata Dontaku Quiz</p>
				<h1>博多どんたく</h1>
				<h2>クイズアプリ</h2>
				<p className="start-description">
					博多どんたくの歴史や見どころを、クイズで楽しく体験しましょう。
				</p>
				<button type="button" className="start-button" onClick={onStart}>
					スタート
				</button>
			</div>
		</section>
	);
}
