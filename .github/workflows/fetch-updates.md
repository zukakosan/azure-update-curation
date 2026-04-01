---
on:
  schedule: daily
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
  create-pull-request:
    max: 1
    draft: false
  create-issue:
    max: 1
---

# Azure Update 週次収集

Azure の公式アップデート情報を API から毎日取得し、分類済み JSON ファイルとしてリポジトリに保存する。
取得するアップデートが英語で記載されている場合は、**日本語に翻訳してから** 保存する。

- **今週分（進行中）**: 毎日の実行ごとに最新データで `site/data/weekly/{CURRENT_WEEK}.json` を作成・上書き更新する。
- **前週分（確定済み）**: 今週の初回実行時に前週のファイルが未作成であれば、前週分も合わせて作成する。

## データソース

- **URL**: `https://www.microsoft.com/releasecommunications/api/v2/azure`
- **メソッド**: GET（認証不要）
- **レスポンス形式**: JSON（OData v4）
- **ページネーション**: `@odata.nextLink` で 100 件ずつ

## 収集タスク（毎日実行）

毎日実行し、**今週分のアップデートを最新状態で取得・保存する**。前週分が未保存の場合は合わせて取得する。

### 手順

#### ステップ A: 日付範囲の計算

1. 実行時刻の UTC 日付から **今週の月曜日**（`CUR_WEEK_START`）と **今日の日付**（`TODAY`）を求める
2. 今週の ISO 8601 週番号を算出する（例: `2026-W14`）→ `CUR_WEEK`
3. 前週の月曜〜日曜の日付範囲を計算する（`PREV_WEEK_START` = 前週月曜、`PREV_WEEK_END` = 前週日曜）
4. 前週の ISO 8601 週番号を算出する（例: `2026-W13`）→ `PREV_WEEK`

#### ステップ B: 前週分の確定（未作成時のみ）

5. `site/data/weekly/{PREV_WEEK}.json` が **既にリポジトリに存在するか** 確認する
6. ファイルが **存在しない** 場合のみ、以下を実行する:
   - Azure Updates API を `curl` で全ページ取得する
   - `modified` フィールドが `PREV_WEEK_START` 〜 `PREV_WEEK_END` の範囲内であるエントリだけを抽出する
   - 後述の「データ変換ルール」に従って変換し、`site/data/weekly/{PREV_WEEK}.json` として書き出す
7. ファイルが **既に存在する** 場合は、前週分の処理をスキップする

#### ステップ C: 今週分の取得・更新

8. `site/data/weekly/` ディレクトリを作成する（なければ）
9. Azure Updates API を `curl` で全ページ取得する（ステップ B で既に取得済みの場合はそのデータを再利用してよい）
10. `modified` フィールドが `CUR_WEEK_START` 〜 `TODAY`（当日を含む）の範囲内であるエントリだけを抽出する
11. 後述の「データ変換ルール」に従って変換する
12. 結果を `site/data/weekly/{CUR_WEEK}.json` として書き出す（既存ファイルがあれば上書きする）

### データ変換ルール

抽出したエントリに対して以下を適用する:

1. 重複 `id` を除去する
2. 各エントリを以下のルールで分類する:
   - `tags` に `"Retirements"` を含む → `category: "retirement"`
   - `status` が `"In preview"` または `"In development"` → `category: "preview"`
   - `status` が `"Launched"` → `category: "ga"`
   - それ以外 → `category: "change"`
3. 各エントリを以下の形に変換する:
   - `id`: そのまま
   - `title`: 先頭の `[Launched]` や `[In preview]` プレフィックスを除去し、**日本語に翻訳する**
   - `date`: `modified` の値
   - `category`: 上記の分類結果
   - `summary`: `description` から HTML タグを除去し、先頭 500 文字に切り詰めたうえで **日本語に翻訳する**
   - `products`: そのまま（配列、英語のまま）
   - `productCategories`: そのまま（配列、英語のまま）
   - `tags`: そのまま（配列、英語のまま）
   - `url`: `https://azure.microsoft.com/updates?id={id}` で構築
   - `actionRequired`: category が `retirement` なら `true`、それ以外は `false`

> **重要: 翻訳ルール**
> - `title` と `summary` は必ず **自然な日本語** に翻訳すること。
> - 固有名詞（Azure サービス名、製品名、技術用語）は英語のまま残す。例: "Azure SQL Database", "Kubernetes", "Copilot"
> - `products`, `productCategories`, `tags` は翻訳しない（フィルタの整合性のため）。
> - Issue 本文のテーブルの `タイトル` 列も日本語翻訳済みの `title` を使うこと。

4. カテゴリ別の件数を集計する（`stats` オブジェクト）

### JSON ファイル構造

各週の JSON ファイルは以下の構造で保存する:

```json
{
  "week": "2026-W14",
  "period": { "from": "2026-03-30", "to": "2026-04-05" },
  "fetchedAt": "ISO8601 timestamp",
  "count": 合計件数,
  "stats": { "ga": N, "preview": N, "retirement": N, "change": N },
  "entries": [ ... ]
}
```

- 今週分（進行中）の `period.to` は、今週の日曜日の日付を設定する（実行日ではない）

### ステップ D: PR・Issue の作成

13. 今週分の `site/data/weekly/{CUR_WEEK}.json` を含む Pull Request を作成する:
    - **ブランチ名**: `data/weekly-{CUR_WEEK}`
    - **タイトル**: `data: weekly Azure updates for {CUR_WEEK}`
    - **本文**: 追加・更新されたエントリの件数とカテゴリ別内訳を記載
    - 前週分のファイルもステップ B で新規作成した場合は、同じ PR に含める
14. GitHub Issue を以下の形式で作成する:
    - **タイトル**: `Azure Weekly Updates: {CUR_WEEK} ({MM/DD}〜{MM/DD})`
    - **本文**: Retirement を先頭に、GA、Preview、Change の順でテーブル表示し、末尾に統計を記載
    - **ラベル**: `azure-updates`
