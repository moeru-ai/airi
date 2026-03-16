/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * Cubism SDKのサンプルで使用するWebGLを管理するクラス
 */
export class LAppGlManager {
  public constructor() {
    this._gl = null;
  }

  public initialize(canvas: HTMLCanvasElement): boolean {
    // glコンテキストを初期化
    this._gl = canvas.getContext('webgl2');

    if (!this._gl) {
      // gl初期化失敗
      alert('Cannot initialize WebGL. This browser does not support.');
      this._gl = null;
      // document.body.innerHTML =
      //   'This browser does not support the <code>&lt;canvas&gt;</code> element.';
      return false;
    }
    return true;
  }

  /**
   * 解放する。
   */
  public release(): void {}

  public getGl(): WebGLRenderingContext | WebGL2RenderingContext {
    return this._gl;
  }

  private _gl: WebGLRenderingContext | WebGL2RenderingContext = null;
}
