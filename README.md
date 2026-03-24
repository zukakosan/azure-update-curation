# Azure Update Curation
このワークスペースでは、Azure に関するアップデート情報を集約する静的 Web サイトのコードとコンテンツを管理する。

## やること
1. 週次の GitHub Actions ワークフロー（Agentic Workflows）を実行し、対象とするサイトから前週のアップデート情報を取得する
2. 取得した内容を標準化して JSON ファイルとして PR を作成し、自動マージ後に静的 Web サイトへデプロイする

## 対象データソース

| ソース | URL | ワークフロー |
|--------|-----|-------------|
| Azure 公式アップデート | `https://www.microsoft.com/releasecommunications/api/v2/azure` | Azure Update 週次収集 |
| Zenn (Microsoft publication) | `https://zenn.dev/p/microsoft` | Azure コミュニティ記事 週次収集 |
| Qiita (Microsoft org) | `https://qiita.com/organizations/microsoft` | Azure コミュニティ記事 週次収集 |

## ワークフロー全体像

```mermaid
flowchart TD
    subgraph "毎週月曜 (スケジュール / 手動実行)"
        A["🔄 Azure Update 週次収集<br/><i>fetch-updates.lock.yml</i>"]
        B["🔄 Azure コミュニティ記事 週次収集<br/><i>fetch-community-updates.lock.yml</i>"]
    end

    A -->|"API からデータ取得<br/>分類・翻訳"| A1["📝 PR 作成<br/><i>site/data/weekly/{WEEK}.json</i>"]
    A -->|"safe-outputs"| A2["📋 Issue 作成<br/><i>azure-updates ラベル</i>"]

    B -->|"RSS / API からデータ取得<br/>分類・翻訳"| B1["📝 PR 作成<br/><i>site/data/community/{WEEK}.json</i>"]
    B -->|"safe-outputs"| B2["📋 Issue 作成<br/><i>community-articles ラベル</i>"]

    A1 & B1 -->|"workflow_run<br/>completed"| C["🔀 Auto-merge data PRs<br/><i>auto-merge-data.yml</i>"]

    C -->|"MERGEABLE → squash merge<br/>CONFLICTING → close"| D["✅ main ブランチ更新"]

    C -->|"workflow_run<br/>completed"| E["🚀 Azure Static Web Apps CI/CD<br/><i>azure-static-web-apps-*.yml</i>"]

    E -->|"デプロイ"| F["🌐 Azure Static Web Apps<br/><i>サイト公開</i>"]

    style A fill:#2563eb,color:#fff
    style B fill:#2563eb,color:#fff
    style C fill:#f59e0b,color:#000
    style E fill:#22c55e,color:#fff
    style F fill:#06b6d4,color:#fff
```

## データフロー

```mermaid
flowchart LR
    subgraph Sources["データソース"]
        S1["Azure Updates API"]
        S2["Zenn RSS"]
        S3["Qiita API"]
    end

    subgraph GH["GitHub (Agentic Workflows)"]
        W1["fetch-updates"]
        W2["fetch-community-updates"]
    end

    subgraph Repo["リポジトリ (main)"]
        D1["site/data/weekly/{WEEK}.json"]
        D2["site/data/community/{WEEK}.json"]
    end

    subgraph Site["静的サイト"]
        UI["📋 公式アップデート タブ"]
        UI2["📝 コミュニティ記事 タブ"]
    end

    S1 --> W1 --> D1 --> UI
    S2 & S3 --> W2 --> D2 --> UI2
```

## ワークフロー一覧

| ワークフロー | ファイル | トリガー | 概要 |
|-------------|---------|---------|------|
| Azure Update 週次収集 | `fetch-updates.md` / `.lock.yml` | 毎週月曜 / 手動 | Azure 公式 API から前週のアップデートを取得し、PR + Issue を作成 |
| Azure コミュニティ記事 週次収集 | `fetch-community-updates.md` / `.lock.yml` | 毎週月曜 / 手動 | Zenn・Qiita から前週の記事を取得し、PR + Issue を作成 |
| Auto-merge data PRs | `auto-merge-data.yml` | 上記ワークフロー完了後 | データ更新 PR を自動 squash merge（conflict は自動 close） |
| Azure Static Web Apps CI/CD | `azure-static-web-apps-*.yml` | push to main / auto-merge 完了後 | `./site` を Azure Static Web Apps にデプロイ |

## 競合回避

| 項目 | fetch-updates（公式） | fetch-community-updates（コミュニティ） |
|------|----------------------|----------------------------------------|
| 出力ディレクトリ | `site/data/weekly/` | `site/data/community/` |
| Issue ラベル | `azure-updates` | `community-articles` |
| ネットワーク許可 | `microsoft.com`, `azure.microsoft.com` | `zenn.dev`, `qiita.com` |
