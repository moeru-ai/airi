/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';
import { CubismFramework } from '../live2dcubismframework';
import {
  CubismBlendMode,
  CubismTextureColor
} from '../rendering/cubismrenderer';
import { csmMap } from '../type/csmmap';
import { csmVector } from '../type/csmvector';
import { CSM_ASSERT } from '../utils/cubismdebug';

/**
 * SDK側から与えられたDrawableの乗算色・スクリーン色上書きフラグと
 * その色を保持する構造体
 */
export class DrawableColorData {
  constructor(
    isOverwritten = false,
    color: CubismTextureColor = new CubismTextureColor()
  ) {
    this.isOverwritten = isOverwritten;
    this.color = color;
  }

  public isOverwritten: boolean;
  public color: CubismTextureColor;
}
/**
 * @brief テクスチャの色をRGBAで扱うための構造体
 */
export class PartColorData {
  constructor(
    isOverwritten = false,
    color: CubismTextureColor = new CubismTextureColor()
  ) {
    this.isOverwritten = isOverwritten;
    this.color = color;
  }

  public isOverwritten: boolean;
  public color: CubismTextureColor;
}

/**
 * テクスチャのカリング設定を管理するための構造体
 */
export class DrawableCullingData {
  /**
   * コンストラクタ
   *
   * @param isOverwritten
   * @param isCulling
   */
  public constructor(isOverwritten = false, isCulling = false) {
    this.isOverwritten = isOverwritten;
    this.isCulling = isCulling;
  }

  public isOverwritten: boolean;
  public isCulling: boolean;
}

/**
 * モデル
 *
 * Mocデータから生成されるモデルのクラス。
 */
export class CubismModel {
  /**
   * モデルのパラメータの更新
   */
  public update(): void {
    // Update model
    this._model.update();

    this._model.drawables.resetDynamicFlags();
  }

  /**
   * PixelsPerUnitを取得する
   * @returns PixelsPerUnit
   */
  public getPixelsPerUnit(): number {
    if (this._model == null) {
      return 0.0;
    }

    return this._model.canvasinfo.PixelsPerUnit;
  }

  /**
   * キャンバスの幅を取得する
   */
  public getCanvasWidth(): number {
    if (this._model == null) {
      return 0.0;
    }

    return (
      this._model.canvasinfo.CanvasWidth / this._model.canvasinfo.PixelsPerUnit
    );
  }

  /**
   * キャンバスの高さを取得する
   */
  public getCanvasHeight(): number {
    if (this._model == null) {
      return 0.0;
    }

    return (
      this._model.canvasinfo.CanvasHeight / this._model.canvasinfo.PixelsPerUnit
    );
  }

  /**
   * パラメータを保存する
   */
  public saveParameters(): void {
    const parameterCount: number = this._model.parameters.count;
    const savedParameterCount: number = this._savedParameters.getSize();

    for (let i = 0; i < parameterCount; ++i) {
      if (i < savedParameterCount) {
        this._savedParameters.set(i, this._parameterValues[i]);
      } else {
        this._savedParameters.pushBack(this._parameterValues[i]);
      }
    }
  }

  /**
   * 乗算色を取得する
   * @param index Drawablesのインデックス
   * @returns 指定したdrawableの乗算色(RGBA)
   */
  public getMultiplyColor(index: number): CubismTextureColor {
    // Drawableとモデル全体の乗算色上書きフラグがどちらもtrueな場合、モデル全体の上書きフラグが優先される
    if (
      this.getOverwriteFlagForModelMultiplyColors() ||
      this.getOverwriteFlagForDrawableMultiplyColors(index)
    ) {
      return this._userMultiplyColors.at(index).color;
    }

    const color = this.getDrawableMultiplyColor(index);
    return color;
  }

  /**
   * スクリーン色を取得する
   * @param index Drawablesのインデックス
   * @returns 指定したdrawableのスクリーン色(RGBA)
   */
  public getScreenColor(index: number): CubismTextureColor {
    // Drawableとモデル全体のスクリーン色上書きフラグがどちらもtrueな場合、モデル全体の上書きフラグが優先される
    if (
      this.getOverwriteFlagForModelScreenColors() ||
      this.getOverwriteFlagForDrawableScreenColors(index)
    ) {
      return this._userScreenColors.at(index).color;
    }

    const color = this.getDrawableScreenColor(index);
    return color;
  }

  /**
   * 乗算色をセットする
   * @param index Drawablesのインデックス
   * @param color 設定する乗算色(CubismTextureColor)
   */
  public setMultiplyColorByTextureColor(
    index: number,
    color: CubismTextureColor
  ) {
    this.setMultiplyColorByRGBA(index, color.r, color.g, color.b, color.a);
  }

  /**
   * 乗算色をセットする
   * @param index Drawablesのインデックス
   * @param r 設定する乗算色のR値
   * @param g 設定する乗算色のG値
   * @param b 設定する乗算色のB値
   * @param a 設定する乗算色のA値
   */
  public setMultiplyColorByRGBA(
    index: number,
    r: number,
    g: number,
    b: number,
    a = 1.0
  ) {
    this._userMultiplyColors.at(index).color.r = r;
    this._userMultiplyColors.at(index).color.g = g;
    this._userMultiplyColors.at(index).color.b = b;
    this._userMultiplyColors.at(index).color.a = a;
  }

  /**
   * スクリーン色をセットする
   * @param index Drawablesのインデックス
   * @param color 設定するスクリーン色(CubismTextureColor)
   */
  public setScreenColorByTextureColor(
    index: number,
    color: CubismTextureColor
  ) {
    this.setScreenColorByRGBA(index, color.r, color.g, color.b, color.a);
  }

  /**
   * スクリーン色をセットする
   * @param index Drawablesのインデックス
   * @param r 設定するスクリーン色のR値
   * @param g 設定するスクリーン色のG値
   * @param b 設定するスクリーン色のB値
   * @param a 設定するスクリーン色のA値
   */
  public setScreenColorByRGBA(
    index: number,
    r: number,
    g: number,
    b: number,
    a = 1.0
  ) {
    this._userScreenColors.at(index).color.r = r;
    this._userScreenColors.at(index).color.g = g;
    this._userScreenColors.at(index).color.b = b;
    this._userScreenColors.at(index).color.a = a;
  }
  /**
   * partの乗算色を取得する
   * @param partIndex partのインデックス
   * @returns 指定したpartの乗算色
   */
  public getPartMultiplyColor(partIndex: number): CubismTextureColor {
    return this._userPartMultiplyColors.at(partIndex).color;
  }

  /**
   * partのスクリーン色を取得する
   * @param partIndex partのインデックス
   * @returns 指定したpartのスクリーン色
   */
  public getPartScreenColor(partIndex: number): CubismTextureColor {
    return this._userPartScreenColors.at(partIndex).color;
  }

  /**
   * partのOverwriteColor setter関数
   * @param partIndex partのインデックス
   * @param r 設定する色のR値
   * @param g 設定する色のG値
   * @param b 設定する色のB値
   * @param a 設定する色のA値
   * @param partColors 設定するpartのカラーデータ配列
   * @param drawableColors partに関連するDrawableのカラーデータ配列
   */
  public setPartColor(
    partIndex: number,
    r: number,
    g: number,
    b: number,
    a: number,
    partColors: csmVector<PartColorData>,
    drawableColors: csmVector<DrawableColorData>
  ) {
    partColors.at(partIndex).color.r = r;
    partColors.at(partIndex).color.g = g;
    partColors.at(partIndex).color.b = b;
    partColors.at(partIndex).color.a = a;

    if (partColors.at(partIndex).isOverwritten) {
      for (
        let i = 0;
        i < this._partChildDrawables.at(partIndex).getSize();
        ++i
      ) {
        const drawableIndex = this._partChildDrawables.at(partIndex).at(i);
        drawableColors.at(drawableIndex).color.r = r;
        drawableColors.at(drawableIndex).color.g = g;
        drawableColors.at(drawableIndex).color.b = b;
        drawableColors.at(drawableIndex).color.a = a;
      }
    }
  }

  /**
   * 乗算色をセットする
   * @param partIndex partのインデックス
   * @param color 設定する乗算色(CubismTextureColor)
   */
  public setPartMultiplyColorByTextureColor(
    partIndex: number,
    color: CubismTextureColor
  ) {
    this.setPartMultiplyColorByRGBA(
      partIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }

  /**
   * 乗算色をセットする
   * @param partIndex partのインデックス
   * @param r 設定する乗算色のR値
   * @param g 設定する乗算色のG値
   * @param b 設定する乗算色のB値
   * @param a 設定する乗算色のA値
   */
  public setPartMultiplyColorByRGBA(
    partIndex: number,
    r: number,
    g: number,
    b: number,
    a: number
  ) {
    this.setPartColor(
      partIndex,
      r,
      g,
      b,
      a,
      this._userPartMultiplyColors,
      this._userMultiplyColors
    );
  }

  /**
   * スクリーン色をセットする
   * @param partIndex partのインデックス
   * @param color 設定するスクリーン色(CubismTextureColor)
   */
  public setPartScreenColorByTextureColor(
    partIndex: number,
    color: CubismTextureColor
  ) {
    this.setPartScreenColorByRGBA(
      partIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }

  /**
   * スクリーン色をセットする
   * @param partIndex partのインデックス
   * @param r 設定するスクリーン色のR値
   * @param g 設定するスクリーン色のG値
   * @param b 設定するスクリーン色のB値
   * @param a 設定するスクリーン色のA値
   */
  public setPartScreenColorByRGBA(
    partIndex: number,
    r: number,
    g: number,
    b: number,
    a: number
  ) {
    this.setPartColor(
      partIndex,
      r,
      g,
      b,
      a,
      this._userPartScreenColors,
      this._userScreenColors
    );
  }

  /**
   * SDKから指定したモデルの乗算色を上書きするか
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  public getOverwriteFlagForModelMultiplyColors(): boolean {
    return this._isOverwrittenModelMultiplyColors;
  }

  /**
   * SDKから指定したモデルのスクリーン色を上書きするか
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  public getOverwriteFlagForModelScreenColors(): boolean {
    return this._isOverwrittenModelScreenColors;
  }

  /**
   * SDKから指定したモデルの乗算色を上書きするかセットする
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  public setOverwriteFlagForModelMultiplyColors(value: boolean) {
    this._isOverwrittenModelMultiplyColors = value;
  }

  /**
   * SDKから指定したモデルのスクリーン色を上書きするかセットする
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  public setOverwriteFlagForModelScreenColors(value: boolean) {
    this._isOverwrittenModelScreenColors = value;
  }

  /**
   * SDKから指定したDrawableIndexの乗算色を上書きするか
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  public getOverwriteFlagForDrawableMultiplyColors(
    drawableindex: number
  ): boolean {
    return this._userMultiplyColors.at(drawableindex).isOverwritten;
  }

  /**
   * SDKから指定したDrawableIndexのスクリーン色を上書きするか
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  public getOverwriteFlagForDrawableScreenColors(
    drawableindex: number
  ): boolean {
    return this._userScreenColors.at(drawableindex).isOverwritten;
  }

  /**
   * SDKから指定したDrawableIndexの乗算色を上書きするかセットする
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  public setOverwriteFlagForDrawableMultiplyColors(
    drawableindex: number,
    value: boolean
  ) {
    this._userMultiplyColors.at(drawableindex).isOverwritten = value;
  }

  /**
   * SDKから指定したDrawableIndexのスクリーン色を上書きするかセットする
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  public setOverwriteFlagForDrawableScreenColors(
    drawableindex: number,
    value: boolean
  ) {
    this._userScreenColors.at(drawableindex).isOverwritten = value;
  }

  /**
   * SDKからpartの乗算色を上書きするか
   * @param partIndex partのインデックス
   * @returns true    ->  SDKからの情報を優先する
   *          false   ->  モデルに設定されている色情報を使用
   */
  public getOverwriteColorForPartMultiplyColors(partIndex: number) {
    return this._userPartMultiplyColors.at(partIndex).isOverwritten;
  }

  /**
   * SDKからpartのスクリーン色を上書きするか
   * @param partIndex partのインデックス
   * @returns true    ->  SDKからの情報を優先する
   *          false   ->  モデルに設定されている色情報を使用
   */
  public getOverwriteColorForPartScreenColors(partIndex: number) {
    return this._userPartScreenColors.at(partIndex).isOverwritten;
  }

  /**
   * partのOverwriteFlag setter関数
   * @param partIndex partのインデックス
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   * @param partColors 設定するpartのカラーデータ配列
   * @param drawableColors partに関連するDrawableのカラーデータ配列
   */
  public setOverwriteColorForPartColors(
    partIndex: number,
    value: boolean,
    partColors: csmVector<PartColorData>,
    drawableColors: csmVector<DrawableColorData>
  ) {
    partColors.at(partIndex).isOverwritten = value;

    for (let i = 0; i < this._partChildDrawables.at(partIndex).getSize(); ++i) {
      const drawableIndex = this._partChildDrawables.at(partIndex).at(i);
      drawableColors.at(drawableIndex).isOverwritten = value;

      if (value) {
        drawableColors.at(drawableIndex).color.r =
          partColors.at(partIndex).color.r;
        drawableColors.at(drawableIndex).color.g =
          partColors.at(partIndex).color.g;
        drawableColors.at(drawableIndex).color.b =
          partColors.at(partIndex).color.b;
        drawableColors.at(drawableIndex).color.a =
          partColors.at(partIndex).color.a;
      }
    }
  }

  /**
   * SDKからpartのスクリーン色を上書きするかをセットする
   * @param partIndex partのインデックス
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  public setOverwriteColorForPartMultiplyColors(
    partIndex: number,
    value: boolean
  ) {
    this._userPartMultiplyColors.at(partIndex).isOverwritten = value;
    this.setOverwriteColorForPartColors(
      partIndex,
      value,
      this._userPartMultiplyColors,
      this._userMultiplyColors
    );
  }

  /**
   * SDKからpartのスクリーン色を上書きするかをセットする
   * @param partIndex partのインデックス
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  public setOverwriteColorForPartScreenColors(
    partIndex: number,
    value: boolean
  ) {
    this._userPartScreenColors.at(partIndex).isOverwritten = value;
    this.setOverwriteColorForPartColors(
      partIndex,
      value,
      this._userPartScreenColors,
      this._userScreenColors
    );
  }

  /**
   * Drawableのカリング情報を取得する。
   *
   * @param   drawableIndex   Drawableのインデックス
   * @return  Drawableのカリング情報
   */
  public getDrawableCulling(drawableIndex: number): boolean {
    if (
      this.getOverwriteFlagForModelCullings() ||
      this.getOverwriteFlagForDrawableCullings(drawableIndex)
    ) {
      return this._userCullings.at(drawableIndex).isCulling;
    }

    const constantFlags = this._model.drawables.constantFlags;
    return !Live2DCubismCore.Utils.hasIsDoubleSidedBit(
      constantFlags[drawableIndex]
    );
  }

  /**
   * Drawableのカリング情報を設定する。
   *
   * @param drawableIndex Drawableのインデックス
   * @param isCulling カリング情報
   */
  public setDrawableCulling(drawableIndex: number, isCulling: boolean): void {
    this._userCullings.at(drawableIndex).isCulling = isCulling;
  }

  /**
   * SDKからモデル全体のカリング設定を上書きするか。
   *
   * @retval  true    ->  SDK上のカリング設定を使用
   * @retval  false   ->  モデルのカリング設定を使用
   */
  public getOverwriteFlagForModelCullings(): boolean {
    return this._isOverwrittenCullings;
  }

  /**
   * SDKからモデル全体のカリング設定を上書きするかを設定する。
   *
   * @param isOverwrittenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
   */
  public setOverwriteFlagForModelCullings(
    isOverwrittenCullings: boolean
  ): void {
    this._isOverwrittenCullings = isOverwrittenCullings;
  }

  /**
   *
   * @param drawableIndex Drawableのインデックス
   * @retval  true    ->  SDK上のカリング設定を使用
   * @retval  false   ->  モデルのカリング設定を使用
   */
  public getOverwriteFlagForDrawableCullings(drawableIndex: number): boolean {
    return this._userCullings.at(drawableIndex).isOverwritten;
  }

  /**
   *
   * @param drawableIndex Drawableのインデックス
   * @param isOverwrittenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
   */
  public setOverwriteFlagForDrawableCullings(
    drawableIndex: number,
    isOverwrittenCullings: boolean
  ): void {
    this._userCullings.at(drawableIndex).isOverwritten = isOverwrittenCullings;
  }

  /**
   * モデルの不透明度を取得する
   *
   * @returns 不透明度の値
   */
  public getModelOapcity(): number {
    return this._modelOpacity;
  }

  /**
   * モデルの不透明度を設定する
   *
   * @param value 不透明度の値
   */
  public setModelOapcity(value: number) {
    this._modelOpacity = value;
  }

  /**
   * モデルを取得
   */
  public getModel(): Live2DCubismCore.Model {
    return this._model;
  }

  /**
   * パーツのインデックスを取得
   * @param partId パーツのID
   * @return パーツのインデックス
   */
  public getPartIndex(partId: CubismIdHandle): number {
    let partIndex: number;
    const partCount: number = this._model.parts.count;

    for (partIndex = 0; partIndex < partCount; ++partIndex) {
      if (partId == this._partIds.at(partIndex)) {
        return partIndex;
      }
    }

    // モデルに存在していない場合、非存在パーツIDリスト内にあるかを検索し、そのインデックスを返す
    if (this._notExistPartId.isExist(partId)) {
      return this._notExistPartId.getValue(partId);
    }

    // 非存在パーツIDリストにない場合、新しく要素を追加する
    partIndex = partCount + this._notExistPartId.getSize();
    this._notExistPartId.setValue(partId, partIndex);
    this._notExistPartOpacities.appendKey(partIndex);

    return partIndex;
  }

  /**
   * パーツのIDを取得する。
   *
   * @param partIndex 取得するパーツのインデックス
   * @return パーツのID
   */
  public getPartId(partIndex: number): CubismIdHandle {
    const partId = this._model.parts.ids[partIndex];
    return CubismFramework.getIdManager().getId(partId);
  }

  /**
   * パーツの個数の取得
   * @return パーツの個数
   */
  public getPartCount(): number {
    const partCount: number = this._model.parts.count;
    return partCount;
  }

  /**
   * パーツの不透明度の設定(Index)
   * @param partIndex パーツのインデックス
   * @param opacity 不透明度
   */
  public setPartOpacityByIndex(partIndex: number, opacity: number): void {
    if (this._notExistPartOpacities.isExist(partIndex)) {
      this._notExistPartOpacities.setValue(partIndex, opacity);
      return;
    }

    // インデックスの範囲内検知
    CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());

    this._partOpacities[partIndex] = opacity;
  }

  /**
   * パーツの不透明度の設定(Id)
   * @param partId パーツのID
   * @param opacity パーツの不透明度
   */
  public setPartOpacityById(partId: CubismIdHandle, opacity: number): void {
    // 高速化のためにPartIndexを取得できる機構になっているが、外部からの設定の時は呼び出し頻度が低いため不要
    const index: number = this.getPartIndex(partId);

    if (index < 0) {
      return; // パーツがないのでスキップ
    }

    this.setPartOpacityByIndex(index, opacity);
  }

  /**
   * パーツの不透明度の取得(index)
   * @param partIndex パーツのインデックス
   * @return パーツの不透明度
   */
  public getPartOpacityByIndex(partIndex: number): number {
    if (this._notExistPartOpacities.isExist(partIndex)) {
      // モデルに存在しないパーツIDの場合、非存在パーツリストから不透明度を返す。
      return this._notExistPartOpacities.getValue(partIndex);
    }

    // インデックスの範囲内検知
    CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());

    return this._partOpacities[partIndex];
  }

  /**
   * パーツの不透明度の取得(id)
   * @param partId パーツのＩｄ
   * @return パーツの不透明度
   */
  public getPartOpacityById(partId: CubismIdHandle): number {
    // 高速化のためにPartIndexを取得できる機構になっているが、外部からの設定の時は呼び出し頻度が低いため不要
    const index: number = this.getPartIndex(partId);

    if (index < 0) {
      return 0; // パーツが無いのでスキップ
    }

    return this.getPartOpacityByIndex(index);
  }

  /**
   * パラメータのインデックスの取得
   * @param パラメータID
   * @return パラメータのインデックス
   */
  public getParameterIndex(parameterId: CubismIdHandle): number {
    let parameterIndex: number;
    const idCount: number = this._model.parameters.count;

    for (parameterIndex = 0; parameterIndex < idCount; ++parameterIndex) {
      if (parameterId != this._parameterIds.at(parameterIndex)) {
        continue;
      }

      return parameterIndex;
    }

    // モデルに存在していない場合、非存在パラメータIDリスト内を検索し、そのインデックスを返す
    if (this._notExistParameterId.isExist(parameterId)) {
      return this._notExistParameterId.getValue(parameterId);
    }

    // 非存在パラメータIDリストにない場合新しく要素を追加する
    parameterIndex =
      this._model.parameters.count + this._notExistParameterId.getSize();

    this._notExistParameterId.setValue(parameterId, parameterIndex);
    this._notExistParameterValues.appendKey(parameterIndex);

    return parameterIndex;
  }

  /**
   * パラメータの個数の取得
   * @return パラメータの個数
   */
  public getParameterCount(): number {
    return this._model.parameters.count;
  }

  /**
   * パラメータの種類の取得
   * @param parameterIndex パラメータのインデックス
   * @return csmParameterType_Normal -> 通常のパラメータ
   *          csmParameterType_BlendShape -> ブレンドシェイプパラメータ
   */
  public getParameterType(
    parameterIndex: number
  ): Live2DCubismCore.csmParameterType {
    return this._model.parameters.types[parameterIndex];
  }

  /**
   * パラメータの最大値の取得
   * @param parameterIndex パラメータのインデックス
   * @return パラメータの最大値
   */
  public getParameterMaximumValue(parameterIndex: number): number {
    return this._model.parameters.maximumValues[parameterIndex];
  }

  /**
   * パラメータの最小値の取得
   * @param parameterIndex パラメータのインデックス
   * @return パラメータの最小値
   */
  public getParameterMinimumValue(parameterIndex: number): number {
    return this._model.parameters.minimumValues[parameterIndex];
  }

  /**
   * パラメータのデフォルト値の取得
   * @param parameterIndex パラメータのインデックス
   * @return パラメータのデフォルト値
   */
  public getParameterDefaultValue(parameterIndex: number): number {
    return this._model.parameters.defaultValues[parameterIndex];
  }

  /**
   * 指定したパラメータindexのIDを取得
   *
   * @param parameterIndex パラメータのインデックス
   * @returns パラメータID
   */
  public getParameterId(parameterIndex: number): CubismIdHandle {
    return CubismFramework.getIdManager().getId(
      this._model.parameters.ids[parameterIndex]
    );
  }

  /**
   * パラメータの値の取得
   * @param parameterIndex    パラメータのインデックス
   * @return パラメータの値
   */
  public getParameterValueByIndex(parameterIndex: number): number {
    if (this._notExistParameterValues.isExist(parameterIndex)) {
      return this._notExistParameterValues.getValue(parameterIndex);
    }

    // インデックスの範囲内検知
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );

    return this._parameterValues[parameterIndex];
  }

  /**
   * パラメータの値の取得
   * @param parameterId    パラメータのID
   * @return パラメータの値
   */
  public getParameterValueById(parameterId: CubismIdHandle): number {
    // 高速化のためにparameterIndexを取得できる機構になっているが、外部からの設定の時は呼び出し頻度が低いため不要
    const parameterIndex: number = this.getParameterIndex(parameterId);
    return this.getParameterValueByIndex(parameterIndex);
  }

  /**
   * パラメータの値の設定
   * @param parameterIndex パラメータのインデックス
   * @param value パラメータの値
   * @param weight 重み
   */
  public setParameterValueByIndex(
    parameterIndex: number,
    value: number,
    weight = 1.0
  ): void {
    if (this._notExistParameterValues.isExist(parameterIndex)) {
      this._notExistParameterValues.setValue(
        parameterIndex,
        weight == 1
          ? value
          : this._notExistParameterValues.getValue(parameterIndex) *
              (1 - weight) +
              value * weight
      );

      return;
    }

    // インデックスの範囲内検知
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );

    if (this._model.parameters.maximumValues[parameterIndex] < value) {
      value = this._model.parameters.maximumValues[parameterIndex];
    }
    if (this._model.parameters.minimumValues[parameterIndex] > value) {
      value = this._model.parameters.minimumValues[parameterIndex];
    }

    this._parameterValues[parameterIndex] =
      weight == 1
        ? value
        : (this._parameterValues[parameterIndex] =
            this._parameterValues[parameterIndex] * (1 - weight) +
            value * weight);
  }

  /**
   * パラメータの値の設定
   * @param parameterId パラメータのID
   * @param value パラメータの値
   * @param weight 重み
   */
  public setParameterValueById(
    parameterId: CubismIdHandle,
    value: number,
    weight = 1.0
  ): void {
    const index: number = this.getParameterIndex(parameterId);
    this.setParameterValueByIndex(index, value, weight);
  }

  /**
   * パラメータの値の加算(index)
   * @param parameterIndex パラメータインデックス
   * @param value 加算する値
   * @param weight 重み
   */
  public addParameterValueByIndex(
    parameterIndex: number,
    value: number,
    weight = 1.0
  ): void {
    this.setParameterValueByIndex(
      parameterIndex,
      this.getParameterValueByIndex(parameterIndex) + value * weight
    );
  }

  /**
   * パラメータの値の加算(id)
   * @param parameterId パラメータＩＤ
   * @param value 加算する値
   * @param weight 重み
   */
  public addParameterValueById(
    parameterId: any,
    value: number,
    weight = 1.0
  ): void {
    const index: number = this.getParameterIndex(parameterId);
    this.addParameterValueByIndex(index, value, weight);
  }

  /**
   * パラメータの値の乗算
   * @param parameterId パラメータのID
   * @param value 乗算する値
   * @param weight 重み
   */
  public multiplyParameterValueById(
    parameterId: CubismIdHandle,
    value: number,
    weight = 1.0
  ): void {
    const index: number = this.getParameterIndex(parameterId);
    this.multiplyParameterValueByIndex(index, value, weight);
  }

  /**
   * パラメータの値の乗算
   * @param parameterIndex パラメータのインデックス
   * @param value 乗算する値
   * @param weight 重み
   */
  public multiplyParameterValueByIndex(
    parameterIndex: number,
    value: number,
    weight = 1.0
  ): void {
    this.setParameterValueByIndex(
      parameterIndex,
      this.getParameterValueByIndex(parameterIndex) *
        (1.0 + (value - 1.0) * weight)
    );
  }

  /**
   * Drawableのインデックスの取得
   * @param drawableId DrawableのID
   * @return Drawableのインデックス
   */
  public getDrawableIndex(drawableId: CubismIdHandle): number {
    const drawableCount = this._model.drawables.count;

    for (
      let drawableIndex = 0;
      drawableIndex < drawableCount;
      ++drawableIndex
    ) {
      if (this._drawableIds.at(drawableIndex) == drawableId) {
        return drawableIndex;
      }
    }

    return -1;
  }

  /**
   * Drawableの個数の取得
   * @return drawableの個数
   */
  public getDrawableCount(): number {
    const drawableCount = this._model.drawables.count;
    return drawableCount;
  }

  /**
   * DrawableのIDを取得する
   * @param drawableIndex Drawableのインデックス
   * @return drawableのID
   */
  public getDrawableId(drawableIndex: number): CubismIdHandle {
    const parameterIds: string[] = this._model.drawables.ids;
    return CubismFramework.getIdManager().getId(parameterIds[drawableIndex]);
  }

  /**
   * Drawableの描画順リストの取得
   * @return Drawableの描画順リスト
   */
  public getDrawableRenderOrders(): Int32Array {
    const renderOrders: Int32Array = this._model.drawables.renderOrders;
    return renderOrders;
  }

  /**
   * @deprecated
   * 関数名が誤っていたため、代替となる getDrawableTextureIndex を追加し、この関数は非推奨となりました。
   *
   * Drawableのテクスチャインデックスリストの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableのテクスチャインデックスリスト
   */
  public getDrawableTextureIndices(drawableIndex: number): number {
    return this.getDrawableTextureIndex(drawableIndex);
  }

  /**
   * Drawableのテクスチャインデックスの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableのテクスチャインデックス
   */
  public getDrawableTextureIndex(drawableIndex: number): number {
    const textureIndices: Int32Array = this._model.drawables.textureIndices;
    return textureIndices[drawableIndex];
  }

  /**
   * DrawableのVertexPositionsの変化情報の取得
   *
   * 直近のCubismModel.update関数でDrawableの頂点情報が変化したかを取得する。
   *
   * @param   drawableIndex   Drawableのインデックス
   * @retval  true    Drawableの頂点情報が直近のCubismModel.update関数で変化した
   * @retval  false   Drawableの頂点情報が直近のCubismModel.update関数で変化していない
   */
  public getDrawableDynamicFlagVertexPositionsDidChange(
    drawableIndex: number
  ): boolean {
    const dynamicFlags: Uint8Array = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasVertexPositionsDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }

  /**
   * Drawableの頂点インデックスの個数の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点インデックスの個数
   */
  public getDrawableVertexIndexCount(drawableIndex: number): number {
    const indexCounts: Int32Array = this._model.drawables.indexCounts;
    return indexCounts[drawableIndex];
  }

  /**
   * Drawableの頂点の個数の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点の個数
   */
  public getDrawableVertexCount(drawableIndex: number): number {
    const vertexCounts = this._model.drawables.vertexCounts;
    return vertexCounts[drawableIndex];
  }

  /**
   * Drawableの頂点リストの取得
   * @param drawableIndex drawableのインデックス
   * @return drawableの頂点リスト
   */
  public getDrawableVertices(drawableIndex: number): Float32Array {
    return this.getDrawableVertexPositions(drawableIndex);
  }

  /**
   * Drawableの頂点インデックスリストの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点インデックスリスト
   */
  public getDrawableVertexIndices(drawableIndex: number): Uint16Array {
    const indicesArray: Uint16Array[] = this._model.drawables.indices;
    return indicesArray[drawableIndex];
  }

  /**
   * Drawableの頂点リストの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点リスト
   */
  public getDrawableVertexPositions(drawableIndex: number): Float32Array {
    const verticesArray: Float32Array[] = this._model.drawables.vertexPositions;
    return verticesArray[drawableIndex];
  }

  /**
   * Drawableの頂点のUVリストの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点UVリスト
   */
  public getDrawableVertexUvs(drawableIndex: number): Float32Array {
    const uvsArray: Float32Array[] = this._model.drawables.vertexUvs;
    return uvsArray[drawableIndex];
  }

  /**
   * Drawableの不透明度の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの不透明度
   */
  public getDrawableOpacity(drawableIndex: number): number {
    const opacities: Float32Array = this._model.drawables.opacities;
    return opacities[drawableIndex];
  }

  /**
   * Drawableの乗算色の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの乗算色(RGBA)
   * スクリーン色はRGBAで取得されるが、Aは必ず0
   */
  public getDrawableMultiplyColor(drawableIndex: number): CubismTextureColor {
    const multiplyColors: Float32Array = this._model.drawables.multiplyColors;
    const index = drawableIndex * 4;
    const multiplyColor: CubismTextureColor = new CubismTextureColor();
    multiplyColor.r = multiplyColors[index];
    multiplyColor.g = multiplyColors[index + 1];
    multiplyColor.b = multiplyColors[index + 2];
    multiplyColor.a = multiplyColors[index + 3];
    return multiplyColor;
  }

  /**
   * Drawableのスクリーン色の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableのスクリーン色(RGBA)
   * スクリーン色はRGBAで取得されるが、Aは必ず0
   */
  public getDrawableScreenColor(drawableIndex: number): CubismTextureColor {
    const screenColors: Float32Array = this._model.drawables.screenColors;
    const index = drawableIndex * 4;
    const screenColor: CubismTextureColor = new CubismTextureColor();
    screenColor.r = screenColors[index];
    screenColor.g = screenColors[index + 1];
    screenColor.b = screenColors[index + 2];
    screenColor.a = screenColors[index + 3];
    return screenColor;
  }

  /**
   * Drawableの親パーツのインデックスの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの親パーツのインデックス
   */
  public getDrawableParentPartIndex(drawableIndex: number): number {
    return this._model.drawables.parentPartIndices[drawableIndex];
  }

  /**
   * Drawableのブレンドモードを取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableのブレンドモード
   */
  public getDrawableBlendMode(drawableIndex: number): CubismBlendMode {
    const constantFlags = this._model.drawables.constantFlags;

    return Live2DCubismCore.Utils.hasBlendAdditiveBit(
      constantFlags[drawableIndex]
    )
      ? CubismBlendMode.CubismBlendMode_Additive
      : Live2DCubismCore.Utils.hasBlendMultiplicativeBit(
            constantFlags[drawableIndex]
          )
        ? CubismBlendMode.CubismBlendMode_Multiplicative
        : CubismBlendMode.CubismBlendMode_Normal;
  }

  /**
   * Drawableのマスクの反転使用の取得
   *
   * Drawableのマスク使用時の反転設定を取得する。
   * マスクを使用しない場合は無視される。
   *
   * @param drawableIndex Drawableのインデックス
   * @return Drawableの反転設定
   */
  public getDrawableInvertedMaskBit(drawableIndex: number): boolean {
    const constantFlags: Uint8Array = this._model.drawables.constantFlags;

    return Live2DCubismCore.Utils.hasIsInvertedMaskBit(
      constantFlags[drawableIndex]
    );
  }

  /**
   * Drawableのクリッピングマスクリストの取得
   * @return Drawableのクリッピングマスクリスト
   */
  public getDrawableMasks(): Int32Array[] {
    const masks: Int32Array[] = this._model.drawables.masks;
    return masks;
  }

  /**
   * Drawableのクリッピングマスクの個数リストの取得
   * @return Drawableのクリッピングマスクの個数リスト
   */
  public getDrawableMaskCounts(): Int32Array {
    const maskCounts: Int32Array = this._model.drawables.maskCounts;
    return maskCounts;
  }

  /**
   * クリッピングマスクの使用状態
   *
   * @return true クリッピングマスクを使用している
   * @return false クリッピングマスクを使用していない
   */
  public isUsingMasking(): boolean {
    for (let d = 0; d < this._model.drawables.count; ++d) {
      if (this._model.drawables.maskCounts[d] <= 0) {
        continue;
      }
      return true;
    }
    return false;
  }

  /**
   * Drawableの表示情報を取得する
   *
   * @param drawableIndex Drawableのインデックス
   * @return true Drawableが表示
   * @return false Drawableが非表示
   */
  public getDrawableDynamicFlagIsVisible(drawableIndex: number): boolean {
    const dynamicFlags: Uint8Array = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasIsVisibleBit(dynamicFlags[drawableIndex]);
  }

  /**
   * DrawableのDrawOrderの変化情報の取得
   *
   * 直近のCubismModel.update関数でdrawableのdrawOrderが変化したかを取得する。
   * drawOrderはartMesh上で指定する0から1000の情報
   * @param drawableIndex drawableのインデックス
   * @return true drawableの不透明度が直近のCubismModel.update関数で変化した
   * @return false drawableの不透明度が直近のCubismModel.update関数で変化している
   */
  public getDrawableDynamicFlagVisibilityDidChange(
    drawableIndex: number
  ): boolean {
    const dynamicFlags: Uint8Array = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasVisibilityDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }

  /**
   * Drawableの不透明度の変化情報の取得
   *
   * 直近のCubismModel.update関数でdrawableの不透明度が変化したかを取得する。
   *
   * @param drawableIndex drawableのインデックス
   * @return true Drawableの不透明度が直近のCubismModel.update関数で変化した
   * @return false Drawableの不透明度が直近のCubismModel.update関数で変化してない
   */
  public getDrawableDynamicFlagOpacityDidChange(
    drawableIndex: number
  ): boolean {
    const dynamicFlags: Uint8Array = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasOpacityDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }

  /**
   * Drawableの描画順序の変化情報の取得
   *
   * 直近のCubismModel.update関数でDrawableの描画の順序が変化したかを取得する。
   *
   * @param drawableIndex Drawableのインデックス
   * @return true Drawableの描画の順序が直近のCubismModel.update関数で変化した
   * @return false Drawableの描画の順序が直近のCubismModel.update関数で変化してない
   */
  public getDrawableDynamicFlagRenderOrderDidChange(
    drawableIndex: number
  ): boolean {
    const dynamicFlags: Uint8Array = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasRenderOrderDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }

  /**
   * Drawableの乗算色・スクリーン色の変化情報の取得
   *
   * 直近のCubismModel.update関数でDrawableの乗算色・スクリーン色が変化したかを取得する。
   *
   * @param drawableIndex Drawableのインデックス
   * @return true Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化した
   * @return false Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化してない
   */
  public getDrawableDynamicFlagBlendColorDidChange(
    drawableIndex: number
  ): boolean {
    const dynamicFlags: Uint8Array = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasBlendColorDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }

  /**
   * 保存されたパラメータの読み込み
   */
  public loadParameters(): void {
    let parameterCount: number = this._model.parameters.count;
    const savedParameterCount: number = this._savedParameters.getSize();

    if (parameterCount > savedParameterCount) {
      parameterCount = savedParameterCount;
    }

    for (let i = 0; i < parameterCount; ++i) {
      this._parameterValues[i] = this._savedParameters.at(i);
    }
  }

  /**
   * 初期化する
   */
  public initialize(): void {
    CSM_ASSERT(this._model);

    this._parameterValues = this._model.parameters.values;
    this._partOpacities = this._model.parts.opacities;
    this._parameterMaximumValues = this._model.parameters.maximumValues;
    this._parameterMinimumValues = this._model.parameters.minimumValues;

    {
      const parameterIds: string[] = this._model.parameters.ids;
      const parameterCount: number = this._model.parameters.count;

      this._parameterIds.prepareCapacity(parameterCount);
      for (let i = 0; i < parameterCount; ++i) {
        this._parameterIds.pushBack(
          CubismFramework.getIdManager().getId(parameterIds[i])
        );
      }
    }

    const partCount: number = this._model.parts.count;
    {
      const partIds: string[] = this._model.parts.ids;

      this._partIds.prepareCapacity(partCount);
      for (let i = 0; i < partCount; ++i) {
        this._partIds.pushBack(
          CubismFramework.getIdManager().getId(partIds[i])
        );
      }

      this._userPartMultiplyColors.prepareCapacity(partCount);
      this._userPartScreenColors.prepareCapacity(partCount);

      this._partChildDrawables.prepareCapacity(partCount);
    }

    {
      const drawableIds: string[] = this._model.drawables.ids;
      const drawableCount: number = this._model.drawables.count;

      this._userMultiplyColors.prepareCapacity(drawableCount);
      this._userScreenColors.prepareCapacity(drawableCount);

      // カリング設定
      this._userCullings.prepareCapacity(drawableCount);
      const userCulling: DrawableCullingData = new DrawableCullingData(
        false,
        false
      );

      // Part
      {
        for (let i = 0; i < partCount; ++i) {
          const multiplyColor: CubismTextureColor = new CubismTextureColor(
            1.0,
            1.0,
            1.0,
            1.0
          );
          const screenColor: CubismTextureColor = new CubismTextureColor(
            0.0,
            0.0,
            0.0,
            1.0
          );

          const userMultiplyColor: PartColorData = new PartColorData(
            false,
            multiplyColor
          );
          const userScreenColor: PartColorData = new PartColorData(
            false,
            screenColor
          );

          this._userPartMultiplyColors.pushBack(userMultiplyColor);
          this._userPartScreenColors.pushBack(userScreenColor);
          this._partChildDrawables.pushBack(new csmVector<number>());
          this._partChildDrawables.at(i).prepareCapacity(drawableCount);
        }
      }

      // Drawables
      {
        for (let i = 0; i < drawableCount; ++i) {
          const multiplyColor: CubismTextureColor = new CubismTextureColor(
            1.0,
            1.0,
            1.0,
            1.0
          );
          const screenColor: CubismTextureColor = new CubismTextureColor(
            0.0,
            0.0,
            0.0,
            1.0
          );

          const userMultiplyColor: DrawableColorData = new DrawableColorData(
            false,
            multiplyColor
          );
          const userScreenColor: DrawableColorData = new DrawableColorData(
            false,
            screenColor
          );

          this._drawableIds.pushBack(
            CubismFramework.getIdManager().getId(drawableIds[i])
          );

          this._userMultiplyColors.pushBack(userMultiplyColor);
          this._userScreenColors.pushBack(userScreenColor);

          this._userCullings.pushBack(userCulling);

          const parentIndex = this.getDrawableParentPartIndex(i);
          if (parentIndex >= 0) {
            this._partChildDrawables.at(parentIndex).pushBack(i);
          }
        }
      }
    }
  }

  /**
   * コンストラクタ
   * @param model モデル
   */
  public constructor(model: Live2DCubismCore.Model) {
    this._model = model;
    this._parameterValues = null;
    this._parameterMaximumValues = null;
    this._parameterMinimumValues = null;
    this._partOpacities = null;
    this._savedParameters = new csmVector<number>();
    this._parameterIds = new csmVector<CubismIdHandle>();
    this._drawableIds = new csmVector<CubismIdHandle>();
    this._partIds = new csmVector<CubismIdHandle>();
    this._isOverwrittenModelMultiplyColors = false;
    this._isOverwrittenModelScreenColors = false;
    this._isOverwrittenCullings = false;
    this._modelOpacity = 1.0;

    this._userMultiplyColors = new csmVector<DrawableColorData>();
    this._userScreenColors = new csmVector<DrawableColorData>();
    this._userCullings = new csmVector<DrawableCullingData>();
    this._userPartMultiplyColors = new csmVector<PartColorData>();
    this._userPartScreenColors = new csmVector<PartColorData>();
    this._partChildDrawables = new csmVector<csmVector<number>>();

    this._notExistPartId = new csmMap<CubismIdHandle, number>();
    this._notExistParameterId = new csmMap<CubismIdHandle, number>();
    this._notExistParameterValues = new csmMap<number, number>();
    this._notExistPartOpacities = new csmMap<number, number>();
  }

  /**
   * デストラクタ相当の処理
   */
  public release(): void {
    this._model.release();
    this._model = null;
  }

  private _notExistPartOpacities: csmMap<number, number>; // 存在していないパーツの不透明度のリスト
  private _notExistPartId: csmMap<CubismIdHandle, number>; // 存在していないパーツIDのリスト

  private _notExistParameterValues: csmMap<number, number>; // 存在していないパラメータの値のリスト
  private _notExistParameterId: csmMap<CubismIdHandle, number>; // 存在していないパラメータIDのリスト

  private _savedParameters: csmVector<number>; // 保存されたパラメータ

  private _isOverwrittenModelMultiplyColors: boolean; // SDK上でモデル全体の乗算色を上書きするか判定するフラグ
  private _isOverwrittenModelScreenColors: boolean; // SDK上でモデル全体のスクリーン色を上書きするか判定するフラグ
  private _userMultiplyColors: csmVector<DrawableColorData>; // Drawableごとに設定する乗算色と上書きフラグを管理するリスト
  private _userScreenColors: csmVector<DrawableColorData>; // Drawableごとに設定するスクリーン色と上書きフラグを管理するリスト
  private _userPartScreenColors: csmVector<PartColorData>; // Part 乗算色の配列
  private _userPartMultiplyColors: csmVector<PartColorData>; // Part スクリーン色の配列
  private _partChildDrawables: csmVector<csmVector<number>>; // Partの子DrawableIndexの配列

  private _model: Live2DCubismCore.Model; // モデル

  private _parameterValues: Float32Array; // パラメータの値のリスト
  private _parameterMaximumValues: Float32Array; // パラメータの最大値のリスト
  private _parameterMinimumValues: Float32Array; // パラメータの最小値のリスト

  private _partOpacities: Float32Array; // パーツの不透明度のリスト

  private _modelOpacity: number; // モデルの不透明度

  private _parameterIds: csmVector<CubismIdHandle>;
  private _partIds: csmVector<CubismIdHandle>;
  private _drawableIds: csmVector<CubismIdHandle>;

  private _isOverwrittenCullings: boolean; // モデルのカリング設定をすべて上書きするか？
  private _userCullings: csmVector<DrawableCullingData>; // カリング設定の配列
}

// Namespace definition for compatibility.
import * as $ from './cubismmodel';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismModel = $.CubismModel;
  export type CubismModel = $.CubismModel;
}
