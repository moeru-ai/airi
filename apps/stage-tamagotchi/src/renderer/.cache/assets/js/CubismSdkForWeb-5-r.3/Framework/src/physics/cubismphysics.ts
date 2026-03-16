/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMath } from '../math/cubismmath';
import { CubismVector2 } from '../math/cubismvector2';
import { csmVector } from '../type/csmvector';
import { CubismModel } from '../model/cubismmodel';
import {
  CubismPhysicsInput,
  CubismPhysicsNormalization,
  CubismPhysicsOutput,
  CubismPhysicsParticle,
  CubismPhysicsRig,
  CubismPhysicsSource,
  CubismPhysicsSubRig,
  CubismPhysicsTargetType
} from './cubismphysicsinternal';
import { CubismPhysicsJson } from './cubismphysicsjson';

// physics types tags.
const PhysicsTypeTagX = 'X';
const PhysicsTypeTagY = 'Y';
const PhysicsTypeTagAngle = 'Angle';

// Constant of air resistance.
const AirResistance = 5.0;

// Constant of maximum weight of input and output ratio.
const MaximumWeight = 100.0;

// Constant of threshold of movement.
const MovementThreshold = 0.001;

// Constant of maximum allowed delta time
const MaxDeltaTime = 5.0;

/**
 * 物理演算クラス
 */
export class CubismPhysics {
  /**
   * インスタンスの作成
   * @param buffer    physics3.jsonが読み込まれているバッファ
   * @param size      バッファのサイズ
   * @return 作成されたインスタンス
   */
  public static create(buffer: ArrayBuffer, size: number): CubismPhysics {
    const ret: CubismPhysics = new CubismPhysics();

    ret.parse(buffer, size);
    ret._physicsRig.gravity.y = 0;

    return ret;
  }

  /**
   * インスタンスを破棄する
   * @param physics 破棄するインスタンス
   */
  public static delete(physics: CubismPhysics): void {
    if (physics != null) {
      physics.release();
      physics = null;
    }
  }

  /**
   * physics3.jsonをパースする。
   * @param physicsJson physics3.jsonが読み込まれているバッファ
   * @param size バッファのサイズ
   */
  public parse(physicsJson: ArrayBuffer, size: number): void {
    this._physicsRig = new CubismPhysicsRig();

    let json: CubismPhysicsJson = new CubismPhysicsJson(physicsJson, size);

    this._physicsRig.gravity = json.getGravity();
    this._physicsRig.wind = json.getWind();
    this._physicsRig.subRigCount = json.getSubRigCount();

    this._physicsRig.fps = json.getFps();

    this._physicsRig.settings.updateSize(
      this._physicsRig.subRigCount,
      CubismPhysicsSubRig,
      true
    );
    this._physicsRig.inputs.updateSize(
      json.getTotalInputCount(),
      CubismPhysicsInput,
      true
    );
    this._physicsRig.outputs.updateSize(
      json.getTotalOutputCount(),
      CubismPhysicsOutput,
      true
    );
    this._physicsRig.particles.updateSize(
      json.getVertexCount(),
      CubismPhysicsParticle,
      true
    );

    this._currentRigOutputs.clear();
    this._previousRigOutputs.clear();

    let inputIndex = 0,
      outputIndex = 0,
      particleIndex = 0;

    for (let i = 0; i < this._physicsRig.settings.getSize(); ++i) {
      this._physicsRig.settings.at(i).normalizationPosition.minimum =
        json.getNormalizationPositionMinimumValue(i);
      this._physicsRig.settings.at(i).normalizationPosition.maximum =
        json.getNormalizationPositionMaximumValue(i);
      this._physicsRig.settings.at(i).normalizationPosition.defalut =
        json.getNormalizationPositionDefaultValue(i);

      this._physicsRig.settings.at(i).normalizationAngle.minimum =
        json.getNormalizationAngleMinimumValue(i);
      this._physicsRig.settings.at(i).normalizationAngle.maximum =
        json.getNormalizationAngleMaximumValue(i);
      this._physicsRig.settings.at(i).normalizationAngle.defalut =
        json.getNormalizationAngleDefaultValue(i);

      // Input
      this._physicsRig.settings.at(i).inputCount = json.getInputCount(i);
      this._physicsRig.settings.at(i).baseInputIndex = inputIndex;

      for (let j = 0; j < this._physicsRig.settings.at(i).inputCount; ++j) {
        this._physicsRig.inputs.at(inputIndex + j).sourceParameterIndex = -1;
        this._physicsRig.inputs.at(inputIndex + j).weight = json.getInputWeight(
          i,
          j
        );
        this._physicsRig.inputs.at(inputIndex + j).reflect =
          json.getInputReflect(i, j);

        if (json.getInputType(i, j) == PhysicsTypeTagX) {
          this._physicsRig.inputs.at(inputIndex + j).type =
            CubismPhysicsSource.CubismPhysicsSource_X;
          this._physicsRig.inputs.at(
            inputIndex + j
          ).getNormalizedParameterValue =
            getInputTranslationXFromNormalizedParameterValue;
        } else if (json.getInputType(i, j) == PhysicsTypeTagY) {
          this._physicsRig.inputs.at(inputIndex + j).type =
            CubismPhysicsSource.CubismPhysicsSource_Y;
          this._physicsRig.inputs.at(
            inputIndex + j
          ).getNormalizedParameterValue =
            getInputTranslationYFromNormalizedParamterValue;
        } else if (json.getInputType(i, j) == PhysicsTypeTagAngle) {
          this._physicsRig.inputs.at(inputIndex + j).type =
            CubismPhysicsSource.CubismPhysicsSource_Angle;
          this._physicsRig.inputs.at(
            inputIndex + j
          ).getNormalizedParameterValue =
            getInputAngleFromNormalizedParameterValue;
        }

        this._physicsRig.inputs.at(inputIndex + j).source.targetType =
          CubismPhysicsTargetType.CubismPhysicsTargetType_Parameter;
        this._physicsRig.inputs.at(inputIndex + j).source.id =
          json.getInputSourceId(i, j);
      }
      inputIndex += this._physicsRig.settings.at(i).inputCount;

      // Output
      this._physicsRig.settings.at(i).outputCount = json.getOutputCount(i);
      this._physicsRig.settings.at(i).baseOutputIndex = outputIndex;

      const currentRigOutput = new PhysicsOutput();
      currentRigOutput.outputs.resize(
        this._physicsRig.settings.at(i).outputCount
      );

      const previousRigOutput = new PhysicsOutput();
      previousRigOutput.outputs.resize(
        this._physicsRig.settings.at(i).outputCount
      );

      for (let j = 0; j < this._physicsRig.settings.at(i).outputCount; ++j) {
        // initialize
        currentRigOutput.outputs.set(j, 0.0);
        previousRigOutput.outputs.set(j, 0.0);

        this._physicsRig.outputs.at(outputIndex + j).destinationParameterIndex =
          -1;
        this._physicsRig.outputs.at(outputIndex + j).vertexIndex =
          json.getOutputVertexIndex(i, j);
        this._physicsRig.outputs.at(outputIndex + j).angleScale =
          json.getOutputAngleScale(i, j);
        this._physicsRig.outputs.at(outputIndex + j).weight =
          json.getOutputWeight(i, j);
        this._physicsRig.outputs.at(outputIndex + j).destination.targetType =
          CubismPhysicsTargetType.CubismPhysicsTargetType_Parameter;

        this._physicsRig.outputs.at(outputIndex + j).destination.id =
          json.getOutputDestinationId(i, j);

        if (json.getOutputType(i, j) == PhysicsTypeTagX) {
          this._physicsRig.outputs.at(outputIndex + j).type =
            CubismPhysicsSource.CubismPhysicsSource_X;
          this._physicsRig.outputs.at(outputIndex + j).getValue =
            getOutputTranslationX;
          this._physicsRig.outputs.at(outputIndex + j).getScale =
            getOutputScaleTranslationX;
        } else if (json.getOutputType(i, j) == PhysicsTypeTagY) {
          this._physicsRig.outputs.at(outputIndex + j).type =
            CubismPhysicsSource.CubismPhysicsSource_Y;
          this._physicsRig.outputs.at(outputIndex + j).getValue =
            getOutputTranslationY;
          this._physicsRig.outputs.at(outputIndex + j).getScale =
            getOutputScaleTranslationY;
        } else if (json.getOutputType(i, j) == PhysicsTypeTagAngle) {
          this._physicsRig.outputs.at(outputIndex + j).type =
            CubismPhysicsSource.CubismPhysicsSource_Angle;
          this._physicsRig.outputs.at(outputIndex + j).getValue =
            getOutputAngle;
          this._physicsRig.outputs.at(outputIndex + j).getScale =
            getOutputScaleAngle;
        }

        this._physicsRig.outputs.at(outputIndex + j).reflect =
          json.getOutputReflect(i, j);
      }

      this._currentRigOutputs.pushBack(currentRigOutput);
      this._previousRigOutputs.pushBack(previousRigOutput);

      outputIndex += this._physicsRig.settings.at(i).outputCount;

      // Particle
      this._physicsRig.settings.at(i).particleCount = json.getParticleCount(i);
      this._physicsRig.settings.at(i).baseParticleIndex = particleIndex;

      for (let j = 0; j < this._physicsRig.settings.at(i).particleCount; ++j) {
        this._physicsRig.particles.at(particleIndex + j).mobility =
          json.getParticleMobility(i, j);
        this._physicsRig.particles.at(particleIndex + j).delay =
          json.getParticleDelay(i, j);
        this._physicsRig.particles.at(particleIndex + j).acceleration =
          json.getParticleAcceleration(i, j);
        this._physicsRig.particles.at(particleIndex + j).radius =
          json.getParticleRadius(i, j);
        this._physicsRig.particles.at(particleIndex + j).position =
          json.getParticlePosition(i, j);
      }

      particleIndex += this._physicsRig.settings.at(i).particleCount;
    }

    this.initialize();

    json.release();
    json = void 0;
    json = null;
  }

  /**
   * 現在のパラメータ値で物理演算が安定化する状態を演算する。
   * @param model 物理演算の結果を適用するモデル
   */
  public stabilization(model: CubismModel): void {
    let totalAngle: { angle: number };
    let weight: number;
    let radAngle: number;
    let outputValue: number;
    const totalTranslation: CubismVector2 = new CubismVector2();
    let currentSetting: CubismPhysicsSubRig;
    let currentInputs: CubismPhysicsInput[];
    let currentOutputs: CubismPhysicsOutput[];
    let currentParticles: CubismPhysicsParticle[];

    const parameterValues: Float32Array = model.getModel().parameters.values;
    const parameterMaximumValues: Float32Array =
      model.getModel().parameters.maximumValues;
    const parameterMinimumValues: Float32Array =
      model.getModel().parameters.minimumValues;
    const parameterDefaultValues: Float32Array =
      model.getModel().parameters.defaultValues;

    if ((this._parameterCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterCaches = new Float32Array(model.getParameterCount());
    }

    if ((this._parameterInputCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterInputCaches = new Float32Array(model.getParameterCount());
    }

    for (let j = 0; j < model.getParameterCount(); ++j) {
      this._parameterCaches[j] = parameterValues[j];
      this._parameterInputCaches[j] = parameterValues[j];
    }

    for (
      let settingIndex = 0;
      settingIndex < this._physicsRig.subRigCount;
      ++settingIndex
    ) {
      totalAngle = { angle: 0.0 };
      totalTranslation.x = 0.0;
      totalTranslation.y = 0.0;
      currentSetting = this._physicsRig.settings.at(settingIndex);
      currentInputs = this._physicsRig.inputs.get(
        currentSetting.baseInputIndex
      );
      currentOutputs = this._physicsRig.outputs.get(
        currentSetting.baseOutputIndex
      );
      currentParticles = this._physicsRig.particles.get(
        currentSetting.baseParticleIndex
      );

      // Load input parameters
      for (let i = 0; i < currentSetting.inputCount; ++i) {
        weight = currentInputs[i].weight / MaximumWeight;

        if (currentInputs[i].sourceParameterIndex == -1) {
          currentInputs[i].sourceParameterIndex = model.getParameterIndex(
            currentInputs[i].source.id
          );
        }

        currentInputs[i].getNormalizedParameterValue(
          totalTranslation,
          totalAngle,
          parameterValues[currentInputs[i].sourceParameterIndex],
          parameterMinimumValues[currentInputs[i].sourceParameterIndex],
          parameterMaximumValues[currentInputs[i].sourceParameterIndex],
          parameterDefaultValues[currentInputs[i].sourceParameterIndex],
          currentSetting.normalizationPosition,
          currentSetting.normalizationAngle,
          currentInputs[i].reflect,
          weight
        );

        this._parameterCaches[currentInputs[i].sourceParameterIndex] =
          parameterValues[currentInputs[i].sourceParameterIndex];
      }

      radAngle = CubismMath.degreesToRadian(-totalAngle.angle);

      totalTranslation.x =
        totalTranslation.x * CubismMath.cos(radAngle) -
        totalTranslation.y * CubismMath.sin(radAngle);
      totalTranslation.y =
        totalTranslation.x * CubismMath.sin(radAngle) +
        totalTranslation.y * CubismMath.cos(radAngle);

      // Calculate particles position.
      updateParticlesForStabilization(
        currentParticles,
        currentSetting.particleCount,
        totalTranslation,
        totalAngle.angle,
        this._options.wind,
        MovementThreshold * currentSetting.normalizationPosition.maximum
      );

      // Update output parameters.
      for (let i = 0; i < currentSetting.outputCount; ++i) {
        const particleIndex = currentOutputs[i].vertexIndex;

        if (currentOutputs[i].destinationParameterIndex == -1) {
          currentOutputs[i].destinationParameterIndex = model.getParameterIndex(
            currentOutputs[i].destination.id
          );
        }

        if (
          particleIndex < 1 ||
          particleIndex >= currentSetting.particleCount
        ) {
          continue;
        }

        let translation: CubismVector2 = new CubismVector2();
        translation = currentParticles[particleIndex].position.substract(
          currentParticles[particleIndex - 1].position
        );

        outputValue = currentOutputs[i].getValue(
          translation,
          currentParticles,
          particleIndex,
          currentOutputs[i].reflect,
          this._options.gravity
        );

        this._currentRigOutputs.at(settingIndex).outputs.set(i, outputValue);
        this._previousRigOutputs.at(settingIndex).outputs.set(i, outputValue);

        const destinationParameterIndex: number =
          currentOutputs[i].destinationParameterIndex;

        const outParameterCaches: Float32Array =
          !Float32Array.prototype.slice && 'subarray' in Float32Array.prototype
            ? JSON.parse(
                JSON.stringify(
                  parameterValues.subarray(destinationParameterIndex)
                )
              ) // 値渡しするため、JSON.parse, JSON.stringify
            : parameterValues.slice(destinationParameterIndex);

        updateOutputParameterValue(
          outParameterCaches,
          parameterMinimumValues[destinationParameterIndex],
          parameterMaximumValues[destinationParameterIndex],
          outputValue,
          currentOutputs[i]
        );

        // 値を反映
        for (
          let offset: number = destinationParameterIndex, outParamIndex = 0;
          offset < this._parameterCaches.length;
          offset++, outParamIndex++
        ) {
          parameterValues[offset] = this._parameterCaches[offset] =
            outParameterCaches[outParamIndex];
        }
      }
    }
  }

  /**
   * 物理演算の評価
   *
   * Pendulum interpolation weights
   *
   * 振り子の計算結果は保存され、パラメータへの出力は保存された前回の結果で補間されます。
   * The result of the pendulum calculation is saved and
   * the output to the parameters is interpolated with the saved previous result of the pendulum calculation.
   *
   * 図で示すと[1]と[2]で補間されます。
   * The figure shows the interpolation between [1] and [2].
   *
   * 補間の重みは最新の振り子計算タイミングと次回のタイミングの間で見た現在時間で決定する。
   * The weight of the interpolation are determined by the current time seen between
   * the latest pendulum calculation timing and the next timing.
   *
   * 図で示すと[2]と[4]の間でみた(3)の位置の重みになる。
   * Figure shows the weight of position (3) as seen between [2] and [4].
   *
   * 解釈として振り子計算のタイミングと重み計算のタイミングがズレる。
   * As an interpretation, the pendulum calculation and weights are misaligned.
   *
   * physics3.jsonにFPS情報が存在しない場合は常に前の振り子状態で設定される。
   * If there is no FPS information in physics3.json, it is always set in the previous pendulum state.
   *
   * この仕様は補間範囲を逸脱したことが原因の震えたような見た目を回避を目的にしている。
   * The purpose of this specification is to avoid the quivering appearance caused by deviations from the interpolation range.
   *
   * ------------ time -------------->
   *
   *                 |+++++|------| <- weight
   * ==[1]====#=====[2]---(3)----(4)
   *          ^ output contents
   *
   * 1:_previousRigOutputs
   * 2:_currentRigOutputs
   * 3:_currentRemainTime (now rendering)
   * 4:next particles timing
   * @param model 物理演算の結果を適用するモデル
   * @param deltaTimeSeconds デルタ時間[秒]
   */
  public evaluate(model: CubismModel, deltaTimeSeconds: number): void {
    let totalAngle: { angle: number };
    let weight: number;
    let radAngle: number;
    let outputValue: number;
    const totalTranslation: CubismVector2 = new CubismVector2();
    let currentSetting: CubismPhysicsSubRig;
    let currentInputs: CubismPhysicsInput[];
    let currentOutputs: CubismPhysicsOutput[];
    let currentParticles: CubismPhysicsParticle[];

    if (0.0 >= deltaTimeSeconds) {
      return;
    }

    const parameterValues: Float32Array = model.getModel().parameters.values;
    const parameterMaximumValues: Float32Array =
      model.getModel().parameters.maximumValues;
    const parameterMinimumValues: Float32Array =
      model.getModel().parameters.minimumValues;
    const parameterDefaultValues: Float32Array =
      model.getModel().parameters.defaultValues;

    let physicsDeltaTime: number;
    this._currentRemainTime += deltaTimeSeconds;
    if (this._currentRemainTime > MaxDeltaTime) {
      this._currentRemainTime = 0.0;
    }

    if ((this._parameterCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterCaches = new Float32Array(model.getParameterCount());
    }

    if ((this._parameterInputCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterInputCaches = new Float32Array(model.getParameterCount());
      for (let j = 0; j < model.getParameterCount(); ++j) {
        this._parameterInputCaches[j] = parameterValues[j];
      }
    }

    if (this._physicsRig.fps > 0.0) {
      physicsDeltaTime = 1.0 / this._physicsRig.fps;
    } else {
      physicsDeltaTime = deltaTimeSeconds;
    }

    while (this._currentRemainTime >= physicsDeltaTime) {
      // copyRigOutputs _currentRigOutputs to _previousRigOutputs
      for (
        let settingIndex = 0;
        settingIndex < this._physicsRig.subRigCount;
        ++settingIndex
      ) {
        currentSetting = this._physicsRig.settings.at(settingIndex);
        currentOutputs = this._physicsRig.outputs.get(
          currentSetting.baseOutputIndex
        );
        for (let i = 0; i < currentSetting.outputCount; ++i) {
          this._previousRigOutputs
            .at(settingIndex)
            .outputs.set(
              i,
              this._currentRigOutputs.at(settingIndex).outputs.at(i)
            );
        }
      }

      // 入力キャッシュとパラメータで線形補間してUpdateParticlesするタイミングでの入力を計算する。
      // Calculate the input at the timing to UpdateParticles by linear interpolation with the _parameterInputCache and parameterValue.
      // _parameterCacheはグループ間での値の伝搬の役割があるので_parameterInputCacheとの分離が必要。
      // _parameterCache needs to be separated from _parameterInputCache because of its role in propagating values between groups.
      const inputWeight = physicsDeltaTime / this._currentRemainTime;
      for (let j = 0; j < model.getParameterCount(); ++j) {
        this._parameterCaches[j] =
          this._parameterInputCaches[j] * (1.0 - inputWeight) +
          parameterValues[j] * inputWeight;
        this._parameterInputCaches[j] = this._parameterCaches[j];
      }

      for (
        let settingIndex = 0;
        settingIndex < this._physicsRig.subRigCount;
        ++settingIndex
      ) {
        totalAngle = { angle: 0.0 };
        totalTranslation.x = 0.0;
        totalTranslation.y = 0.0;
        currentSetting = this._physicsRig.settings.at(settingIndex);
        currentInputs = this._physicsRig.inputs.get(
          currentSetting.baseInputIndex
        );
        currentOutputs = this._physicsRig.outputs.get(
          currentSetting.baseOutputIndex
        );
        currentParticles = this._physicsRig.particles.get(
          currentSetting.baseParticleIndex
        );

        // Load input parameters
        for (let i = 0; i < currentSetting.inputCount; ++i) {
          weight = currentInputs[i].weight / MaximumWeight;

          if (currentInputs[i].sourceParameterIndex == -1) {
            currentInputs[i].sourceParameterIndex = model.getParameterIndex(
              currentInputs[i].source.id
            );
          }

          currentInputs[i].getNormalizedParameterValue(
            totalTranslation,
            totalAngle,
            this._parameterCaches[currentInputs[i].sourceParameterIndex],
            parameterMinimumValues[currentInputs[i].sourceParameterIndex],
            parameterMaximumValues[currentInputs[i].sourceParameterIndex],
            parameterDefaultValues[currentInputs[i].sourceParameterIndex],
            currentSetting.normalizationPosition,
            currentSetting.normalizationAngle,
            currentInputs[i].reflect,
            weight
          );
        }

        radAngle = CubismMath.degreesToRadian(-totalAngle.angle);

        totalTranslation.x =
          totalTranslation.x * CubismMath.cos(radAngle) -
          totalTranslation.y * CubismMath.sin(radAngle);
        totalTranslation.y =
          totalTranslation.x * CubismMath.sin(radAngle) +
          totalTranslation.y * CubismMath.cos(radAngle);

        // Calculate particles position.
        updateParticles(
          currentParticles,
          currentSetting.particleCount,
          totalTranslation,
          totalAngle.angle,
          this._options.wind,
          MovementThreshold * currentSetting.normalizationPosition.maximum,
          physicsDeltaTime,
          AirResistance
        );

        // Update output parameters.
        for (let i = 0; i < currentSetting.outputCount; ++i) {
          const particleIndex = currentOutputs[i].vertexIndex;

          if (currentOutputs[i].destinationParameterIndex == -1) {
            currentOutputs[i].destinationParameterIndex =
              model.getParameterIndex(currentOutputs[i].destination.id);
          }

          if (
            particleIndex < 1 ||
            particleIndex >= currentSetting.particleCount
          ) {
            continue;
          }

          const translation: CubismVector2 = new CubismVector2();
          translation.x =
            currentParticles[particleIndex].position.x -
            currentParticles[particleIndex - 1].position.x;
          translation.y =
            currentParticles[particleIndex].position.y -
            currentParticles[particleIndex - 1].position.y;

          outputValue = currentOutputs[i].getValue(
            translation,
            currentParticles,
            particleIndex,
            currentOutputs[i].reflect,
            this._options.gravity
          );

          this._currentRigOutputs.at(settingIndex).outputs.set(i, outputValue);

          const destinationParameterIndex: number =
            currentOutputs[i].destinationParameterIndex;
          const outParameterCaches: Float32Array =
            !Float32Array.prototype.slice &&
            'subarray' in Float32Array.prototype
              ? JSON.parse(
                  JSON.stringify(
                    this._parameterCaches.subarray(destinationParameterIndex)
                  )
                ) // 値渡しするため、JSON.parse, JSON.stringify
              : this._parameterCaches.slice(destinationParameterIndex);

          updateOutputParameterValue(
            outParameterCaches,
            parameterMinimumValues[destinationParameterIndex],
            parameterMaximumValues[destinationParameterIndex],
            outputValue,
            currentOutputs[i]
          );

          // 値を反映
          for (
            let offset: number = destinationParameterIndex, outParamIndex = 0;
            offset < this._parameterCaches.length;
            offset++, outParamIndex++
          ) {
            this._parameterCaches[offset] = outParameterCaches[outParamIndex];
          }
        }
      }
      this._currentRemainTime -= physicsDeltaTime;
    }

    const alpha: number = this._currentRemainTime / physicsDeltaTime;
    this.interpolate(model, alpha);
  }

  /**
   * 物理演算結果の適用
   * 振り子演算の最新の結果と一つ前の結果から指定した重みで適用する。
   * @param model 物理演算の結果を適用するモデル
   * @param weight 最新結果の重み
   */
  public interpolate(model: CubismModel, weight: number): void {
    let currentOutputs: CubismPhysicsOutput[];
    let currentSetting: CubismPhysicsSubRig;
    const parameterValues: Float32Array = model.getModel().parameters.values;
    const parameterMaximumValues: Float32Array =
      model.getModel().parameters.maximumValues;
    const parameterMinimumValues: Float32Array =
      model.getModel().parameters.minimumValues;

    for (
      let settingIndex = 0;
      settingIndex < this._physicsRig.subRigCount;
      ++settingIndex
    ) {
      currentSetting = this._physicsRig.settings.at(settingIndex);
      currentOutputs = this._physicsRig.outputs.get(
        currentSetting.baseOutputIndex
      );

      // Load input parameters.
      for (let i = 0; i < currentSetting.outputCount; ++i) {
        if (currentOutputs[i].destinationParameterIndex == -1) {
          continue;
        }

        const destinationParameterIndex: number =
          currentOutputs[i].destinationParameterIndex;
        const outParameterValues: Float32Array =
          !Float32Array.prototype.slice && 'subarray' in Float32Array.prototype
            ? JSON.parse(
                JSON.stringify(
                  parameterValues.subarray(destinationParameterIndex)
                )
              ) // 値渡しするため、JSON.parse, JSON.stringify
            : parameterValues.slice(destinationParameterIndex);

        updateOutputParameterValue(
          outParameterValues,
          parameterMinimumValues[destinationParameterIndex],
          parameterMaximumValues[destinationParameterIndex],
          this._previousRigOutputs.at(settingIndex).outputs.at(i) *
            (1 - weight) +
            this._currentRigOutputs.at(settingIndex).outputs.at(i) * weight,
          currentOutputs[i]
        );

        // 値を反映
        for (
          let offset: number = destinationParameterIndex, outParamIndex = 0;
          offset < parameterValues.length;
          offset++, outParamIndex++
        ) {
          parameterValues[offset] = outParameterValues[outParamIndex];
        }
      }
    }
  }

  /**
   * オプションの設定
   * @param options オプション
   */
  public setOptions(options: Options): void {
    this._options = options;
  }

  /**
   * オプションの取得
   * @return オプション
   */
  public getOption(): Options {
    return this._options;
  }

  /**
   * コンストラクタ
   */
  public constructor() {
    this._physicsRig = null;

    // set default options
    this._options = new Options();
    this._options.gravity.y = -1.0;
    this._options.gravity.x = 0.0;
    this._options.wind.x = 0.0;
    this._options.wind.y = 0.0;
    this._currentRigOutputs = new csmVector<PhysicsOutput>();
    this._previousRigOutputs = new csmVector<PhysicsOutput>();
    this._currentRemainTime = 0.0;
    this._parameterCaches = null;
    this._parameterInputCaches = null;
  }

  /**
   * デストラクタ相当の処理
   */
  public release(): void {
    this._physicsRig = void 0;
    this._physicsRig = null;
  }

  /**
   * 初期化する
   */
  public initialize(): void {
    let strand: CubismPhysicsParticle[];
    let currentSetting: CubismPhysicsSubRig;
    let radius: CubismVector2;

    for (
      let settingIndex = 0;
      settingIndex < this._physicsRig.subRigCount;
      ++settingIndex
    ) {
      currentSetting = this._physicsRig.settings.at(settingIndex);
      strand = this._physicsRig.particles.get(currentSetting.baseParticleIndex);

      // Initialize the top of particle.
      strand[0].initialPosition = new CubismVector2(0.0, 0.0);
      strand[0].lastPosition = new CubismVector2(
        strand[0].initialPosition.x,
        strand[0].initialPosition.y
      );
      strand[0].lastGravity = new CubismVector2(0.0, -1.0);
      strand[0].lastGravity.y *= -1.0;
      strand[0].velocity = new CubismVector2(0.0, 0.0);
      strand[0].force = new CubismVector2(0.0, 0.0);

      // Initialize particles.
      for (let i = 1; i < currentSetting.particleCount; ++i) {
        radius = new CubismVector2(0.0, 0.0);
        radius.y = strand[i].radius;
        strand[i].initialPosition = new CubismVector2(
          strand[i - 1].initialPosition.x + radius.x,
          strand[i - 1].initialPosition.y + radius.y
        );
        strand[i].position = new CubismVector2(
          strand[i].initialPosition.x,
          strand[i].initialPosition.y
        );
        strand[i].lastPosition = new CubismVector2(
          strand[i].initialPosition.x,
          strand[i].initialPosition.y
        );
        strand[i].lastGravity = new CubismVector2(0.0, -1.0);
        strand[i].lastGravity.y *= -1.0;
        strand[i].velocity = new CubismVector2(0.0, 0.0);
        strand[i].force = new CubismVector2(0.0, 0.0);
      }
    }
  }

  _physicsRig: CubismPhysicsRig; // 物理演算のデータ
  _options: Options; // オプション

  _currentRigOutputs: csmVector<PhysicsOutput>; ///< 最新の振り子計算の結果
  _previousRigOutputs: csmVector<PhysicsOutput>; ///< 一つ前の振り子計算の結果

  _currentRemainTime: number; ///< 物理演算が処理していない時間

  _parameterCaches: Float32Array; ///< Evaluateで利用するパラメータのキャッシュ
  _parameterInputCaches: Float32Array; ///< UpdateParticlesが動くときの入力をキャッシュ
}

/**
 * 物理演算のオプション
 */
export class Options {
  constructor() {
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
  }

  gravity: CubismVector2; // 重力方向
  wind: CubismVector2; // 風の方向
}

/**
 * パラメータに適用する前の物理演算の出力結果
 */
export class PhysicsOutput {
  constructor() {
    this.outputs = new csmVector<number>(0);
  }

  outputs: csmVector<number>; // 物理演算出力結果
}

/**
 * Gets sign.
 *
 * @param value Evaluation target value.
 *
 * @return Sign of value.
 */
function sign(value: number): number {
  let ret = 0;

  if (value > 0.0) {
    ret = 1;
  } else if (value < 0.0) {
    ret = -1;
  }

  return ret;
}

function getInputTranslationXFromNormalizedParameterValue(
  targetTranslation: CubismVector2,
  targetAngle: { angle: number },
  value: number,
  parameterMinimumValue: number,
  parameterMaximumValue: number,
  parameterDefaultValue: number,
  normalizationPosition: CubismPhysicsNormalization,
  normalizationAngle: CubismPhysicsNormalization,
  isInverted: boolean,
  weight: number
): void {
  targetTranslation.x +=
    normalizeParameterValue(
      value,
      parameterMinimumValue,
      parameterMaximumValue,
      parameterDefaultValue,
      normalizationPosition.minimum,
      normalizationPosition.maximum,
      normalizationPosition.defalut,
      isInverted
    ) * weight;
}

function getInputTranslationYFromNormalizedParamterValue(
  targetTranslation: CubismVector2,
  targetAngle: { angle: number },
  value: number,
  parameterMinimumValue: number,
  parameterMaximumValue: number,
  parameterDefaultValue: number,
  normalizationPosition: CubismPhysicsNormalization,
  normalizationAngle: CubismPhysicsNormalization,
  isInverted: boolean,
  weight: number
): void {
  targetTranslation.y +=
    normalizeParameterValue(
      value,
      parameterMinimumValue,
      parameterMaximumValue,
      parameterDefaultValue,
      normalizationPosition.minimum,
      normalizationPosition.maximum,
      normalizationPosition.defalut,
      isInverted
    ) * weight;
}

function getInputAngleFromNormalizedParameterValue(
  targetTranslation: CubismVector2,
  targetAngle: { angle: number },
  value: number,
  parameterMinimumValue: number,
  parameterMaximumValue: number,
  parameterDefaultValue: number,
  normalizaitionPosition: CubismPhysicsNormalization,
  normalizationAngle: CubismPhysicsNormalization,
  isInverted: boolean,
  weight: number
): void {
  targetAngle.angle +=
    normalizeParameterValue(
      value,
      parameterMinimumValue,
      parameterMaximumValue,
      parameterDefaultValue,
      normalizationAngle.minimum,
      normalizationAngle.maximum,
      normalizationAngle.defalut,
      isInverted
    ) * weight;
}

function getOutputTranslationX(
  translation: CubismVector2,
  particles: CubismPhysicsParticle[],
  particleIndex: number,
  isInverted: boolean,
  parentGravity: CubismVector2
): number {
  let outputValue: number = translation.x;

  if (isInverted) {
    outputValue *= -1.0;
  }

  return outputValue;
}

function getOutputTranslationY(
  translation: CubismVector2,
  particles: CubismPhysicsParticle[],
  particleIndex: number,
  isInverted: boolean,
  parentGravity: CubismVector2
): number {
  let outputValue: number = translation.y;

  if (isInverted) {
    outputValue *= -1.0;
  }
  return outputValue;
}

function getOutputAngle(
  translation: CubismVector2,
  particles: CubismPhysicsParticle[],
  particleIndex: number,
  isInverted: boolean,
  parentGravity: CubismVector2
): number {
  let outputValue: number;

  if (particleIndex >= 2) {
    parentGravity = particles[particleIndex - 1].position.substract(
      particles[particleIndex - 2].position
    );
  } else {
    parentGravity = parentGravity.multiplyByScaler(-1.0);
  }

  outputValue = CubismMath.directionToRadian(parentGravity, translation);

  if (isInverted) {
    outputValue *= -1.0;
  }

  return outputValue;
}

function getRangeValue(min: number, max: number): number {
  const maxValue: number = CubismMath.max(min, max);
  const minValue: number = CubismMath.min(min, max);

  return CubismMath.abs(maxValue - minValue);
}

function getDefaultValue(min: number, max: number): number {
  const minValue: number = CubismMath.min(min, max);
  return minValue + getRangeValue(min, max) / 2.0;
}

function getOutputScaleTranslationX(
  translationScale: CubismVector2,
  angleScale: number
): number {
  return JSON.parse(JSON.stringify(translationScale.x));
}

function getOutputScaleTranslationY(
  translationScale: CubismVector2,
  angleScale: number
): number {
  return JSON.parse(JSON.stringify(translationScale.y));
}

function getOutputScaleAngle(
  translationScale: CubismVector2,
  angleScale: number
): number {
  return JSON.parse(JSON.stringify(angleScale));
}

/**
 * Updates particles.
 *
 * @param strand                Target array of particle.
 * @param strandCount           Count of particle.
 * @param totalTranslation      Total translation value.
 * @param totalAngle            Total angle.
 * @param windDirection         Direction of Wind.
 * @param thresholdValue        Threshold of movement.
 * @param deltaTimeSeconds      Delta time.
 * @param airResistance         Air resistance.
 */
function updateParticles(
  strand: CubismPhysicsParticle[],
  strandCount: number,
  totalTranslation: CubismVector2,
  totalAngle: number,
  windDirection: CubismVector2,
  thresholdValue: number,
  deltaTimeSeconds: number,
  airResistance: number
) {
  let delay: number;
  let radian: number;
  let direction: CubismVector2 = new CubismVector2(0.0, 0.0);
  let velocity: CubismVector2 = new CubismVector2(0.0, 0.0);
  let force: CubismVector2 = new CubismVector2(0.0, 0.0);
  let newDirection: CubismVector2 = new CubismVector2(0.0, 0.0);

  strand[0].position = new CubismVector2(
    totalTranslation.x,
    totalTranslation.y
  );

  const totalRadian: number = CubismMath.degreesToRadian(totalAngle);
  const currentGravity: CubismVector2 =
    CubismMath.radianToDirection(totalRadian);
  currentGravity.normalize();

  for (let i = 1; i < strandCount; ++i) {
    strand[i].force = currentGravity
      .multiplyByScaler(strand[i].acceleration)
      .add(windDirection);

    strand[i].lastPosition = new CubismVector2(
      strand[i].position.x,
      strand[i].position.y
    );

    delay = strand[i].delay * deltaTimeSeconds * 30.0;

    direction = strand[i].position.substract(strand[i - 1].position);

    radian =
      CubismMath.directionToRadian(strand[i].lastGravity, currentGravity) /
      airResistance;

    direction.x =
      CubismMath.cos(radian) * direction.x -
      direction.y * CubismMath.sin(radian);
    direction.y =
      CubismMath.sin(radian) * direction.x +
      direction.y * CubismMath.cos(radian);

    strand[i].position = strand[i - 1].position.add(direction);

    velocity = strand[i].velocity.multiplyByScaler(delay);
    force = strand[i].force.multiplyByScaler(delay).multiplyByScaler(delay);

    strand[i].position = strand[i].position.add(velocity).add(force);

    newDirection = strand[i].position.substract(strand[i - 1].position);
    newDirection.normalize();

    strand[i].position = strand[i - 1].position.add(
      newDirection.multiplyByScaler(strand[i].radius)
    );

    if (CubismMath.abs(strand[i].position.x) < thresholdValue) {
      strand[i].position.x = 0.0;
    }

    if (delay != 0.0) {
      strand[i].velocity = strand[i].position.substract(strand[i].lastPosition);
      strand[i].velocity = strand[i].velocity.divisionByScalar(delay);
      strand[i].velocity = strand[i].velocity.multiplyByScaler(
        strand[i].mobility
      );
    }

    strand[i].force = new CubismVector2(0.0, 0.0);
    strand[i].lastGravity = new CubismVector2(
      currentGravity.x,
      currentGravity.y
    );
  }
}

/**
 * Updates particles for stabilization.
 *
 * @param strand                Target array of particle.
 * @param strandCount           Count of particle.
 * @param totalTranslation      Total translation value.
 * @param totalAngle            Total angle.
 * @param windDirection         Direction of Wind.
 * @param thresholdValue        Threshold of movement.
 */
function updateParticlesForStabilization(
  strand: CubismPhysicsParticle[],
  strandCount: number,
  totalTranslation: CubismVector2,
  totalAngle: number,
  windDirection: CubismVector2,
  thresholdValue: number
) {
  let force: CubismVector2 = new CubismVector2(0.0, 0.0);

  strand[0].position = new CubismVector2(
    totalTranslation.x,
    totalTranslation.y
  );

  const totalRadian: number = CubismMath.degreesToRadian(totalAngle);
  const currentGravity: CubismVector2 =
    CubismMath.radianToDirection(totalRadian);
  currentGravity.normalize();

  for (let i = 1; i < strandCount; ++i) {
    strand[i].force = currentGravity
      .multiplyByScaler(strand[i].acceleration)
      .add(windDirection);

    strand[i].lastPosition = new CubismVector2(
      strand[i].position.x,
      strand[i].position.y
    );

    strand[i].velocity = new CubismVector2(0.0, 0.0);
    force = strand[i].force;
    force.normalize();

    force = force.multiplyByScaler(strand[i].radius);
    strand[i].position = strand[i - 1].position.add(force);

    if (CubismMath.abs(strand[i].position.x) < thresholdValue) {
      strand[i].position.x = 0.0;
    }

    strand[i].force = new CubismVector2(0.0, 0.0);
    strand[i].lastGravity = new CubismVector2(
      currentGravity.x,
      currentGravity.y
    );
  }
}

/**
 * Updates output parameter value.
 * @param parameterValue            Target parameter value.
 * @param parameterValueMinimum     Minimum of parameter value.
 * @param parameterValueMaximum     Maximum of parameter value.
 * @param translation               Translation value.
 */
function updateOutputParameterValue(
  parameterValue: Float32Array,
  parameterValueMinimum: number,
  parameterValueMaximum: number,
  translation: number,
  output: CubismPhysicsOutput
): void {
  let value: number;
  const outputScale: number = output.getScale(
    output.translationScale,
    output.angleScale
  );

  value = translation * outputScale;

  if (value < parameterValueMinimum) {
    if (value < output.valueBelowMinimum) {
      output.valueBelowMinimum = value;
    }

    value = parameterValueMinimum;
  } else if (value > parameterValueMaximum) {
    if (value > output.valueExceededMaximum) {
      output.valueExceededMaximum = value;
    }

    value = parameterValueMaximum;
  }

  const weight: number = output.weight / MaximumWeight;

  if (weight >= 1.0) {
    parameterValue[0] = value;
  } else {
    value = parameterValue[0] * (1.0 - weight) + value * weight;
    parameterValue[0] = value;
  }
}

function normalizeParameterValue(
  value: number,
  parameterMinimum: number,
  parameterMaximum: number,
  parameterDefault: number,
  normalizedMinimum: number,
  normalizedMaximum: number,
  normalizedDefault: number,
  isInverted: boolean
) {
  let result = 0.0;

  const maxValue: number = CubismMath.max(parameterMaximum, parameterMinimum);

  if (maxValue < value) {
    value = maxValue;
  }

  const minValue: number = CubismMath.min(parameterMaximum, parameterMinimum);

  if (minValue > value) {
    value = minValue;
  }

  const minNormValue: number = CubismMath.min(
    normalizedMinimum,
    normalizedMaximum
  );
  const maxNormValue: number = CubismMath.max(
    normalizedMinimum,
    normalizedMaximum
  );
  const middleNormValue: number = normalizedDefault;

  const middleValue: number = getDefaultValue(minValue, maxValue);
  const paramValue: number = value - middleValue;

  switch (sign(paramValue)) {
    case 1: {
      const nLength: number = maxNormValue - middleNormValue;
      const pLength: number = maxValue - middleValue;

      if (pLength != 0.0) {
        result = paramValue * (nLength / pLength);
        result += middleNormValue;
      }

      break;
    }
    case -1: {
      const nLength: number = minNormValue - middleNormValue;
      const pLength: number = minValue - middleValue;

      if (pLength != 0.0) {
        result = paramValue * (nLength / pLength);
        result += middleNormValue;
      }

      break;
    }
    case 0: {
      result = middleNormValue;

      break;
    }
    default: {
      break;
    }
  }

  return isInverted ? result : result * -1.0;
}

// Namespace definition for compatibility.
import * as $ from './cubismphysics';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismPhysics = $.CubismPhysics;
  export type CubismPhysics = $.CubismPhysics;
  export const Options = $.Options;
  export type Options = $.Options;
}
