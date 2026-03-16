/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { csmString } from '../type/csmstring';
import { csmVector } from '../type/csmvector';
import { CubismId } from './cubismid';

/**
 * ID名の管理
 *
 * ID名を管理する。
 */
export class CubismIdManager {
  /**
   * コンストラクタ
   */
  public constructor() {
    this._ids = new csmVector<CubismId>();
  }

  /**
   * デストラクタ相当の処理
   */
  public release(): void {
    for (let i = 0; i < this._ids.getSize(); ++i) {
      this._ids.set(i, void 0);
    }
    this._ids = null;
  }

  /**
   * ID名をリストから登録
   *
   * @param ids ID名リスト
   * @param count IDの個数
   */
  public registerIds(ids: string[] | csmString[]): void {
    for (let i = 0; i < ids.length; i++) {
      this.registerId(ids[i]);
    }
  }

  /**
   * ID名を登録
   *
   * @param id ID名
   */
  public registerId(id: string | csmString): CubismId {
    let result: CubismId = null;

    if ('string' == typeof id) {
      if ((result = this.findId(id)) != null) {
        return result;
      }

      result = CubismId.createIdInternal(id);
      this._ids.pushBack(result);
    } else {
      return this.registerId(id.s);
    }

    return result;
  }

  /**
   * ID名からIDを取得する
   *
   * @param id ID名
   */
  public getId(id: csmString | string): CubismId {
    return this.registerId(id);
  }

  /**
   * ID名からIDの確認
   *
   * @return true 存在する
   * @return false 存在しない
   */
  public isExist(id: csmString | string): boolean {
    if ('string' == typeof id) {
      return this.findId(id) != null;
    }
    return this.isExist(id.s);
  }

  /**
   * ID名からIDを検索する。
   *
   * @param id ID名
   * @return 登録されているID。なければNULL。
   */
  private findId(id: string): CubismId {
    for (let i = 0; i < this._ids.getSize(); ++i) {
      if (this._ids.at(i).getString().isEqual(id)) {
        return this._ids.at(i);
      }
    }

    return null;
  }

  private _ids: csmVector<CubismId>; // 登録されているIDのリスト
}

// Namespace definition for compatibility.
import * as $ from './cubismidmanager';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismIdManager = $.CubismIdManager;
  export type CubismIdManager = $.CubismIdManager;
}
