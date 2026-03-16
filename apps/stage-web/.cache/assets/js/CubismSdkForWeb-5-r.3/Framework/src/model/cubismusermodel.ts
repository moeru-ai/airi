/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismBreath } from '../effect/cubismbreath';
import { CubismEyeBlink } from '../effect/cubismeyeblink';
import { CubismPose } from '../effect/cubismpose';
import { ICubismModelSetting } from '../icubismmodelsetting';
import { CubismIdHandle } from '../id/cubismid';
import { Constant } from '../live2dcubismframework';
import { CubismModelMatrix } from '../math/cubismmodelmatrix';
import { CubismTargetPoint } from '../math/cubismtargetpoint';
import {
  ACubismMotion,
  BeganMotionCallback,
  FinishedMotionCallback
} from '../motion/acubismmotion';
import { CubismExpressionMotion } from '../motion/cubismexpressionmotion';
import { CubismExpressionMotionManager } from '../motion/cubismexpressionmotionmanager';
import { CubismMotion } from '../motion/cubismmotion';
import { CubismMotionManager } from '../motion/cubismmotionmanager';
import { CubismMotionQueueManager } from '../motion/cubismmotionqueuemanager';
import { CubismPhysics } from '../physics/cubismphysics';
import { CubismRenderer_WebGL } from '../rendering/cubismrenderer_webgl';
import { csmString } from '../type/csmstring';
import { CubismLogError, CubismLogInfo } from '../utils/cubismdebug';
import { CubismMoc } from './cubismmoc';
import { CubismModel } from './cubismmodel';
import { CubismModelUserData } from './cubismmodeluserdata';

/**
 * ユーザーが実際に使用するモデル
 *
 * ユーザーが実際に使用するモデルの基底クラス。これを継承してユーザーが実装する。
 */
export class CubismUserModel {
  /**
   * 初期化状態の取得
   *
   * 初期化されている状態か？
   *
   * @return true     初期化されている
   * @return false    初期化されていない
   */
  public isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 初期化状態の設定
   *
   * 初期化状態を設定する。
   *
   * @param v 初期化状態
   */
  public setInitialized(v: boolean): void {
    this._initialized = v;
  }

  /**
   * 更新状態の取得
   *
   * 更新されている状態か？
   *
   * @return true     更新されている
   * @return false    更新されていない
   */
  public isUpdating(): boolean {
    return this._updating;
  }

  /**
   * 更新状態の設定
   *
   * 更新状態を設定する
   *
   * @param v 更新状態
   */
  public setUpdating(v: boolean): void {
    this._updating = v;
  }

  /**
   * マウスドラッグ情報の設定
   * @param ドラッグしているカーソルのX位置
   * @param ドラッグしているカーソルのY位置
   */
  public setDragging(x: number, y: number): void {
    this._dragManager.set(x, y);
  }

  /**
   * 加速度の情報を設定する
   * @param x X軸方向の加速度
   * @param y Y軸方向の加速度
   * @param z Z軸方向の加速度
   */
  public setAcceleration(x: number, y: number, z: number): void {
    this._accelerationX = x;
    this._accelerationY = y;
    this._accelerationZ = z;
  }

  /**
   * モデル行列を取得する
   * @return モデル行列
   */
  public getModelMatrix(): CubismModelMatrix {
    return this._modelMatrix;
  }

  /**
   * 不透明度の設定
   * @param a 不透明度
   */
  public setOpacity(a: number): void {
    this._opacity = a;
  }

  /**
   * 不透明度の取得
   * @return 不透明度
   */
  public getOpacity(): number {
    return this._opacity;
  }

  /**
   * モデルデータを読み込む
   *
   * @param buffer    moc3ファイルが読み込まれているバッファ
   */
  public loadModel(buffer: ArrayBuffer, shouldCheckMocConsistency = false) {
    this._moc = CubismMoc.create(buffer, shouldCheckMocConsistency);

    if (this._moc == null) {
      CubismLogError('Failed to CubismMoc.create().');
      return;
    }

    this._model = this._moc.createModel();

    if (this._model == null) {
      CubismLogError('Failed to CreateModel().');
      return;
    }

    this._model.saveParameters();
    this._modelMatrix = new CubismModelMatrix(
      this._model.getCanvasWidth(),
      this._model.getCanvasHeight()
    );
  }

  /**
   * モーションデータを読み込む
   * @param buffer motion3.jsonファイルが読み込まれているバッファ
   * @param size バッファのサイズ
   * @param name モーションの名前
   * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
   * @param onBeganMotionHandler モーション再生開始時に呼び出されるコールバック関数
   * @param modelSetting モデル設定
   * @param group モーショングループ名
   * @param index モーションインデックス
   * @return モーションクラス
   */
  public loadMotion(
    buffer: ArrayBuffer,
    size: number,
    name: string,
    onFinishedMotionHandler?: FinishedMotionCallback,
    onBeganMotionHandler?: BeganMotionCallback,
    modelSetting?: ICubismModelSetting,
    group?: string,
    index?: number
  ): CubismMotion {
    if (buffer == null || size == 0) {
      CubismLogError('Failed to loadMotion().');
      return null;
    }

    const motion: CubismMotion = CubismMotion.create(
      buffer,
      size,
      onFinishedMotionHandler,
      onBeganMotionHandler
    );

    if (motion == null) {
      CubismLogError(`Failed to create motion from buffer in LoadMotion()`);
      return null;
    }

    // 必要であればモーションフェード値を上書き
    if (modelSetting) {
      const fadeInTime: number = modelSetting.getMotionFadeInTimeValue(
        group,
        index
      );
      if (fadeInTime >= 0.0) {
        motion.setFadeInTime(fadeInTime);
      }

      const fadeOutTime = modelSetting.getMotionFadeOutTimeValue(group, index);
      if (fadeOutTime >= 0.0) {
        motion.setFadeOutTime(fadeOutTime);
      }
    }

    return motion;
  }

  /**
   * 表情データの読み込み
   * @param buffer expファイルが読み込まれているバッファ
   * @param size バッファのサイズ
   * @param name 表情の名前
   */
  public loadExpression(
    buffer: ArrayBuffer,
    size: number,
    name: string
  ): ACubismMotion {
    if (buffer == null || size == 0) {
      CubismLogError('Failed to loadExpression().');
      return null;
    }
    return CubismExpressionMotion.create(buffer, size);
  }

  /**
   * ポーズデータの読み込み
   * @param buffer pose3.jsonが読み込まれているバッファ
   * @param size バッファのサイズ
   */
  public loadPose(buffer: ArrayBuffer, size: number): void {
    if (buffer == null || size == 0) {
      CubismLogError('Failed to loadPose().');
      return;
    }
    this._pose = CubismPose.create(buffer, size);
  }

  /**
   * モデルに付属するユーザーデータを読み込む
   * @param buffer userdata3.jsonが読み込まれているバッファ
   * @param size バッファのサイズ
   */
  public loadUserData(buffer: ArrayBuffer, size: number): void {
    if (buffer == null || size == 0) {
      CubismLogError('Failed to loadUserData().');
      return;
    }
    this._modelUserData = CubismModelUserData.create(buffer, size);
  }

  /**
   * 物理演算データの読み込み
   * @param buffer  physics3.jsonが読み込まれているバッファ
   * @param size    バッファのサイズ
   */
  public loadPhysics(buffer: ArrayBuffer, size: number): void {
    if (buffer == null || size == 0) {
      CubismLogError('Failed to loadPhysics().');
      return;
    }
    this._physics = CubismPhysics.create(buffer, size);
  }

  /**
   * 当たり判定の取得
   * @param drawableId 検証したいDrawableのID
   * @param pointX X位置
   * @param pointY Y位置
   * @return true ヒットしている
   * @return false ヒットしていない
   */
  public isHit(
    drawableId: CubismIdHandle,
    pointX: number,
    pointY: number
  ): boolean {
    const drawIndex: number = this._model.getDrawableIndex(drawableId);

    if (drawIndex < 0) {
      return false; // 存在しない場合はfalse
    }

    const count: number = this._model.getDrawableVertexCount(drawIndex);
    const vertices: Float32Array = this._model.getDrawableVertices(drawIndex);

    let left: number = vertices[0];
    let right: number = vertices[0];
    let top: number = vertices[1];
    let bottom: number = vertices[1];

    for (let j = 1; j < count; ++j) {
      const x = vertices[Constant.vertexOffset + j * Constant.vertexStep];
      const y = vertices[Constant.vertexOffset + j * Constant.vertexStep + 1];

      if (x < left) {
        left = x; // Min x
      }

      if (x > right) {
        right = x; // Max x
      }

      if (y < top) {
        top = y; // Min y
      }

      if (y > bottom) {
        bottom = y; // Max y
      }
    }

    const tx: number = this._modelMatrix.invertTransformX(pointX);
    const ty: number = this._modelMatrix.invertTransformY(pointY);

    return left <= tx && tx <= right && top <= ty && ty <= bottom;
  }

  /**
   * モデルの取得
   * @return モデル
   */
  public getModel(): CubismModel {
    return this._model;
  }

  /**
   * レンダラの取得
   * @return レンダラ
   */
  public getRenderer(): CubismRenderer_WebGL {
    return this._renderer;
  }

  /**
   * レンダラを作成して初期化を実行する
   * @param maskBufferCount バッファの生成数
   */
  public createRenderer(maskBufferCount = 1): void {
    if (this._renderer) {
      this.deleteRenderer();
    }

    this._renderer = new CubismRenderer_WebGL();
    this._renderer.initialize(this._model, maskBufferCount);
  }

  /**
   * レンダラの解放
   */
  public deleteRenderer(): void {
    if (this._renderer != null) {
      this._renderer.release();
      this._renderer = null;
    }
  }

  /**
   * イベント発火時の標準処理
   *
   * Eventが再生処理時にあった場合の処理をする。
   * 継承で上書きすることを想定している。
   * 上書きしない場合はログ出力をする。
   *
   * @param eventValue 発火したイベントの文字列データ
   */
  public motionEventFired(eventValue: csmString): void {
    CubismLogInfo('{0}', eventValue.s);
  }

  /**
   * イベント用のコールバック
   *
   * CubismMotionQueueManagerにイベント用に登録するためのCallback。
   * CubismUserModelの継承先のEventFiredを呼ぶ。
   *
   * @param caller 発火したイベントを管理していたモーションマネージャー、比較用
   * @param eventValue 発火したイベントの文字列データ
   * @param customData CubismUserModelを継承したインスタンスを想定
   */
  public static cubismDefaultMotionEventCallback(
    caller: CubismMotionQueueManager,
    eventValue: csmString,
    customData: CubismUserModel
  ): void {
    const model: CubismUserModel = customData;

    if (model != null) {
      model.motionEventFired(eventValue);
    }
  }

  /**
   * コンストラクタ
   */
  public constructor() {
    // 各変数初期化
    this._moc = null;
    this._model = null;
    this._motionManager = null;
    this._expressionManager = null;
    this._eyeBlink = null;
    this._breath = null;
    this._modelMatrix = null;
    this._pose = null;
    this._dragManager = null;
    this._physics = null;
    this._modelUserData = null;
    this._initialized = false;
    this._updating = false;
    this._opacity = 1.0;
    this._lipsync = true;
    this._lastLipSyncValue = 0.0;
    this._dragX = 0.0;
    this._dragY = 0.0;
    this._accelerationX = 0.0;
    this._accelerationY = 0.0;
    this._accelerationZ = 0.0;
    this._mocConsistency = false;
    this._debugMode = false;
    this._renderer = null;

    // モーションマネージャーを作成
    this._motionManager = new CubismMotionManager();
    this._motionManager.setEventCallback(
      CubismUserModel.cubismDefaultMotionEventCallback,
      this
    );

    // 表情マネージャーを作成
    this._expressionManager = new CubismExpressionMotionManager();

    // ドラッグによるアニメーション
    this._dragManager = new CubismTargetPoint();
  }

  /**
   * デストラクタに相当する処理
   */
  public release() {
    if (this._motionManager != null) {
      this._motionManager.release();
      this._motionManager = null;
    }

    if (this._expressionManager != null) {
      this._expressionManager.release();
      this._expressionManager = null;
    }

    if (this._moc != null) {
      this._moc.deleteModel(this._model);
      this._moc.release();
      this._moc = null;
    }

    this._modelMatrix = null;

    CubismPose.delete(this._pose);
    CubismEyeBlink.delete(this._eyeBlink);
    CubismBreath.delete(this._breath);

    this._dragManager = null;

    CubismPhysics.delete(this._physics);
    CubismModelUserData.delete(this._modelUserData);

    this.deleteRenderer();
  }

  protected _moc: CubismMoc; // Mocデータ
  protected _model: CubismModel; // Modelインスタンス

  protected _motionManager: CubismMotionManager; // モーション管理
  protected _expressionManager: CubismExpressionMotionManager; // 表情管理
  protected _eyeBlink: CubismEyeBlink; // 自動まばたき
  protected _breath: CubismBreath; // 呼吸
  protected _modelMatrix: CubismModelMatrix; // モデル行列
  protected _pose: CubismPose; // ポーズ管理
  protected _dragManager: CubismTargetPoint; // マウスドラッグ
  protected _physics: CubismPhysics; // 物理演算
  protected _modelUserData: CubismModelUserData; // ユーザーデータ

  protected _initialized: boolean; // 初期化されたかどうか
  protected _updating: boolean; // 更新されたかどうか
  protected _opacity: number; // 不透明度
  protected _lipsync: boolean; // リップシンクするかどうか
  protected _lastLipSyncValue: number; // 最後のリップシンクの制御地
  protected _dragX: number; // マウスドラッグのX位置
  protected _dragY: number; // マウスドラッグのY位置
  protected _accelerationX: number; // X軸方向の加速度
  protected _accelerationY: number; // Y軸方向の加速度
  protected _accelerationZ: number; // Z軸方向の加速度
  protected _mocConsistency: boolean; // MOC3一貫性検証するかどうか
  protected _debugMode: boolean; // デバッグモードかどうか

  private _renderer: CubismRenderer_WebGL; // レンダラ
}

// Namespace definition for compatibility.
import * as $ from './cubismusermodel';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismUserModel = $.CubismUserModel;
  export type CubismUserModel = $.CubismUserModel;
}
