/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';
import { CubismFramework } from '../live2dcubismframework';
import { csmString } from '../type/csmstring';
import { CSM_ASSERT, CubismLogWarning } from '../utils/cubismdebug';
import { CubismJson, JsonMap } from '../utils/cubismjson';
import { CubismMotionSegmentType } from './cubismmotioninternal';

// JSON keys
const Meta = 'Meta';
const Duration = 'Duration';
const Loop = 'Loop';
const AreBeziersRestricted = 'AreBeziersRestricted';
const CurveCount = 'CurveCount';
const Fps = 'Fps';
const TotalSegmentCount = 'TotalSegmentCount';
const TotalPointCount = 'TotalPointCount';
const Curves = 'Curves';
const Target = 'Target';
const Id = 'Id';
const FadeInTime = 'FadeInTime';
const FadeOutTime = 'FadeOutTime';
const Segments = 'Segments';
const UserData = 'UserData';
const UserDataCount = 'UserDataCount';
const TotalUserDataSize = 'TotalUserDataSize';
const Time = 'Time';
const Value = 'Value';

/**
 * motion3.jsonのコンテナ。
 */
export class CubismMotionJson {
  /**
   * コンストラクタ
   * @param buffer motion3.jsonが読み込まれているバッファ
   * @param size バッファのサイズ
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
   * モーションの長さを取得する
   * @return モーションの長さ[秒]
   */
  public getMotionDuration(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(Duration)
      .toFloat();
  }

  /**
   * モーションのループ情報の取得
   * @return true ループする
   * @return false ループしない
   */
  public isMotionLoop(): boolean {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(Loop)
      .toBoolean();
  }

  /**
   *  motion3.jsonファイルの整合性チェック
   *
   * @return 正常なファイルの場合はtrueを返す。
   */
  hasConsistency(): boolean {
    let result = true;

    if (!this._json || !this._json.getRoot()) {
      return false;
    }

    const actualCurveListSize = this._json
      .getRoot()
      .getValueByString(Curves)
      .getVector()
      .getSize();
    let actualTotalSegmentCount = 0;
    let actualTotalPointCount = 0;

    // カウント処理
    for (
      let curvePosition = 0;
      curvePosition < actualCurveListSize;
      ++curvePosition
    ) {
      for (
        let segmentPosition = 0;
        segmentPosition < this.getMotionCurveSegmentCount(curvePosition);

      ) {
        if (segmentPosition == 0) {
          actualTotalPointCount += 1;
          segmentPosition += 2;
        }

        const segment = this.getMotionCurveSegment(
          curvePosition,
          segmentPosition
        ) as CubismMotionSegmentType;

        switch (segment) {
          case CubismMotionSegmentType.CubismMotionSegmentType_Linear:
            actualTotalPointCount += 1;
            segmentPosition += 3;
            break;
          case CubismMotionSegmentType.CubismMotionSegmentType_Bezier:
            actualTotalPointCount += 3;
            segmentPosition += 7;
            break;
          case CubismMotionSegmentType.CubismMotionSegmentType_Stepped:
            actualTotalPointCount += 1;
            segmentPosition += 3;
            break;
          case CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped:
            actualTotalPointCount += 1;
            segmentPosition += 3;
            break;
          default:
            CSM_ASSERT(0);
            break;
        }

        ++actualTotalSegmentCount;
      }
    }

    // 個数チェック
    if (actualCurveListSize != this.getMotionCurveCount()) {
      CubismLogWarning('The number of curves does not match the metadata.');
      result = false;
    }
    if (actualTotalSegmentCount != this.getMotionTotalSegmentCount()) {
      CubismLogWarning('The number of segment does not match the metadata.');
      result = false;
    }
    if (actualTotalPointCount != this.getMotionTotalPointCount()) {
      CubismLogWarning('The number of point does not match the metadata.');
      result = false;
    }

    return result;
  }

  public getEvaluationOptionFlag(flagType: EvaluationOptionFlag): boolean {
    if (
      EvaluationOptionFlag.EvaluationOptionFlag_AreBeziersRistricted == flagType
    ) {
      return this._json
        .getRoot()
        .getValueByString(Meta)
        .getValueByString(AreBeziersRestricted)
        .toBoolean();
    }

    return false;
  }

  /**
   * モーションカーブの個数の取得
   * @return モーションカーブの個数
   */
  public getMotionCurveCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(CurveCount)
      .toInt();
  }

  /**
   * モーションのフレームレートの取得
   * @return フレームレート[FPS]
   */
  public getMotionFps(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(Fps)
      .toFloat();
  }

  /**
   * モーションのセグメントの総合計の取得
   * @return モーションのセグメントの取得
   */
  public getMotionTotalSegmentCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(TotalSegmentCount)
      .toInt();
  }

  /**
   * モーションのカーブの制御店の総合計の取得
   * @return モーションのカーブの制御点の総合計
   */
  public getMotionTotalPointCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(TotalPointCount)
      .toInt();
  }

  /**
   * モーションのフェードイン時間の存在
   * @return true 存在する
   * @return false 存在しない
   */
  public isExistMotionFadeInTime(): boolean {
    return !this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(FadeInTime)
      .isNull();
  }

  /**
   * モーションのフェードアウト時間の存在
   * @return true 存在する
   * @return false 存在しない
   */
  public isExistMotionFadeOutTime(): boolean {
    return !this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(FadeOutTime)
      .isNull();
  }

  /**
   * モーションのフェードイン時間の取得
   * @return フェードイン時間[秒]
   */
  public getMotionFadeInTime(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(FadeInTime)
      .toFloat();
  }

  /**
   * モーションのフェードアウト時間の取得
   * @return フェードアウト時間[秒]
   */
  public getMotionFadeOutTime(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(FadeOutTime)
      .toFloat();
  }

  /**
   * モーションのカーブの種類の取得
   * @param curveIndex カーブのインデックス
   * @return カーブの種類
   */
  public getMotionCurveTarget(curveIndex: number): string {
    return this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(Target)
      .getRawString();
  }

  /**
   * モーションのカーブのIDの取得
   * @param curveIndex カーブのインデックス
   * @return カーブのID
   */
  public getMotionCurveId(curveIndex: number): CubismIdHandle {
    return CubismFramework.getIdManager().getId(
      this._json
        .getRoot()
        .getValueByString(Curves)
        .getValueByIndex(curveIndex)
        .getValueByString(Id)
        .getRawString()
    );
  }

  /**
   * モーションのカーブのフェードイン時間の存在
   * @param curveIndex カーブのインデックス
   * @return true 存在する
   * @return false 存在しない
   */
  public isExistMotionCurveFadeInTime(curveIndex: number): boolean {
    return !this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(FadeInTime)
      .isNull();
  }

  /**
   * モーションのカーブのフェードアウト時間の存在
   * @param curveIndex カーブのインデックス
   * @return true 存在する
   * @return false 存在しない
   */
  public isExistMotionCurveFadeOutTime(curveIndex: number): boolean {
    return !this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(FadeOutTime)
      .isNull();
  }

  /**
   * モーションのカーブのフェードイン時間の取得
   * @param curveIndex カーブのインデックス
   * @return フェードイン時間[秒]
   */
  public getMotionCurveFadeInTime(curveIndex: number): number {
    return this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(FadeInTime)
      .toFloat();
  }

  /**
   * モーションのカーブのフェードアウト時間の取得
   * @param curveIndex カーブのインデックス
   * @return フェードアウト時間[秒]
   */
  public getMotionCurveFadeOutTime(curveIndex: number): number {
    return this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(FadeOutTime)
      .toFloat();
  }

  /**
   * モーションのカーブのセグメントの個数を取得する
   * @param curveIndex カーブのインデックス
   * @return モーションのカーブのセグメントの個数
   */
  public getMotionCurveSegmentCount(curveIndex: number): number {
    return this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(Segments)
      .getVector()
      .getSize();
  }

  /**
   * モーションのカーブのセグメントの値の取得
   * @param curveIndex カーブのインデックス
   * @param segmentIndex セグメントのインデックス
   * @return セグメントの値
   */
  public getMotionCurveSegment(
    curveIndex: number,
    segmentIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(Segments)
      .getValueByIndex(segmentIndex)
      .toFloat();
  }

  /**
   * イベントの個数の取得
   * @return イベントの個数
   */
  public getEventCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(UserDataCount)
      .toInt();
  }

  /**
   *  イベントの総文字数の取得
   * @return イベントの総文字数
   */
  public getTotalEventValueSize(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(TotalUserDataSize)
      .toInt();
  }

  /**
   * イベントの時間の取得
   * @param userDataIndex イベントのインデックス
   * @return イベントの時間[秒]
   */
  public getEventTime(userDataIndex: number): number {
    return this._json
      .getRoot()
      .getValueByString(UserData)
      .getValueByIndex(userDataIndex)
      .getValueByString(Time)
      .toFloat();
  }

  /**
   * イベントの取得
   * @param userDataIndex イベントのインデックス
   * @return イベントの文字列
   */
  public getEventValue(userDataIndex: number): csmString {
    return new csmString(
      this._json
        .getRoot()
        .getValueByString(UserData)
        .getValueByIndex(userDataIndex)
        .getValueByString(Value)
        .getRawString()
    );
  }

  _json: CubismJson; // motion3.jsonのデータ
}

/**
 * @brief ベジェカーブの解釈方法のフラグタイプ
 */
export enum EvaluationOptionFlag {
  EvaluationOptionFlag_AreBeziersRistricted = 0 ///< ベジェハンドルの規制状態
}

// Namespace definition for compatibility.
import * as $ from './cubismmotionjson';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismMotionJson = $.CubismMotionJson;
  export type CubismMotionJson = $.CubismMotionJson;
}
