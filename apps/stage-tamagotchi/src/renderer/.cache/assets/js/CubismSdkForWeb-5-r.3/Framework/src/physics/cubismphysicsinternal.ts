/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';
import { CubismVector2 } from '../math/cubismvector2';
import { csmVector } from '../type/csmvector';

/**
 * 物理演算の適用先の種類
 */
export enum CubismPhysicsTargetType {
  CubismPhysicsTargetType_Parameter // パラメータに対して適用
}

/**
 * 物理演算の入力の種類
 */
export enum CubismPhysicsSource {
  CubismPhysicsSource_X, // X軸の位置から
  CubismPhysicsSource_Y, // Y軸の位置から
  CubismPhysicsSource_Angle // 角度から
}

/**
 * @brief 物理演算で使用する外部の力
 *
 * 物理演算で使用する外部の力。
 */
export class PhysicsJsonEffectiveForces {
  constructor() {
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
  }
  gravity: CubismVector2; // 重力
  wind: CubismVector2; // 風
}

/**
 * 物理演算のパラメータ情報
 */
export class CubismPhysicsParameter {
  id: CubismIdHandle; // パラメータ
  targetType: CubismPhysicsTargetType; // 適用先の種類
}

/**
 * 物理演算の正規化情報
 */
export class CubismPhysicsNormalization {
  minimum: number; // 最大値
  maximum: number; // 最小値
  defalut: number; // デフォルト値
}

/**
 * 物理演算の演算委使用する物理点の情報
 */
export class CubismPhysicsParticle {
  constructor() {
    this.initialPosition = new CubismVector2(0, 0);
    this.position = new CubismVector2(0, 0);
    this.lastPosition = new CubismVector2(0, 0);
    this.lastGravity = new CubismVector2(0, 0);
    this.force = new CubismVector2(0, 0);
    this.velocity = new CubismVector2(0, 0);
  }

  initialPosition: CubismVector2; // 初期位置
  mobility: number; // 動きやすさ
  delay: number; // 遅れ
  acceleration: number; // 加速度
  radius: number; // 距離
  position: CubismVector2; // 現在の位置
  lastPosition: CubismVector2; // 最後の位置
  lastGravity: CubismVector2; // 最後の重力
  force: CubismVector2; // 現在かかっている力
  velocity: CubismVector2; // 現在の速度
}

/**
 * 物理演算の物理点の管理
 */
export class CubismPhysicsSubRig {
  constructor() {
    this.normalizationPosition = new CubismPhysicsNormalization();
    this.normalizationAngle = new CubismPhysicsNormalization();
  }
  inputCount: number; // 入力の個数
  outputCount: number; // 出力の個数
  particleCount: number; // 物理点の個数
  baseInputIndex: number; // 入力の最初のインデックス
  baseOutputIndex: number; // 出力の最初のインデックス
  baseParticleIndex: number; // 物理点の最初のインデックス
  normalizationPosition: CubismPhysicsNormalization; // 正規化された位置
  normalizationAngle: CubismPhysicsNormalization; // 正規化された角度
}

/**
 * 正規化されたパラメータの取得関数の宣言
 * @param targetTranslation     // 演算結果の移動値
 * @param targetAngle           // 演算結果の角度
 * @param value                 // パラメータの値
 * @param parameterMinimunValue // パラメータの最小値
 * @param parameterMaximumValue // パラメータの最大値
 * @param parameterDefaultValue // パラメータのデフォルト値
 * @param normalizationPosition // 正規化された位置
 * @param normalizationAngle    // 正規化された角度
 * @param isInverted            // 値が反転されているか？
 * @param weight                // 重み
 */
export interface normalizedPhysicsParameterValueGetter {
  (
    targetTranslation: CubismVector2,
    targetAngle: { angle: number },
    value: number,
    parameterMinimunValue: number,
    parameterMaximumValue: number,
    parameterDefaultValue: number,
    normalizationPosition: CubismPhysicsNormalization,
    normalizationAngle: CubismPhysicsNormalization,
    isInverted: boolean,
    weight: number
  ): void;
}

/**
 * 物理演算の値の取得関数の宣言
 * @param translation 移動値
 * @param particles 物理点のリスト
 * @param isInverted 値が反映されているか
 * @param parentGravity 重力
 * @return 値
 */
export interface physicsValueGetter {
  (
    translation: CubismVector2,
    particles: CubismPhysicsParticle[],
    particleIndex: number,
    isInverted: boolean,
    parentGravity: CubismVector2
  ): number;
}

/**
 * 物理演算のスケールの取得関数の宣言
 * @param translationScale 移動値のスケール
 * @param angleScale    角度のスケール
 * @return スケール値
 */
export interface physicsScaleGetter {
  (translationScale: CubismVector2, angleScale: number): number;
}

/**
 * 物理演算の入力情報
 */
export class CubismPhysicsInput {
  constructor() {
    this.source = new CubismPhysicsParameter();
  }
  source: CubismPhysicsParameter; // 入力元のパラメータ
  sourceParameterIndex: number; // 入力元のパラメータのインデックス
  weight: number; // 重み
  type: number; // 入力の種類
  reflect: boolean; // 値が反転されているかどうか
  getNormalizedParameterValue: normalizedPhysicsParameterValueGetter; // 正規化されたパラメータ値の取得関数
}

/**
 * @brief 物理演算の出力情報
 *
 * 物理演算の出力情報。
 */
export class CubismPhysicsOutput {
  constructor() {
    this.destination = new CubismPhysicsParameter();
    this.translationScale = new CubismVector2(0, 0);
  }

  destination: CubismPhysicsParameter; // 出力先のパラメータ
  destinationParameterIndex: number; // 出力先のパラメータのインデックス
  vertexIndex: number; // 振り子のインデックス
  translationScale: CubismVector2; // 移動値のスケール
  angleScale: number; // 角度のスケール
  weight: number; // 重み
  type: CubismPhysicsSource; // 出力の種類
  reflect: boolean; // 値が反転されているかどうか
  valueBelowMinimum: number; // 最小値を下回った時の値
  valueExceededMaximum: number; // 最大値をこえた時の値
  getValue: physicsValueGetter; // 物理演算の値の取得関数
  getScale: physicsScaleGetter; // 物理演算のスケール値の取得関数
}

/**
 * @brief 物理演算のデータ
 *
 * 物理演算のデータ。
 */
export class CubismPhysicsRig {
  constructor() {
    this.settings = new csmVector<CubismPhysicsSubRig>();
    this.inputs = new csmVector<CubismPhysicsInput>();
    this.outputs = new csmVector<CubismPhysicsOutput>();
    this.particles = new csmVector<CubismPhysicsParticle>();
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
    this.fps = 0.0;
  }

  subRigCount: number; // 物理演算の物理点の個数
  settings: csmVector<CubismPhysicsSubRig>; // 物理演算の物理点の管理のリスト
  inputs: csmVector<CubismPhysicsInput>; // 物理演算の入力のリスト
  outputs: csmVector<CubismPhysicsOutput>; // 物理演算の出力のリスト
  particles: csmVector<CubismPhysicsParticle>; // 物理演算の物理点のリスト
  gravity: CubismVector2; // 重力
  wind: CubismVector2; // 風
  fps: number; //物理演算動作FPS
}

// Namespace definition for compatibility.
import * as $ from './cubismphysicsinternal';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismPhysicsInput = $.CubismPhysicsInput;
  export type CubismPhysicsInput = $.CubismPhysicsInput;
  export const CubismPhysicsNormalization = $.CubismPhysicsNormalization;
  export type CubismPhysicsNormalization = $.CubismPhysicsNormalization;
  export const CubismPhysicsOutput = $.CubismPhysicsOutput;
  export type CubismPhysicsOutput = $.CubismPhysicsOutput;
  export const CubismPhysicsParameter = $.CubismPhysicsParameter;
  export type CubismPhysicsParameter = $.CubismPhysicsParameter;
  export const CubismPhysicsParticle = $.CubismPhysicsParticle;
  export type CubismPhysicsParticle = $.CubismPhysicsParticle;
  export const CubismPhysicsRig = $.CubismPhysicsRig;
  export type CubismPhysicsRig = $.CubismPhysicsRig;
  export const CubismPhysicsSource = $.CubismPhysicsSource;
  export type CubismPhysicsSource = $.CubismPhysicsSource;
  export const CubismPhysicsSubRig = $.CubismPhysicsSubRig;
  export type CubismPhysicsSubRig = $.CubismPhysicsSubRig;
  export const CubismPhysicsTargetType = $.CubismPhysicsTargetType;
  export type CubismPhysicsTargetType = $.CubismPhysicsTargetType;
  export const PhysicsJsonEffectiveForces = $.PhysicsJsonEffectiveForces;
  export type PhysicsJsonEffectiveForces = $.PhysicsJsonEffectiveForces;
  export type normalizedPhysicsParameterValueGetter =
    $.normalizedPhysicsParameterValueGetter;
  export type physicsScaleGetter = $.physicsScaleGetter;
  export type physicsValueGetter = $.physicsValueGetter;
}
