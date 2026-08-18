- [English](README.md)

# VRM addon for Godot Engine

このパッケージには VRM Addon として [VRM v1.0](https://github.com/vrm-c/vrm-specification/tree/master/specification) に準拠した VRM モデルのインポーターやエクスポートと、VRM を動かすためのスクリプトが含まれています。Godot Engine 4.0 stable 以降に対応しています。

[V-Sekai team](https://v-sekai.org/about) が自信を持ってお届けします。

また、VRM Addon とは別に Godot 用の MToon シェーダーも同梱されています。（MToon 単体での利用が可能です）

![Example of VRM Addon used to import two example characters](vrm_samples/screenshot/vrm_sample_screenshot.png)


VRM が持つデータは全てインポートされ、インスペクタに表示されます。ただし、ボーンアニメーション等を行う場合に[リターゲットの必要性が出てくる](https://qiita.com/TokageItLab/items/e5880123a9f508b2769d)ので、それらに関しては他のスクリプトやアドオンの導入を各自で検討して下さい。

## VRM とは？

参照：[https://vrm.dev/](https://vrm.dev/)

「VRM」は VR アプリケーション向けの人型 3D アバター（3D モデル）データを扱うためのファイルフォーマットです。[glTF 2.0](https://www.khronos.org/gltf/) をベースとしており、誰でも自由に利用することができます。

## 現在 Godot で動作する VRM の機能

VRM 1.0をインポートとエクスポートをサポートをサポートします。機能の内訳は次のとおりです。

* VRM 0.0をインポート：✅実装済み; VRM 1.0への変換します。
* VRM 1.0をインポート：✅実装済み
* VRMをエクスポート（`.vrm`）：✅実装済み, エクスポートには全部のモデルをVRM 1.0になります。
* VRM1.0の拡張子のglTFをエクスポート（`.gltf`）：✅`VRMC_node_constraint`, ✅`VRMC_materials_mtoon`
	* ⚠️ VRMC_springBoneは、`.vrm`の代わりに`.gltf`を使用することはサポートされていません。
	* ⚠️ 注意: When exporting .gltf, a clone of the scene root node is not made by Godot.
	  Because some export operations are destructive, the export process will corrupt some of your materials.
	  Please save the scene first and revert after export!

* `VRMC_materials_mtoon`：✅実装済み
* `VRMC_node_constraint`：⚠バグ: リターゲティングと️問題がある。
* `VRMC_springBone`：✅実装済み（ボーン操作最適化パッチの適用を推奨）
* `VRMC_materials_hdr_emissive`：✅実装済み
* `VRMC_vrm`：✅実装済み
	* `firstPerson`：⚠️Head hiding implemented (camera layers or runtime script needed)
	* `eyeOffset`：✅実装済み（`Head`の`BoneAttachment3D`「`LookOffset`」）
	* `lookAt`：⚠AnimationTrack として追加 (application must create `BlendSpace2D`)
	* `expressions`（気分、口形素）：
		* モーフ、ブレンドシェイプ、バインド: ✅実装済み（`BlendTree` `Add3` AnimationTrack として追加）
		* マテリアルカラー、UVオフセット: ✅実装済み（`BlendTree` `Add3` AnimationTrack として追加）
	* `humanoid`：✅実装済み (uses `%GeneralSkeleton` `SkeletonProfileHumanoid` compatible retargeting.)
	* Metadata：✅実装済み, including License information and screenshot

## Future work

* `VRMC_vrm_animation`のサポート
	* サポートされていません。Intended use: humanoid AnimationLibrary import/export.

## Godot 3.x

Godot 3.x（3.2.2 以降）は、このリポジトリの `godot3` ブランチを利用して下さい。

https://github.com/V-Sekai/godot-vrm

## 使い方

VRM Addon を addons/vrm にインストールします。**生成された VRM meta のスクリプトからパスを参照するので、決してリネームしないで下さい。**

Godot-MToon-Shader を addons/Godot-MToon-Shader にインストールします。**マテリアルからパスを参照するので、決してリネームしないで下さい。**

「プロジェクト設定」→「プラグイン」で、「VRM」と「Godot-MToon-Shader」を探し、VRM と MToon プラグインを有効にします。

## 謝辞

Godot-VRM のテストと開発にご協力頂きました [V-Sekai team](https://v-sekai.org/about) とコントリビューターの方々に感謝致します。

- [The Mirror](https://www.themirror.space/)の https://github.com/aaronfranke
- https://github.com/fire
- https://github.com/TokageItLab
- https://github.com/lyuma
- https://github.com/SaracenOne

For their extensive help testing and contributing code to Godot-VRM.

また、UniVRM、MToon、その他 VRM ツールの開発者の方々に感謝致します。

- The VRM Consortium ( https://github.com/vrm-c )
- https://github.com/Santarh
- https://github.com/ousttrue
- https://github.com/saturday06
- https://github.com/FMS-Cat
