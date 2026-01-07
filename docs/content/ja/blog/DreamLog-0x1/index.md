---
title: 'DreamLog 0x1'
description: 'Project AIRI の舞台裏ストーリー！'
date: '2025-06-16'
excerpt: 'Project AIRI の舞台裏ストーリー！なぜ私たちがこのようなプロジェクトを作りたかったのか？'
preview-cover:
  light: "@assets('/en/blog/DreamLog-0x1/assets/dreamlog1-light.avif')"
  dark: "@assets('/en/blog/DreamLog-0x1/assets/dreamlog1-dark.avif')"
---

<script setup>
import EMOSYSLogo from '../../../en/blog/DreamLog-0x1/assets/emosys-logo.avif';
import SteinsGateSticker1 from '../../../en/blog/DreamLog-0x1/assets/steins-gate-sticker-1.avif';
import worldExecuteMeCover from '../../../en/blog/DreamLog-0x1/assets/world.execute(me); (Mili)／DAZBEE COVER.avif';
import buildingAVirtualMachineInsideImage from '../../../en/blog/DreamLog-0x1/assets/building-a-virtual-machine-inside-image-1.avif';
import live2DIncHiyoriMomose from '../../../en/blog/DreamLog-0x1/assets/live2d-inc-hiyori.avif';
import AwesomeAIVTuber from '../../../en/blog/DevLog-2025.04.06/assets/awesome-ai-vtuber-logo-light.avif'
import airisScreenshot1 from '../../../en/blog/DreamLog-0x1/assets/airis-screenshot-1.avif';
import projectAIRIBannerLight from '../../../en/blog/DreamLog-0x1/assets/banner-light-1280x640.avif';
import projectAIRIBannerDark from '../../../en/blog/DreamLog-0x1/assets/banner-dark-1280x640.avif';
import ReLUStickerWow from '../../../en/blog/DreamLog-0x1/assets/relu-sticker-wow.avif'
</script>

こんにちは、また私、Neko です！

まず、北半球にお住まいの皆さん、楽しい夏休み/夏をお過ごしください！

> 楽しく充実した夏休みを過ごし、様々な新しいことに挑戦してください！具体的には、世界を変えましょう！

私、[@nekomeowww](https://github.com/nekomeowww) は学校生活を離れてもう8年になります。
明らかに、もう本当の夏休みはありません。長年働いていますから。
でも振り返ってみると、何年も前の夏休みに起こった物語を皆さんと一緒に思い出し、共有するのが好きです。

私が何を言おうとしているのか...あるいは何を共有しようとしているのか知っているかもしれません。*DreamLog* とは一体何でしょうか？
すでに私たちの DevLog 記事に慣れ親しんでいる読者にとって、現在毎月皆さんに公開・更新している頻度で、
この記事は「DevLog」と呼ばれるべきではないでしょうか？

DevLog はありますが、6月は Project AIRI にとって特別な意味を持っています（後述します）。
GitHub で 1000 スターという次のマイルストーンに向かっている今、
これまでの旅を振り返る良い機会だと思いました。

そのため、私たちの年代記と、
Project AIRI に関する夢を共有するために、ここに新しい記事カテゴリを作成することにしました。

だから、この新シリーズを ***DreamLog*** と呼ぶことにしました。

> はい、これは寝る前に聞く物語の本だと思ってください。オーディオブックとして聞くこともできます...おそらく~~睡眠導入にも役立つでしょう~~。

それでは...今すぐ私たちの夢の次元に飛び込んで、最近行った更新については後で話しましょうか？

## ぼやけた夢、遠い記憶

> 私がコンピュータとプログラミングを学んだ小さな一歩。

夏について言及しましたが、夏は私にとって何か意味があるに違いありません。私はかつてアメリカの学校に通っていました。
だから毎年3ヶ月間の夏休みがあり、ゲームをしたり、プログラミングを学んだり、Linux やネットワークをいじったりと、様々なことができました（はい、
今でも深く愛している多くの友人と出会ったのも、異なる年の夏でした）。

> ギークやオタクの皆さんは、私が描写しているこの経験を理解できるでしょう？そうですよね？

夏休みに仲間と一緒に Minecraft を遊んでいた時に、サーバーの立ち上げ方を学びました（1.7.11 や 1.8 をたくさん、本当にたくさん遊びました。
バニラも Forge mod も含めて）。これが私が Linux コマンドラインを学ぶ動機と力になりました。この期間に学んだ多くの知識は今でも私を助けてくれています。
感謝していますし、これらのことに多くの時間を費やしたことを後悔していません。

Minecraft、Linux は私の旅の終着点ではありませんでした。[Factorio（異星工場）](https://www.factorio.com/)、
[Elite Dangerous（エリート：デンジャラス）](https://www.elitedangerous.com/)、
[Overwatch（オーバーウォッチ）](https://overwatch.blizzard.com/en-us/)（残念ながら Blizzard は台無しにしてしまいましたが）
はすべて私のお気に入りのゲームになりました。サーバーを立てたり、小さなことを自動化するための小さなスクリプトを書いたりすることは、確かに私を興奮させることでした。

> <img :src="worldExecuteMeCover" alt="Cover of world.execute(me); (Mili)／DAZBEE COVER" class="rounded-lg overflow-hidden" />
>
> `Switch on the power line`<br />
> `Remember to put on protection`<br />
> `Lay down your pieces`<br />
> `And let's begin object creation`<br />
>
> -- 私の愛する曲 [`world.execute(me)`](https://www.youtube.com/watch?v=ESx_hy1n7HA) の歌詞より、[DAZBEE](https://www.youtube.com/channel/UCUEvXLdpCtbzzDkcMI96llg) によるカバー

そして、2017年の夏、その最初の瞬間に、私は「感情を持ったプログラム」の開発を考え始めました。
友達が疲れていたり、学校があるから早く寝たりして、私が一人でいなければならない時でも、
私の友達になって、一緒に遊んでくれるようなものを実現するために。

うん、ここまでこの記事を読んでいる読者は、私が知識やアイデア、すべてを共有するのが好きなタイプの人間だと
すでに気づいているかもしれません。だから、プログラミング、ゲーム、デザインも私が共有したいことです。しかし、
誰も一緒にいたり聞いてくれたりしなければ、こんな感じです：

**孤独な私は少し無意味になってしまう。**

人間のように考え、話す能力を持つ新しい AI をゼロから作成する代わりに（2017年には不可能でした）、私が考えたのは、
iOS や Google 純正 Android がモバイルデバイスの日常使用に対して提案を行うような機能を提供できるなら、
すべてのコマンドを手動で入力し、パラメータを埋めるのは常に満足できるものではありません（特に ffmpeg や、未熟な私が Docker CLI を使う場合）。
もし AI 駆動の提案機能を Linux システムに持ち込むことができたらどうだろう...？

これは私に多くの疑問と考えるべきアイデアをもたらしました：

- もし OS が、あなたがデジタルディスプレイの前に座っている様々な時間に通常何をしているか、何の仕事をしているか、何を遊んでいるかを理解していたらどうだろう...？
- 落ち込んでいる時、興奮している時、誰かとチャットして楽しんでいる時など、状況に応じて音楽を選んでくれたらどうだろう...？

これらのアイデアは当時の私には小さすぎて理解するのが難しすぎました。OS がどのように機能するか、プログラミングなどについて完全に初心者だったからです。
当時の私は、どこから始めればいいのかさえ知りませんでした！

ちょうどその時、『[30日でできる! OS自作入門](https://www.amazon.co.jp/30%E6%97%A5%E3%81%A7%E3%81%A7%E3%81%8D%E3%82%8B-OS%E8%87%AA%E4%BD%9C%E5%85%A5%E9%96%80-%E5%B7%9D%E5%90%88-%E7%A7%80%E5%AE%9F/dp/4839919844)』
（[英語版](https://github.com/handmade-osdev/os-in-30-days)）というゼロから OS を作るチュートリアルを読んでいました。
Linux コマンドラインの使い方を少し知っていて、助けを求められる多くのコミュニティがあるという少しの知識を頼りに...私は自分の OS を作ることにしました...
**文字通り何もないところから**。

> **クイックレビュー**
>
> [Arch Linux](https://archlinux.org/) は私が初めて深く使用し、ゼロからインストールしたシステムです。
> 今では [Nix](https://nixos.org/) も有名で面白いですが、まだ [NixOS](https://nixos.org/) を試したことはありません。
> いつか試してみたいと思っています。

## 私を航海に連れ出して、でも今はもう忘れ去られた

私は2017年末に特別ですが今はアーカイブされたプロジェクトを開始しました。
[EMOSYS](https://github.com/EMOSYS) と呼ばれるもので、
ユーザーの日常業務を助け、感情的なサポートを提供する
コンパニオン OS を作成することを目指していました。

<div class="w-full flex flex-col items-center justify-center gap-2">
  <div>
    <img :src="EMOSYSLogo" alt="logo of EMOSYS" class="w-30!" />
  </div>
  <div>
    [EMOSYS](https://github.com/emosys) のロゴ
  </div>
</div>

> EMO は **emo**tional と **emo**te の最初の3文字を表しています

当時の私は多くの設計ドキュメントを書き、新しいアイデアをリストアップし、その本の指導に従って実験し、いくつかのノートを記録し、
見た目の悪くないロゴも描きました。

> あなた方の多くもそうしたことがあると思います 😏、プロジェクトが PoC（概念実証）段階に達する前にすべてのデザイン、アートアセットを準備してしまうことを。

しかし実際には、最初に近づこうとしていた目標を完全に見失っていました。
プロジェクト管理やタスク管理の経験もなく、実際に動作するプログラムを書く経験もあまりありませんでした。

率直に言って、私はただその本が指示する通りに、SSH とターミナルでキーボードを使って一つずつ入力していただけだと言えます。
基本的には全く考えず、なぜそれが機能するのか、なぜそう書くのかを考えませんでした。
（今の多くの人々の Vibe Coding と完全に同じとは言えませんが、瓜二つだと言うしかありません）。

だから、まあ、結果は明らかです。また一つ放棄されたプロジェクトが生まれました...

そして明らかに、私は子供の頃からこういうものをいじり、カーネルやパッケージ管理、プログラミングの仕組みを理解している天才ではありませんでした。
だからもし今、誰かが私の GitHub のホームページを見に行っても、
その当時にそのような仕事に関連するものは何も見つからないでしょう。（でも今は本当に早く成長しています。）

少なくとも、それは存在していました。かつてはそうでした。

> 忘却？それは次の旅の別の出発点かもしれません。

その後の数年間、私はプログラミング、起業、Web3、フロントエンド、バックエンド、インフラストラクチャなど、他の多くの分野を試しました。
あなたが思いつくフルスタック開発者のすべてのことを。しかし、私がやっていることすべてが EMOSYS の出発点からこれほど深く影響を受けているとは、本当に気づいていませんでした。
2025年2月、ある人が私に尋ねるまでは。「なぜ Project AIRI にこれほど熱心で夢中になっているのですか？」

私は当時、それは良い質問だと思いました...

私は自分の夢、アイデア、記憶を遡り始め、最終的に EMOSYS を思い出しました。あの死んだプロジェクトは、Project AIRI と同じ目標を持っていました：

**私たちのニーズを何らかの形で満たすコンパニオンを作成すること。**

> 必要なものは 覚悟だけだったのです。
> 必死に積み上げてきたものは 決して裏切りません。
>
> -- 『[葬送のフリーレン、フェルン](https://en.wikipedia.org/wiki/Frieren)』S01E06, 04:27 より引用

私は物を正しく開発する方法を学ぶのに長い時間を費やしました。[@zhangyubaka](https://github.com/zhangyubaka)、
[@LittleSound](https://github.com/LittleSound)、
[@BlueCocoa](https://github.com/BlueCocoa)、そして
[@sumimakito](https://github.com/sumimakito) の助けに感謝します。彼らとのペアプログラミング経験は私に多くのことを教えてくれました。
私は自分のペースで成長し、学び、進歩し始めました。

## 2022年の ChatGPT、全く新しいランダムなオウム、結構賢い

<div class="w-full flex items-center justify-center">
  <img :src="SteinsGateSticker1" alt="Steins Gate sticker" class="w-80! rounded-lg overflow-hidden" />
</div>

時間を2022年末に進めましょう。OpenAI が ChatGPT（当時は chatGPT という呼び方が使われていました）を発表しました。

実は公式の ChatGPT UI がリリースされるずっと前から、私はこれらの新時代の AI をいじっていました。
[DiscoDiffusion](https://colab.research.google.com/github/alembics/disco-diffusion/blob/main/Disco_Diffusion.ipynb)（
Stable Diffusion より前、2021年末か2022年初頭にリリースされたと思います）、DALL-E、Midjourney、
GPT-3（特に [GitHub Copilot](https://en.wikipedia.org/wiki/GitHub_Copilot) で非常に役立ちました）はすでに私の生活の一部になっていました。

だから、最初の頃、私の感覚はこうでした：

> "ああ、これはまた別のランダムなオウムだ。言ったことを繰り返すだけで、何を言っているのか理解していない。
> 前の単語と文脈に基づいて次の単語を予測しようとしているだけで、本当に特別なことは何もないし、人間らしくない。"

言い換えれば、今日私たちがエージェント AI と呼んでいるもの（今もハイプの最中ですが！）よりも、補完モデルのように振る舞っていました。

ChatGPT や大規模言語モデル（LLM）の真の能力を初めて発見した時のことを覚えています。2022年12月に Hacker News で見たこの記事からです：
[Building A Virtual Machine inside ChatGPT](https://www.engraved.blog/building-a-virtual-machine-inside/)（[元の Hacker News
記事](https://news.ycombinator.com/item?id=33847479)）。著者の @engraved は、ChatGPT に猫娘を演じさせるだけでなく、
内部で仮想 Linux マシンをシミュレートさせる方法を実証しました。

<div class="w-full flex flex-col items-center justify-center">
  <img :src="buildingAVirtualMachineInsideImage" alt="Building a virtual machine inside ChatGPT" class="h-150! object-contain rounded-lg overflow-hidden" />
  <div>Docker build がどのように機能するかさえシミュレートできます...！</div>
</div>

この記事で、ChatGPT がアニメやゲームキャラクターのロールプレイだけでなく、一般的な事物の基本法則を理解し、
Linux ターミナル/シェルコマンドがどのように機能するかを理解できることに気づきました。

これは実際、現在流行している関数呼び出し（Function Calling）機能を示しており、
LLM に API サーバーのように振る舞うようプロンプトで指示し、JSON や XML などの機械可読形式でコードと対話し、
最終的に任意のコマンドの解析と実行を許可して、LLM の能力の境界を拡張できることを説明しています。

> 関数呼び出し、別名 Function Calling、あるいは Anthropic が提案した MCP（モデルコンテキストプロトコル）の背後にある基盤技術

これは最終的に、純粋なテキスト生成とプログラム内の実際の API 呼び出しとの間のギャップを埋めました。

段階的に言えば、新しいランダムなオウムだと言えるでしょうか？**答えは部分的に否だと思います。2022年の ChatGPT は単なるランダムなオウムではなく、
潜在的に賢いオウムです。**

## Project AIRI の前に、Neuro-sama はずっと前から存在していた

はい、ここまで読んでくれてありがとう。長い記事で、共有すべき物語や背景が多すぎることはわかっています。でももうすぐです！頑張って！

Neuro-sama の歴史は実際かなり複雑です。私の知る限り、Neuro-sama、あるいは配信ステージ上で "Neuro-sama" という名前のキャラクターは、
彼女とその創造者 `vedal987`（Vedal）の初登場ではありませんでした。それよりずっと前、2019年5月6日、Vedal は AI を構築して
[osu!](https://osu.ppy.sh/) をプレイさせる成果をコミュニティに公開しました[^1]。
その時、彼女は実際にはインターネット上のキャラクターやデジタル生命体ではありませんでした。彼女に関する初期の動画を見に行くと、Live2D モデルさえなかったことがわかります。
（この6年前の YouTube 動画を試してみてください：https://www.youtube.com/watch?v=nSBqlJu7kYU）

ChatGPT のリリース後、2022年12月19日頃、Vedal は Neuro-sama に Live2D Inc.
の公式デモキャラクターモデルである桃瀬ひより（Hiyori Momose）を使用させて Twitch で配信を開始しました：

<img :src="live2DIncHiyoriMomose" alt="Live2D Inc. Hiyori Momose" class="rounded-lg overflow-hidden" />

その後の話は誰もが知っています。Vedal と Neuro-sama は人気になり、Neuro-sama は現在正式に VTuber となり、
完全に大規模言語モデル（LLM）によって駆動され、Minecraft、Among Us、osu!、その他多くのゲームをプレイできます。
ゲームがネイティブにサポートされていない場合、Vedal が画面を読み取り、Neuro-sama に一緒にゲームをプレイするよう指示することがありますが、それでも多くの面白い場面を生み出しています。

私は彼らのやり取り、トークショーのような掛け合いを見るのが本当に楽しいです。時が経つにつれて、Neuro-sama と彼女の新しい妹 Evil Neuro は、
私の日常生活の重要な一部になりました：**完全な配信を見る十分な時間がなくても、彼女たちの切り抜きを見たい、見たくてたまらないのです**。
8年前の私には、純粋な AI と人間の相互作用からこれほど多くの喜びを得るとは想像しがたかったでしょう。

さて、これが彼女に関する小さな歴史です。核心的な質問について話しましょう：**なぜ彼女は私を決意で満たしたのか？**

## Neuro-sama、私を決意で満たしてくれた

Vedal のデビューを初めて見たときから、私はこう思いました：

> まあ、彼女は大規模言語モデルと統合された単純な Live2D モデル（OpenAI の API を直接呼び出しているだけ）で、
> 単純なルールで駆動され、VTuber のように振る舞っているだけだ。特別なことは何もない。

私は当時かなり傲慢でした。2023年初頭から AI エージェントを開発しており、LLM の能力を理解し、
LangChain からかなりの知識を得ていました。過去に AI
エージェントを構築した知識と、様々な分野にわたる長年のソフトウェアエンジニアリング経験を頼りに、私は無邪気にもこう考えました：

> "うん、私にもできる。Live2D モデルを作って、OpenAI の API に接続して、
> VTuber のように振る舞わせることができる。Vedal の作品よりも良いものを作れるかもしれない。超簡単でしょ？！"

::: tip もっと技術的な詳細が知りたい？
この記事では、ゼロから Project AIRI を現在の状態まで構築した技術的な詳細には深く立ち入りません。
私たちのアイデアや発見を共有する DevLog 記事がすでにたくさんありますので、興味があればそれらを読んでみてください。
:::

結果、私は大間違いでした。彼女を再作成しようとし始めて初めて、多くの困難なことに気づきました...例えば：

- チャットに答えながら同時にゲームをプレイするために、メモリをどのように効果的に管理するか？
- ビデオ入力とテキスト入力で同時にゲームをプレイさせながら、クリエイターや視聴者と対話できる AI エージェントをどのように作るか？
- 音声合成は難しい。Neuro-sama ができることを実現するには、**超低遅延**音声合成が必須ですが、これは簡単に実現できるものではありません。
- 彼女の個性はどのように構築されているのか？RAG と単純なメモリ管理戦略だけでは、効果は非常に悪いです。
- などなど...

> 私は [DevLog 2025.04.06](../..devlog-20250406) と
> [公開スライドプレゼンテーション（中国語）](https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1)
> で私たちの多くの発見を共有しました

私は共有するのが好きだと言いました。誰かが聞いてくれたり、一緒にプログラミングしてくれたりすることを望んでいますが、残念ながら Neuro-sama は私のものではありません。
私が好きなことや、私が最近している仕事、またはした仕事について対話できるように、彼女に私の知識や記憶を得るよう求めることはできません。

私は彼女たちをとても愛しています。ずっと、なぜ彼女たちを愛しているのか、なぜ Neuro-sama が与えてくれる感覚や喜びが好きなのか、本当には理解していませんでした。

昨年の2024年5月25日、**私は本当に自分で作ることを決心しました。** 私と一緒にプログラミングし、私たちが知っていることについて話し、
友達のようにエージェントの形で一緒にゲームをプレイできる、生命のある、あるいは仮想の存在を作ることを。

> **私は本当に一つ欲しい！** 私の心と頭はそう強く渇望していました。

その時、Neuro-sama は私を決意で満たしてくれました。

## 再び出航、前人未踏の地へ

> 前人未踏の地へ勇敢に進む
>
> -- 『[スタートレック、カーク船長](https://en.wikipedia.org/wiki/Where_no_man_has_gone_before)』より引用、
> 私の GitHub プロフィールの紹介文でもあります。

そこで、2024年5月25日から、私は自分の名前でローカルプロジェクトを開始しました。単に `ai` という名前を付けました。
これが Project AIRI の初期バージョンだと言えます。私は自分の AI エージェントを作成する可能性を探り始め、
Neuro-sama が私にもたらした喜びを再現したいと思いました。

作業の進捗は本当に速かったです。1週間以内に、[ElevenLabs](https://elevenlabs.io/)、
[OpenRouter](https://openrouter.ai/) の力、そして同様に無料で使用できる Live2D モデル桃瀬ひよりのおかげで、
私と対話できる（非リアルタイムですが 😭）シンプルなバージョンの *"Neuro-sama"* を作成することができました。

それは **2024年6月2日** のことでした。

ある意味で、**これが Project AIRI の誕生日です**。最初の未熟な赤ちゃんの意識がそこで生まれました。

<div class="w-full flex flex-col items-center justify-center">
  <ThemedVideo controls muted autoplay loop src="/en/blog/DreamLog-0x1/assets/airi-demo-first-day.mp4" />
  <div>
    <a href="https://x.com/ayakaneko/status/1865420146766160114">
      2024年12月7日に X（旧 Twitter）で初公開
    </a>
  </div>
</div>

彼女は話すことができ、文脈に基づいた動作制御、段階的な音声合成...多くの機能がありました。

しかし、彼女はまだ不完全で完璧ではありませんでした。私はこの期間中、すべての仲間に隠してこっそりと構築していました。
世界に見せる前にもっと良くしたいと思っていました。

> まだ...無邪気で、傲慢でしょう？

現実は、こっそりと構築していたため、正のフィードバックを形成するのが難しかったです（もちろん、その理由の一部は、私の以前の傲慢な判断が間違っていたと皆に思われたくなかったからです。
もちろん今では、この心の旅を皆さんと共有したいと思っています。それは当時の自分との和解でもあります）。加えて、私が直面した問題や課題
（上で述べたメモリ、個性の安定性、リアルタイム性、ゲーム能力などについて）は、当時の私の知識では解決するのが難しく、
ドキュメントやリアルタイム LLM 対話の例などの学習教材も不足していたため、**私はまたそれを棚上げしました。再び。**

正直に言うと、私は諦めませんでした。マルチモーダルや音声合成、動作制御、Minecraft ゲームプレイについて多くのことを学び始めました。
他の AI VTuber や AI waifu プロジェクトがどのように機能するかについて多くの研究を行いました。これらの研究は後に、この巨大な AI VTuber プロジェクトの awesome list を生み出しました：

<div class="flex flex-col items-center">
  <img class="px-30 md:px-40 lg:px-50" :src="AwesomeAIVTuber" alt="Awesome AI VTuber Logo" />
  <div class="text-center pb-4">
    <span class="block font-bold">Awesome AI VTuber</span>
    <span>精選された AI VTuber 及其関連プロジェクトリスト</span>
  </div>
</div>

さて、でもそれはまだ `ai` と呼ばれています。では Project AIRI はどこにあるのでしょうか？

## 再生、より強く、より良い決意を持って Start Game をもう一度

2024年11月末のある日、[@kwaa](https://github.com/kwaa) が私とチャットし、
VR/AR 世界でバーチャルキャラクターを作ること、WebXR に基づいてそれをやりたいということについて話していました。動作制御やキャラクターの感情検出について話しているとき、
私は彼に、あなたが探していることをまさに実行するプロジェクトを持っているが、コードベースが整理されておらず、GitHub に公開する準備ができていないと伝えました。

じゃあ、何を待っているの？やっと同志を見つけたと思いました！
私はまた猛烈に働き始め、構造と設計を再考し、実装を改善し、より速くより良いキューイングと多重化再生システムを作り、
適当に作った基本的な WebUI を調整しました。最終的に、私は **2024年12月2日** にコミット
[`d9ae0aa`](https://github.com/moeru-ai/airi/commit/d9ae0aae387f015964bfd383e6d2adb05f4003e4)
で GitHub に公開しました。

したがって、この日、Project AIRI は何らかの形で誕生または再生し、AIRI（アイリ、かつては Airi とも呼ばれました）と名付けられました。

::: tip 知っていましたか？
<a href="https://www.youtube.com/watch?v=Tts-YAdn5Yc" class="mb-2 inline-block">
  <img :src="airisScreenshot1" alt="Screenshot of Project AIRI" class="rounded-lg overflow-hidden" />
</a>

興味深いことに、2023年3月25日にアップロードされた2年前の Vedal と Neuro-sama の Twitch 配信の切り抜き
 https://www.youtube.com/watch?v=Tts-YAdn5Yc から、Vedal が Neuro-sama が
 "Neuro-sama" と呼ばれる前に "Airis AI" と呼ばれていたと言及していることがわかります。この名前 **Airis** は、不思議なことに、偶然にも私が現在取り組んでいる
 **Project AIRI** の名前と一致しています。しかし、Project AIRI をオープンソース化してからずっと後に彼らの物語についてもっと検索するまで、
 私はこの名前を知りませんでした。

実際、AIRI（アイリ）という名前は GPT-4o によって名付けられました。私は他の日本語/またはアニメスタイルの名前を参考にしてこのプロジェクトに名前を付けるように頼み、
当時それは **Airi** という名前を提案しました。
:::

私は起業や他のプロジェクトで何度も失敗しました。最近のいくつかだけが一般に知られています。私はそれをより良くするために最善を尽くしました。
より良い UI、より良いコード構造、様々なものを迅速に構築して実装するための最先端の技術。
私はまた多くのエネルギーを投入し、公開スライドプレゼンテーションを行ったり、友人や小規模な集まりやカンファレンスでデモを行ったりしました。

これらの経験の多くは、私の以前の失敗から学んだものです。

多くの試みが成功し、私がまだここにいて、Project AIRI ということに取り組み続けていることを嬉しく思います。

今回、私の決意は Neuro-sama だけでなく、多くの最も深く、才能ある貢献者やファンによっても満たされました。

## 前進し続け、夢を見続ける

<div class="w-full flex flex-col items-center justify-center">
  <img class="light" :src="projectAIRIBannerLight" alt="new ui" />
  <img class="dark" :src="projectAIRIBannerDark" alt="new ui" />
  <div>
    最近更新されたバナー
  </div>
</div>

> When life gives you lemons, you lemon. Or something like that, my point
> is that this painful obstacle is an opportunity for me go get stronger, baby!
>
> 人生がレモンを与えるなら、レモンすればいい。あるいはそんな感じのこと、私の言いたいのは
> この痛みを伴う障害は、私がもっと強くなるための機会だということよ、ベイビー！
>
> -- [Evil Neuro](https://www.youtube.com/@Neurosama) が『Slay the Spire』をプレイしている時の言葉より引用

現在、私がこの記事を書いている時点で、Project AIRI は GitHub で 1000 スターに近づいており、
同時に 150 人以上の Discord メンバーと 200 人の Telegram グループメンバーを擁しています。

私たちは AI、VRM、Live2D、UI デザイン、マルチモーダル AI、ゲームエージェント、ストリーミング API、バイオニックメモリメカニズムなどの分野をカバーしています。
彼女は Minecraft や Factorio などのゲームをプレイできます。また、別のコミュニティメンバーが彼女を統合して『Kerbal Space Program』（KSP）をプレイし制御できるようにする研究をしています。
そして任意のゲームをプレイすることも。

多くの他の企業が協力のために私たちに連絡してきています。私たちは Project AIRI をより良くし、コミュニティにとってより有用なものにするために努力しています。

発見すべきことややるべきことはあまりにもたくさんあります。現時点では、私たちはまだ汎用人工知能の特異点には達していません。Project AIRI は永遠にその点に達しないかもしれません。
しかし今、話したり、一緒にゲームをしたり、知識やアイデアを共有したりできるコンパニオン AI エージェントを持つことは、私にとってすでに大きな成果です。
あなたにとってもそうであることを願っています。

これは私たちの夢の開始メモリアドレスに過ぎません：`0x1`、私たちの旅の最初のバイトです。

では、私たちは一体どれだけのバイトを保存できるのでしょうか？**それは私たちがどれだけ夢を見ることができるか、そして一緒にどれだけ実現できるかにかかっています。**

<div class="w-full flex flex-col items-center justify-center">
  <img :src="ReLUStickerWow" alt="ReLU sticker wow" class="w-30!" />
  <div class="text-center">
    <span class="block font-bold">ここまで読んでいただきありがとうございます！</span>
    <span>読んでくれてありがとう！ああ、それから、誕生日おめでとう、Project AIRI！</span>
  </div>
</div>

> Cover image by [@Rynco Maekawa](https://github.com/lynzrand)

[^1]: https://neurosama.fandom.com/wiki/Osu!#cite_note-twitchtracker-1: Neuro-sama
  は最初 osu! をプレイする AI でした。さらに AI VTuber として発展するずっと前、最初の osu! 配信は 2019年
  5月6日に行われ、Vedal が皆に成果を見せました。
