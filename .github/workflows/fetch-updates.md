---
on:
  schedule: daily on weekdays
  workflow_dispatch:

permissions:
  contents: read
  issues: read

network:
  allowed:
    - microsoft.com
    - azure.microsoft.com

safe-outputs:
  scripts: {}
  create-issue:
    max: 1
---

# Azure Update 日次収集

Azure の公式アップデート情報を API から取得し、分類済み JSON ファイルとしてリポジトリに保存する。
毎週月曜には前週分をまとめた週次サマリ Issue を作成する。

## データソース

- **URL**: `https://www.microsoft.com/releasecommunications/api/v2/azure`
- **メソッド**: GET（認証不要）
- **レスポンス形式**: JSON（OData v4）
- **ページネーション**: `@odata.nextLink` で 100 件ずつ

## 日次収集タスク

以下のシェルスクリプトを実行して、本日分のアップデートを取得・保存すること。

### 手順

1. 環境変数 `TARGET` に本日の日付（UTC, `YYYY-MM-DD` 形式）をセットする
2. `data/` ディレクトリを作成する（なければ）
3. Azure Updates API を `curl` で取得する。`@odata.nextLink` がある限り次ページも取得し、全エントリを結合する
4. `modified` フィールドが `TARGET` の日付で始まるエントリだけを抽出する
5. 各エントリを以下のルールで分類する:
   - `tags` に `"Retirements"` を含む → `category: "retirement"`
   - `status` が `"In preview"` または `"In development"` → `category: "preview"`
   - `status` が `"Launched"` → `category: "ga"`
   - それ以外 → `category: "change"`
6. 各エントリを以下の形に変換する:
   - `id`: そのまま
   - `title`: 先頭の `[Launched]` や `[In preview]` プレフィックスを除去
   - `date`: `modified` の値
   - `category`: 上記の分類結果
   - `summary`: `description` から HTML タグを除去し、先頭 500 文字に切り詰め
   - `products`: そのまま（配列）
   - `productCategories`: そのまま（配列）
   - `tags`: そのまま（配列）
   - `url`: `https://azure.microsoft.com/updates?id={id}` で構築
   - `actionRequired`: category が `retirement` なら `true`、それ以外は `false`
7. 結果を以下の JSON 構造でファイル `data/{TARGET}.json` に書き出す:
   ```json
   {
     "fetchedAt": "ISO8601 timestamp",
     "date": "YYYY-MM-DD",
     "count": エントリ数,
     "entries": [ ... ]
   }
   ```
8. 変更があれば `git add data/{TARGET}.json` して `git commit -m "data: fetch Azure updates for {TARGET}"` して `git push` する

## 週次サマリタスク（月曜のみ）

本日が月曜日の場合、追加で以下を行う:

1. 前週月曜〜日曜の日付範囲を計算する
2. `data/YYYY-MM-DD.json` ファイルを 7 日分読み込み、全 entries をマージする（重複 `id` は除去）
3. カテゴリ別の件数を集計する（`stats` オブジェクト）
4. ISO 8601 週番号を算出する（例: `2026-W12`）
5. 結果を `data/weekly/{WEEK}.json` に書き出す:
   ```json
   {
     "week": "2026-W12",
     "period": { "from": "2026-03-16", "to": "2026-03-22" },
     "fetchedAt": "ISO8601 timestamp",
     "count": 合計件数,
     "stats": { "ga": N, "preview": N, "retirement": N, "change": N },
     "entries": [ ... ]
   }
   ```
6. `git add data/weekly/` して commit & push する
7. GitHub Issue を以下の形式で作成する:
   - **タイトル**: `Azure Weekly Updates: {WEEK} ({MM/DD}〜{MM/DD})`
   - **本文**: Retirement を先頭に、GA、Preview、Change の順でテーブル表示し、末尾に統計を記載
   - **ラベル**: `azure-updates`
