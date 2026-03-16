/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * 文字列クラス。
 */
export class csmString {
  /**
   * 文字列を後方に追加する
   *
   * @param c 追加する文字列
   * @return 更新された文字列
   */
  public append(c: string, length?: number): csmString {
    this.s += length !== undefined ? c.substr(0, length) : c;

    return this;
  }

  /**
   * 文字サイズを拡張して文字を埋める
   * @param length    拡張する文字数
   * @param v         埋める文字
   * @return 更新された文字列
   */
  public expansion(length: number, v: string): csmString {
    for (let i = 0; i < length; i++) {
      this.append(v);
    }

    return this;
  }

  /**
   * 文字列の長さをバイト数で取得する
   */
  public getBytes(): number {
    return encodeURIComponent(this.s).replace(/%../g, 'x').length;
  }

  /**
   * 文字列の長さを返す
   */
  public getLength(): number {
    return this.s.length;
  }

  /**
   * 文字列比較 <
   * @param s 比較する文字列
   * @return true:    比較する文字列より小さい
   * @return false:   比較する文字列より大きい
   */
  public isLess(s: csmString): boolean {
    return this.s < s.s;
  }

  /**
   * 文字列比較 >
   * @param s 比較する文字列
   * @return true:    比較する文字列より大きい
   * @return false:   比較する文字列より小さい
   */
  public isGreat(s: csmString): boolean {
    return this.s > s.s;
  }

  /**
   * 文字列比較 ==
   * @param s 比較する文字列
   * @return true:    比較する文字列と等しい
   * @return false:   比較する文字列と異なる
   */
  public isEqual(s: string): boolean {
    return this.s == s;
  }

  /**
   * 文字列が空かどうか
   * @return true: 空の文字列
   * @return false: 値が設定されている
   */
  public isEmpty(): boolean {
    return this.s.length == 0;
  }

  /**
   * 引数付きコンストラクタ
   */
  public constructor(s: string) {
    this.s = s;
  }

  s: string;
}

// Namespace definition for compatibility.
import * as $ from './csmstring';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const csmString = $.csmString;
  export type csmString = $.csmString;
}
