---
title: 前日譚 v0.0.1
---

- [x] プロジェクト作成 - 完了、Vitesse Lite と Vue を使用して作成 (2024年6月7日)
- [x] フロントエンド Live2D 統合 - [Pixi.js レンダラーを使用した Vue アプリケーションへの Live2D モデルの統合](https://nolebase.ayaka.io/to/3cae2b7c0b) にて完了 (2024年6月7日)
  - [x] Live2D Cubism SDK 統合
  - [x] pixi.js レンダリング
  - [x] モデルのダウンロード
    - [x] 桃瀬ひより (Neuro の初期バージョンモデル) Pro 版 (中小企業による商用利用は無料)

![](../../../../zh-Hans/docs/chronicles/version-v0.0.1/assets/screenshot-1.avif)

- [x] Vercel AI SDK を介した GPT-4o の統合 (2024年6月7日)
  - [x] `@ai-sdk/openai`
  - [x] `ai`
- [x] ストリーミングトークン送信 (2024年6月8日)
- [x] ストリーミングトークン受信 (2024年6月8日)
- [x] ストリーミング TTS (2024年6月8日)
  - [x] [node.js - Elevenlabs Streaming API から来るストリーミングオーディオを適切に処理するには？ - Stack Overflow](https://stackoverflow.com/questions/76854884/how-to-properly-handle-streaming-audio-coming-from-elevenlabs-streaming-api)
  - [x] [Stream Response - Getting Started - h3 (unjs.io)](https://h3.unjs.io/examples/stream-response)
  - [x] ~~GPT-SoVITS 設定~~ (これは少し複雑なので、時間があるときにサンプルに取り組みます)
- [x] リップシンク (2024年6月9日)
  - [x] 音量に基づいて口の開き具合を決定
    - [x] Math.pow 比率で音量曲線を増幅
    - [x] 線形正規化
    - [x] MinMax 正規化
    - [x] ~~SoftMax 正規化~~ (効果が良くなかった、出力データがすべて 0.999999 から 1.000001 の範囲になった)
- [x] ストリーミングトークンからストリーミング TTS へ (2024年6月9日)
  - [x] 句読点とスペース + 文字数制限の組み合わせに基づいて文を構築し、TTS 推論を実装できるようです
    - [x] ~~11Labs は WebSocket ベース~~
    - [x] TTS ストリームリクエストをキュー経由で発行し、オーディオストリームキューに入れる
    - [x] Vue でキューを実装
      - [x] キューは先入れ先出し (FIFO) である必要がある
        - [x] 出る、[`Array.prototype.shift`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/shift)
        - [x] 入る、[`Array.prototype.push`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/push)
        - [x] イベントベース
          - [x] イベント
            - [x] `add`、追加時に `add` イベントをトリガー
            - [x] `pick`、取得時に `pick` イベントをトリガー
            - [x] `processing`、ハンドラー呼び出し時に `processing` イベントをトリガー
            - [x] `done`、ハンドラー終了時に `done` イベントをトリガー
          - [x] イベント処理
            - [x] `add` または `done` イベントが発生したとき、実行中のハンドラーがあるか確認
              - [x] はいの場合、戻る
              - [x] いいえの場合、`pick(): T` してからハンドラーを呼び出す
        - [x] キューハンドラー
          - [x] await の場合、キューハンドラーの処理を待つ
            - [x] 理論的には、textPart から TTS ストリームハンドラーへの接続は別のキュー、つまりオーディオストリームキューに接続する必要がある
            - [x] オーディオストリームはマージできるか？ Raw PCM (.wav) を直接扱う必要があるかもしれない
            - [x] オーディオストリームキューハンドラーは、再生するためにオーディオストリームキューからオーディオを継続的に見つける必要がある
- [x] 基本的な Neuro Sama / AI Vtuber ロールプレイング (2024年6月10日)
  - [x] 基本的なプロンプト

2024年6月10日に完了済み、所要時間は4日未満。

現在は以下が可能です：
- ✅ フルスタック (元々は素の Vue 3 でした)
- ✅ Live2D モデル表示
- ✅ 会話
- ✅ 会話 UI
- ✅ 音声
- ✅ Live2D リップシンク (itorr の GitHub の説明に感謝)
- ✅ 基本的なプロンプト

![](../../../../zh-Hans/docs/chronicles/version-v0.0.1/assets/screenshot-2.avif)

## マルチモーダル

### 口 (2024年6月8日)

- [x] TTS 統合 (2024年6月8日)
  - [x] 11Labs 統合
- [ ] 調査
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">実験</span> [Deepgram Voice AI: Text to Speech + Speech to Text APIs | Deepgram](https://deepgram.com/)
  - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">実験</span> GPT-SoVITS を試す
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">実験</span> fish-speech を試す (2024年7月6日 ~ 2024年7月7日)
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> 確かに数ショットの直接コピーが可能で、Gura の声をコピーしてみましたが、最初の4秒間は非常に高い品質を維持できました
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> fish audio のオーディオ処理ツールは非常に包括的で、オーディオプロセッサーはほとんどのニーズ (ラベリングや自動ラベリングを含む) をカバーできます
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> 効果は非常に不安定で、頻繁に単語や音を飲み込んだり、突然ランダムなノイズを出したりします
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> RTX 4090 デバイスで実行しても、ストリーミングオーディオモードでは、推論結果を出力するのに最大2秒かかります
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">実験</span> ChatTTS を試す (2024年7月6日 ~ 2024年7月7日)
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> 確かに数ショットの直接コピーが可能で、Gura の声をコピーしてみましたが、効果は fish-speech ほど良くありません
    - <span class="i-icon-park-outline:up-one translate-y-0.5 text-green-800 dark:text-green-400 text-lg"></span> 感情制御は fish-speech よりもはるかに優れていますが、英語環境では `[uv_break]` のようなトークンも発音されてしまい、WeChat グループの人々もこれについて議論し質問しています
    - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> RTX 4090 デバイスで実行しても、ストリーミングオーディオモードでは数分かかります... 🤯 本当にばかげています。プレーン/正規化されたテキストをアクショントークン付きのテキストに変換するために最初にローカルで LLM を実行しているようで、LLM を開始するときにキャッシュやモデルサイズの考慮がないようです
   - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">実験</span> [TTS Arena - a Hugging Face Space by TTS-AGI](https://huggingface.co/spaces/TTS-AGI/TTS-Arena) で言及されている他のモデルを試す (2024年7月8日)
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">実験</span> XTTSv2 を試す
      - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> huggingface を直接使用しましたが、効果は低く、fish speech や chatts よりも安定していますが、トーンが平坦すぎて、アニメのトーンには LoRA が必要かもしれません
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">実験</span> StyleTTS 2 を試す
      - <span class="i-icon-park-outline:down-one translate-y-0.5 text-red-800 dark:text-red-400 text-lg"></span> huggingface を直接使用しましたが、効果は低く、fish speech や chatts よりも安定していますが、トーンが平坦すぎて、アニメのトーンには LoRA が必要かもしれません
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">実験</span> CosyVoice (Alibaba) を試す
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">実験</span> [Koemotion](https://koemotion.rinna.co.jp/)
   - [ ] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">実験</span> [Seed-TTS](https://bytedancespeech.github.io/seedtts_tech_report/)

### 表情 (2024年7月9日)

- [x] <span class="text-sm px-1 py-0.5 border border-solid border-purple-500/30 text-purple-800 dark:text-purple-400 bg-purple-500/20 rounded-lg">実験</span> 埋め込み命令を通じてリアルタイムで表情を素早く処理する方法について GPT と議論しました https://poe.com/s/vu7foBWJHtnPmWzJNeAy (2024年7月7日)
- [x] フロントエンド Live2D 表情制御 (2024年7月9日)
  - [x] `<|EMOTE_HAPPY|>` のエンコードを通じて実装
  - [x] `<|DELAY:1|>` のような遅延構文の追加サポート
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">機能</span> 感情トークン `<|EMOTE_.*|>` パーサーとトークナイザーをカプセル化
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">機能</span> キューイングされたストリーミング処理をサポート、`useEmotionMessagesQueue` と `useEmotionsQueue` をカプセル化
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">機能</span> Live2D を呼び出してモーション表情を処理することをサポート
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">機能</span> テストデバッグページ
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">機能</span> 遅延トークン `<|DELAY:.*|>` パーサーとトークナイザーをカプセル化して、ストリーミングプロセス全体の遅延を動的に制御
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">機能</span> キューイングされたストリーミング処理をサポート、`useDelaysQueue` をカプセル化
    - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">機能</span> テストデバッグページ
  - [x] <span class="text-sm px-1 py-0.5 border border-solid border-green-500/30 text-green-800 dark:text-green-400 bg-green-500/20 rounded-lg">機能</span> 表示レイヤーのカプセル化は、ストリームテキストを事前にトークン化および解析して `<|...|>` 構文を除外することをサポート

### アクション

#### VRM リップシンク

##### 調査

- [ ] [sigal-raab/MoDi: Unconditional Motion Synthesis from Diverse Data](https://github.com/sigal-raab/MoDi)
- [ ] [TMR - Text-to-motion Retrieval](https://mathis.petrovich.fr/tmr/)
  - [ ] [Mathux/TMR - GitHub](https://github.com/Mathux/TMR)
- [ ] 調査時に使用したインデックスサイト
  - [ ] [Hannibal046/Awesome-LLM: Awesome-LLM: a curated list of Large Language Model](https://github.com/Hannibal046/Awesome-LLM)
- [ ] 調査時の ADHD 行動
  - [ ] 友人が NVIDIA の新しい論文 [ConsiStory: Training-Free Consistent Text-to-Image Generation](https://research.nvidia.com/labs/par/consistory/) を勧めてくれました。IPadapter よりも安定していると感じます。
- [ ] 興味深いのは [IDEA-Research/MotionLLM: [Arxiv-2024] MotionLLM: Understanding Human Behaviors from Human Motions and Videos](https://github.com/IDEA-Research/MotionLLM) です。この論文と研究方向は、ビデオアニメーションフレーム間で形成される人間のアクションを説明するために自然言語を使用することに関するものです。2024年5月31日公開。
- [ ] [Ksuriuri/EasyAIVtuber: Simply animate your 2D waifu.](https://github.com/Ksuriuri/EasyAIVtuber)
- [ ] これはかなり大きなトピックで、いくつかのキーワードを調査し、この現在の方向性における主流の研究命題を見つけました：
  - [ ] デジタルヒューマン合成 -> 仮想 WebCam モーションキャプチャ
    - [ ] [PersonaTalk: Bring Attention to Your Persona in Visual Dubbing](https://arxiv.org/pdf/2409.05379)
      - [ ] これが SOTA のようです
    - [ ] [OpenTalker/SadTalker: [CVPR 2023] SadTalker：Learning Realistic 3D Motion Coefficients for Stylized Audio-Driven Single Image Talking Face Animation](https://github.com/OpenTalker/SadTalker)
    - [ ] [Rudrabha/Wav2Lip: This repository contains the codes of "A Lip Sync Expert Is All You Need for Speech to Lip Generation In the Wild", published at ACM Multimedia 2020. For HD commercial model, please try out Sync Labs](https://github.com/Rudrabha/Wav2Lip)
    - [ ] [yerfor/GeneFace: GeneFace: Generalized and High-Fidelity 3D Talking Face Synthesis; ICLR 2023; Official code](https://github.com/yerfor/GeneFace)
    - [ ] [harlanhong/CVPR2022-DaGAN: Official code for CVPR2022 paper: Depth-Aware Generative Adversarial Network for Talking Head Video Generation](https://github.com/harlanhong/CVPR2022-DaGAN)
    - [ ] [Kedreamix/PaddleAvatar](https://github.com/Kedreamix/PaddleAvatar)
    - [ ] [yangkang2021/I_am_a_person: Real-time interactive GPT digital human](https://github.com/yangkang2021/I_am_a_person?tab=readme-ov-file)
    - [ ] [I_am_a_person/数字人/README.md at main · yangkang2021/I_am_a_person](https://github.com/yangkang2021/I_am_a_person/blob/main/%E6%95%B0%E5%AD%97%E4%BA%BA/README.md)
  - [ ] Text-to-Motion (T2M、テキストからモーションへとも呼ばれます)
    - [ ] [SuperPADL: Scaling Language-Directed Physics-Based Control with Progressive Supervised Distillation](https://arxiv.org/html/2407.10481v1)
      - [ ] NVIDIA の2024年7月1日の最新情報
      - [ ] 友人のおすすめ
    - [ ] [Generating Diverse and Natural 3D Human Motions from Text (CVPR 2022)](https://github.com/EricGuo5513/text-to-motion)
      - [ ] 論文: [Generating Diverse and Natural 3D Human Motions from Texts](https://ericguo5513.github.io/text-to-motion/)
    - [ ] 友人が自然言語ジョイント生成を行っているパートナーを勧めてくれました。彼はこれらの論文を勧めてくれました：
      - [ ] [TEMOS: Generating diverse human motions from textual descriptions (arxiv.org)](https://arxiv.org/abs/2204.14109)
      - [ ] [AvatarGPT: All-in-One Framework for Motion Understanding, Planning, Generation and Beyond](https://arxiv.org/abs/2311.16468)
      - [ ] [T2M-GPT: Generating Human Motion from Textual Descriptions with Discrete Representations](https://arxiv.org/abs/2301.06052)
    - [ ] キーフレーム制御なので、いくつかのキーフレーム関連の論文も調べました
      - [ ] [Koala: Key frame-conditioned long video-LLM](https://arxiv.org/html/2404.04346v1)
  - [ ] Code as Policies (主にロボット工学分野)
    - [ ] もちろん、先駆者はここです [Code as Policies: Language Model Programs for Embodied Control](https://code-as-policies.github.io/)
    - [ ] [Scaling Up and Distilling Down: Language-Guided Robot Skill Acquisition (columbia.edu)](https://www.cs.columbia.edu/~huy/scalingup/)
    - [ ] [CLIPort](https://cliport.github.io/)：CLIPort: What and Where Pathways for Robotic Manipulation
    - [ ] [VIMA | General Robot Manipulation with Multimodal Prompts](https://vimalabs.github.io/)：VIMA: General Robot Manipulation with Multimodal Prompts
    - [ ] [Scaling Up and Distilling Down: Language-Guided Robot Skill Acquisition](https://www.cs.columbia.edu/~huy/scalingup/)
    - [ ] [EUREKA: HUMAN-LEVEL REWARD DESIGN VIA CODING LARGE LANGUAGE MODELS](https://eureka-research.github.io/assets/eureka_paper.pdf) は要約のような感じです。
  - [ ] 強化学習 (Reinforcement Learning)
    - [ ] この方向性は主に、基礎となるロボット制御で既存の RL 学習済みモデルを組み合わせてインターフェースし、インターフェースと計算レイヤーに多くの code as policies 実装を使用しています
      - [ ] [MarI/O - Machine Learning for Video Games - YouTube](https://www.youtube.com/watch?v=qv6UVOQ0F44)
    - [ ] [RLADAPTER: BRIDGING LARGE LANGUAGE MODELS TO REINFORCEMENT LEARNING IN OPEN WORLDS](https://openreview.net/pdf?id=3s4fZTr1ce) は主に次のように述べています：RLAdapter フレームワーク内で、RL エージェントのトレーニング中に生成された情報を使用して軽量言語モデルを微調整すると、LLM がダウンストリームタスクに適応するのに大幅に役立ち、RL エージェントにより良いガイダンスを提供できます。Crafter 環境で RLAdapter 実験を評価した結果、RLAdapter は SOTA ベースラインを上回りました。さらに、私たちのフレームワークの下では、エージェントはベースラインモデルが持っていない常識的な動作を示します
    - [ ] [See and Think: Embodied Agent in Virtual Environment](https://arxiv.org/pdf/2311.15209) は、以下で言及されている Voyager、PlanMC、MP5 に似ており、これも Minecraft の研究であり、主に RL を強調していると感じます。
    - [ ] [Text2Reward: Reward Shaping with Language Models for Reinforcement Learning](https://text-to-reward.github.io/)
    - [ ] [Direct Preference Optimization: Your Language Model is Secretly a Reward Model](https://arxiv.org/pdf/2305.18290) は主に LLM 自体が報酬可能なモデルであることについて語っています。RLHF を組み合わせる方法を学べるかもしれません。トランスフォーマーにとって非常に基本的です。
  - [ ] 身体化制御 (Embodied Control)
    - [ ] ここに多く記録されています
      - [ ] [zchoi/Awesome-Embodied-Agent-with-LLMs](https://github.com/zchoi/Awesome-Embodied-Agent-with-LLMs)：これは「大規模言語モデルを使用した身体化 AI またはロボット」の研究の厳選されたリストです。最新の更新情報については、このリポジトリをご覧ください！ 🔥
    - [ ] [MP5: A Multi-modal Open-ended Embodied System in Minecraft via Active Perception](https://arxiv.org/pdf/2312.07472) これは興味深いです。比較的完全な Minecraft RL フレームワークを使用し、自然な指示を使用して LLM に「**昼間**に**草原**の**水際**で**石の剣**で**豚**を**殺す**」と伝え、RL エージェントはこれらの特徴を認識して対応する目標を達成できます。[AI に Minecraft をプレイさせる方法は？ Voyager 論文メモ](https://nolebase.ayaka.io/to/27024f5434) とは異なり、MP5 は PlanMC に似ており、Voyager の元の純粋なテキストと純粋な状態情報ではなく、マルチモーダル機能を統合しています。
      - [ ] 概要: 非常に挑戦的な Minecraft シミュレーター上に構築された、実行可能なサブゴールを分解し、複雑なコンテキスト認識計画を設計し、身体化されたアクション制御を実行し、目標条件付きのアクティブな知覚スキームと頻繁に通信できる、オープンエンドのマルチモーダル身体化システム MP5 を紹介します。具体的には、MP5 はマルチモーダル大規模言語モデル (MLLM) の最近の進歩に基づいて開発されており、システムは複数の機能モジュールに変調されており、スケジュールと連携を行って、最終的に事前定義されたコンテキストおよびプロセス関連のタスクを解決できます。
    - [ ] [CRADLE: Empowering Foundation Agents Towards General Computer Control](https://arxiv.org/pdf/2403.03186) まだ読んでいません。暇なときに読みます。
    - [ ] [Embodied Multi-Modal Agent trained by an LLM from a Parallel TextWorld](https://arxiv.org/pdf/2311.16714) は主に **並行テキスト世界で優れた LLM エージェントを使用して、視覚世界に住む VLM エージェントをトレーニングする** ことについて語っています。
    - [ ] [Online continual learning ONLINE CONTINUAL LEARNING FOR INTERACTIVE INSTRUCTION FOLLOWING AGENTS](https://openreview.net/pdf?id=7M0EzjugaN)
  - [ ] 操作 (Manipulation) (主にロボット工学分野)
  - [ ] モーション埋め込み (Motion Embeddings)
    - [ ] [PerAct](https://peract.github.io/)：非常にまれですが、code as policies と RL 環境情報に加えて操作をトークンにエンコードして計算すると言っています
  - [ ] フィードバックループ (Feedback Loop) (主にロボット工学 + 制御分野、このカテゴリは実際にはよりまれです)
    - [ ] 一般的な環境に関連している気がします。これは比較的低レベルです
    - [ ] 多分、RL を直接研究するのが役立つでしょう
    - [ ] [InCoRo: In-Context Learning for Robotics Control with Feedback Loops](https://arxiv.org/html/2402.05188v1?_immersive_translate_auto_translate=1) この論文のタイトルは魅力的ですが、まだ注意深く読んでいません。暇なときに読むことができます。多くの人が引用しています。
      - [ ] 目的は主に、自然な LLM 言語コマンドを使用して、自然言語コマンドをロボットユニットの低レベルの _静的_ 実行計画に変換することです。LLM の内部ロボットシステムを使用してこれを新しいレベルに一般化し、新しいタスクへのゼロショット一般化を可能にします。
    - [ ] 関連して、Hugging Face のオープンソース LeRobot も参考になります
      - [ ] [huggingface/lerobot: 🤗 LeRobot: End-to-end Learning for Real-World Robotics in Pytorch](https://github.com/huggingface/lerobot?tab=readme-ov-file)

### ビジョン

- [ ] [OpenGVLab/Ask-Anything: [CVPR2024 Highlight][VideoChatGPT] ChatGPT with video understanding! And many more supported LMs such as miniGPT4, StableLM, and MOSS.](https://github.com/OpenGVLab/Ask-Anything)
- [ ] [DirtyHarryLYL/LLM-in-Vision: Recent LLM-based CV and related works. Welcome to comment/contribute! (github.com)](https://github.com/DirtyHarryLYL/LLM-in-Vision)
- [ ] [landing-ai/vision-agent: Vision agent (github.com)](https://github.com/landing-ai/vision-agent)
- [ ] [2404.04834 LLM-Based Multi-Agent Systems for Software Engineering: Vision and the Road Ahead (arxiv.org)](https://arxiv.org/abs/2404.04834)
- [ ] [Experimentation: LLM, LangChain Agent, Computer Vision | by TeeTracker | Medium](https://teetracker.medium.com/experimentation-llm-langchain-agent-computer-vision-0c405deb7c6e)
- [ ] Neuro Sama はどのように画面を見て理解できるのか？
- [ ] [Is it possible to use a local LLM and have it play Minecraft? : r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/comments/143ziop/comment/jnfvr1w/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)
- [ ] [2402.07945 ScreenAgent: A Vision Language Model-driven Computer Control Agent](https://arxiv.org/abs/2402.07945)
- [ ] 大規模言語モデルにロボットを制御させるスタンフォードやベイエリアのシステムはどのように機能しているのか？
  - [ ] 直接ストリーミングトークン出力？ アクショントークン？
  - [ ] コンピュータビジョンはどのように行われているのか？
  - [ ] 宿題を写す
- [ ] [svpino/alloy-voice-assistant](https://github.com/svpino/alloy-voice-assistant)

### メモリ

- [ ] 長期記憶
- [ ] 短期記憶
