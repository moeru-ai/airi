/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { LAppSubdelegate } from './lappsubdelegate';

/**
 * スプライトを実装するクラス
 *
 * テクスチャＩＤ、Rectの管理
 */
export class LAppSprite {
  /**
   * コンストラクタ
   * @param x            x座標
   * @param y            y座標
   * @param width        横幅
   * @param height       高さ
   * @param textureId    テクスチャ
   */
  public constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    textureId: WebGLTexture
  ) {
    this._rect = new Rect();
    this._rect.left = x - width * 0.5;
    this._rect.right = x + width * 0.5;
    this._rect.up = y + height * 0.5;
    this._rect.down = y - height * 0.5;
    this._texture = textureId;
    this._vertexBuffer = null;
    this._uvBuffer = null;
    this._indexBuffer = null;

    this._positionLocation = null;
    this._uvLocation = null;
    this._textureLocation = null;

    this._positionArray = null;
    this._uvArray = null;
    this._indexArray = null;

    this._firstDraw = true;
  }

  /**
   * 解放する。
   */
  public release(): void {
    this._rect = null;

    const gl = this._subdelegate.getGlManager().getGl();

    gl.deleteTexture(this._texture);
    this._texture = null;

    gl.deleteBuffer(this._uvBuffer);
    this._uvBuffer = null;

    gl.deleteBuffer(this._vertexBuffer);
    this._vertexBuffer = null;

    gl.deleteBuffer(this._indexBuffer);
    this._indexBuffer = null;
  }

  /**
   * テクスチャを返す
   */
  public getTexture(): WebGLTexture {
    return this._texture;
  }

  /**
   * 描画する。
   * @param programId シェーダープログラム
   * @param canvas 描画するキャンパス情報
   */
  public render(programId: WebGLProgram): void {
    if (this._texture == null) {
      // ロードが完了していない
      return;
    }

    const gl = this._subdelegate.getGlManager().getGl();

    // 初回描画時
    if (this._firstDraw) {
      // 何番目のattribute変数か取得
      this._positionLocation = gl.getAttribLocation(programId, 'position');
      gl.enableVertexAttribArray(this._positionLocation);

      this._uvLocation = gl.getAttribLocation(programId, 'uv');
      gl.enableVertexAttribArray(this._uvLocation);

      // 何番目のuniform変数か取得
      this._textureLocation = gl.getUniformLocation(programId, 'texture');

      // uniform属性の登録
      gl.uniform1i(this._textureLocation, 0);

      // uvバッファ、座標初期化
      {
        this._uvArray = new Float32Array([
          1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0
        ]);

        // uvバッファを作成
        this._uvBuffer = gl.createBuffer();
      }

      // 頂点バッファ、座標初期化
      {
        const maxWidth = this._subdelegate.getCanvas().width;
        const maxHeight = this._subdelegate.getCanvas().height;

        // 頂点データ
        this._positionArray = new Float32Array([
          (this._rect.right - maxWidth * 0.5) / (maxWidth * 0.5),
          (this._rect.up - maxHeight * 0.5) / (maxHeight * 0.5),
          (this._rect.left - maxWidth * 0.5) / (maxWidth * 0.5),
          (this._rect.up - maxHeight * 0.5) / (maxHeight * 0.5),
          (this._rect.left - maxWidth * 0.5) / (maxWidth * 0.5),
          (this._rect.down - maxHeight * 0.5) / (maxHeight * 0.5),
          (this._rect.right - maxWidth * 0.5) / (maxWidth * 0.5),
          (this._rect.down - maxHeight * 0.5) / (maxHeight * 0.5)
        ]);

        // 頂点バッファを作成
        this._vertexBuffer = gl.createBuffer();
      }

      // 頂点インデックスバッファ、初期化
      {
        // インデックスデータ
        this._indexArray = new Uint16Array([0, 1, 2, 3, 2, 0]);

        // インデックスバッファを作成
        this._indexBuffer = gl.createBuffer();
      }

      this._firstDraw = false;
    }

    // UV座標登録
    gl.bindBuffer(gl.ARRAY_BUFFER, this._uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this._uvArray, gl.STATIC_DRAW);

    // attribute属性を登録
    gl.vertexAttribPointer(this._uvLocation, 2, gl.FLOAT, false, 0, 0);

    // 頂点座標を登録
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this._positionArray, gl.STATIC_DRAW);

    // attribute属性を登録
    gl.vertexAttribPointer(this._positionLocation, 2, gl.FLOAT, false, 0, 0);

    // 頂点インデックスを作成
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexArray, gl.DYNAMIC_DRAW);

    // モデルの描画
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.drawElements(
      gl.TRIANGLES,
      this._indexArray.length,
      gl.UNSIGNED_SHORT,
      0
    );
  }

  /**
   * 当たり判定
   * @param pointX x座標
   * @param pointY y座標
   */
  public isHit(pointX: number, pointY: number): boolean {
    // 画面サイズを取得する。
    const { height } = this._subdelegate.getCanvas();

    // Y座標は変換する必要あり
    const y = height - pointY;

    return (
      pointX >= this._rect.left &&
      pointX <= this._rect.right &&
      y <= this._rect.up &&
      y >= this._rect.down
    );
  }

  /**
   * setter
   * @param subdelegate
   */
  public setSubdelegate(subdelegate: LAppSubdelegate): void {
    this._subdelegate = subdelegate;
  }

  _texture: WebGLTexture; // テクスチャ
  _vertexBuffer: WebGLBuffer; // 頂点バッファ
  _uvBuffer: WebGLBuffer; // uv頂点バッファ
  _indexBuffer: WebGLBuffer; // 頂点インデックスバッファ
  _rect: Rect; // 矩形

  _positionLocation: number;
  _uvLocation: number;
  _textureLocation: WebGLUniformLocation;

  _positionArray: Float32Array;
  _uvArray: Float32Array;
  _indexArray: Uint16Array;

  _firstDraw: boolean;

  private _subdelegate: LAppSubdelegate;
}

export class Rect {
  public left: number; // 左辺
  public right: number; // 右辺
  public up: number; // 上辺
  public down: number; // 下辺
}
