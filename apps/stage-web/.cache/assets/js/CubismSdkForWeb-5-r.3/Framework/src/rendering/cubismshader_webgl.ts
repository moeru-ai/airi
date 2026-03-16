/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMatrix44 } from '../math/cubismmatrix44';
import { CubismModel } from '../model/cubismmodel';
import { csmMap, iterator } from '../type/csmmap';
import { csmRect } from '../type/csmrectf';
import { csmVector } from '../type/csmvector';
import { CubismLogError } from '../utils/cubismdebug';
import { CubismBlendMode, CubismTextureColor } from './cubismrenderer';
import { CubismRenderer_WebGL } from './cubismrenderer_webgl';

let s_instance: CubismShaderManager_WebGL; // インスタンス（シングルトン）
const ShaderCount = 10; // シェーダーの数 = マスク生成用 + (通常用 + 加算 + 乗算) * (マスク無の乗算済アルファ対応版 + マスク有の乗算済アルファ対応版 + マスク有反転の乗算済アルファ対応版)

/**
 * WebGL用のシェーダープログラムを生成・破棄するクラス
 */
export class CubismShader_WebGL {
  /**
   * コンストラクタ
   */
  public constructor() {
    this._shaderSets = new csmVector<CubismShaderSet>();
  }

  /**
   * デストラクタ相当の処理
   */
  public release(): void {
    this.releaseShaderProgram();
  }

  /**
   * 描画用のシェーダプログラムの一連のセットアップを実行する
   * @param renderer レンダラー
   * @param model 描画対象のモデル
   * @param index 描画対象のメッシュのインデックス
   */
  public setupShaderProgramForDraw(
    renderer: CubismRenderer_WebGL,
    model: Readonly<CubismModel>,
    index: number
  ): void {
    if (!renderer.isPremultipliedAlpha()) {
      CubismLogError('NoPremultipliedAlpha is not allowed');
    }

    if (this._shaderSets.getSize() == 0) {
      this.generateShaders();
    }

    // Blending
    let srcColor: number;
    let dstColor: number;
    let srcAlpha: number;
    let dstAlpha: number;

    // _shaderSets用のオフセット計算
    const masked: boolean = renderer.getClippingContextBufferForDraw() != null; // この描画オブジェクトはマスク対象か
    const invertedMask: boolean = model.getDrawableInvertedMaskBit(index);
    const offset: number = masked ? (invertedMask ? 2 : 1) : 0;

    let shaderSet: CubismShaderSet;
    switch (model.getDrawableBlendMode(index)) {
      case CubismBlendMode.CubismBlendMode_Normal:
      default:
        shaderSet = this._shaderSets.at(
          ShaderNames.ShaderNames_NormalPremultipliedAlpha + offset
        );
        srcColor = this.gl.ONE;
        dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
        srcAlpha = this.gl.ONE;
        dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
        break;

      case CubismBlendMode.CubismBlendMode_Additive:
        shaderSet = this._shaderSets.at(
          ShaderNames.ShaderNames_AddPremultipliedAlpha + offset
        );
        srcColor = this.gl.ONE;
        dstColor = this.gl.ONE;
        srcAlpha = this.gl.ZERO;
        dstAlpha = this.gl.ONE;
        break;

      case CubismBlendMode.CubismBlendMode_Multiplicative:
        shaderSet = this._shaderSets.at(
          ShaderNames.ShaderNames_MultPremultipliedAlpha + offset
        );
        srcColor = this.gl.DST_COLOR;
        dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
        srcAlpha = this.gl.ZERO;
        dstAlpha = this.gl.ONE;
        break;
    }

    this.gl.useProgram(shaderSet.shaderProgram);

    // 頂点配列の設定
    if (renderer._bufferData.vertex == null) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);

    // 頂点配列の設定
    const vertexArray: Float32Array = model.getDrawableVertices(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    // テクスチャ頂点の設定
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const uvArray: Float32Array = model.getDrawableVertexUvs(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    if (masked) {
      this.gl.activeTexture(this.gl.TEXTURE1);

      // frameBufferに書かれたテクスチャ
      const tex: WebGLTexture = renderer
        .getClippingContextBufferForDraw()
        .getClippingManager()
        .getColorBuffer()
        .at(renderer.getClippingContextBufferForDraw()._bufferIndex);
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
      this.gl.uniform1i(shaderSet.samplerTexture1Location, 1);

      // view座標をClippingContextの座標に変換するための行列を設定
      this.gl.uniformMatrix4fv(
        shaderSet.uniformClipMatrixLocation,
        false,
        renderer.getClippingContextBufferForDraw()._matrixForDraw.getArray()
      );

      // 使用するカラーチャンネルを設定
      const channelIndex: number =
        renderer.getClippingContextBufferForDraw()._layoutChannelIndex;
      const colorChannel: CubismTextureColor = renderer
        .getClippingContextBufferForDraw()
        .getClippingManager()
        .getChannelFlagAsColor(channelIndex);
      this.gl.uniform4f(
        shaderSet.uniformChannelFlagLocation,
        colorChannel.r,
        colorChannel.g,
        colorChannel.b,
        colorChannel.a
      );
    }

    // テクスチャ設定
    const textureNo: number = model.getDrawableTextureIndex(index);
    const textureId: WebGLTexture = renderer
      .getBindedTextures()
      .getValue(textureNo);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);

    //座標変換
    const matrix4x4: CubismMatrix44 = renderer.getMvpMatrix();
    this.gl.uniformMatrix4fv(
      shaderSet.uniformMatrixLocation,
      false,
      matrix4x4.getArray()
    );

    //ベース色の取得
    const baseColor: CubismTextureColor = renderer.getModelColorWithOpacity(
      model.getDrawableOpacity(index)
    );
    const multiplyColor: CubismTextureColor = model.getMultiplyColor(index);
    const screenColor: CubismTextureColor = model.getScreenColor(index);

    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      baseColor.r,
      baseColor.g,
      baseColor.b,
      baseColor.a
    );

    this.gl.uniform4f(
      shaderSet.uniformMultiplyColorLocation,
      multiplyColor.r,
      multiplyColor.g,
      multiplyColor.b,
      multiplyColor.a
    );

    this.gl.uniform4f(
      shaderSet.uniformScreenColorLocation,
      screenColor.r,
      screenColor.g,
      screenColor.b,
      screenColor.a
    );

    // IBOを作成し、データを転送
    if (renderer._bufferData.index == null) {
      renderer._bufferData.index = this.gl.createBuffer();
    }
    const indexArray: Uint16Array = model.getDrawableVertexIndices(index);

    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      renderer._bufferData.index
    );
    this.gl.bufferData(
      this.gl.ELEMENT_ARRAY_BUFFER,
      indexArray,
      this.gl.DYNAMIC_DRAW
    );

    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }

  /**
   * マスク用のシェーダプログラムの一連のセットアップを実行する
   * @param renderer レンダラー
   * @param model 描画対象のモデル
   * @param index 描画対象のメッシュのインデックス
   */
  public setupShaderProgramForMask(
    renderer: CubismRenderer_WebGL,
    model: Readonly<CubismModel>,
    index: number
  ): void {
    if (!renderer.isPremultipliedAlpha()) {
      CubismLogError('NoPremultipliedAlpha is not allowed');
    }

    if (this._shaderSets.getSize() == 0) {
      this.generateShaders();
    }

    const shaderSet: CubismShaderSet = this._shaderSets.at(
      ShaderNames.ShaderNames_SetupMask
    );
    this.gl.useProgram(shaderSet.shaderProgram);

    // 頂点配列の設定
    if (renderer._bufferData.vertex == null) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
    const vertexArray: Float32Array = model.getDrawableVertices(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    //テクスチャ設定
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const textureNo: number = model.getDrawableTextureIndex(index);
    const textureId: WebGLTexture = renderer
      .getBindedTextures()
      .getValue(textureNo);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);

    // テクスチャ頂点の設定
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const uvArray: Float32Array = model.getDrawableVertexUvs(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    // チャンネル
    const context = renderer.getClippingContextBufferForMask();
    const channelIndex: number =
      renderer.getClippingContextBufferForMask()._layoutChannelIndex;
    const colorChannel: CubismTextureColor = renderer
      .getClippingContextBufferForMask()
      .getClippingManager()
      .getChannelFlagAsColor(channelIndex);
    this.gl.uniform4f(
      shaderSet.uniformChannelFlagLocation,
      colorChannel.r,
      colorChannel.g,
      colorChannel.b,
      colorChannel.a
    );

    this.gl.uniformMatrix4fv(
      shaderSet.uniformClipMatrixLocation,
      false,
      renderer.getClippingContextBufferForMask()._matrixForMask.getArray()
    );

    const rect: csmRect =
      renderer.getClippingContextBufferForMask()._layoutBounds;

    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      rect.x * 2.0 - 1.0,
      rect.y * 2.0 - 1.0,
      rect.getRight() * 2.0 - 1.0,
      rect.getBottom() * 2.0 - 1.0
    );

    const multiplyColor: CubismTextureColor = model.getMultiplyColor(index);
    const screenColor: CubismTextureColor = model.getScreenColor(index);

    this.gl.uniform4f(
      shaderSet.uniformMultiplyColorLocation,
      multiplyColor.r,
      multiplyColor.g,
      multiplyColor.b,
      multiplyColor.a
    );

    this.gl.uniform4f(
      shaderSet.uniformScreenColorLocation,
      screenColor.r,
      screenColor.g,
      screenColor.b,
      screenColor.a
    );

    // Blending
    const srcColor: number = this.gl.ZERO;
    const dstColor: number = this.gl.ONE_MINUS_SRC_COLOR;
    const srcAlpha: number = this.gl.ZERO;
    const dstAlpha: number = this.gl.ONE_MINUS_SRC_ALPHA;

    // IBOを作成し、データを転送
    if (renderer._bufferData.index == null) {
      renderer._bufferData.index = this.gl.createBuffer();
    }
    const indexArray: Uint16Array = model.getDrawableVertexIndices(index);

    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      renderer._bufferData.index
    );
    this.gl.bufferData(
      this.gl.ELEMENT_ARRAY_BUFFER,
      indexArray,
      this.gl.DYNAMIC_DRAW
    );

    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }

  /**
   * シェーダープログラムを解放する
   */
  public releaseShaderProgram(): void {
    for (let i = 0; i < this._shaderSets.getSize(); i++) {
      this.gl.deleteProgram(this._shaderSets.at(i).shaderProgram);
      this._shaderSets.at(i).shaderProgram = 0;
      this._shaderSets.set(i, void 0);
      this._shaderSets.set(i, null);
    }
  }

  /**
   * シェーダープログラムを初期化する
   * @param vertShaderSrc 頂点シェーダのソース
   * @param fragShaderSrc フラグメントシェーダのソース
   */
  public generateShaders(): void {
    for (let i = 0; i < ShaderCount; i++) {
      this._shaderSets.pushBack(new CubismShaderSet());
    }

    this._shaderSets.at(0).shaderProgram = this.loadShaderProgram(
      vertexShaderSrcSetupMask,
      fragmentShaderSrcsetupMask
    );

    this._shaderSets.at(1).shaderProgram = this.loadShaderProgram(
      vertexShaderSrc,
      fragmentShaderSrcPremultipliedAlpha
    );
    this._shaderSets.at(2).shaderProgram = this.loadShaderProgram(
      vertexShaderSrcMasked,
      fragmentShaderSrcMaskPremultipliedAlpha
    );
    this._shaderSets.at(3).shaderProgram = this.loadShaderProgram(
      vertexShaderSrcMasked,
      fragmentShaderSrcMaskInvertedPremultipliedAlpha
    );

    // 加算も通常と同じシェーダーを利用する
    this._shaderSets.at(4).shaderProgram = this._shaderSets.at(1).shaderProgram;
    this._shaderSets.at(5).shaderProgram = this._shaderSets.at(2).shaderProgram;
    this._shaderSets.at(6).shaderProgram = this._shaderSets.at(3).shaderProgram;

    // 乗算も通常と同じシェーダーを利用する
    this._shaderSets.at(7).shaderProgram = this._shaderSets.at(1).shaderProgram;
    this._shaderSets.at(8).shaderProgram = this._shaderSets.at(2).shaderProgram;
    this._shaderSets.at(9).shaderProgram = this._shaderSets.at(3).shaderProgram;

    // SetupMask
    this._shaderSets.at(0).attributePositionLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(0).shaderProgram,
        'a_position'
      );
    this._shaderSets.at(0).attributeTexCoordLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(0).shaderProgram,
        'a_texCoord'
      );
    this._shaderSets.at(0).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(0).shaderProgram,
      's_texture0'
    );
    this._shaderSets.at(0).uniformClipMatrixLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(0).shaderProgram,
        'u_clipMatrix'
      );
    this._shaderSets.at(0).uniformChannelFlagLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(0).shaderProgram,
        'u_channelFlag'
      );
    this._shaderSets.at(0).uniformBaseColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(0).shaderProgram,
        'u_baseColor'
      );
    this._shaderSets.at(0).uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(0).shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets.at(0).uniformScreenColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(0).shaderProgram,
        'u_screenColor'
      );

    // 通常（PremultipliedAlpha）
    this._shaderSets.at(1).attributePositionLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(1).shaderProgram,
        'a_position'
      );
    this._shaderSets.at(1).attributeTexCoordLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(1).shaderProgram,
        'a_texCoord'
      );
    this._shaderSets.at(1).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(1).shaderProgram,
      's_texture0'
    );
    this._shaderSets.at(1).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(1).shaderProgram,
      'u_matrix'
    );
    this._shaderSets.at(1).uniformBaseColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(1).shaderProgram,
        'u_baseColor'
      );
    this._shaderSets.at(1).uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(1).shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets.at(1).uniformScreenColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(1).shaderProgram,
        'u_screenColor'
      );

    // 通常（クリッピング、PremultipliedAlpha）
    this._shaderSets.at(2).attributePositionLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(2).shaderProgram,
        'a_position'
      );
    this._shaderSets.at(2).attributeTexCoordLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(2).shaderProgram,
        'a_texCoord'
      );
    this._shaderSets.at(2).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(2).shaderProgram,
      's_texture0'
    );
    this._shaderSets.at(2).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(2).shaderProgram,
      's_texture1'
    );
    this._shaderSets.at(2).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(2).shaderProgram,
      'u_matrix'
    );
    this._shaderSets.at(2).uniformClipMatrixLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        'u_clipMatrix'
      );
    this._shaderSets.at(2).uniformChannelFlagLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        'u_channelFlag'
      );
    this._shaderSets.at(2).uniformBaseColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        'u_baseColor'
      );
    this._shaderSets.at(2).uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets.at(2).uniformScreenColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        'u_screenColor'
      );

    // 通常（クリッピング・反転, PremultipliedAlpha）
    this._shaderSets.at(3).attributePositionLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(3).shaderProgram,
        'a_position'
      );
    this._shaderSets.at(3).attributeTexCoordLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(3).shaderProgram,
        'a_texCoord'
      );
    this._shaderSets.at(3).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(3).shaderProgram,
      's_texture0'
    );
    this._shaderSets.at(3).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(3).shaderProgram,
      's_texture1'
    );
    this._shaderSets.at(3).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(3).shaderProgram,
      'u_matrix'
    );
    this._shaderSets.at(3).uniformClipMatrixLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        'u_clipMatrix'
      );
    this._shaderSets.at(3).uniformChannelFlagLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        'u_channelFlag'
      );
    this._shaderSets.at(3).uniformBaseColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        'u_baseColor'
      );
    this._shaderSets.at(3).uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets.at(3).uniformScreenColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        'u_screenColor'
      );

    // 加算（PremultipliedAlpha）
    this._shaderSets.at(4).attributePositionLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(4).shaderProgram,
        'a_position'
      );
    this._shaderSets.at(4).attributeTexCoordLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(4).shaderProgram,
        'a_texCoord'
      );
    this._shaderSets.at(4).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(4).shaderProgram,
      's_texture0'
    );
    this._shaderSets.at(4).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(4).shaderProgram,
      'u_matrix'
    );
    this._shaderSets.at(4).uniformBaseColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(4).shaderProgram,
        'u_baseColor'
      );
    this._shaderSets.at(4).uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(4).shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets.at(4).uniformScreenColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(4).shaderProgram,
        'u_screenColor'
      );

    // 加算（クリッピング、PremultipliedAlpha）
    this._shaderSets.at(5).attributePositionLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(5).shaderProgram,
        'a_position'
      );
    this._shaderSets.at(5).attributeTexCoordLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(5).shaderProgram,
        'a_texCoord'
      );
    this._shaderSets.at(5).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(5).shaderProgram,
      's_texture0'
    );
    this._shaderSets.at(5).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(5).shaderProgram,
      's_texture1'
    );
    this._shaderSets.at(5).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(5).shaderProgram,
      'u_matrix'
    );
    this._shaderSets.at(5).uniformClipMatrixLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        'u_clipMatrix'
      );
    this._shaderSets.at(5).uniformChannelFlagLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        'u_channelFlag'
      );
    this._shaderSets.at(5).uniformBaseColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        'u_baseColor'
      );
    this._shaderSets.at(5).uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets.at(5).uniformScreenColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        'u_screenColor'
      );

    // 加算（クリッピング・反転、PremultipliedAlpha）
    this._shaderSets.at(6).attributePositionLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(6).shaderProgram,
        'a_position'
      );
    this._shaderSets.at(6).attributeTexCoordLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(6).shaderProgram,
        'a_texCoord'
      );
    this._shaderSets.at(6).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(6).shaderProgram,
      's_texture0'
    );
    this._shaderSets.at(6).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(6).shaderProgram,
      's_texture1'
    );
    this._shaderSets.at(6).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(6).shaderProgram,
      'u_matrix'
    );
    this._shaderSets.at(6).uniformClipMatrixLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        'u_clipMatrix'
      );
    this._shaderSets.at(6).uniformChannelFlagLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        'u_channelFlag'
      );
    this._shaderSets.at(6).uniformBaseColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        'u_baseColor'
      );
    this._shaderSets.at(6).uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets.at(6).uniformScreenColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        'u_screenColor'
      );

    // 乗算（PremultipliedAlpha）
    this._shaderSets.at(7).attributePositionLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(7).shaderProgram,
        'a_position'
      );
    this._shaderSets.at(7).attributeTexCoordLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(7).shaderProgram,
        'a_texCoord'
      );
    this._shaderSets.at(7).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(7).shaderProgram,
      's_texture0'
    );
    this._shaderSets.at(7).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(7).shaderProgram,
      'u_matrix'
    );
    this._shaderSets.at(7).uniformBaseColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(7).shaderProgram,
        'u_baseColor'
      );
    this._shaderSets.at(7).uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(7).shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets.at(7).uniformScreenColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(7).shaderProgram,
        'u_screenColor'
      );

    // 乗算（クリッピング、PremultipliedAlpha）
    this._shaderSets.at(8).attributePositionLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(8).shaderProgram,
        'a_position'
      );
    this._shaderSets.at(8).attributeTexCoordLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(8).shaderProgram,
        'a_texCoord'
      );
    this._shaderSets.at(8).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(8).shaderProgram,
      's_texture0'
    );
    this._shaderSets.at(8).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(8).shaderProgram,
      's_texture1'
    );
    this._shaderSets.at(8).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(8).shaderProgram,
      'u_matrix'
    );
    this._shaderSets.at(8).uniformClipMatrixLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        'u_clipMatrix'
      );
    this._shaderSets.at(8).uniformChannelFlagLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        'u_channelFlag'
      );
    this._shaderSets.at(8).uniformBaseColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        'u_baseColor'
      );
    this._shaderSets.at(8).uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets.at(8).uniformScreenColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        'u_screenColor'
      );

    // 乗算（クリッピング・反転、PremultipliedAlpha）
    this._shaderSets.at(9).attributePositionLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(9).shaderProgram,
        'a_position'
      );
    this._shaderSets.at(9).attributeTexCoordLocation =
      this.gl.getAttribLocation(
        this._shaderSets.at(9).shaderProgram,
        'a_texCoord'
      );
    this._shaderSets.at(9).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(9).shaderProgram,
      's_texture0'
    );
    this._shaderSets.at(9).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(9).shaderProgram,
      's_texture1'
    );
    this._shaderSets.at(9).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(9).shaderProgram,
      'u_matrix'
    );
    this._shaderSets.at(9).uniformClipMatrixLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        'u_clipMatrix'
      );
    this._shaderSets.at(9).uniformChannelFlagLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        'u_channelFlag'
      );
    this._shaderSets.at(9).uniformBaseColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        'u_baseColor'
      );
    this._shaderSets.at(9).uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets.at(9).uniformScreenColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        'u_screenColor'
      );
  }

  /**
   * シェーダプログラムをロードしてアドレスを返す
   * @param vertexShaderSource    頂点シェーダのソース
   * @param fragmentShaderSource  フラグメントシェーダのソース
   * @return シェーダプログラムのアドレス
   */
  public loadShaderProgram(
    vertexShaderSource: string,
    fragmentShaderSource: string
  ): WebGLProgram {
    // Create Shader Program
    let shaderProgram: WebGLProgram = this.gl.createProgram();

    let vertShader = this.compileShaderSource(
      this.gl.VERTEX_SHADER,
      vertexShaderSource
    );

    if (!vertShader) {
      CubismLogError('Vertex shader compile error!');
      return 0;
    }

    let fragShader = this.compileShaderSource(
      this.gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );
    if (!fragShader) {
      CubismLogError('Vertex shader compile error!');
      return 0;
    }

    // Attach vertex shader to program
    this.gl.attachShader(shaderProgram, vertShader);

    // Attach fragment shader to program
    this.gl.attachShader(shaderProgram, fragShader);

    // link program
    this.gl.linkProgram(shaderProgram);
    const linkStatus = this.gl.getProgramParameter(
      shaderProgram,
      this.gl.LINK_STATUS
    );

    // リンクに失敗したらシェーダーを削除
    if (!linkStatus) {
      CubismLogError('Failed to link program: {0}', shaderProgram);

      this.gl.deleteShader(vertShader);
      vertShader = 0;

      this.gl.deleteShader(fragShader);
      fragShader = 0;

      if (shaderProgram) {
        this.gl.deleteProgram(shaderProgram);
        shaderProgram = 0;
      }

      return 0;
    }

    // Release vertex and fragment shaders.
    this.gl.deleteShader(vertShader);
    this.gl.deleteShader(fragShader);

    return shaderProgram;
  }

  /**
   * シェーダープログラムをコンパイルする
   * @param shaderType シェーダタイプ(Vertex/Fragment)
   * @param shaderSource シェーダソースコード
   *
   * @return コンパイルされたシェーダープログラム
   */
  public compileShaderSource(
    shaderType: GLenum,
    shaderSource: string
  ): WebGLProgram {
    const source: string = shaderSource;

    const shader: WebGLProgram = this.gl.createShader(shaderType);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!shader) {
      const log: string = this.gl.getShaderInfoLog(shader);
      CubismLogError('Shader compile log: {0} ', log);
    }

    const status: any = this.gl.getShaderParameter(
      shader,
      this.gl.COMPILE_STATUS
    );
    if (!status) {
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  public setGl(gl: WebGLRenderingContext): void {
    this.gl = gl;
  }

  _shaderSets: csmVector<CubismShaderSet>; // ロードしたシェーダープログラムを保持する変数
  gl: WebGLRenderingContext; // webglコンテキスト
}

/**
 * GLContextごとにCubismShader_WebGLを確保するためのクラス
 * シングルトンなクラスであり、CubismShaderManager_WebGL.getInstanceからアクセスする。
 */
export class CubismShaderManager_WebGL {
  /**
   * インスタンスを取得する（シングルトン）
   * @return インスタンス
   */
  public static getInstance(): CubismShaderManager_WebGL {
    if (s_instance == null) {
      s_instance = new CubismShaderManager_WebGL();
    }
    return s_instance;
  }

  /**
   * インスタンスを開放する（シングルトン）
   */
  public static deleteInstance(): void {
    if (s_instance) {
      s_instance.release();
      s_instance = null;
    }
  }

  /**
   * Privateなコンストラクタ
   */
  private constructor() {
    this._shaderMap = new csmMap<WebGLRenderingContext, CubismShader_WebGL>();
  }

  /**
   * デストラクタ相当の処理
   */
  public release(): void {
    for (
      const ite: iterator<WebGLRenderingContext, CubismShader_WebGL> =
        this._shaderMap.begin();
      ite.notEqual(this._shaderMap.end());
      ite.preIncrement()
    ) {
      ite.ptr().second.release();
    }
    this._shaderMap.clear();
  }

  /**
   * GLContextをキーにShaderを取得する
   * @param gl
   * @returns
   */
  public getShader(gl: WebGLRenderingContext): CubismShader_WebGL {
    return this._shaderMap.getValue(gl);
  }

  /**
   * GLContextを登録する
   * @param gl
   */
  public setGlContext(gl: WebGLRenderingContext): void {
    if (!this._shaderMap.isExist(gl)) {
      const instance = new CubismShader_WebGL();
      instance.setGl(gl);
      this._shaderMap.setValue(gl, instance);
    }
  }

  /**
   * GLContextごとのShaderを保持する変数
   */
  private _shaderMap: csmMap<WebGLRenderingContext, CubismShader_WebGL>;
}

/**
 * CubismShader_WebGLのインナークラス
 */
export class CubismShaderSet {
  shaderProgram: WebGLProgram; // シェーダープログラムのアドレス
  attributePositionLocation: GLuint; // シェーダープログラムに渡す変数のアドレス（Position）
  attributeTexCoordLocation: GLuint; // シェーダープログラムに渡す変数のアドレス（TexCoord）
  uniformMatrixLocation: WebGLUniformLocation; // シェーダープログラムに渡す変数のアドレス（Matrix）
  uniformClipMatrixLocation: WebGLUniformLocation; // シェーダープログラムに渡す変数のアドレス（ClipMatrix）
  samplerTexture0Location: WebGLUniformLocation; // シェーダープログラムに渡す変数のアドレス（Texture0）
  samplerTexture1Location: WebGLUniformLocation; // シェーダープログラムに渡す変数のアドレス（Texture1）
  uniformBaseColorLocation: WebGLUniformLocation; // シェーダープログラムに渡す変数のアドレス（BaseColor）
  uniformChannelFlagLocation: WebGLUniformLocation; // シェーダープログラムに渡す変数のアドレス（ChannelFlag）
  uniformMultiplyColorLocation: WebGLUniformLocation; // シェーダープログラムに渡す変数のアドレス（MultiplyColor）
  uniformScreenColorLocation: WebGLUniformLocation; // シェーダープログラムに渡す変数のアドレス（ScreenColor）
}

export enum ShaderNames {
  // SetupMask
  ShaderNames_SetupMask,

  // Normal
  ShaderNames_NormalPremultipliedAlpha,
  ShaderNames_NormalMaskedPremultipliedAlpha,
  ShaderNames_NomralMaskedInvertedPremultipliedAlpha,

  // Add
  ShaderNames_AddPremultipliedAlpha,
  ShaderNames_AddMaskedPremultipliedAlpha,
  ShaderNames_AddMaskedPremultipliedAlphaInverted,

  // Mult
  ShaderNames_MultPremultipliedAlpha,
  ShaderNames_MultMaskedPremultipliedAlpha,
  ShaderNames_MultMaskedPremultipliedAlphaInverted
}

export const vertexShaderSrcSetupMask =
  'attribute vec4     a_position;' +
  'attribute vec2     a_texCoord;' +
  'varying vec2       v_texCoord;' +
  'varying vec4       v_myPos;' +
  'uniform mat4       u_clipMatrix;' +
  'void main()' +
  '{' +
  '   gl_Position = u_clipMatrix * a_position;' +
  '   v_myPos = u_clipMatrix * a_position;' +
  '   v_texCoord = a_texCoord;' +
  '   v_texCoord.y = 1.0 - v_texCoord.y;' +
  '}';

export const fragmentShaderSrcsetupMask =
  'precision mediump float;' +
  'varying vec2       v_texCoord;' +
  'varying vec4       v_myPos;' +
  'uniform vec4       u_baseColor;' +
  'uniform vec4       u_channelFlag;' +
  'uniform sampler2D  s_texture0;' +
  'void main()' +
  '{' +
  '   float isInside = ' +
  '       step(u_baseColor.x, v_myPos.x/v_myPos.w)' +
  '       * step(u_baseColor.y, v_myPos.y/v_myPos.w)' +
  '       * step(v_myPos.x/v_myPos.w, u_baseColor.z)' +
  '       * step(v_myPos.y/v_myPos.w, u_baseColor.w);' +
  '   gl_FragColor = u_channelFlag * texture2D(s_texture0, v_texCoord).a * isInside;' +
  '}';

//----- バーテックスシェーダプログラム -----
// Normal & Add & Mult 共通
export const vertexShaderSrc =
  'attribute vec4     a_position;' + //v.vertex
  'attribute vec2     a_texCoord;' + //v.texcoord
  'varying vec2       v_texCoord;' + //v2f.texcoord
  'uniform mat4       u_matrix;' +
  'void main()' +
  '{' +
  '   gl_Position = u_matrix * a_position;' +
  '   v_texCoord = a_texCoord;' +
  '   v_texCoord.y = 1.0 - v_texCoord.y;' +
  '}';

// Normal & Add & Mult 共通（クリッピングされたものの描画用）
export const vertexShaderSrcMasked =
  'attribute vec4     a_position;' +
  'attribute vec2     a_texCoord;' +
  'varying vec2       v_texCoord;' +
  'varying vec4       v_clipPos;' +
  'uniform mat4       u_matrix;' +
  'uniform mat4       u_clipMatrix;' +
  'void main()' +
  '{' +
  '   gl_Position = u_matrix * a_position;' +
  '   v_clipPos = u_clipMatrix * a_position;' +
  '   v_texCoord = a_texCoord;' +
  '   v_texCoord.y = 1.0 - v_texCoord.y;' +
  '}';

//----- フラグメントシェーダプログラム -----
// Normal & Add & Mult 共通 （PremultipliedAlpha）
export const fragmentShaderSrcPremultipliedAlpha =
  'precision mediump float;' +
  'varying vec2       v_texCoord;' + //v2f.texcoord
  'uniform vec4       u_baseColor;' +
  'uniform sampler2D  s_texture0;' + //_MainTex
  'uniform vec4       u_multiplyColor;' +
  'uniform vec4       u_screenColor;' +
  'void main()' +
  '{' +
  '   vec4 texColor = texture2D(s_texture0, v_texCoord);' +
  '   texColor.rgb = texColor.rgb * u_multiplyColor.rgb;' +
  '   texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);' +
  '   vec4 color = texColor * u_baseColor;' +
  '   gl_FragColor = vec4(color.rgb, color.a);' +
  '}';

// Normal （クリッピングされたものの描画用、PremultipliedAlpha兼用）
export const fragmentShaderSrcMaskPremultipliedAlpha =
  'precision mediump float;' +
  'varying vec2       v_texCoord;' +
  'varying vec4       v_clipPos;' +
  'uniform vec4       u_baseColor;' +
  'uniform vec4       u_channelFlag;' +
  'uniform sampler2D  s_texture0;' +
  'uniform sampler2D  s_texture1;' +
  'uniform vec4       u_multiplyColor;' +
  'uniform vec4       u_screenColor;' +
  'void main()' +
  '{' +
  '   vec4 texColor = texture2D(s_texture0, v_texCoord);' +
  '   texColor.rgb = texColor.rgb * u_multiplyColor.rgb;' +
  '   texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);' +
  '   vec4 col_formask = texColor * u_baseColor;' +
  '   vec4 clipMask = (1.0 - texture2D(s_texture1, v_clipPos.xy / v_clipPos.w)) * u_channelFlag;' +
  '   float maskVal = clipMask.r + clipMask.g + clipMask.b + clipMask.a;' +
  '   col_formask = col_formask * maskVal;' +
  '   gl_FragColor = col_formask;' +
  '}';

// Normal & Add & Mult 共通（クリッピングされて反転使用の描画用、PremultipliedAlphaの場合）
export const fragmentShaderSrcMaskInvertedPremultipliedAlpha =
  'precision mediump float;' +
  'varying vec2      v_texCoord;' +
  'varying vec4      v_clipPos;' +
  'uniform sampler2D s_texture0;' +
  'uniform sampler2D s_texture1;' +
  'uniform vec4      u_channelFlag;' +
  'uniform vec4      u_baseColor;' +
  'uniform vec4      u_multiplyColor;' +
  'uniform vec4      u_screenColor;' +
  'void main()' +
  '{' +
  '   vec4 texColor = texture2D(s_texture0, v_texCoord);' +
  '   texColor.rgb = texColor.rgb * u_multiplyColor.rgb;' +
  '   texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);' +
  '   vec4 col_formask = texColor * u_baseColor;' +
  '   vec4 clipMask = (1.0 - texture2D(s_texture1, v_clipPos.xy / v_clipPos.w)) * u_channelFlag;' +
  '   float maskVal = clipMask.r + clipMask.g + clipMask.b + clipMask.a;' +
  '   col_formask = col_formask * (1.0 - maskVal);' +
  '   gl_FragColor = col_formask;' +
  '}';

// Namespace definition for compatibility.
import * as $ from './cubismshader_webgl';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismShaderSet = $.CubismShaderSet;
  export type CubismShaderSet = $.CubismShaderSet;
  export const CubismShader_WebGL = $.CubismShader_WebGL;
  export type CubismShader_WebGL = $.CubismShader_WebGL;
  export const CubismShaderManager_WebGL = $.CubismShaderManager_WebGL;
  export type CubismShaderManager_WebGL = $.CubismShaderManager_WebGL;
  export const ShaderNames = $.ShaderNames;
  export type ShaderNames = $.ShaderNames;
}
