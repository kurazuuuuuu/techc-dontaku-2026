export type SampleQuestion = {
	category: string;
	choices: string[];
	question: string;
};

export const sampleQuestions: SampleQuestion[] = [
	{
		category: "どんたくの基礎",
		question: "博多どんたく港まつりは、毎年おもに何月に開催されるでしょう？",
		choices: ["3月", "5月", "8月", "11月"],
	},
	{
		category: "歴史",
		question: "博多どんたくのルーツとして知られる伝統行事はどれでしょう？",
		choices: ["追い山", "博多松囃子", "放生会", "おくんち"],
	},
	{
		category: "見どころ",
		question: "パレードや演舞など、会場で楽しめる多彩な出し物を何と呼ぶでしょう？",
		choices: ["どんたく隊", "飾り山", "奉納舞", "祝い舟"],
	},
];
