/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { csmMap, iterator } from '../type/csmmap';
import { CubismMatrix44 } from './cubismmatrix44';

/**
 * モデル座標設定用の4x4行列
 *
 * モデル座標設定用の4x4行列クラス
 */
export class CubismModelMatrix extends CubismMatrix44 {
  /**
   * コンストラクタ
   *
   * @param w 横幅
   * @param h 縦幅
   */
  constructor(w?: number, h?: number) {
    super();

    this._width = w !== undefined ? w : 0.0;
    this._height = h !== undefined ? h : 0.0;

    this.setHeight(2.0);
  }

  /**
   * 横幅を設定
   *
   * @param w 横幅
   */
  public setWidth(w: number): void {
    const scaleX: number = w / this._width;
    const scaleY: number = scaleX;
    this.scale(scaleX, scaleY);
  }

  /**
   * 縦幅を設定
   * @param h 縦幅
   */
  public setHeight(h: number): void {
    const scaleX: number = h / this._height;
    const scaleY: number = scaleX;
    this.scale(scaleX, scaleY);
  }

  /**
   * 位置を設定
   *
   * @param x X軸の位置
   * @param y Y軸の位置
   */
  public setPosition(x: number, y: number): void {
    this.translate(x, y);
  }

  /**
   * 中心位置を設定
   *
   * @param x X軸の中心位置
   * @param y Y軸の中心位置
   *
   * @note widthかheightを設定したあとでないと、拡大率が正しく取得できないためずれる。
   */
  public setCenterPosition(x: number, y: number) {
    this.centerX(x);
    this.centerY(y);
  }

  /**
   * 上辺の位置を設定する
   *
   * @param y 上辺のY軸位置
   */
  public top(y: number): void {
    this.setY(y);
  }

  /**
   * 下辺の位置を設定する
   *
   * @param y 下辺のY軸位置
   */
  public bottom(y: number) {
    const h: number = this._height * this.getScaleY();

    this.translateY(y - h);
  }

  /**
   * 左辺の位置を設定
   *
   * @param x 左辺のX軸位置
   */
  public left(x: number): void {
    this.setX(x);
  }

  /**
   * 右辺の位置を設定
   *
   * @param x 右辺のX軸位置
   */
  public right(x: number): void {
    const w = this._width * this.getScaleX();

    this.translateX(x - w);
  }

  /**
   * X軸の中心位置を設定
   *
   * @param x X軸の中心位置
   */
  public centerX(x: number): void {
    const w = this._width * this.getScaleX();

    this.translateX(x - w / 2.0);
  }

  /**
   * X軸の位置を設定
   *
   * @param x X軸の位置
   */
  public setX(x: number): void {
    this.translateX(x);
  }

  /**
   * Y軸の中心位置を設定
   *
   * @param y Y軸の中心位置
   */
  public centerY(y: number): void {
    const h: number = this._height * this.getScaleY();

    this.translateY(y - h / 2.0);
  }

  /**
   * Y軸の位置を設定する
   *
   * @param y Y軸の位置
   */
  public setY(y: number): void {
    this.translateY(y);
  }

  /**
   * レイアウト情報から位置を設定
   *
   * @param layout レイアウト情報
   */
  public setupFromLayout(layout: csmMap<string, number>): void {
    const keyWidth = 'width';
    const keyHeight = 'height';
    const keyX = 'x';
    const keyY = 'y';
    const keyCenterX = 'center_x';
    const keyCenterY = 'center_y';
    const keyTop = 'top';
    const keyBottom = 'bottom';
    const keyLeft = 'left';
    const keyRight = 'right';

    for (
      const ite: iterator<string, number> = layout.begin();
      ite.notEqual(layout.end());
      ite.preIncrement()
    ) {
      const key: string = ite.ptr().first;
      const value: number = ite.ptr().second;

      if (key == keyWidth) {
        this.setWidth(value);
      } else if (key == keyHeight) {
        this.setHeight(value);
      }
    }

    for (
      const ite: iterator<string, number> = layout.begin();
      ite.notEqual(layout.end());
      ite.preIncrement()
    ) {
      const key: string = ite.ptr().first;
      const value: number = ite.ptr().second;

      if (key == keyX) {
        this.setX(value);
      } else if (key == keyY) {
        this.setY(value);
      } else if (key == keyCenterX) {
        this.centerX(value);
      } else if (key == keyCenterY) {
        this.centerY(value);
      } else if (key == keyTop) {
        this.top(value);
      } else if (key == keyBottom) {
        this.bottom(value);
      } else if (key == keyLeft) {
        this.left(value);
      } else if (key == keyRight) {
        this.right(value);
      }
    }
  }

  private _width: number; // 横幅
  private _height: number; // 縦幅
}

// Namespace definition for compatibility.
import * as $ from './cubismmodelmatrix';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismModelMatrix = $.CubismModelMatrix;
  export type CubismModelMatrix = $.CubismModelMatrix;
}
