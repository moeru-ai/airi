import { CubismId, CubismIdHandle } from '../id/cubismid';
import { LogLevel, csmDelete } from '../live2dcubismframework';
import { CubismModel } from '../model/cubismmodel';
import { csmVector, iterator } from '../type/csmvector';
import { ACubismMotion } from './acubismmotion';
import { CubismExpressionMotion } from './cubismexpressionmotion';
import { CubismMotionQueueEntry } from './cubismmotionqueueentry';
import {
  CubismMotionQueueEntryHandle,
  CubismMotionQueueManager
} from './cubismmotionqueuemanager';
import { CubismLogInfo } from '../utils/cubismdebug';

/**
 * @brief パラメータに適用する表情の値を持たせる構造体
 */
export class ExpressionParameterValue {
  parameterId: CubismIdHandle; // パラメーターID
  additiveValue: number; // 加算値
  multiplyValue: number; // 乗算値
  overwriteValue: number; // 上書き値
}

/**
 * @brief 表情モーションの管理
 *
 * 表情モーションの管理をおこなうクラス。
 */
export class CubismExpressionMotionManager extends CubismMotionQueueManager {
  /**
   * コンストラクタ
   */
  public constructor() {
    super();
    this._currentPriority = 0;
    this._reservePriority = 0;
    this._expressionParameterValues = new csmVector<ExpressionParameterValue>();
    this._fadeWeights = new csmVector<number>();
  }

  /**
   * デストラクタ相当の処理
   */
  public release(): void {
    if (this._expressionParameterValues) {
      csmDelete(this._expressionParameterValues);
      this._expressionParameterValues = null;
    }

    if (this._fadeWeights) {
      csmDelete(this._fadeWeights);
      this._fadeWeights = null;
    }
  }

  /**
   * @deprecated
   * ExpressionではPriorityを使用していないため、この関数は非推奨となりました。
   *
   * @brief 再生中のモーションの優先度の取得
   *
   * 再生中のモーションの優先度を取得する。
   *
   * @returns モーションの優先度
   */
  public getCurrentPriority(): number {
    CubismLogInfo(
      'CubismExpressionMotionManager.getCurrentPriority() is deprecated because a priority value is not actually used during expression motion playback.'
    );
    return this._currentPriority;
  }

  /**
   * @deprecated
   * ExpressionではPriorityを使用していないため、この関数は非推奨となりました。
   *
   * @brief 予約中のモーションの優先度の取得
   *
   * 予約中のモーションの優先度を取得する。
   *
   * @return  モーションの優先度
   */
  public getReservePriority(): number {
    CubismLogInfo(
      'CubismExpressionMotionManager.getReservePriority() is deprecated because a priority value is not actually used during expression motion playback.'
    );
    return this._reservePriority;
  }

  /**
   * @brief 再生中のモーションのウェイトを取得する。
   *
   * @param[in]    index    表情のインデックス
   * @returns               表情モーションのウェイト
   */
  public getFadeWeight(index: number): number {
    if (
      index < 0 ||
      this._fadeWeights.getSize() < 1 ||
      index >= this._fadeWeights.getSize()
    ) {
      console.warn(
        'Failed to get the fade weight value. The element at that index does not exist.'
      );
      return -1;
    }

    return this._fadeWeights.at(index);
  }

  /**
   * @brief モーションのウェイトの設定。
   *
   * @param[in]    index    表情のインデックス
   * @param[in]    index    表情モーションのウェイト
   */
  public setFadeWeight(index: number, expressionFadeWeight: number): void {
    if (
      index < 0 ||
      this._fadeWeights.getSize() < 1 ||
      this._fadeWeights.getSize() <= index
    ) {
      console.warn(
        'Failed to set the fade weight value. The element at that index does not exist.'
      );
      return;
    }

    this._fadeWeights.set(index, expressionFadeWeight);
  }

  /**
   * @deprecated
   * ExpressionではPriorityを使用していないため、この関数は非推奨となりました。
   *
   * @brief 予約中のモーションの優先度の設定
   *
   * 予約中のモーションの優先度を設定する。
   *
   * @param[in]   priority     優先度
   */
  public setReservePriority(priority: number) {
    CubismLogInfo(
      'CubismExpressionMotionManager.setReservePriority() is deprecated because a priority value is not actually used during expression motion playback.'
    );
    this._reservePriority = priority;
  }

  /**
   * @deprecated
   * ExpressionではPriorityを使用していないため、この関数は非推奨となりました。
   * CubismExpressionMotionManager.startMotion() を使用してください。
   *
   * @brief 優先度を設定してモーションの開始
   *
   * 優先度を設定してモーションを開始する。
   *
   * @param[in]   motion          モーション
   * @param[in]   autoDelete      再生が終了したモーションのインスタンスを削除するならtrue
   * @param[in]   priority        優先度
   * @return                      開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するIsFinished()の引数で使用する。開始できない時は「-1」
   */
  public startMotionPriority(
    motion: ACubismMotion,
    autoDelete: boolean,
    priority: number
  ): CubismMotionQueueEntryHandle {
    CubismLogInfo(
      'CubismExpressionMotionManager.startMotionPriority() is deprecated because a priority value is not actually used during expression motion playback.'
    );
    if (priority == this.getReservePriority()) {
      this.setReservePriority(0);
    }
    this._currentPriority = priority;

    return this.startMotion(motion, autoDelete);
  }

  /**
   * @brief モーションの更新
   *
   * モーションを更新して、モデルにパラメータ値を反映する。
   *
   * @param[in]   model   対象のモデル
   * @param[in]   deltaTimeSeconds    デルタ時間[秒]
   * @retval  true    更新されている
   * @retval  false   更新されていない
   */
  public updateMotion(model: CubismModel, deltaTimeSeconds: number): boolean {
    this._userTimeSeconds += deltaTimeSeconds;
    let updated = false;
    const motions = this.getCubismMotionQueueEntries();

    let expressionWeight = 0.0;
    let expressionIndex = 0;

    if (this._fadeWeights.getSize() !== motions.getSize()) {
      const difference = motions.getSize() - this._fadeWeights.getSize();
      for (let i = 0; i < difference; i++) {
        this._fadeWeights.pushBack(0.0);
      }
    }

    // ------- 処理を行う --------
    // 既にモーションがあれば終了フラグを立てる
    for (
      let ite: iterator<CubismMotionQueueEntry> = this._motions.begin();
      ite.notEqual(this._motions.end());

    ) {
      const motionQueueEntry = ite.ptr();

      if (motionQueueEntry == null) {
        ite = motions.erase(ite); //削除
        continue;
      }

      const expressionMotion = <CubismExpressionMotion>(
        motionQueueEntry.getCubismMotion()
      );

      if (expressionMotion == null) {
        csmDelete(motionQueueEntry);
        ite = motions.erase(ite); //削除
        continue;
      }

      const expressionParameters = expressionMotion.getExpressionParameters();

      if (motionQueueEntry.isAvailable()) {
        // 再生中のExpressionが参照しているパラメータをすべてリストアップ
        for (let i = 0; i < expressionParameters.getSize(); ++i) {
          if (expressionParameters.at(i).parameterId == null) {
            continue;
          }

          let index = -1;
          // リストにパラメータIDが存在するか検索
          for (let j = 0; j < this._expressionParameterValues.getSize(); ++j) {
            if (
              this._expressionParameterValues.at(j).parameterId !=
              expressionParameters.at(i).parameterId
            ) {
              continue;
            }

            index = j;
            break;
          }

          if (index >= 0) {
            continue;
          }

          // パラメータがリストに存在しないなら新規追加
          const item: ExpressionParameterValue = new ExpressionParameterValue();
          item.parameterId = expressionParameters.at(i).parameterId;
          item.additiveValue = CubismExpressionMotion.DefaultAdditiveValue;
          item.multiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
          item.overwriteValue = model.getParameterValueById(item.parameterId);
          this._expressionParameterValues.pushBack(item);
        }
      }

      // ------ 値を計算する ------
      expressionMotion.setupMotionQueueEntry(
        motionQueueEntry,
        this._userTimeSeconds
      );
      this.setFadeWeight(
        expressionIndex,
        expressionMotion.updateFadeWeight(
          motionQueueEntry,
          this._userTimeSeconds
        )
      );
      expressionMotion.calculateExpressionParameters(
        model,
        this._userTimeSeconds,
        motionQueueEntry,
        this._expressionParameterValues,
        expressionIndex,
        this.getFadeWeight(expressionIndex)
      );

      expressionWeight +=
        expressionMotion.getFadeInTime() == 0.0
          ? 1.0
          : CubismMath.getEasingSine(
              (this._userTimeSeconds - motionQueueEntry.getFadeInStartTime()) /
                expressionMotion.getFadeInTime()
            );

      updated = true;

      if (motionQueueEntry.isTriggeredFadeOut()) {
        // フェードアウト開始
        motionQueueEntry.startFadeOut(
          motionQueueEntry.getFadeOutSeconds(),
          this._userTimeSeconds
        );
      }

      ite.preIncrement();
      ++expressionIndex;
    }

    // ----- 最新のExpressionのフェードが完了していればそれ以前を削除する ------
    if (motions.getSize() > 1) {
      const latestFadeWeight: number = this.getFadeWeight(
        this._fadeWeights.getSize() - 1
      );
      if (latestFadeWeight >= 1.0) {
        // 配列の最後の要素は削除しない
        for (let i = motions.getSize() - 2; i >= 0; --i) {
          const motionQueueEntry = motions.at(i);
          csmDelete(motionQueueEntry);
          motions.remove(i);
          this._fadeWeights.remove(i);
        }
      }
    }

    if (expressionWeight > 1.0) {
      expressionWeight = 1.0;
    }

    // モデルに各値を適用
    for (let i = 0; i < this._expressionParameterValues.getSize(); ++i) {
      const expressionParameterValue = this._expressionParameterValues.at(i);
      model.setParameterValueById(
        expressionParameterValue.parameterId,
        (expressionParameterValue.overwriteValue +
          expressionParameterValue.additiveValue) *
          expressionParameterValue.multiplyValue,
        expressionWeight
      );

      expressionParameterValue.additiveValue =
        CubismExpressionMotion.DefaultAdditiveValue;
      expressionParameterValue.multiplyValue =
        CubismExpressionMotion.DefaultMultiplyValue;
    }

    return updated;
  }

  private _expressionParameterValues: csmVector<ExpressionParameterValue>; ///< モデルに適用する各パラメータの値
  private _fadeWeights: csmVector<number>; ///< 再生中の表情のウェイト
  private _currentPriority: number; ///< @deprecated 現在再生中のモーションの優先度。Expressionでは使用しないため非推奨。
  private _reservePriority: number; ///< @deprecated 再生予定のモーションの優先度。再生中は0になる。モーションファイルを別スレッドで読み込むときの機能。Expressionでは使用しないため非推奨。
  private _startExpressionTime: number; ///< 表情の再生開始時刻
}

// Namespace definition for compatibility.
import * as $ from './cubismexpressionmotionmanager';
import { CubismMath } from '../math/cubismmath';
import { CubismDebug, CubismLogError } from '../utils/cubismdebug';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismExpressionMotionManager = $.CubismExpressionMotionManager;
  export type CubismExpressionMotionManager = $.CubismExpressionMotionManager;
}
