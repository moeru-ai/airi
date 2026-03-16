/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMath } from '../math/cubismmath';
import { CubismModel } from '../model/cubismmodel';
import { csmString } from '../type/csmstring';
import { csmVector } from '../type/csmvector';
import { CSM_ASSERT, CubismDebug } from '../utils/cubismdebug';
import { CubismMotionQueueEntry } from './cubismmotionqueueentry';

/** モーション再生開始コールバック関数定義 */
export type BeganMotionCallback = (self: ACubismMotion) => void;

/** モーション再生終了コールバック関数定義 */
export type FinishedMotionCallback = (self: ACubismMotion) => void;

/**
 * モーションの抽象基底クラス
 *
 * モーションの抽象基底クラス。MotionQueueManagerによってモーションの再生を管理する。
 */
export abstract class ACubismMotion {
  /**
   * インスタンスの破棄
   */
  public static delete(motion: ACubismMotion): void {
    motion.release();
    motion = null;
  }

  /**
   * コンストラクタ
   */
  public constructor() {
    this._fadeInSeconds = -1.0;
    this._fadeOutSeconds = -1.0;
    this._weight = 1.0;
    this._offsetSeconds = 0.0; // 再生の開始時刻
    this._isLoop = false; // ループするか
    this._isLoopFadeIn = true; // ループ時にフェードインが有効かどうかのフラグ。初期値では有効。
    this._previousLoopState = this._isLoop;
    this._firedEventValues = new csmVector<csmString>();
  }

  /**
   * デストラクタ相当の処理
   */
  public release(): void {
    this._weight = 0.0;
  }

  /**
   * モデルのパラメータ
   * @param model 対象のモデル
   * @param motionQueueEntry CubismMotionQueueManagerで管理されているモーション
   * @param userTimeSeconds デルタ時間の積算値[秒]
   */
  public updateParameters(
    model: CubismModel,
    motionQueueEntry: CubismMotionQueueEntry,
    userTimeSeconds: number
  ): void {
    if (!motionQueueEntry.isAvailable() || motionQueueEntry.isFinished()) {
      return;
    }

    this.setupMotionQueueEntry(motionQueueEntry, userTimeSeconds);

    const fadeWeight = this.updateFadeWeight(motionQueueEntry, userTimeSeconds);

    //---- 全てのパラメータIDをループする ----
    this.doUpdateParameters(
      model,
      userTimeSeconds,
      fadeWeight,
      motionQueueEntry
    );

    // 後処理
    // 終了時刻を過ぎたら終了フラグを立てる(CubismMotionQueueManager)
    if (
      motionQueueEntry.getEndTime() > 0 &&
      motionQueueEntry.getEndTime() < userTimeSeconds
    ) {
      motionQueueEntry.setIsFinished(true); // 終了
    }
  }

  /**
   * @brief モデルの再生開始処理
   *
   * モーションの再生を開始するためのセットアップを行う。
   *
   * @param[in]   motionQueueEntry    CubismMotionQueueManagerで管理されているモーション
   * @param[in]   userTimeSeconds     デルタ時間の積算値[秒]
   */
  public setupMotionQueueEntry(
    motionQueueEntry: CubismMotionQueueEntry,
    userTimeSeconds: number
  ) {
    if (motionQueueEntry == null || motionQueueEntry.isStarted()) {
      return;
    }

    if (!motionQueueEntry.isAvailable()) {
      return;
    }

    motionQueueEntry.setIsStarted(true);
    motionQueueEntry.setStartTime(userTimeSeconds - this._offsetSeconds); // モーションの開始時刻を記録
    motionQueueEntry.setFadeInStartTime(userTimeSeconds); // フェードインの開始時刻

    if (motionQueueEntry.getEndTime() < 0.0) {
      // 開始していないうちに終了設定している場合がある
      this.adjustEndTime(motionQueueEntry);
    }

    // 再生開始コールバック
    if (motionQueueEntry._motion._onBeganMotion) {
      motionQueueEntry._motion._onBeganMotion(motionQueueEntry._motion);
    }
  }

  /**
   * @brief モデルのウェイト更新
   *
   * モーションのウェイトを更新する。
   *
   * @param[in]   motionQueueEntry    CubismMotionQueueManagerで管理されているモーション
   * @param[in]   userTimeSeconds     デルタ時間の積算値[秒]
   */
  public updateFadeWeight(
    motionQueueEntry: CubismMotionQueueEntry,
    userTimeSeconds: number
  ): number {
    if (motionQueueEntry == null) {
      CubismDebug.print(LogLevel.LogLevel_Error, 'motionQueueEntry is null.');
    }

    let fadeWeight: number = this._weight; // 現在の値と掛け合わせる割合

    //---- フェードイン・アウトの処理 ----
    // 単純なサイン関数でイージングする
    const fadeIn: number =
      this._fadeInSeconds == 0.0
        ? 1.0
        : CubismMath.getEasingSine(
            (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) /
              this._fadeInSeconds
          );

    const fadeOut: number =
      this._fadeOutSeconds == 0.0 || motionQueueEntry.getEndTime() < 0.0
        ? 1.0
        : CubismMath.getEasingSine(
            (motionQueueEntry.getEndTime() - userTimeSeconds) /
              this._fadeOutSeconds
          );

    fadeWeight = fadeWeight * fadeIn * fadeOut;

    motionQueueEntry.setState(userTimeSeconds, fadeWeight);

    CSM_ASSERT(0.0 <= fadeWeight && fadeWeight <= 1.0);

    return fadeWeight;
  }

  /**
   * フェードインの時間を設定する
   * @param fadeInSeconds フェードインにかかる時間[秒]
   */
  public setFadeInTime(fadeInSeconds: number): void {
    this._fadeInSeconds = fadeInSeconds;
  }

  /**
   * フェードアウトの時間を設定する
   * @param fadeOutSeconds フェードアウトにかかる時間[秒]
   */
  public setFadeOutTime(fadeOutSeconds: number): void {
    this._fadeOutSeconds = fadeOutSeconds;
  }

  /**
   * フェードアウトにかかる時間の取得
   * @return フェードアウトにかかる時間[秒]
   */
  public getFadeOutTime(): number {
    return this._fadeOutSeconds;
  }

  /**
   * フェードインにかかる時間の取得
   * @return フェードインにかかる時間[秒]
   */
  public getFadeInTime(): number {
    return this._fadeInSeconds;
  }

  /**
   * モーション適用の重みの設定
   * @param weight 重み（0.0 - 1.0）
   */
  public setWeight(weight: number): void {
    this._weight = weight;
  }

  /**
   * モーション適用の重みの取得
   * @return 重み（0.0 - 1.0）
   */
  public getWeight(): number {
    return this._weight;
  }

  /**
   * モーションの長さの取得
   * @return モーションの長さ[秒]
   *
   * @note ループの時は「-1」。
   *       ループでない場合は、オーバーライドする。
   *       正の値の時は取得される時間で終了する。
   *       「-1」の時は外部から停止命令がない限り終わらない処理となる。
   */
  public getDuration(): number {
    return -1.0;
  }

  /**
   * モーションのループ1回分の長さの取得
   * @return モーションのループ一回分の長さ[秒]
   *
   * @note ループしない場合は、getDuration()と同じ値を返す
   *       ループ一回分の長さが定義できない場合(プログラム的に動き続けるサブクラスなど)の場合は「-1」を返す
   */
  public getLoopDuration(): number {
    return -1.0;
  }

  /**
   * モーション再生の開始時刻の設定
   * @param offsetSeconds モーション再生の開始時刻[秒]
   */
  public setOffsetTime(offsetSeconds: number): void {
    this._offsetSeconds = offsetSeconds;
  }

  /**
   * ループ情報の設定
   * @param loop ループ情報
   */
  public setLoop(loop: boolean): void {
    this._isLoop = loop;
  }

  /**
   * ループ情報の取得
   * @return true ループする
   * @return false ループしない
   */
  public getLoop(): boolean {
    return this._isLoop;
  }

  /**
   * ループ時のフェードイン情報の設定
   * @param loopFadeIn  ループ時のフェードイン情報
   */
  public setLoopFadeIn(loopFadeIn: boolean) {
    this._isLoopFadeIn = loopFadeIn;
  }

  /**
   * ループ時のフェードイン情報の取得
   *
   * @return  true    する
   * @return  false   しない
   */
  public getLoopFadeIn(): boolean {
    return this._isLoopFadeIn;
  }

  /**
   * モデルのパラメータ更新
   *
   * イベント発火のチェック。
   * 入力する時間は呼ばれるモーションタイミングを０とした秒数で行う。
   *
   * @param beforeCheckTimeSeconds 前回のイベントチェック時間[秒]
   * @param motionTimeSeconds 今回の再生時間[秒]
   */
  public getFiredEvent(
    beforeCheckTimeSeconds: number,
    motionTimeSeconds: number
  ): csmVector<csmString> {
    return this._firedEventValues;
  }

  /**
   * モーションを更新して、モデルにパラメータ値を反映する
   * @param model 対象のモデル
   * @param userTimeSeconds デルタ時間の積算値[秒]
   * @param weight モーションの重み
   * @param motionQueueEntry CubismMotionQueueManagerで管理されているモーション
   * @return true モデルへパラメータ値の反映あり
   * @return false モデルへのパラメータ値の反映なし（モーションの変化なし）
   */
  public abstract doUpdateParameters(
    model: CubismModel,
    userTimeSeconds: number,
    weight: number,
    motionQueueEntry: CubismMotionQueueEntry
  ): void;

  /**
   * モーション再生開始コールバックの登録
   *
   * モーション再生開始コールバックを登録する。
   * 以下の状態の際には呼び出されない:
   *   1. 再生中のモーションが「ループ」として設定されているとき
   *   2. コールバックが登録されていない時
   *
   * @param onBeganMotionHandler モーション再生開始コールバック関数
   */
  public setBeganMotionHandler = (onBeganMotionHandler: BeganMotionCallback) =>
    (this._onBeganMotion = onBeganMotionHandler);

  /**
   * モーション再生開始コールバックの取得
   *
   * モーション再生開始コールバックを取得する。
   *
   * @return 登録されているモーション再生開始コールバック関数
   */
  public getBeganMotionHandler = () => this._onBeganMotion;

  /**
   * モーション再生終了コールバックの登録
   *
   * モーション再生終了コールバックを登録する。
   * isFinishedフラグを設定するタイミングで呼び出される。
   * 以下の状態の際には呼び出されない:
   *   1. 再生中のモーションが「ループ」として設定されているとき
   *   2. コールバックが登録されていない時
   *
   * @param onFinishedMotionHandler モーション再生終了コールバック関数
   */
  public setFinishedMotionHandler = (
    onFinishedMotionHandler: FinishedMotionCallback
  ) => (this._onFinishedMotion = onFinishedMotionHandler);

  /**
   * モーション再生終了コールバックの取得
   *
   * モーション再生終了コールバックを取得する。
   *
   * @return 登録されているモーション再生終了コールバック関数
   */
  public getFinishedMotionHandler = () => this._onFinishedMotion;

  /**
   * 透明度のカーブが存在するかどうかを確認する
   *
   * @returns true  -> キーが存在する
   *          false -> キーが存在しない
   */
  public isExistModelOpacity(): boolean {
    return false;
  }

  /**
   * 透明度のカーブのインデックスを返す
   *
   * @returns success:透明度のカーブのインデックス
   */
  public getModelOpacityIndex(): number {
    return -1;
  }

  /**
   * 透明度のIdを返す
   *
   * @param index モーションカーブのインデックス
   * @returns success:透明度のId
   */
  public getModelOpacityId(index: number): CubismIdHandle {
    return null;
  }

  /**
   * 指定時間の透明度の値を返す
   *
   * @returns success:モーションの現在時間におけるOpacityの値
   *
   * @note  更新後の値を取るにはUpdateParameters() の後に呼び出す。
   */
  protected getModelOpacityValue(): number {
    return 1.0;
  }

  /**
   * 終了時刻の調整
   * @param motionQueueEntry CubismMotionQueueManagerで管理されているモーション
   */
  protected adjustEndTime(motionQueueEntry: CubismMotionQueueEntry) {
    const duration = this.getDuration();

    // duration == -1 の場合はループする
    const endTime =
      duration <= 0.0 ? -1 : motionQueueEntry.getStartTime() + duration;

    motionQueueEntry.setEndTime(endTime);
  }

  public _fadeInSeconds: number; // フェードインにかかる時間[秒]
  public _fadeOutSeconds: number; // フェードアウトにかかる時間[秒]
  public _weight: number; // モーションの重み
  public _offsetSeconds: number; // モーション再生の開始時間[秒]
  public _isLoop: boolean; // ループが有効かのフラグ
  public _isLoopFadeIn: boolean; // ループ時にフェードインが有効かどうかのフラグ
  public _previousLoopState: boolean; // 前回の `_isLoop` の状態
  public _firedEventValues: csmVector<csmString>;

  // モーション再生開始コールバック関数
  public _onBeganMotion?: BeganMotionCallback;
  // モーション再生終了コールバック関数
  public _onFinishedMotion?: FinishedMotionCallback;
}

// Namespace definition for compatibility.
import * as $ from './acubismmotion';
import { CubismIdHandle } from '../id/cubismid';
import { LogLevel } from '../live2dcubismframework';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const ACubismMotion = $.ACubismMotion;
  export type ACubismMotion = $.ACubismMotion;
  export type BeganMotionCallback = $.BeganMotionCallback;
  export type FinishedMotionCallback = $.FinishedMotionCallback;
}
