/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismModel } from '../model/cubismmodel';
import { csmMap } from '../type/csmmap';
import { csmRect } from '../type/csmrectf';
import { csmVector } from '../type/csmvector';
import { CubismLogError } from '../utils/cubismdebug';
import { CubismClippingManager } from './cubismclippingmanager';
import { CubismClippingContext, CubismRenderer } from './cubismrenderer';
import { CubismShaderManager_WebGL } from './cubismshader_webgl';

let s_viewport: number[];
let s_fbo: WebGLFramebuffer;

/**
 * クリッピングマスクの処理を実行するクラス
 */
export class CubismClippingManager_WebGL extends CubismClippingManager<CubismClippingContext_WebGL> {
  /**
   * テンポラリのレンダーテクスチャのアドレスを取得する
   * FrameBufferObjectが存在しない場合、新しく生成する
   *
   * @return レンダーテクスチャの配列
   */
  public getMaskRenderTexture(): csmVector<WebGLFramebuffer> {
    // テンポラリのRenderTextureを取得する
    if (this._maskTexture && this._maskTexture.textures != null) {
      // 前回使ったものを返す
      this._maskTexture.frameNo = this._currentFrameNo;
    } else {
      // FrameBufferObjectが存在しない場合、新しく生成する
      if (this._maskRenderTextures != null) {
        this._maskRenderTextures.clear();
      }
      this._maskRenderTextures = new csmVector<WebGLFramebuffer>();

      // ColorBufferObjectが存在しない場合、新しく生成する
      if (this._maskColorBuffers != null) {
        this._maskColorBuffers.clear();
      }
      this._maskColorBuffers = new csmVector<WebGLTexture>();

      // クリッピングバッファサイズを取得
      const size: number = this._clippingMaskBufferSize;

      for (let index = 0; index < this._renderTextureCount; index++) {
        this._maskColorBuffers.pushBack(this.gl.createTexture()); // 直接代入
        this.gl.bindTexture(
          this.gl.TEXTURE_2D,
          this._maskColorBuffers.at(index)
        );
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          this.gl.RGBA,
          size,
          size,
          0,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
          null
        );
        this.gl.texParameteri(
          this.gl.TEXTURE_2D,
          this.gl.TEXTURE_WRAP_S,
          this.gl.CLAMP_TO_EDGE
        );
        this.gl.texParameteri(
          this.gl.TEXTURE_2D,
          this.gl.TEXTURE_WRAP_T,
          this.gl.CLAMP_TO_EDGE
        );
        this.gl.texParameteri(
          this.gl.TEXTURE_2D,
          this.gl.TEXTURE_MIN_FILTER,
          this.gl.LINEAR
        );
        this.gl.texParameteri(
          this.gl.TEXTURE_2D,
          this.gl.TEXTURE_MAG_FILTER,
          this.gl.LINEAR
        );
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);

        this._maskRenderTextures.pushBack(this.gl.createFramebuffer());
        this.gl.bindFramebuffer(
          this.gl.FRAMEBUFFER,
          this._maskRenderTextures.at(index)
        );
        this.gl.framebufferTexture2D(
          this.gl.FRAMEBUFFER,
          this.gl.COLOR_ATTACHMENT0,
          this.gl.TEXTURE_2D,
          this._maskColorBuffers.at(index),
          0
        );
      }
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, s_fbo);

      this._maskTexture = new CubismRenderTextureResource(
        this._currentFrameNo,
        this._maskRenderTextures
      );
    }

    return this._maskTexture.textures;
  }

  /**
   * WebGLレンダリングコンテキストを設定する
   * @param gl WebGLレンダリングコンテキスト
   */
  public setGL(gl: WebGLRenderingContext): void {
    this.gl = gl;
  }

  /**
   * コンストラクタ
   */
  public constructor() {
    super(CubismClippingContext_WebGL);
  }

  /**
   * クリッピングコンテキストを作成する。モデル描画時に実行する。
   * @param model モデルのインスタンス
   * @param renderer レンダラのインスタンス
   */
  public setupClippingContext(
    model: CubismModel,
    renderer: CubismRenderer_WebGL
  ): void {
    this._currentFrameNo++;

    // 全てのクリッピングを用意する
    // 同じクリップ（複数の場合はまとめて一つのクリップ）を使う場合は1度だけ設定する
    let usingClipCount = 0;
    for (
      let clipIndex = 0;
      clipIndex < this._clippingContextListForMask.getSize();
      clipIndex++
    ) {
      // 1つのクリッピングマスクに関して
      const cc: CubismClippingContext_WebGL =
        this._clippingContextListForMask.at(clipIndex);

      // このクリップを利用する描画オブジェクト群全体を囲む矩形を計算
      this.calcClippedDrawTotalBounds(model, cc);

      if (cc._isUsing) {
        usingClipCount++; // 使用中としてカウント
      }
    }

    // マスク作成処理
    if (usingClipCount > 0) {
      // 生成したFrameBufferと同じサイズでビューポートを設定
      this.gl.viewport(
        0,
        0,
        this._clippingMaskBufferSize,
        this._clippingMaskBufferSize
      );

      // 後の計算のためにインデックスの最初をセット
      this._currentMaskRenderTexture = this.getMaskRenderTexture().at(0);

      renderer.preDraw(); // バッファをクリアする

      this.setupLayoutBounds(usingClipCount);

      // ---------- マスク描画処理 ----------
      // マスク用RenderTextureをactiveにセット
      this.gl.bindFramebuffer(
        this.gl.FRAMEBUFFER,
        this._currentMaskRenderTexture
      );

      // サイズがレンダーテクスチャの枚数と合わない場合は合わせる
      if (this._clearedFrameBufferFlags.getSize() != this._renderTextureCount) {
        this._clearedFrameBufferFlags.clear();
        this._clearedFrameBufferFlags = new csmVector<boolean>(
          this._renderTextureCount
        );
      }

      // マスクのクリアフラグを毎フレーム開始時に初期化
      for (
        let index = 0;
        index < this._clearedFrameBufferFlags.getSize();
        index++
      ) {
        this._clearedFrameBufferFlags.set(index, false);
      }

      // 実際にマスクを生成する
      // 全てのマスクをどのようにレイアウトして描くかを決定し、ClipContext, ClippedDrawContextに記憶する
      for (
        let clipIndex = 0;
        clipIndex < this._clippingContextListForMask.getSize();
        clipIndex++
      ) {
        // --- 実際に1つのマスクを描く ---
        const clipContext: CubismClippingContext_WebGL =
          this._clippingContextListForMask.at(clipIndex);
        const allClipedDrawRect: csmRect = clipContext._allClippedDrawRect; // このマスクを使う、すべての描画オブジェクトの論理座標上の囲み矩形
        const layoutBoundsOnTex01: csmRect = clipContext._layoutBounds; // この中にマスクを収める
        const margin = 0.05; // モデル座標上の矩形を、適宜マージンを付けて使う
        let scaleX = 0;
        let scaleY = 0;

        // clipContextに設定したレンダーテクスチャをインデックスで取得
        const clipContextRenderTexture = this.getMaskRenderTexture().at(
          clipContext._bufferIndex
        );

        // 現在のレンダーテクスチャがclipContextのものと異なる場合
        if (this._currentMaskRenderTexture != clipContextRenderTexture) {
          this._currentMaskRenderTexture = clipContextRenderTexture;
          renderer.preDraw(); // バッファをクリアする
          // マスク用RenderTextureをactiveにセット
          this.gl.bindFramebuffer(
            this.gl.FRAMEBUFFER,
            this._currentMaskRenderTexture
          );
        }

        this._tmpBoundsOnModel.setRect(allClipedDrawRect);
        this._tmpBoundsOnModel.expand(
          allClipedDrawRect.width * margin,
          allClipedDrawRect.height * margin
        );
        //########## 本来は割り当てられた領域の全体を使わず必要最低限のサイズがよい

        // シェーダ用の計算式を求める。回転を考慮しない場合は以下のとおり
        // movePeriod' = movePeriod * scaleX + offX		  [[ movePeriod' = (movePeriod - tmpBoundsOnModel.movePeriod)*scale + layoutBoundsOnTex01.movePeriod ]]
        scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
        scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;

        // マスク生成時に使う行列を求める
        {
          // シェーダに渡す行列を求める <<<<<<<<<<<<<<<<<<<<<<<< 要最適化（逆順に計算すればシンプルにできる）
          this._tmpMatrix.loadIdentity();
          {
            // layout0..1 を -1..1に変換
            this._tmpMatrix.translateRelative(-1.0, -1.0);
            this._tmpMatrix.scaleRelative(2.0, 2.0);
          }
          {
            // view to layout0..1
            this._tmpMatrix.translateRelative(
              layoutBoundsOnTex01.x,
              layoutBoundsOnTex01.y
            );
            this._tmpMatrix.scaleRelative(scaleX, scaleY); // new = [translate][scale]
            this._tmpMatrix.translateRelative(
              -this._tmpBoundsOnModel.x,
              -this._tmpBoundsOnModel.y
            );
            // new = [translate][scale][translate]
          }
          // tmpMatrixForMaskが計算結果
          this._tmpMatrixForMask.setMatrix(this._tmpMatrix.getArray());
        }

        //--------- draw時の mask 参照用行列を計算
        {
          // シェーダに渡す行列を求める <<<<<<<<<<<<<<<<<<<<<<<< 要最適化（逆順に計算すればシンプルにできる）
          this._tmpMatrix.loadIdentity();
          {
            this._tmpMatrix.translateRelative(
              layoutBoundsOnTex01.x,
              layoutBoundsOnTex01.y
            );
            this._tmpMatrix.scaleRelative(scaleX, scaleY); // new = [translate][scale]
            this._tmpMatrix.translateRelative(
              -this._tmpBoundsOnModel.x,
              -this._tmpBoundsOnModel.y
            );
            // new = [translate][scale][translate]
          }
          this._tmpMatrixForDraw.setMatrix(this._tmpMatrix.getArray());
        }
        clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
        clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());

        const clipDrawCount: number = clipContext._clippingIdCount;
        for (let i = 0; i < clipDrawCount; i++) {
          const clipDrawIndex: number = clipContext._clippingIdList[i];

          // 頂点情報が更新されておらず、信頼性がない場合は描画をパスする
          if (
            !model.getDrawableDynamicFlagVertexPositionsDidChange(clipDrawIndex)
          ) {
            continue;
          }

          renderer.setIsCulling(
            model.getDrawableCulling(clipDrawIndex) != false
          );

          // マスクがクリアされていないなら処理する
          if (!this._clearedFrameBufferFlags.at(clipContext._bufferIndex)) {
            // マスクをクリアする
            // (仮仕様) 1が無効（描かれない）領域、0が有効（描かれる）領域。（シェーダーCd*Csで0に近い値をかけてマスクを作る。1をかけると何も起こらない）
            this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            this._clearedFrameBufferFlags.set(clipContext._bufferIndex, true);
          }

          // 今回専用の変換を適用して描く
          // チャンネルも切り替える必要がある(A,R,G,B)
          renderer.setClippingContextBufferForMask(clipContext);

          renderer.drawMeshWebGL(model, clipDrawIndex);
        }
      }

      // --- 後処理 ---
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, s_fbo); // 描画対象を戻す
      renderer.setClippingContextBufferForMask(null);

      this.gl.viewport(
        s_viewport[0],
        s_viewport[1],
        s_viewport[2],
        s_viewport[3]
      );
    }
  }

  /**
   * カラーバッファを取得する
   * @return カラーバッファ
   */
  public getColorBuffer(): csmVector<WebGLTexture> {
    return this._maskColorBuffers;
  }

  /**
   * マスクの合計数をカウント
   * @returns
   */
  public getClippingMaskCount(): number {
    return this._clippingContextListForMask.getSize();
  }

  public _currentMaskRenderTexture: WebGLFramebuffer; // マスク用レンダーテクスチャのアドレス
  public _maskRenderTextures: csmVector<WebGLFramebuffer>; // レンダーテクスチャのリスト
  public _maskColorBuffers: csmVector<WebGLTexture>; // マスク用カラーバッファーのアドレスのリスト
  public _currentFrameNo: number; // マスクテクスチャに与えるフレーム番号

  public _maskTexture: CubismRenderTextureResource; // マスク用のテクスチャリソースのリスト

  gl: WebGLRenderingContext; // WebGLレンダリングコンテキスト
}

/**
 * レンダーテクスチャのリソースを定義する構造体
 * クリッピングマスクで使用する
 */
export class CubismRenderTextureResource {
  /**
   * 引数付きコンストラクタ
   * @param frameNo レンダラーのフレーム番号
   * @param texture テクスチャのアドレス
   */
  public constructor(frameNo: number, texture: csmVector<WebGLFramebuffer>) {
    this.frameNo = frameNo;
    this.textures = texture;
  }

  public frameNo: number; // レンダラのフレーム番号
  public textures: csmVector<WebGLFramebuffer>; // テクスチャのアドレス
}

/**
 * クリッピングマスクのコンテキスト
 */
export class CubismClippingContext_WebGL extends CubismClippingContext {
  /**
   * 引数付きコンストラクタ
   */
  public constructor(
    manager: CubismClippingManager_WebGL,
    clippingDrawableIndices: Int32Array,
    clipCount: number
  ) {
    super(clippingDrawableIndices, clipCount);
    this._owner = manager;
  }

  /**
   * このマスクを管理するマネージャのインスタンスを取得する
   * @return クリッピングマネージャのインスタンス
   */
  public getClippingManager(): CubismClippingManager_WebGL {
    return this._owner;
  }

  public setGl(gl: WebGLRenderingContext): void {
    this._owner.setGL(gl);
  }

  private _owner: CubismClippingManager_WebGL; // このマスクを管理しているマネージャのインスタンス
}

export class CubismRendererProfile_WebGL {
  private setGlEnable(index: GLenum, enabled: GLboolean): void {
    if (enabled) this.gl.enable(index);
    else this.gl.disable(index);
  }

  private setGlEnableVertexAttribArray(
    index: GLuint,
    enabled: GLboolean
  ): void {
    if (enabled) this.gl.enableVertexAttribArray(index);
    else this.gl.disableVertexAttribArray(index);
  }

  public save(): void {
    if (this.gl == null) {
      CubismLogError(
        "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
      );
      return;
    }
    //-- push state --
    this._lastArrayBufferBinding = this.gl.getParameter(
      this.gl.ARRAY_BUFFER_BINDING
    );
    this._lastElementArrayBufferBinding = this.gl.getParameter(
      this.gl.ELEMENT_ARRAY_BUFFER_BINDING
    );
    this._lastProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);

    this._lastActiveTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
    this.gl.activeTexture(this.gl.TEXTURE1); //テクスチャユニット1をアクティブに（以後の設定対象とする）
    this._lastTexture1Binding2D = this.gl.getParameter(
      this.gl.TEXTURE_BINDING_2D
    );

    this.gl.activeTexture(this.gl.TEXTURE0); //テクスチャユニット0をアクティブに（以後の設定対象とする）
    this._lastTexture0Binding2D = this.gl.getParameter(
      this.gl.TEXTURE_BINDING_2D
    );

    this._lastVertexAttribArrayEnabled[0] = this.gl.getVertexAttrib(
      0,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );
    this._lastVertexAttribArrayEnabled[1] = this.gl.getVertexAttrib(
      1,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );
    this._lastVertexAttribArrayEnabled[2] = this.gl.getVertexAttrib(
      2,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );
    this._lastVertexAttribArrayEnabled[3] = this.gl.getVertexAttrib(
      3,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );

    this._lastScissorTest = this.gl.isEnabled(this.gl.SCISSOR_TEST);
    this._lastStencilTest = this.gl.isEnabled(this.gl.STENCIL_TEST);
    this._lastDepthTest = this.gl.isEnabled(this.gl.DEPTH_TEST);
    this._lastCullFace = this.gl.isEnabled(this.gl.CULL_FACE);
    this._lastBlend = this.gl.isEnabled(this.gl.BLEND);

    this._lastFrontFace = this.gl.getParameter(this.gl.FRONT_FACE);

    this._lastColorMask = this.gl.getParameter(this.gl.COLOR_WRITEMASK);

    // backup blending
    this._lastBlending[0] = this.gl.getParameter(this.gl.BLEND_SRC_RGB);
    this._lastBlending[1] = this.gl.getParameter(this.gl.BLEND_DST_RGB);
    this._lastBlending[2] = this.gl.getParameter(this.gl.BLEND_SRC_ALPHA);
    this._lastBlending[3] = this.gl.getParameter(this.gl.BLEND_DST_ALPHA);

    // モデル描画直前のFBOとビューポートを保存
    this._lastFBO = this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING);
    this._lastViewport = this.gl.getParameter(this.gl.VIEWPORT);
  }

  public restore(): void {
    if (this.gl == null) {
      CubismLogError(
        "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
      );
      return;
    }
    this.gl.useProgram(this._lastProgram);

    this.setGlEnableVertexAttribArray(0, this._lastVertexAttribArrayEnabled[0]);
    this.setGlEnableVertexAttribArray(1, this._lastVertexAttribArrayEnabled[1]);
    this.setGlEnableVertexAttribArray(2, this._lastVertexAttribArrayEnabled[2]);
    this.setGlEnableVertexAttribArray(3, this._lastVertexAttribArrayEnabled[3]);

    this.setGlEnable(this.gl.SCISSOR_TEST, this._lastScissorTest);
    this.setGlEnable(this.gl.STENCIL_TEST, this._lastStencilTest);
    this.setGlEnable(this.gl.DEPTH_TEST, this._lastDepthTest);
    this.setGlEnable(this.gl.CULL_FACE, this._lastCullFace);
    this.setGlEnable(this.gl.BLEND, this._lastBlend);

    this.gl.frontFace(this._lastFrontFace);

    this.gl.colorMask(
      this._lastColorMask[0],
      this._lastColorMask[1],
      this._lastColorMask[2],
      this._lastColorMask[3]
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this._lastArrayBufferBinding); //前にバッファがバインドされていたら破棄する必要がある
    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      this._lastElementArrayBufferBinding
    );

    this.gl.activeTexture(this.gl.TEXTURE1); //テクスチャユニット1を復元
    this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture1Binding2D);

    this.gl.activeTexture(this.gl.TEXTURE0); //テクスチャユニット0を復元
    this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture0Binding2D);

    this.gl.activeTexture(this._lastActiveTexture);

    this.gl.blendFuncSeparate(
      this._lastBlending[0],
      this._lastBlending[1],
      this._lastBlending[2],
      this._lastBlending[3]
    );
  }

  public setGl(gl: WebGLRenderingContext): void {
    this.gl = gl;
  }

  constructor() {
    this._lastVertexAttribArrayEnabled = new Array<GLboolean>(4);
    this._lastColorMask = new Array<GLboolean>(4);
    this._lastBlending = new Array<GLint>(4);
    this._lastViewport = new Array<GLint>(4);
  }

  private _lastArrayBufferBinding: GLint; ///< モデル描画直前の頂点バッファ
  private _lastElementArrayBufferBinding: GLint; ///< モデル描画直前のElementバッファ
  private _lastProgram: GLint; ///< モデル描画直前のシェーダプログラムバッファ
  private _lastActiveTexture: GLint; ///< モデル描画直前のアクティブなテクスチャ
  private _lastTexture0Binding2D: GLint; ///< モデル描画直前のテクスチャユニット0
  private _lastTexture1Binding2D: GLint; ///< モデル描画直前のテクスチャユニット1
  private _lastVertexAttribArrayEnabled: GLboolean[]; ///< モデル描画直前のテクスチャユニット1
  private _lastScissorTest: GLboolean; ///< モデル描画直前のGL_VERTEX_ATTRIB_ARRAY_ENABLEDパラメータ
  private _lastBlend: GLboolean; ///< モデル描画直前のGL_SCISSOR_TESTパラメータ
  private _lastStencilTest: GLboolean; ///< モデル描画直前のGL_STENCIL_TESTパラメータ
  private _lastDepthTest: GLboolean; ///< モデル描画直前のGL_DEPTH_TESTパラメータ
  private _lastCullFace: GLboolean; ///< モデル描画直前のGL_CULL_FACEパラメータ
  private _lastFrontFace: GLint; ///< モデル描画直前のGL_CULL_FACEパラメータ
  private _lastColorMask: GLboolean[]; ///< モデル描画直前のGL_COLOR_WRITEMASKパラメータ
  private _lastBlending: GLint[]; ///< モデル描画直前のカラーブレンディングパラメータ
  private _lastFBO: GLint; ///< モデル描画直前のフレームバッファ
  private _lastViewport: GLint[]; ///< モデル描画直前のビューポート

  gl: WebGLRenderingContext;
}

/**
 * WebGL用の描画命令を実装したクラス
 */
export class CubismRenderer_WebGL extends CubismRenderer {
  /**
   * レンダラの初期化処理を実行する
   * 引数に渡したモデルからレンダラの初期化処理に必要な情報を取り出すことができる
   *
   * @param model モデルのインスタンス
   * @param maskBufferCount バッファの生成数
   */
  public initialize(model: CubismModel, maskBufferCount = 1): void {
    if (model.isUsingMasking()) {
      this._clippingManager = new CubismClippingManager_WebGL(); // クリッピングマスク・バッファ前処理方式を初期化
      this._clippingManager.initialize(model, maskBufferCount);
    }

    this._sortedDrawableIndexList.resize(model.getDrawableCount(), 0);

    super.initialize(model); // 親クラスの処理を呼ぶ
  }

  /**
   * WebGLテクスチャのバインド処理
   * CubismRendererにテクスチャを設定し、CubismRenderer内でその画像を参照するためのIndex値を戻り値とする
   * @param modelTextureNo セットするモデルテクスチャの番号
   * @param glTextureNo WebGLテクスチャの番号
   */
  public bindTexture(modelTextureNo: number, glTexture: WebGLTexture): void {
    this._textures.setValue(modelTextureNo, glTexture);
  }

  /**
   * WebGLにバインドされたテクスチャのリストを取得する
   * @return テクスチャのリスト
   */
  public getBindedTextures(): csmMap<number, WebGLTexture> {
    return this._textures;
  }

  /**
   * クリッピングマスクバッファのサイズを設定する
   * マスク用のFrameBufferを破棄、再作成する為処理コストは高い
   * @param size クリッピングマスクバッファのサイズ
   */
  public setClippingMaskBufferSize(size: number) {
    // クリッピングマスクを利用しない場合は早期リターン
    if (!this._model.isUsingMasking()) {
      return;
    }

    // インスタンス破棄前にレンダーテクスチャの数を保存
    const renderTextureCount: number =
      this._clippingManager.getRenderTextureCount();

    // FrameBufferのサイズを変更するためにインスタンスを破棄・再作成する
    this._clippingManager.release();
    this._clippingManager = void 0;
    this._clippingManager = null;

    this._clippingManager = new CubismClippingManager_WebGL();

    this._clippingManager.setClippingMaskBufferSize(size);

    this._clippingManager.initialize(
      this.getModel(),
      renderTextureCount // インスタンス破棄前に保存したレンダーテクスチャの数
    );
  }

  /**
   * クリッピングマスクバッファのサイズを取得する
   * @return クリッピングマスクバッファのサイズ
   */
  public getClippingMaskBufferSize(): number {
    return this._model.isUsingMasking()
      ? this._clippingManager.getClippingMaskBufferSize()
      : -1;
  }

  /**
   * レンダーテクスチャの枚数を取得する
   * @return レンダーテクスチャの枚数
   */
  public getRenderTextureCount(): number {
    return this._model.isUsingMasking()
      ? this._clippingManager.getRenderTextureCount()
      : -1;
  }

  /**
   * コンストラクタ
   */
  public constructor() {
    super();
    this._clippingContextBufferForMask = null;
    this._clippingContextBufferForDraw = null;
    this._rendererProfile = new CubismRendererProfile_WebGL();
    this.firstDraw = true;
    this._textures = new csmMap<number, number>();
    this._sortedDrawableIndexList = new csmVector<number>();
    this._bufferData = {
      vertex: (WebGLBuffer = null),
      uv: (WebGLBuffer = null),
      index: (WebGLBuffer = null)
    };

    // テクスチャ対応マップの容量を確保しておく
    this._textures.prepareCapacity(32, true);
  }

  /**
   * デストラクタ相当の処理
   */
  public release(): void {
    if (this._clippingManager) {
      this._clippingManager.release();
      this._clippingManager = void 0;
      this._clippingManager = null;
    }

    if (this.gl == null) {
      return;
    }
    this.gl.deleteBuffer(this._bufferData.vertex);
    this._bufferData.vertex = null;
    this.gl.deleteBuffer(this._bufferData.uv);
    this._bufferData.uv = null;
    this.gl.deleteBuffer(this._bufferData.index);
    this._bufferData.index = null;
    this._bufferData = null;

    this._textures = null;
  }

  /**
   * モデルを描画する実際の処理
   */
  public doDrawModel(): void {
    if (this.gl == null) {
      CubismLogError(
        "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
      );
      return;
    }

    //------------ クリッピングマスク・バッファ前処理方式の場合 ------------
    if (this._clippingManager != null) {
      this.preDraw();

      if (this.isUsingHighPrecisionMask()) {
        this._clippingManager.setupMatrixForHighPrecision(
          this.getModel(),
          false
        );
      } else {
        this._clippingManager.setupClippingContext(this.getModel(), this);
      }
    }

    // 上記クリッピング処理内でも一度PreDrawを呼ぶので注意!!
    this.preDraw();

    const drawableCount: number = this.getModel().getDrawableCount();
    const renderOrder: Int32Array = this.getModel().getDrawableRenderOrders();

    // インデックスを描画順でソート
    for (let i = 0; i < drawableCount; ++i) {
      const order: number = renderOrder[i];
      this._sortedDrawableIndexList.set(order, i);
    }

    // 描画
    for (let i = 0; i < drawableCount; ++i) {
      const drawableIndex: number = this._sortedDrawableIndexList.at(i);

      // Drawableが表示状態でなければ処理をパスする
      if (!this.getModel().getDrawableDynamicFlagIsVisible(drawableIndex)) {
        continue;
      }

      const clipContext =
        this._clippingManager != null
          ? this._clippingManager
              .getClippingContextListForDraw()
              .at(drawableIndex)
          : null;

      if (clipContext != null && this.isUsingHighPrecisionMask()) {
        // 描くことになっていた
        if (clipContext._isUsing) {
          // 生成したFrameBufferと同じサイズでビューポートを設定
          this.gl.viewport(
            0,
            0,
            this._clippingManager.getClippingMaskBufferSize(),
            this._clippingManager.getClippingMaskBufferSize()
          );

          this.preDraw(); // バッファをクリアする

          // ---------- マスク描画処理 ----------
          // マスク用RenderTextureをactiveにセット
          this.gl.bindFramebuffer(
            this.gl.FRAMEBUFFER,
            clipContext
              .getClippingManager()
              .getMaskRenderTexture()
              .at(clipContext._bufferIndex)
          );

          // マスクをクリアする
          // (仮仕様) 1が無効（描かれない）領域、0が有効（描かれる）領域。（シェーダーCd*Csで0に近い値をかけてマスクを作る。1をかけると何も起こらない）
          this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
          this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        }

        {
          const clipDrawCount: number = clipContext._clippingIdCount;

          for (let index = 0; index < clipDrawCount; index++) {
            const clipDrawIndex: number = clipContext._clippingIdList[index];

            // 頂点情報が更新されておらず、信頼性がない場合は描画をパスする
            if (
              !this._model.getDrawableDynamicFlagVertexPositionsDidChange(
                clipDrawIndex
              )
            ) {
              continue;
            }

            this.setIsCulling(
              this._model.getDrawableCulling(clipDrawIndex) != false
            );

            // 今回専用の変換を適用して描く
            // チャンネルも切り替える必要がある(A,R,G,B)
            this.setClippingContextBufferForMask(clipContext);

            this.drawMeshWebGL(this._model, clipDrawIndex);
          }
        }

        {
          // --- 後処理 ---
          this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, s_fbo); // 描画対象を戻す
          this.setClippingContextBufferForMask(null);

          this.gl.viewport(
            s_viewport[0],
            s_viewport[1],
            s_viewport[2],
            s_viewport[3]
          );

          this.preDraw(); // バッファをクリアする
        }
      }

      // クリッピングマスクをセットする
      this.setClippingContextBufferForDraw(clipContext);

      this.setIsCulling(this.getModel().getDrawableCulling(drawableIndex));

      this.drawMeshWebGL(this._model, drawableIndex);
    }
  }

  /**
   * 描画オブジェクト（アートメッシュ）を描画する。
   * @param model 描画対象のモデル
   * @param index 描画対象のメッシュのインデックス
   */
  public drawMeshWebGL(model: Readonly<CubismModel>, index: number): void {
    // 裏面描画の有効・無効
    if (this.isCulling()) {
      this.gl.enable(this.gl.CULL_FACE);
    } else {
      this.gl.disable(this.gl.CULL_FACE);
    }

    this.gl.frontFace(this.gl.CCW); // Cubism SDK OpenGLはマスク・アートメッシュ共にCCWが表面

    if (this.isGeneratingMask()) {
      CubismShaderManager_WebGL.getInstance()
        .getShader(this.gl)
        .setupShaderProgramForMask(this, model, index);
    } else {
      CubismShaderManager_WebGL.getInstance()
        .getShader(this.gl)
        .setupShaderProgramForDraw(this, model, index);
    }

    {
      const indexCount: number = model.getDrawableVertexIndexCount(index);
      this.gl.drawElements(
        this.gl.TRIANGLES,
        indexCount,
        this.gl.UNSIGNED_SHORT,
        0
      );
    }

    // 後処理
    this.gl.useProgram(null);
    this.setClippingContextBufferForDraw(null);
    this.setClippingContextBufferForMask(null);
  }

  protected saveProfile(): void {
    this._rendererProfile.save();
  }

  protected restoreProfile(): void {
    this._rendererProfile.restore();
  }

  /**
   * レンダラが保持する静的なリソースを解放する
   * WebGLの静的なシェーダープログラムを解放する
   */
  public static doStaticRelease(): void {
    CubismShaderManager_WebGL.deleteInstance();
  }

  /**
   * レンダーステートを設定する
   * @param fbo アプリケーション側で指定しているフレームバッファ
   * @param viewport ビューポート
   */
  public setRenderState(fbo: WebGLFramebuffer, viewport: number[]): void {
    s_fbo = fbo;
    s_viewport = viewport;
  }

  /**
   * 描画開始時の追加処理
   * モデルを描画する前にクリッピングマスクに必要な処理を実装している
   */
  public preDraw(): void {
    if (this.firstDraw) {
      this.firstDraw = false;
    }

    this.gl.disable(this.gl.SCISSOR_TEST);
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.disable(this.gl.DEPTH_TEST);

    // カリング（1.0beta3）
    this.gl.frontFace(this.gl.CW);

    this.gl.enable(this.gl.BLEND);
    this.gl.colorMask(true, true, true, true);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null); // 前にバッファがバインドされていたら破棄する必要がある
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);

    // 異方性フィルタリングを適用する
    if (this.getAnisotropy() > 0.0 && this._extension) {
      for (let i = 0; i < this._textures.getSize(); ++i) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, this._textures.getValue(i));
        this.gl.texParameterf(
          this.gl.TEXTURE_2D,
          this._extension.TEXTURE_MAX_ANISOTROPY_EXT,
          this.getAnisotropy()
        );
      }
    }
  }

  /**
   * マスクテクスチャに描画するクリッピングコンテキストをセットする
   */
  public setClippingContextBufferForMask(clip: CubismClippingContext_WebGL) {
    this._clippingContextBufferForMask = clip;
  }

  /**
   * マスクテクスチャに描画するクリッピングコンテキストを取得する
   * @return マスクテクスチャに描画するクリッピングコンテキスト
   */
  public getClippingContextBufferForMask(): CubismClippingContext_WebGL {
    return this._clippingContextBufferForMask;
  }

  /**
   * 画面上に描画するクリッピングコンテキストをセットする
   */
  public setClippingContextBufferForDraw(
    clip: CubismClippingContext_WebGL
  ): void {
    this._clippingContextBufferForDraw = clip;
  }

  /**
   * 画面上に描画するクリッピングコンテキストを取得する
   * @return 画面上に描画するクリッピングコンテキスト
   */
  public getClippingContextBufferForDraw(): CubismClippingContext_WebGL {
    return this._clippingContextBufferForDraw;
  }

  /**
   * マスク生成時かを判定する
   * @returns 判定値
   */
  public isGeneratingMask() {
    return this.getClippingContextBufferForMask() != null;
  }

  /**
   * glの設定
   */
  public startUp(gl: WebGLRenderingContext): void {
    this.gl = gl;

    if (this._clippingManager) {
      this._clippingManager.setGL(gl);
    }

    CubismShaderManager_WebGL.getInstance().setGlContext(gl);
    this._rendererProfile.setGl(gl);

    // 異方性フィルタリングが使用できるかチェック
    this._extension =
      this.gl.getExtension('EXT_texture_filter_anisotropic') ||
      this.gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
      this.gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
  }

  _textures: csmMap<number, WebGLTexture>; // モデルが参照するテクスチャとレンダラでバインドしているテクスチャとのマップ
  _sortedDrawableIndexList: csmVector<number>; // 描画オブジェクトのインデックスを描画順に並べたリスト
  _clippingManager: CubismClippingManager_WebGL; // クリッピングマスク管理オブジェクト
  _clippingContextBufferForMask: CubismClippingContext_WebGL; // マスクテクスチャに描画するためのクリッピングコンテキスト
  _clippingContextBufferForDraw: CubismClippingContext_WebGL; // 画面上描画するためのクリッピングコンテキスト
  _rendererProfile: CubismRendererProfile_WebGL;
  firstDraw: boolean;
  _bufferData: {
    vertex: WebGLBuffer;
    uv: WebGLBuffer;
    index: WebGLBuffer;
  }; // 頂点バッファデータ
  _extension: any; // 拡張機能
  gl: WebGLRenderingContext; // webglコンテキスト
}

/**
 * レンダラが保持する静的なリソースを開放する
 */
CubismRenderer.staticRelease = (): void => {
  CubismRenderer_WebGL.doStaticRelease();
};

// Namespace definition for compatibility.
import * as $ from './cubismrenderer_webgl';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismClippingContext = $.CubismClippingContext_WebGL;
  export type CubismClippingContext = $.CubismClippingContext_WebGL;
  export const CubismClippingManager_WebGL = $.CubismClippingManager_WebGL;
  export type CubismClippingManager_WebGL = $.CubismClippingManager_WebGL;
  export const CubismRenderTextureResource = $.CubismRenderTextureResource;
  export type CubismRenderTextureResource = $.CubismRenderTextureResource;
  export const CubismRenderer_WebGL = $.CubismRenderer_WebGL;
  export type CubismRenderer_WebGL = $.CubismRenderer_WebGL;
}
