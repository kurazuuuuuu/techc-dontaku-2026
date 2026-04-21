# 博多どんたく クイズアプリ
## 

# ソース
- [博多どんたく公式](https://www.dontaku.fukunet.or.jp/)
    - [--> 博多どんたくとは](https://www.dontaku.fukunet.or.jp/about/dontaku/)
- [「博多どんたく港まつり」運営（福岡市民の祭り振興会）公式X](https://x.com/HAKATA_DONTAKU)

## 概要
博多どんたくの専門学校ブースにて展示予定のどんたくクイズアプリ

AIベースでクイズを生成し、遊ぶことができる。

## 技術構成
### フロントエンド
- [React + Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)

### バックエンド
- Hono

### インフラ
- Cloudflare Workers Static Assets
- Cloudflare Workers / Workers AI
- Cloudflare AI Search

### 開発環境
#### パッケージマネージャ
- npm
- pnpm

#### その他
- [wrangler](https://developers.cloudflare.com/workers/wrangler/)

## 開発環境
> [!WARNING]
> 以降の作業はすべて`dontaku-quiz-app`ディレクトリの作業です。


### 環境構築
```zsh
pnpm install
```

### 開発サーバー
```zsh
pnpm run dev

# 終了したいときは`ctrl + c`で終了
```
