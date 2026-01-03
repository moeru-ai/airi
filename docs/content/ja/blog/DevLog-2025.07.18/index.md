---
title: DevLog @ 2025.07.18
category: DevLog
date: 2025-07-18
excerpt: |
  Factorio 強化学習環境に関する論文を読んだ後、Factorio エージェントプロジェクト `airi-factorio` をどのように改善するか共有したいと思います。
preview-cover:
  light: "@assets('/en/blog/DevLog-2025.07.18/assets/factorio-belt.gif')"
  dark: "@assets('/en/blog/DevLog-2025.07.18/assets/factorio-belt.gif')"
---

こんにちは、AIRI メンテナーの一人、[@LemonNeko](https://github.com/LemonNekoGH) です。

## 振り返り

半年前、私は有名な自動化生産シミュレーションゲーム [Factorio](https://www.factorio.com/) をプレイできる AI エージェント [`airi-factorio`](https://github.com/moeru-ai/airi-factorio) を書く最初の試みを行いました。その中で以下の実践を行いました：

- TypeScript で Factorio Mod を記述：[tstl](https://github.com/TypeScriptToLua/TypeScriptToLua) を使用して TypeScript コードを Lua コードにコンパイル。
- RCON を使用して Factorio Mod と対話：[factorio-rcon-api](https://github.com/nekomeowww/factorio-rcon-api) を使用して Factorio と通信し、`/c` コマンドを呼び出して Mod が登録した関数を実行。[@nekomeowww](https://github.com/nekomeowww) に感謝します。
- LLM を使用して意思決定を行い、プレイヤーを操作する Lua コードを生成：プロンプトエンジニアリングを通じて LLM にゲームの操作方法や計画方法を指示し、RCON との対話コードをツールとしてカプセル化して LLM が呼び出せるようにしました。
- ゲーム内のチャットシステムで LLM と対話：ゲームの標準出力を読み取り、正規表現を使用してゲーム内のプレイヤーのチャット内容を解析し、処理のために LLM に送信。
- Factorio Mod のホットリロード：tstl のプラグインを作成してコードの変更をリアルタイムで監視し、新しい Mod コンテンツを RCON 経由でゲームに送信。新しい Mod コードを受け取ったときにすべてのインターフェースをアンロードし、Mod コードを一度実行してホットリロードを実現。しかし、Mod の既存の状態を正しく処理する方法が大きな課題となりました。
- DevContainer での開発：環境をより制御しやすくし、プロジェクトの開始を簡素化。
- シンボリックリンクを使用して `tstl` の出力ディレクトリをゲームディレクトリにリンク：これにより、ゲームディレクトリ内でコンパイルされた Lua コードを直接確認でき、デバッグが容易になりました。

これらを通じて多くの知識を得ました ~~（特に Lua の配列インデックスが 1 から始まることなど）~~。

しかし、非常に多くの問題にも直面しました。主な操作を Mod 内に記述しているため、デバッグが非常に面倒でした。Mod の変更を適用するには、マップを終了してゲームのメインメニューに戻り、再入力する必要がありました。Mod が少し複雑で `data.lua` がある場合は、ゲームを再起動する必要があります。

LLM に Lua コードを生成させ、RCON 経由でゲームコマンド `/c` を呼び出して実行していましたが、Factorio の 1 つのコマンドの長さには制限があり、コードが長すぎる場合は複数回に分けて実行する必要がありました。

現在のコードは堅牢性が低く、保守性も悪いため、新しい友人が開発に参加したい、あるいは試してみたいと思っても、このプロジェクトを開始するのは非常に困難です。

## Factorio Learning Environment

時間を現在に戻すと、私はこのプロジェクトを整理しようと考えていましたが、どこから始めればよいかわかりませんでした。ちょうど誰かが [Factorio Learning Environment](https://arxiv.org/abs/2503.09617) という論文に言及していたので、簡単に読んでみましょう。

この論文では、著者は Factorio Learning Environment (FLE) というフレームワークを提案しており、この環境で AI の長期的な計画、プログラム合成、リソース管理、空間推論の能力をテストしています。

FLE には 2 つのモードがあります：

- Lab-play：24 の人工的に設計されたレベルでテストを行います。リソースは限られており、AI が限られたリソースの下で効率的にパイプラインを構築できるかどうかを評価します。
- Open-play：無制限の大規模マップ。目標は手続き的に生成されたマップ上で最大の工場を建設することであり、AI の長期的な自律的な目標設定、探索、拡張能力を評価します。

彼らは Claude 3.5 Sonnet、GPT-4o、Deepseek-v3、Gemini-2 などの主要な LLM を評価しましたが、Lab-play では当時最強だった Claude 3.5 でさえ 7 つのレベルしか完了しませんでした。

ここまで読んで、彼らの評価がこれほど複雑であるなら、技術的な実装においてどのように保守性を保証しているのか興味を持ち始めました。読み進めると、彼らの実装方法は `airi-factorio` と非常に似ていますが、`airi-factorio` に比べて多くの利点があることがわかりました：

- Python で記述されており、LLM は Python コードを生成し、Python REPL で直接実行して、標準出力で結果を読み取ることができます。Python のデータセットは Lua よりもはるかに多いため、生成の精度が高く、より複雑なコードも生成できます。
- Lua mod には操作を実行するためのプリミティブ（例：place_entity でエンティティを配置）のみが含まれ、より複雑なロジックは Python で記述されるため、Lua mod のバグの可能性が減り、ゲームを頻繁に再起動する必要がなくなります。
- Lua コードを実行するために `/c` コマンドではなく `/sc` コマンドを使用するため、コードがコンソールに出力されず、コンソールがクリーンに保たれ、必要な内容だけが残るため、標準入力の解析の難易度が下がります。

LLM の能力をより適切に評価するために、彼らは必要なすべてのレシピの生産フローと難易度を慎重に分析し、アイテムの生産コストや LLM のスコア計算方法などのいくつかの式をまとめました。

また、彼らが使用した [システムプロンプト](https://arxiv.org/html/2503.09617v1#A8.SS4) も公開しており、環境構造、応答形式、ベストプラクティス、ゲーム出力の理解方法などを規定しています。

## `airi-factorio` に戻る

FLE と比較すると、私たちの実装はかなり未熟に見えます。では、どのように `airi-factorio` を改善すればよいでしょうか？

私は Python を書きたくありません。TypeScript と Golang にしか詳しくありません。偶然にも、最近私たちは [mcp-launcher](https://github.com/moeru-ai/mcp-launcher) を作成しました。これは、あらゆる可能な MCP サーバー用のビルダーです。これと組み合わせて Golang で MCP サーバーを実装し、LLM にそれを呼び出させることができます。

構造図は次のように変化します：

<div class="flex flex-row gap-4">

![以前](/en/blog/DevLog-2025.07.18/assets/structure-before.avif)

![以後](/en/blog/DevLog-2025.07.18/assets/structure-after.avif)

</div>

プレイヤーのチャット内容は LLM にプッシュされるのではなく、[RconChat](https://gitlab.com/FishBus/rconchat) mod に保存され、LLM は MCP サーバーを介してこれらの内容を読み取ります。MCP サーバーを使用することで、LLM に Lua コードを生成させる必要がなくなります。

システムプロンプトに関しては、現在のプロンプトは AI によって生成されたものですが、依然として十分に明確ではなく、優先順位が不明確です。FLE のシステムプロンプトを参考にして改善しようと考えています。

よし、これまでのすべての設計を基本的に覆したので、最初からやり直しです。

## 終わりに

読んでいただきありがとうございます。興味があれば、FLE の論文と [コード](https://github.com/JackHopkins/factorio-learning-environment) をご覧ください。私の理解が間違っているかもしれませんので、ご指摘いただければ幸いです！今回の読み込みは十分ではないかもしれませんが、今後私の考えに従って `airi-factorio` を改善する際には、繰り返し読む必要があり、進展があれば更新します。

この DevLog はここまでです。良い週末を！

> カバー画像は [@anrew10](https://es.pixilart.com/art/factorio-yellow-belt-132272fb3d727dd) の作品から引用
