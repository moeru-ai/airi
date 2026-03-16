/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { csmString } from '../type/csmstring';

/**
 * パラメータ名・パーツ名・Drawable名を保持
 *
 * パラメータ名・パーツ名・Drawable名を保持するクラス。
 *
 * @note 指定したID文字列からCubismIdを取得する際はこのクラスの生成メソッドを呼ばず、
 *       CubismIdManager().getId(id)を使用してください
 */
export class CubismId {
  /**
   * 内部で使用するCubismIdクラス生成メソッド
   *
   * @param id ID文字列
   * @returns CubismId
   * @note 指定したID文字列からCubismIdを取得する際は
   *       CubismIdManager().getId(id)を使用してください
   */
  public static createIdInternal(id: string | csmString) {
    return new CubismId(id);
  }

  /**
   * ID名を取得する
   */
  public getString(): csmString {
    return this._id;
  }

  /**
   * idを比較
   * @param c 比較するid
   * @return 同じならばtrue,異なっていればfalseを返す
   */
  public isEqual(c: string | csmString | CubismId): boolean {
    if (typeof c === 'string') {
      return this._id.isEqual(c);
    } else if (c instanceof csmString) {
      return this._id.isEqual(c.s);
    } else if (c instanceof CubismId) {
      return this._id.isEqual(c._id.s);
    }
    return false;
  }

  /**
   * idを比較
   * @param c 比較するid
   * @return 同じならばtrue,異なっていればfalseを返す
   */
  public isNotEqual(c: string | csmString | CubismId): boolean {
    if (typeof c == 'string') {
      return !this._id.isEqual(c);
    } else if (c instanceof csmString) {
      return !this._id.isEqual(c.s);
    } else if (c instanceof CubismId) {
      return !this._id.isEqual(c._id.s);
    }
    return false;
  }

  /**
   * プライベートコンストラクタ
   *
   * @note ユーザーによる生成は許可しません
   */
  private constructor(id: string | csmString) {
    if (typeof id === 'string') {
      this._id = new csmString(id);
      return;
    }

    this._id = id;
  }

  private _id: csmString; // ID名
}

export declare type CubismIdHandle = CubismId;

// Namespace definition for compatibility.
import * as $ from './cubismid';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismId = $.CubismId;
  export type CubismId = $.CubismId;
  export type CubismIdHandle = $.CubismIdHandle;
}
