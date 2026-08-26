---
title: 開発ログ @ 2025.04.28
category: DevLog
date: 2025-04-28
---

<script setup>
import airiMcpArch from '../../../en/blog/DevLog-2025.04.28/assets/airi-mcp-arch.avif'
</script>

こんにちは、[@LemonNeko](https://github.com/LemonNekoGH) です。今日は私が皆さんと開発ストーリーを共有します。

## 日中の日常

1週間前、私は AIRI のために携帯電話に接続するための MCP サーバー [AIRI-android](https://github.com/LemonNekoGH/AIRI-android) を書きましたが、これは AIRI が Android 携帯を操作するための前半部分にすぎません。AIRI はさらに MCP サーバーと対話できる必要があります。

この2日間で後半部分を完成させ、Tauri 用のプラグイン [#144](https://github.com/moeru-ai/AIRI/pull/144) を書きました。これで AIRI は MCP サーバーと対話できるようになり、既存のすべての MCP サーバーと対話できるようになりました。

興味があれば、これら2つのビデオをご覧ください。最初に AIRI の MCP サーバー設定をデモし、次に AIRI が Android 携帯と対話する様子をデモしています。

<details>
  <summary>AIRI の MCP サーバー設定</summary>
  <ThemedVideo controls muted src="/en/blog/DevLog-2025.04.28/assets/airi-mcp-settings.mp4" style="height: 640px;" />
</details>

<details>
  <summary>AIRI が携帯電話で `Hello World` を入力</summary>
  <ThemedVideo controls muted src="/en/blog/DevLog-2025.04.28/assets/airi-mcp-input-text.mp4" />
</details>

開発中、考えを整理するために、LLM から Android 携帯を呼び出す図を描きました：

<img :src="airiMcpArch" alt="AIRI 操作手机" :style="{ height: '640px', objectFit: 'contain' }" />

次に、私の開発プロセスを共有します。

## Tauri プラグイン開発

実は最初は完全な Tauri プラグインを書くつもりはありませんでした。JavaScript 側にいくつかのコマンドを公開したかっただけでした：

```rust
#[Tauri::command]
fn list_tools() -> Vec<String> {
  // 後で実装
}
```

そしてそれらを呼び出すいくつかのツール関数を書きます：

```javascript
import { invoke } from '@Tauri-apps/api/core'

export const mcp = [
  {
    name: 'list_tools',
    description: 'List all tools',
    execute: async () => {
      return await invoke('list_tools')
    }
  }
]
```

しかしすぐに、コマンド内で MCP クライアントを使用したい場合、MCP クライアントを状態の一部として Tauri に管理させる必要があることに気づきました：

```rust
// main.rs
fn main() {
  Tauri::Builder::default()
    .setup(|app| {
      app.manage(State::new(Mutex::new::<Option<McpClient>>(None))); // 状態を管理
    })
    .run(Tauri::generate_context!())
}

// mcp.rs
#[Tauri::command]
async fn list_tools(state: State<'_, Mutex<Option<McpClient>>>) -> Result<Vec<Tool>, String> { // 引数で状態を取得できる
  // ...rest code
}
```

コマンドがあり、状態があるので、完全なプラグインまであと一歩です。そこで、プラグインにすることにしました。そうすれば公開でき、~~おそらくネット上で最初の Tauri MCP プラグインになるでしょう~~。

しかし、プラグインになった後、コマンドの呼び出し方が変わり、プラグインを通じて呼び出す必要があります：

```diff
  import { invoke } from '@Tauri-apps/api/core'

  export mcp = [
    {
      name: "list_tools",
      description: "List all tools",
      execute: async () => {
-       return await invoke("list_tools")
+       return await invoke("plugin:mcp|list_tools")
      }
    }
  ]
```

これはまあいいでしょう、1行変えるだけです。しかし、Tauri 2 には権限メカニズムがあり、`build.rs` でプラグインのコマンドを定義して、権限リストを自動生成する必要があります：

```rust
const COMMANDS: &[&str] = &[
  "list_tools",
];

fn main() {
  Tauri_plugin::Builder::new(COMMANDS).build();
}
```

これにより、ビルド時にプロジェクトのルートディレクトリに `permissions` フォルダが生成され、権限宣言や説明などが含まれます。

> ここでちょっとしたエピソードがありました。2回目のビルド時に `Tauri-plugin` のバージョンをアップグレードしたところ、新しいバージョンで生成テンプレートが変更され、いくつかのスペースが削除されたため、フォーマットされたように見えました。そこで何が「フォーマット」しているのかを探し回り、ファイルが再生成されていたことに気づくのに1時間かかりました。私の失われた1時間を記念して 🤡。

上の図によると、LLM が MCP ツールを呼び出すと、パラメータは最終的に Python 側の MCP サーバーに渡されます。`input_swipe` を例にとると：

```python
# mcp_server.py
from mcp.server.fastmcp import FastMCP
from ppadb.client import Client

mcp = FastMCP("airi-android")
adb_client = Client()

@mcp.tool()
def input_swipe(x1: int, y1: int, x2: int, y2: int, duration: int = 500):
    return adb_client.input_swipe(x1, y1, x2, y2, duration)
```

これらのパラメータをどのように渡せばよいでしょうか？Rust SDK ドキュメントには次のような [定義](https://docs.rs/rmcp/0.1.5/rmcp/model/struct.CallToolRequestParam.html) があります：

```rust
pub struct CallToolRequestParam {
    pub name: Cow<'static, str>,
    pub arguments: Option<JsonObject>,
}
```

~~わあ、JsonObject だ、助かった！~~ Tauri コマンドのパラメータは JSON にシリアル化できる任意のオブジェクトにできるので、`Map<String, Value>` を直接渡すのはどうでしょうか：

```rust
#[Tauri::command]
async fn call_tool(state: State<'_, Mutex<Option<McpClient>>>, name: String, args: Option<Map<String, Value>>) -> Result<(), ()> {
  let client = state.lock().await.unwrap();

  client.call_tool(CallToolRequestParam { name: name.into(), arguments: args }).await.unwrap();

  Ok(())
}
```

JavaScript 側では、単にオブジェクトを渡すだけです：

```javascript
import { invoke } from '@Tauri-apps/api/core'

invoke('call_tool', { name: 'input_swipe', args: { x1: 100, y1: 100, x2: 200, y2: 200, duration: 500 } })
```

超便利！

パラメータを MCP ツールに渡した後、MCP ツールの戻り値を受け取る必要があります。Tauri コマンドの戻り値も JSON にシリアル化できる任意のオブジェクトにできるので、私は諦めて、ツールの戻り値をそのまま LLM に投げることにしました。LLM がうまく処理してくれると信じています。

よし！これで Tauri プラグインができました！（え？サンプルコードがこれだけで、しかも疑似コードで完成？）

残りの内容は、いくつかの問題について皆さんと議論したいと思います。

## いくつかの問題

1. デモビデオからわかるように、会話の中で、まず AIRI にツールリストを取得させ、次にテキストを入力させました。では、初期化時にツールリストを取得し、システムプロンプトに直接追加することはできないでしょうか？
   - Cursor はそうしています。MCP サーバーを開発しているとき、ツールリストを変更するたびに、有効にするには Cursor を再起動する必要があります。
   - これを行うと柔軟性が犠牲になるかもしれませんが、一般ユーザーは頻繁にツールリストを変更するでしょうか？

2. AIRI が同時に複数の携帯電話に接続することを許可すべきでしょうか？AIRI は複数の携帯電話を使いたがるでしょうか？~~彼女はそれを使って通信詐欺をしたりしないでしょうか？~~
3. 現在の AIRI リポジトリにはすでに Tauri アプリと Tauri プラグインがあることがわかります。どのように管理するのが良いでしょうか？CI はどのように設定すべきでしょうか？Tauri プラグインの Rust 側と JavaScript 側のバージョン番号をどのように同期させるべきでしょうか？

## 将来やりたいこと

- 画像の戻り値をサポートする。そうすれば AIRI は [前回の DevLog](./DevLog-2025.04.22.md) で示した Cursor のように、視覚能力を通じて携帯電話の内容を直接見て、どのように対話するかを決定できます。
- AIRI にデバイスの使用方法を自己学習させる？デバイスごとに個別にプロンプトを書く必要がある場合、作業量は膨大になります。
- マルチ MCP サーバーサポート。結局のところ、MCP は汎用インターフェースを提供しており、AIRI がさまざまなことを行えるようにします。AIRI は携帯電話の操作だけでは満足しないでしょう。
- SSE サポート。これにより、ブラウザ内の AIRI も MCP サーバーを使用できるようになります。

これで終わりです！この DevLog がそれほど退屈でなかったことを願っています！今後ももっと面白いコンテンツをお届けしたいと思います！
