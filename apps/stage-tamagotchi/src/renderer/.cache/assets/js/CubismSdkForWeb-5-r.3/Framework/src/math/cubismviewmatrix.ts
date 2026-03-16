/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMatrix44 } from './cubismmatrix44';

/**
 * カメラの位置変更に使うと便利な4x4行列
 *
 * カメラの位置変更に使うと便利な4x4行列のクラス。
 */
export class CubismViewMatrix extends CubismMatrix44 {
  /**
   * コンストラクタ
   */
  public constructor() {
    super();
    this._screenLeft = 0.0;
    this._screenRight = 0.0;
    this._screenTop = 0.0;
    this._screenBottom = 0.0;
    this._maxLeft = 0.0;
    this._maxRight = 0.0;
    this._maxTop = 0.0;
    this._maxBottom = 0.0;
    this._maxScale = 0.0;
    this._minScale = 0.0;
  }

  /**
   * 移動を調整
   *
   * @param x X軸の移動量
   * @param y Y軸の移動量
   */
  public adjustTranslate(x: number, y: number): void {
    if (this._tr[0] * this._maxLeft + (this._tr[12] + x) > this._screenLeft) {
      x = this._screenLeft - this._tr[0] * this._maxLeft - this._tr[12];
    }

    if (this._tr[0] * this._maxRight + (this._tr[12] + x) < this._screenRight) {
      x = this._screenRight - this._tr[0] * this._maxRight - this._tr[12];
    }

    if (this._tr[5] * this._maxTop + (this._tr[13] + y) < this._screenTop) {
      y = this._screenTop - this._tr[5] * this._maxTop - this._tr[13];
    }

    if (
      this._tr[5] * this._maxBottom + (this._tr[13] + y) >
      this._screenBottom
    ) {
      y = this._screenBottom - this._tr[5] * this._maxBottom - this._tr[13];
    }

    const tr1: Float32Array = new Float32Array([
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      x,
      y,
      0.0,
      1.0
    ]);

    CubismMatrix44.multiply(tr1, this._tr, this._tr);
  }

  /**
   * 拡大率を調整
   *
   * @param cx 拡大を行うX軸の中心位置
   * @param cy 拡大を行うY軸の中心位置
   * @param scale 拡大率
   */
  public adjustScale(cx: number, cy: number, scale: number): void {
    const maxScale: number = this.getMaxScale();
    const minScale: number = this.getMinScale();

    const targetScale = scale * this._tr[0];

    if (targetScale < minScale) {
      if (this._tr[0] > 0.0) {
        scale = minScale / this._tr[0];
      }
    } else if (targetScale > maxScale) {
      if (this._tr[0] > 0.0) {
        scale = maxScale / this._tr[0];
      }
    }

    const tr1: Float32Array = new Float32Array([
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      cx,
      cy,
      0.0,
      1.0
    ]);

    const tr2: Float32Array = new Float32Array([
      scale,
      0.0,
      0.0,
      0.0,
      0.0,
      scale,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0
    ]);

    const tr3: Float32Array = new Float32Array([
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      -cx,
      -cy,
      0.0,
      1.0
    ]);

    CubismMatrix44.multiply(tr3, this._tr, this._tr);
    CubismMatrix44.multiply(tr2, this._tr, this._tr);
    CubismMatrix44.multiply(tr1, this._tr, this._tr);
  }

  /**
   * デバイスに対応する論理座養生の範囲の設定
   *
   * @param left      左辺のX軸の位置
   * @param right     右辺のX軸の位置
   * @param bottom    下辺のY軸の位置
   * @param top       上辺のY軸の位置
   */
  public setScreenRect(
    left: number,
    right: number,
    bottom: number,
    top: number
  ): void {
    this._screenLeft = left;
    this._screenRight = right;
    this._screenBottom = bottom;
    this._screenTop = top;
  }

  /**
   * デバイスに対応する論理座標上の移動可能範囲の設定
   * @param left      左辺のX軸の位置
   * @param right     右辺のX軸の位置
   * @param bottom    下辺のY軸の位置
   * @param top       上辺のY軸の位置
   */
  public setMaxScreenRect(
    left: number,
    right: number,
    bottom: number,
    top: number
  ): void {
    this._maxLeft = left;
    this._maxRight = right;
    this._maxTop = top;
    this._maxBottom = bottom;
  }

  /**
   * 最大拡大率の設定
   * @param maxScale 最大拡大率
   */
  public setMaxScale(maxScale: number): void {
    this._maxScale = maxScale;
  }

  /**
   * 最小拡大率の設定
   * @param minScale 最小拡大率
   */
  public setMinScale(minScale: number): void {
    this._minScale = minScale;
  }

  /**
   * 最大拡大率の取得
   * @return 最大拡大率
   */
  public getMaxScale(): number {
    return this._maxScale;
  }

  /**
   * 最小拡大率の取得
   * @return 最小拡大率
   */
  public getMinScale(): number {
    return this._minScale;
  }

  /**
   * 拡大率が最大になっているかを確認する
   *
   * @return true 拡大率は最大
   * @return false 拡大率は最大ではない
   */
  public isMaxScale(): boolean {
    return this.getScaleX() >= this._maxScale;
  }

  /**
   * 拡大率が最小になっているかを確認する
   *
   * @return true 拡大率は最小
   * @return false 拡大率は最小ではない
   */
  public isMinScale(): boolean {
    return this.getScaleX() <= this._minScale;
  }

  /**
   * デバイスに対応する論理座標の左辺のＸ軸位置を取得する
   * @return デバイスに対応する論理座標の左辺のX軸位置
   */
  public getScreenLeft(): number {
    return this._screenLeft;
  }

  /**
   * デバイスに対応する論理座標の右辺のＸ軸位置を取得する
   * @return デバイスに対応する論理座標の右辺のX軸位置
   */
  public getScreenRight(): number {
    return this._screenRight;
  }

  /**
   * デバイスに対応する論理座標の下辺のY軸位置を取得する
   * @return デバイスに対応する論理座標の下辺のY軸位置
   */
  public getScreenBottom(): number {
    return this._screenBottom;
  }

  /**
   * デバイスに対応する論理座標の上辺のY軸位置を取得する
   * @return デバイスに対応する論理座標の上辺のY軸位置
   */
  public getScreenTop(): number {
    return this._screenTop;
  }

  /**
   * 左辺のX軸位置の最大値の取得
   * @return 左辺のX軸位置の最大値
   */
  public getMaxLeft(): number {
    return this._maxLeft;
  }

  /**
   * 右辺のX軸位置の最大値の取得
   * @return 右辺のX軸位置の最大値
   */
  public getMaxRight(): number {
    return this._maxRight;
  }

  /**
   * 下辺のY軸位置の最大値の取得
   * @return 下辺のY軸位置の最大値
   */
  public getMaxBottom(): number {
    return this._maxBottom;
  }

  /**
   * 上辺のY軸位置の最大値の取得
   * @return 上辺のY軸位置の最大値
   */
  public getMaxTop(): number {
    return this._maxTop;
  }

  private _screenLeft: number; // デバイスに対応する論理座標上の範囲（左辺X軸位置）
  private _screenRight: number; // デバイスに対応する論理座標上の範囲（右辺X軸位置）
  private _screenTop: number; // デバイスに対応する論理座標上の範囲（上辺Y軸位置）
  private _screenBottom: number; // デバイスに対応する論理座標上の範囲（下辺Y軸位置）
  private _maxLeft: number; // 論理座標上の移動可能範囲（左辺X軸位置）
  private _maxRight: number; // 論理座標上の移動可能範囲（右辺X軸位置）
  private _maxTop: number; // 論理座標上の移動可能範囲（上辺Y軸位置）
  private _maxBottom: number; // 論理座標上の移動可能範囲（下辺Y軸位置）
  private _maxScale: number; // 拡大率の最大値
  private _minScale: number; // 拡大率の最小値
}

// Namespace definition for compatibility.
import * as $ from './cubismviewmatrix';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismViewMatrix = $.CubismViewMatrix;
  export type CubismViewMatrix = $.CubismViewMatrix;
}
