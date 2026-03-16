/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { ACubismMotion } from './acubismmotion';
import { CubismMotionQueueEntryHandle } from './cubismmotionqueuemanager';

/**
 * CubismMotionQueueManagerで再生している各モーションの管理クラス。
 */
export class CubismMotionQueueEntry {
  /**
   * コンストラクタ
   */
  public constructor() {
    this._autoDelete = false;
    this._motion = null;
    this._available = true;
    this._finished = false;
    this._started = false;
    this._startTimeSeconds = -1.0;
    this._fadeInStartTimeSeconds = 0.0;
    this._endTimeSeconds = -1.0;
    this._stateTimeSeconds = 0.0;
    this._stateWeight = 0.0;
    this._lastEventCheckSeconds = 0.0;
    this._motionQueueEntryHandle = this;
    this._fadeOutSeconds = 0.0;
    this._isTriggeredFadeOut = false;
  }

  /**
   * デストラクタ相当の処理
   */
  public release(): void {
    if (this._autoDelete && this._motion) {
      ACubismMotion.delete(this._motion); //
    }
  }

  /**
   * フェードアウト時間と開始判定の設定
   * @param fadeOutSeconds フェードアウトにかかる時間[秒]
   */
  public setFadeOut(fadeOutSeconds: number): void {
    this._fadeOutSeconds = fadeOutSeconds;
    this._isTriggeredFadeOut = true;
  }

  /**
   * フェードアウトの開始
   * @param fadeOutSeconds フェードアウトにかかる時間[秒]
   * @param userTimeSeconds デルタ時間の積算値[秒]
   */
  public startFadeOut(fadeOutSeconds: number, userTimeSeconds: number): void {
    const newEndTimeSeconds: number = userTimeSeconds + fadeOutSeconds;
    this._isTriggeredFadeOut = true;

    if (
      this._endTimeSeconds < 0.0 ||
      newEndTimeSeconds < this._endTimeSeconds
    ) {
      this._endTimeSeconds = newEndTimeSeconds;
    }
  }

  /**
   * モーションの終了の確認
   *
   * @return true モーションが終了した
   * @return false 終了していない
   */
  public isFinished(): boolean {
    return this._finished;
  }

  /**
   * モーションの開始の確認
   * @return true モーションが開始した
   * @return false 開始していない
   */
  public isStarted(): boolean {
    return this._started;
  }

  /**
   * モーションの開始時刻の取得
   * @return モーションの開始時刻[秒]
   */
  public getStartTime(): number {
    return this._startTimeSeconds;
  }

  /**
   * フェードインの開始時刻の取得
   * @return フェードインの開始時刻[秒]
   */
  public getFadeInStartTime(): number {
    return this._fadeInStartTimeSeconds;
  }

  /**
   * フェードインの終了時刻の取得
   * @return フェードインの終了時刻の取得
   */
  public getEndTime(): number {
    return this._endTimeSeconds;
  }

  /**
   * モーションの開始時刻の設定
   * @param startTime モーションの開始時刻
   */
  public setStartTime(startTime: number): void {
    this._startTimeSeconds = startTime;
  }

  /**
   * フェードインの開始時刻の設定
   * @param startTime フェードインの開始時刻[秒]
   */
  public setFadeInStartTime(startTime: number): void {
    this._fadeInStartTimeSeconds = startTime;
  }

  /**
   * フェードインの終了時刻の設定
   * @param endTime フェードインの終了時刻[秒]
   */
  public setEndTime(endTime: number): void {
    this._endTimeSeconds = endTime;
  }

  /**
   * モーションの終了の設定
   * @param f trueならモーションの終了
   */
  public setIsFinished(f: boolean): void {
    this._finished = f;
  }

  /**
   * モーション開始の設定
   * @param f trueならモーションの開始
   */
  public setIsStarted(f: boolean): void {
    this._started = f;
  }

  /**
   * モーションの有効性の確認
   * @return true モーションは有効
   * @return false モーションは無効
   */
  public isAvailable(): boolean {
    return this._available;
  }

  /**
   * モーションの有効性の設定
   * @param v trueならモーションは有効
   */
  public setIsAvailable(v: boolean): void {
    this._available = v;
  }

  /**
   * モーションの状態の設定
   * @param timeSeconds 現在時刻[秒]
   * @param weight モーション尾重み
   */
  public setState(timeSeconds: number, weight: number): void {
    this._stateTimeSeconds = timeSeconds;
    this._stateWeight = weight;
  }

  /**
   * モーションの現在時刻の取得
   * @return モーションの現在時刻[秒]
   */
  public getStateTime(): number {
    return this._stateTimeSeconds;
  }

  /**
   * モーションの重みの取得
   * @return モーションの重み
   */
  public getStateWeight(): number {
    return this._stateWeight;
  }

  /**
   * 最後にイベントの発火をチェックした時間を取得
   *
   * @return 最後にイベントの発火をチェックした時間[秒]
   */
  public getLastCheckEventSeconds(): number {
    return this._lastEventCheckSeconds;
  }

  /**
   * 最後にイベントをチェックした時間を設定
   * @param checkSeconds 最後にイベントをチェックした時間[秒]
   */
  public setLastCheckEventSeconds(checkSeconds: number): void {
    this._lastEventCheckSeconds = checkSeconds;
  }

  /**
   * フェードアウト開始判定の取得
   * @return フェードアウト開始するかどうか
   */
  public isTriggeredFadeOut(): boolean {
    return this._isTriggeredFadeOut;
  }

  /**
   * フェードアウト時間の取得
   * @return フェードアウト時間[秒]
   */
  public getFadeOutSeconds(): number {
    return this._fadeOutSeconds;
  }

  /**
   * モーションの取得
   *
   * @return モーション
   */
  public getCubismMotion(): ACubismMotion {
    return this._motion;
  }

  _autoDelete: boolean; // 自動削除
  _motion: ACubismMotion; // モーション

  _available: boolean; // 有効化フラグ
  _finished: boolean; // 終了フラグ
  _started: boolean; // 開始フラグ
  _startTimeSeconds: number; // モーション再生開始時刻[秒]
  _fadeInStartTimeSeconds: number; // フェードイン開始時刻（ループの時は初回のみ）[秒]
  _endTimeSeconds: number; // 終了予定時刻[秒]
  _stateTimeSeconds: number; // 時刻の状態[秒]
  _stateWeight: number; // 重みの状態
  _lastEventCheckSeconds: number; // 最終のMotion側のチェックした時間
  private _fadeOutSeconds: number; // フェードアウト時間[秒]
  private _isTriggeredFadeOut: boolean; // フェードアウト開始フラグ

  _motionQueueEntryHandle: CubismMotionQueueEntryHandle; // インスタンスごとに一意の値を持つ識別番号
}

// Namespace definition for compatibility.
import * as $ from './cubismmotionqueueentry';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismMotionQueueEntry = $.CubismMotionQueueEntry;
  export type CubismMotionQueueEntry = $.CubismMotionQueueEntry;
}
