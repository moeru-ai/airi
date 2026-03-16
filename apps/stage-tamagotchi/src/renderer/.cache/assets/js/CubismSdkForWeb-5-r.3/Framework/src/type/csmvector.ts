/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * ベクター型（可変配列型）
 */
export class csmVector<T> {
  /**
   * 引数付きコンストラクタ
   * @param iniitalCapacity 初期化後のキャパシティ。データサイズは_capacity * sizeof(T)
   * @param zeroClear trueなら初期化時に確保した領域を0で埋める
   */
  constructor(initialCapacity = 0) {
    if (initialCapacity < 1) {
      this._ptr = [];
      this._capacity = 0;
      this._size = 0;
    } else {
      this._ptr = new Array(initialCapacity);
      this._capacity = initialCapacity;
      this._size = 0;
    }
  }

  /**
   * インデックスで指定した要素を返す
   */
  public at(index: number): T {
    return this._ptr[index];
  }

  /**
   * 要素をセット
   * @param index 要素をセットするインデックス
   * @param value セットする要素
   */
  public set(index: number, value: T): void {
    this._ptr[index] = value;
  }

  /**
   * コンテナを取得する
   */
  public get(offset = 0): T[] {
    const ret: T[] = new Array<T>();
    for (let i = offset; i < this._size; i++) {
      ret.push(this._ptr[i]);
    }
    return ret;
  }

  /**
   * pushBack処理、コンテナに新たな要素を追加する
   * @param value PushBack処理で追加する値
   */
  public pushBack(value: T): void {
    if (this._size >= this._capacity) {
      this.prepareCapacity(
        this._capacity == 0 ? csmVector.DefaultSize : this._capacity * 2
      );
    }

    this._ptr[this._size++] = value;
  }

  /**
   * コンテナの全要素を解放する
   */
  public clear(): void {
    this._ptr.length = 0;
    this._size = 0;
  }

  /**
   * コンテナの要素数を返す
   * @return コンテナの要素数
   */
  public getSize(): number {
    return this._size;
  }

  /**
   * コンテナの全要素に対して代入処理を行う
   * @param newSize 代入処理後のサイズ
   * @param value 要素に代入する値
   */
  public assign(newSize: number, value: T): void {
    const curSize = this._size;

    if (curSize < newSize) {
      this.prepareCapacity(newSize); // capacity更新
    }

    for (let i = 0; i < newSize; i++) {
      this._ptr[i] = value;
    }

    this._size = newSize;
  }

  /**
   * サイズ変更
   */
  public resize(newSize: number, value: T = null): void {
    this.updateSize(newSize, value, true);
  }

  /**
   * サイズ変更
   */
  public updateSize(
    newSize: number,
    value: any = null,
    callPlacementNew = true
  ): void {
    const curSize: number = this._size;

    if (curSize < newSize) {
      this.prepareCapacity(newSize); // capacity更新

      if (callPlacementNew) {
        for (let i: number = this._size; i < newSize; i++) {
          if (typeof value == 'function') {
            // new
            this._ptr[i] = JSON.parse(JSON.stringify(new value()));
          } // プリミティブ型なので値渡し
          else {
            this._ptr[i] = value;
          }
        }
      } else {
        for (let i: number = this._size; i < newSize; i++) {
          this._ptr[i] = value;
        }
      }
    } else {
      // newSize <= this._size
      //---
      const sub = this._size - newSize;
      this._ptr.splice(this._size - sub, sub); // 不要なので破棄する
    }
    this._size = newSize;
  }

  /**
   * コンテナにコンテナ要素を挿入する
   * @param position 挿入する位置
   * @param begin 挿入するコンテナの開始位置
   * @param end 挿入するコンテナの終端位置
   */
  public insert(
    position: iterator<T>,
    begin: iterator<T>,
    end: iterator<T>
  ): void {
    let dstSi: number = position._index;
    const srcSi: number = begin._index;
    const srcEi: number = end._index;

    const addCount: number = srcEi - srcSi;

    this.prepareCapacity(this._size + addCount);

    // 挿入用の既存データをシフトして隙間を作る
    const addSize = this._size - dstSi;
    if (addSize > 0) {
      for (let i = 0; i < addSize; i++) {
        this._ptr.splice(dstSi + i, 0, null);
      }
    }

    for (let i: number = srcSi; i < srcEi; i++, dstSi++) {
      this._ptr[dstSi] = begin._vector._ptr[i];
    }

    this._size = this._size + addCount;
  }

  /**
   * コンテナからインデックスで指定した要素を削除する
   * @param index インデックス値
   * @return true 削除実行
   * @return false 削除範囲外
   */
  public remove(index: number): boolean {
    if (index < 0 || this._size <= index) {
      return false; // 削除範囲外
    }

    this._ptr.splice(index, 1);
    --this._size;

    return true;
  }

  /**
   * コンテナから要素を削除して他の要素をシフトする
   * @param ite 削除する要素
   */
  public erase(ite: iterator<T>): iterator<T> {
    const index: number = ite._index;
    if (index < 0 || this._size <= index) {
      return ite; // 削除範囲外
    }

    // 削除
    this._ptr.splice(index, 1);
    --this._size;

    const ite2: iterator<T> = new iterator<T>(this, index); // 終了
    return ite2;
  }

  /**
   * コンテナのキャパシティを確保する
   * @param newSize 新たなキャパシティ。引数の値が現在のサイズ未満の場合は何もしない.
   */
  public prepareCapacity(newSize: number): void {
    if (newSize > this._capacity) {
      if (this._capacity == 0) {
        this._ptr = new Array(newSize);
        this._capacity = newSize;
      } else {
        this._ptr.length = newSize;
        this._capacity = newSize;
      }
    }
  }

  /**
   * コンテナの先頭要素を返す
   */
  public begin(): iterator<T> {
    const ite: iterator<T> =
      this._size == 0 ? this.end() : new iterator<T>(this, 0);
    return ite;
  }

  /**
   * コンテナの終端要素を返す
   */
  public end(): iterator<T> {
    const ite: iterator<T> = new iterator<T>(this, this._size);
    return ite;
  }

  public getOffset(offset: number): csmVector<T> {
    const newVector = new csmVector<T>();
    newVector._ptr = this.get(offset);
    newVector._size = this.get(offset).length;
    newVector._capacity = this.get(offset).length;

    return newVector;
  }

  _ptr: T[]; // コンテナの先頭アドレス
  _size: number; // コンテナの要素数
  _capacity: number; // コンテナのキャパシティ

  static readonly DefaultSize = 10; // コンテナ初期化のデフォルトサイズ
}

export class iterator<T> {
  /**
   * コンストラクタ
   */
  public constructor(v?: csmVector<T>, index?: number) {
    this._vector = v != undefined ? v : null;
    this._index = index != undefined ? index : 0;
  }

  /**
   * 代入
   */
  public set(ite: iterator<T>): iterator<T> {
    this._index = ite._index;
    this._vector = ite._vector;
    return this;
  }

  /**
   * 前置き++演算
   */
  public preIncrement(): iterator<T> {
    ++this._index;
    return this;
  }

  /**
   * 前置き--演算
   */
  public preDecrement(): iterator<T> {
    --this._index;
    return this;
  }

  /**
   * 後置き++演算子
   */
  public increment(): iterator<T> {
    const iteold = new iterator<T>(this._vector, this._index++); // 古い値を保存
    return iteold;
  }

  /**
   * 後置き--演算子
   */
  public decrement(): iterator<T> {
    const iteold = new iterator<T>(this._vector, this._index--); // 古い値を保存
    return iteold;
  }

  /**
   * ptr
   */
  public ptr(): T {
    return this._vector._ptr[this._index];
  }

  /**
   * =演算子のオーバーロード
   */
  public substitution(ite: iterator<T>): iterator<T> {
    this._index = ite._index;
    this._vector = ite._vector;
    return this;
  }

  /**
   * !=演算子のオーバーロード
   */
  public notEqual(ite: iterator<T>): boolean {
    return this._index != ite._index || this._vector != ite._vector;
  }

  _index: number; // コンテナのインデックス値
  _vector: csmVector<T>; // コンテナ
}

// Namespace definition for compatibility.
import * as $ from './csmvector';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const csmVector = $.csmVector;
  export type csmVector<T> = $.csmVector<T>;
  export const iterator = $.iterator;
  export type iterator<T> = $.iterator<T>;
}
