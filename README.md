# Pocket Drummer

URL埋め込み型の16ステップ・ドラムシーケンサーです。キック/スネア/ハイハットのパターンをモバイルでも片手で編集し、URLやQRコードで即共有できます。

## セットアップ

> 本リポジトリでは npm を利用し、`package-lock.json` をコミット対象にしています。

```bash
npm install
npm run dev
```

## 環境変数

- `NEXT_PUBLIC_BASE_URL` (任意): 共有リンク生成時に利用するベース URL。未設定の場合はブラウザの `window.location.origin` を使用します。

`.env.example` を参考に `.env.local` を作成してください。

## デプロイに関するメモ

- Vercel Hobby でのビルドエラー回避のため、TypeScript/ESLint を有効化し未使用コードを極力排除しています。
- 画像最適化回数節約のため `next/image` は使用せず `<img>` で QR を表示します。
- サーバーレス実行時間を消費する処理はなく、再生ロジックはクライアントのみで完結します。
