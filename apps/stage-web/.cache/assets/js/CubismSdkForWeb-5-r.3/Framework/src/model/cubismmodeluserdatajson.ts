/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';
import { CubismFramework } from '../live2dcubismframework';
import { CubismJson } from '../utils/cubismjson';

const Meta = 'Meta';
const UserDataCount = 'UserDataCount';
const TotalUserDataSize = 'TotalUserDataSize';
const UserData = 'UserData';
const Target = 'Target';
const Id = 'Id';
const Value = 'Value';

export class CubismModelUserDataJson {
  /**
   * コンストラクタ
   * @param buffer    userdata3.jsonが読み込まれているバッファ
   * @param size      バッファのサイズ
   */
  public constructor(buffer: ArrayBuffer, size: number) {
    this._json = CubismJson.create(buffer, size);
  }

  /**
   * デストラクタ相当の処理
   */
  public release(): void {
    CubismJson.delete(this._json);
  }

  /**
   * ユーザーデータ個数の取得
   * @return ユーザーデータの個数
   */
  public getUserDataCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(UserDataCount)
      .toInt();
  }

  /**
   * ユーザーデータ総文字列数の取得
   *
   * @return ユーザーデータ総文字列数
   */
  public getTotalUserDataSize(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(TotalUserDataSize)
      .toInt();
  }

  /**
   * ユーザーデータのタイプの取得
   *
   * @return ユーザーデータのタイプ
   */
  public getUserDataTargetType(i: number): string {
    return this._json
      .getRoot()
      .getValueByString(UserData)
      .getValueByIndex(i)
      .getValueByString(Target)
      .getRawString();
  }

  /**
   * ユーザーデータのターゲットIDの取得
   *
   * @param i インデックス
   * @return ユーザーデータターゲットID
   */
  public getUserDataId(i: number): CubismIdHandle {
    return CubismFramework.getIdManager().getId(
      this._json
        .getRoot()
        .getValueByString(UserData)
        .getValueByIndex(i)
        .getValueByString(Id)
        .getRawString()
    );
  }

  /**
   * ユーザーデータの文字列の取得
   *
   * @param i インデックス
   * @return ユーザーデータ
   */
  public getUserDataValue(i: number): string {
    return this._json
      .getRoot()
      .getValueByString(UserData)
      .getValueByIndex(i)
      .getValueByString(Value)
      .getRawString();
  }

  private _json: CubismJson;
}

// Namespace definition for compatibility.
import * as $ from './cubismmodeluserdatajson';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismModelUserDataJson = $.CubismModelUserDataJson;
  export type CubismModelUserDataJson = $.CubismModelUserDataJson;
}
