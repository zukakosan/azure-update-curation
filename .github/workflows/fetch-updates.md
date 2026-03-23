---
on:
  schedule: weekly on monday
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

# Azure Update 週次収集

Azure の公式アップデート情報を API から取得し、前週分をまとめて分類済み JSON ファイルとしてリポジトリに保存する。
取得するアップデートが英語で記載されている場合は、**日本語に翻訳してから** 保存する。

## データソース

- **URL**: `https://www.microsoft.com/releasecommunications/api/v2/azure`
- **メソッド**: GET（認証不要）
- **レスポンス形式**: JSON（OData v4）
- **ページネーション**: `@odata.nextLink` で 100 件ずつ

## 週次収集タスク

毎週月曜に実行し、**前週月曜〜日曜**（7日間）のアップデートを一括取得・保存する。

### 手順

1. 前週月曜〜日曜の日付範囲を計算する（`WEEK_START` = 前週月曜、`WEEK_END` = 前週日曜）
2. ISO 8601 週番号を算出する（例: `2026-W12`）
3. `site/data/weekly/` ディレクトリを作成する（なければ）
4. Azure Updates API を `curl` で取得する。`@odata.nextLink` がある限り次ページも取得し、全エントリを結合する
5. `modified` フィールドが `WEEK_START` 〜 `WEEK_END` の範囲内であるエントリだけを抽出する
6. 重複 `id` を除去する
7. 各エントリを以下のルールで分類する:
   - `tags` に `"Retirements"` を含む → `category: "retirement"`
   - `status` が `"In preview"` または `"In development"` → `category: "preview"`
   - `status` が `"Launched"` → `category: "ga"`
   - それ以外 → `category: "change"`
8. 各エントリを以下の形に変換する:
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
9. カテゴリ別の件数を集計する（`stats` オブジェクト）
10. 結果を以下の JSON 構造でファイル `site/data/weekly/{WEEK}.json` に書き出す:
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
11. 変更があれば `git add site/data/weekly/` して `git commit -m "data: weekly Azure updates for {WEEK}"` して `git push` する
12. GitHub Issue を以下の形式で作成する:
    - **タイトル**: `Azure Weekly Updates: {WEEK} ({MM/DD}〜{MM/DD})`
    - **本文**: Retirement を先頭に、GA、Preview、Change の順でテーブル表示し、末尾に統計を記載
    - **ラベル**: `azure-updates`
