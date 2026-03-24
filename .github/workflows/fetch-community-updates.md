---
on:
  schedule: weekly on monday
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

Blog サイトにおける非公式の Azure 関連記事の情報を取得し、前週分をまとめて分類済み JSON ファイルとしてリポジトリに保存する。
取得するアップデートが英語で記載されている場合は、**日本語に翻訳してから** 保存する。

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

## 週次収集タスク

毎週月曜に実行し、**前週月曜〜日曜**（7日間）に公開された記事を一括取得・保存する。

### 手順

1. 前週月曜〜日曜の日付範囲を計算する（`WEEK_START` = 前週月曜、`WEEK_END` = 前週日曜）
2. ISO 8601 週番号を算出する（例: `2026-W12`）
3. `site/data/community/` ディレクトリを作成する（なければ）
4. **Zenn** の記事を取得する:
   - RSS フィード `https://zenn.dev/p/microsoft/feed` を `curl` で取得する
   - XML をパースし、各 `<item>` から `title`, `link`, `pubDate`, `description`, `dc:creator` を抽出する
   - `pubDate` が `WEEK_START` 〜 `WEEK_END` の範囲内であるエントリだけを抽出する
5. **Qiita** の記事を取得する:
   - `https://qiita.com/api/v2/items?query=org:microsoft&per_page=100&page=1` を `curl` で取得する
   - レスポンスが 100 件の場合は次ページも取得し、全エントリを結合する
   - `created_at` が `WEEK_START` 〜 `WEEK_END` の範囲内であるエントリだけを抽出する
6. Zenn と Qiita の記事を結合し、重複 URL を除去する
7. 各エントリを以下のルールで分類する:
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
8. 各エントリを以下の形に変換する:
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

9. カテゴリ別の件数を集計する（`stats` オブジェクト）
10. 結果を以下の JSON 構造でファイル `site/data/community/{WEEK}.json` に書き出す:
    ```json
    {
      "week": "2026-W12",
      "period": { "from": "2026-03-16", "to": "2026-03-22" },
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
11. JSON ファイル `site/data/community/{WEEK}.json` を含む Pull Request を作成する:
    - **ブランチ名**: `data/community-{WEEK}`
    - **タイトル**: `data: community articles for {WEEK}`
    - **本文**: 追加・更新された記事の件数とカテゴリ別内訳を記載
12. GitHub Issue を以下の形式で作成する:
    - **タイトル**: `Azure Community Articles: {WEEK} ({MM/DD}〜{MM/DD})`
    - **本文**: カテゴリ別にテーブル表示し（AI → DevOps → Security → Database → Container → Serverless → Storage → Network → Other の順）、末尾に統計と出典別の内訳を記載
    - **ラベル**: `community-articles`
