---
on:
  schedule: daily
  workflow_dispatch:

permissions:
  contents: read
  issues: read

network:
  allowed:
    - zenn.dev
    - qiita.com

safe-outputs:
  scripts: {}
  create-pull-request:
    max: 1
    draft: false
  create-issue:
    max: 1
---

# Azure コミュニティ記事 週次収集

Blog サイトにおける非公式の Azure 関連記事の情報を毎日取得し、分類済み JSON ファイルとしてリポジトリに保存する。
取得するアップデートが英語で記載されている場合は、**日本語に翻訳してから** 保存する。

- **今週分（進行中）**: 毎日の実行ごとに最新データで `site/data/community/{CURRENT_WEEK}.json` を作成・上書き更新する。
- **前週分（確定済み）**: 今週の初回実行時に前週のファイルが未作成であれば、前週分も合わせて作成する。

## データソース

### Zenn

- **URL**: `https://zenn.dev/p/microsoft/articles`
- **取得方法**: RSS フィード `https://zenn.dev/p/microsoft/feed` を取得する（認証不要）
- **レスポンス形式**: XML（RSS 2.0）
- **主なフィールド**: `<title>`, `<link>`, `<pubDate>`, `<description>`, `<dc:creator>`

### Qiita

- **URL**: `https://qiita.com/organizations/microsoft`
- **取得方法**: REST API `https://qiita.com/api/v2/items` を `page` / `per_page` パラメータでページネーションしながら取得する（認証不要、レート制限あり）
- **フィルタ条件**: クエリ `org:microsoft` を指定する
- **レスポンス形式**: JSON（配列）
- **主なフィールド**: `id`, `title`, `url`, `created_at`, `updated_at`, `body`, `tags[]`, `user.id`

## fetch-updates ワークフローとの競合回避

本ワークフローは公式 Azure Update 収集ワークフロー（`fetch-updates`）とデータが混在しないよう、以下のように完全に分離する:

| 項目 | fetch-updates（公式） | fetch-community-updates（本ワークフロー） |
|------|----------------------|-------------------------------------------|
| **出力ディレクトリ** | `site/data/weekly/` | `site/data/community/` |
| **ファイル名** | `{WEEK}.json` | `{WEEK}.json` |
| **コミットメッセージ** | `data: weekly Azure updates for {WEEK}` | `data: community articles for {WEEK}` |
| **Issue ラベル** | `azure-updates` | `community-articles` |
| **ネットワーク許可** | `microsoft.com`, `azure.microsoft.com` | `zenn.dev`, `qiita.com` |

> **注意**: 出力ディレクトリが異なるため、同一週番号のファイルが上書きされることはない。
> `workflow_dispatch` で手動実行する場合も、もう一方のワークフローと同時に `git push` が衝突しないよう注意すること。

## 収集タスク（毎日実行）

毎日実行し、**今週分のコミュニティ記事を最新状態で取得・保存する**。前週分が未保存の場合は合わせて取得する。

### 手順

#### ステップ A: 日付範囲の計算

1. 実行時刻の UTC 日付から **今週の月曜日**（`CUR_WEEK_START`）と **今日の日付**（`TODAY`）を求める
2. 今週の ISO 8601 週番号を算出する（例: `2026-W14`）→ `CUR_WEEK`
3. 前週の月曜〜日曜の日付範囲を計算する（`PREV_WEEK_START` = 前週月曜、`PREV_WEEK_END` = 前週日曜）
4. 前週の ISO 8601 週番号を算出する（例: `2026-W13`）→ `PREV_WEEK`

#### ステップ B: 前週分の確定（未作成時のみ）

5. `site/data/community/{PREV_WEEK}.json` が **既にリポジトリに存在するか** 確認する
6. ファイルが **存在しない** 場合のみ、以下を実行する:
   - 後述の「データ取得手順」で `PREV_WEEK_START` 〜 `PREV_WEEK_END` の範囲の記事を取得する
   - 後述の「データ変換ルール」に従って変換し、`site/data/community/{PREV_WEEK}.json` として書き出す
7. ファイルが **既に存在する** 場合は、前週分の処理をスキップする

#### ステップ C: 今週分の取得・更新

8. `site/data/community/` ディレクトリを作成する（なければ）
9. 後述の「データ取得手順」で `CUR_WEEK_START` 〜 `TODAY`（当日を含む）の範囲の記事を取得する
10. 後述の「データ変換ルール」に従って変換する
11. 結果を `site/data/community/{CUR_WEEK}.json` として書き出す（既存ファイルがあれば上書きする）

### データ取得手順

指定された日付範囲（`DATE_START` 〜 `DATE_END`）の記事を以下の手順で取得する:

1. **Zenn** の記事を取得する:
   - RSS フィード `https://zenn.dev/p/microsoft/feed` を `curl` で取得する
   - XML をパースし、各 `<item>` から `title`, `link`, `pubDate`, `description`, `dc:creator` を抽出する
   - `pubDate` が `DATE_START` 〜 `DATE_END` の範囲内であるエントリだけを抽出する
2. **Qiita** の記事を取得する:
   - `https://qiita.com/api/v2/items?query=org:microsoft&per_page=100&page=1` を `curl` で取得する
   - レスポンスが 100 件の場合は次ページも取得し、全エントリを結合する
   - `created_at` が `DATE_START` 〜 `DATE_END` の範囲内であるエントリだけを抽出する
3. Zenn と Qiita の記事を結合し、重複 URL を除去する

### データ変換ルール

結合したエントリに対して以下を適用する:

1. 各エントリを以下のルールで分類する:
   - `tags` またはタイトルに Azure サービスのカテゴリキーワードが含まれる場合、以下の優先順で判定する:
     - `"AI"`, `"OpenAI"`, `"Cognitive"`, `"Machine Learning"`, `"Foundry"` → `category: "ai"`
     - `"DevOps"`, `"GitHub"`, `"CI/CD"`, `"Pipeline"` → `category: "devops"`
     - `"Security"`, `"Entra"`, `"Defender"`, `"Sentinel"` → `category: "security"`
     - `"Network"`, `"Front Door"`, `"VNet"`, `"DNS"` → `category: "network"`
     - `"Database"`, `"Cosmos"`, `"SQL"`, `"PostgreSQL"` → `category: "database"`
     - `"Container"`, `"Kubernetes"`, `"AKS"`, `"Docker"` → `category: "container"`
     - `"Serverless"`, `"Functions"`, `"Logic Apps"`, `"Event Grid"` → `category: "serverless"`
     - `"Storage"`, `"Blob"`, `"Data Lake"` → `category: "storage"`
   - 上記いずれにも該当しない → `category: "other"`
2. 各エントリを以下の形に変換する:
   - `id`: Zenn は URL のスラッグ、Qiita は `id` をそのまま使用
   - `title`: **日本語の場合はそのまま**、英語の場合は **日本語に翻訳する**
   - `date`: Zenn は `pubDate`、Qiita は `created_at` の値
   - `category`: 上記の分類結果
   - `summary`: Zenn は `description`、Qiita は `body` から Markdown / HTML タグを除去し、先頭 300 文字に切り詰める。英語の場合は **日本語に翻訳する**
   - `tags`: Zenn は記事ページから取得（利用可能な場合）、Qiita は `tags[].name` の配列をそのまま使用
   - `url`: 元記事の URL をそのまま使用
   - `source`: `"zenn"` または `"qiita"`
   - `author`: Zenn は `dc:creator`、Qiita は `user.id`

> **重要: 翻訳ルール**
> - `title` と `summary` が**英語の場合のみ**、自然な日本語に翻訳すること。日本語の記事はそのまま保持する。
> - 固有名詞（Azure サービス名、製品名、技術用語）は英語のまま残す。例: "Azure Functions", "Kubernetes", "Copilot"
> - `tags` は翻訳しない（フィルタの整合性のため）。

3. カテゴリ別の件数を集計する（`stats` オブジェクト）

### JSON ファイル構造

各週の JSON ファイルは以下の構造で保存する:

```json
{
  "week": "2026-W14",
  "period": { "from": "2026-03-30", "to": "2026-04-05" },
  "fetchedAt": "ISO8601 timestamp",
  "count": 合計件数,
  "stats": {
    "ai": N,
    "devops": N,
    "security": N,
    "network": N,
    "database": N,
    "container": N,
    "serverless": N,
    "storage": N,
    "other": N
  },
  "entries": [
    {
      "id": "slug-or-id",
      "title": "記事タイトル（日本語）",
      "date": "2026-03-18T10:00:00Z",
      "category": "ai",
      "summary": "記事の概要（300文字以内、日本語）",
      "tags": ["Azure OpenAI", "GPT-4"],
      "url": "https://zenn.dev/microsoft/articles/example-slug",
      "source": "zenn",
      "author": "username"
    }
  ]
}
```

- 今週分（進行中）の `period.to` は、今週の日曜日の日付を設定する（実行日ではない）

### ステップ D: PR・Issue の作成

12. 今週分の `site/data/community/{CUR_WEEK}.json` を含む Pull Request を作成する:
    - **ブランチ名**: `data/community-{CUR_WEEK}`
    - **タイトル**: `data: community articles for {CUR_WEEK}`
    - **本文**: 追加・更新された記事の件数とカテゴリ別内訳を記載
    - 前週分のファイルもステップ B で新規作成した場合は、同じ PR に含める
13. GitHub Issue を以下の形式で作成する:
    - **タイトル**: `Azure Community Articles: {CUR_WEEK} ({MM/DD}〜{MM/DD})`
    - **本文**: カテゴリ別にテーブル表示し（AI → DevOps → Security → Database → Container → Serverless → Storage → Network → Other の順）、末尾に統計と出典別の内訳を記載
    - **ラベル**: `community-articles`
