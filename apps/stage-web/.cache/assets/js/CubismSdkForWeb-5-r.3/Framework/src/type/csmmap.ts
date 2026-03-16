/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismLogDebug, CubismLogWarning } from '../utils/cubismdebug';

/**
 * Key-Valueのペアを定義するクラス
 * csmMapクラスの内部データで使用する。
 */
export class csmPair<_KeyT, _ValT> {
  /**
   * コンストラクタ
   * @param key Keyとしてセットする値
   * @param value Valueとしてセットする値
   */
  public constructor(key?: _KeyT, value?: _ValT) {
    this.first = key == undefined ? null : key;

    this.second = value == undefined ? null : value;
  }

  public first: _KeyT; // keyとして用いる変数
  public second: _ValT; // valueとして用いる変数
}

/**
 * マップ型
 */
export class csmMap<_KeyT, _ValT> {
  /**
   * 引数付きコンストラクタ
   * @param size 初期化時点で確保するサイズ
   */
  public constructor(size?: number) {
    if (size != undefined) {
      if (size < 1) {
        this._keyValues = [];
        this._dummyValue = null;
        this._size = 0;
      } else {
        this._keyValues = new Array(size);
        this._size = size;
      }
    } else {
      this._keyValues = [];
      this._dummyValue = null;
      this._size = 0;
    }
  }

  /**
   * デストラクタ
   */
  public release() {
    this.clear();
  }

  /**
   * キーを追加する
   * @param key 新たに追加するキー
   */
  public appendKey(key: _KeyT): void {
    let findIndex = -1;
    for (let i = 0; i < this._size; i++) {
      if (this._keyValues[i].first == key) {
        findIndex = i;
        break;
      }
    }

    // 同じkeyが既に作られている場合は何もしない
    if (findIndex != -1) {
      CubismLogWarning('The key `{0}` is already append.', key);
      return;
    }

    // 新しくKey/Valueのペアを作る
    this.prepareCapacity(this._size + 1, false); // 1つ以上入る隙間を作る
    // 新しいkey/valueのインデックスは_size

    this._keyValues[this._size] = new csmPair<_KeyT, _ValT>(key);
    this._size += 1;
  }

  /**
   * 添字演算子[key]のオーバーロード(get)
   * @param key 添字から特定されるValue値
   */
  public getValue(key: _KeyT): _ValT {
    let found = -1;

    for (let i = 0; i < this._size; i++) {
      if (this._keyValues[i].first == key) {
        found = i;
        break;
      }
    }

    if (found >= 0) {
      return this._keyValues[found].second;
    } else {
      this.appendKey(key); // 新規キーを追加
      return this._keyValues[this._size - 1].second;
    }
  }

  /**
   * 添字演算子[key]のオーバーロード(set)
   * @param key 添字から特定されるValue値
   * @param value 代入するValue値
   */
  public setValue(key: _KeyT, value: _ValT): void {
    let found = -1;

    for (let i = 0; i < this._size; i++) {
      if (this._keyValues[i].first == key) {
        found = i;
        break;
      }
    }

    if (found >= 0) {
      this._keyValues[found].second = value;
    } else {
      this.appendKey(key); // 新規キーを追加
      this._keyValues[this._size - 1].second = value;
    }
  }

  /**
   * 引数で渡したKeyを持つ要素が存在するか
   * @param key 存在を確認するkey
   * @return true 引数で渡したkeyを持つ要素が存在する
   * @return false 引数で渡したkeyを持つ要素が存在しない
   */
  public isExist(key: _KeyT): boolean {
    for (let i = 0; i < this._size; i++) {
      if (this._keyValues[i].first == key) {
        return true;
      }
    }
    return false;
  }

  /**
   * keyValueのポインタを全て解放する
   */
  public clear(): void {
    this._keyValues = void 0;
    this._keyValues = null;
    this._keyValues = [];

    this._size = 0;
  }

  /**
   * コンテナのサイズを取得する
   *
   * @return コンテナのサイズ
   */
  public getSize(): number {
    return this._size;
  }

  /**
   * コンテナのキャパシティを確保する
   * @param newSize 新たなキャパシティ。引数の値が現在のサイズ未満の場合は何もしない。
   * @param fitToSize trueなら指定したサイズに合わせる。falseならサイズを2倍確保しておく。
   */
  public prepareCapacity(newSize: number, fitToSize: boolean): void {
    if (newSize > this._keyValues.length) {
      if (this._keyValues.length == 0) {
        if (!fitToSize && newSize < csmMap.DefaultSize)
          newSize = csmMap.DefaultSize;
        this._keyValues.length = newSize;
      } else {
        if (!fitToSize && newSize < this._keyValues.length * 2)
          newSize = this._keyValues.length * 2;
        this._keyValues.length = newSize;
      }
    }
  }

  /**
   * コンテナの先頭要素を返す
   */
  public begin(): iterator<_KeyT, _ValT> {
    const ite: iterator<_KeyT, _ValT> = new iterator<_KeyT, _ValT>(this, 0);
    return ite;
  }

  /**
   * コンテナの終端要素を返す
   */
  public end(): iterator<_KeyT, _ValT> {
    const ite: iterator<_KeyT, _ValT> = new iterator<_KeyT, _ValT>(
      this,
      this._size
    ); // 終了
    return ite;
  }

  /**
   * コンテナから要素を削除する
   *
   * @param ite 削除する要素
   */
  public erase(ite: iterator<_KeyT, _ValT>): iterator<_KeyT, _ValT> {
    const index: number = ite._index;
    if (index < 0 || this._size <= index) {
      return ite; // 削除範囲外
    }

    // 削除
    this._keyValues.splice(index, 1);
    --this._size;

    const ite2: iterator<_KeyT, _ValT> = new iterator<_KeyT, _ValT>(
      this,
      index
    ); // 終了
    return ite2;
  }

  /**
   * コンテナの値を32ビット符号付き整数型でダンプする
   */
  public dumpAsInt() {
    for (let i = 0; i < this._size; i++) {
      CubismLogDebug('{0} ,', this._keyValues[i]);
      CubismLogDebug('\n');
    }
  }

  public static readonly DefaultSize = 10; // コンテナの初期化のデフォルトサイズ
  public _keyValues: csmPair<_KeyT, _ValT>[]; // key-valueペアの配列
  public _dummyValue: _ValT; // 空の値を返す為のダミー
  public _size: number; // コンテナの要素数
}

/**
 * csmMap<T>のイテレータ
 */
export class iterator<_KeyT, _ValT> {
  /**
   * コンストラクタ
   */
  constructor(v?: csmMap<_KeyT, _ValT>, idx?: number) {
    this._map = v != undefined ? v : new csmMap<_KeyT, _ValT>();

    this._index = idx != undefined ? idx : 0;
  }

  /**
   * =演算子のオーバーロード
   */
  public set(ite: iterator<_KeyT, _ValT>): iterator<_KeyT, _ValT> {
    this._index = ite._index;
    this._map = ite._map;
    return this;
  }

  /**
   * 前置き++演算子のオーバーロード
   */
  public preIncrement(): iterator<_KeyT, _ValT> {
    ++this._index;
    return this;
  }

  /**
   * 前置き--演算子のオーバーロード
   */
  public preDecrement(): iterator<_KeyT, _ValT> {
    --this._index;
    return this;
  }

  /**
   * 後置き++演算子のオーバーロード
   */
  public increment(): iterator<_KeyT, _ValT> {
    const iteold = new iterator<_KeyT, _ValT>(this._map, this._index++); // 古い値を保存
    return iteold;
  }

  /**
   * 後置き--演算子のオーバーロード
   */
  public decrement(): iterator<_KeyT, _ValT> {
    const iteold = new iterator<_KeyT, _ValT>(this._map, this._index); // 古い値を保存
    this._map = iteold._map;
    this._index = iteold._index;
    return this;
  }

  /**
   * *演算子のオーバーロード
   */
  public ptr(): csmPair<_KeyT, _ValT> {
    return this._map._keyValues[this._index];
  }

  /**
   * !=演算
   */
  public notEqual(ite: iterator<_KeyT, _ValT>): boolean {
    return this._index != ite._index || this._map != ite._map;
  }

  _index: number; // コンテナのインデックス値
  _map: csmMap<_KeyT, _ValT>; // コンテナ
}

// Namespace definition for compatibility.
import * as $ from './csmmap';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const csmMap = $.csmMap;
  export type csmMap<K, V> = $.csmMap<K, V>;
  export const csmPair = $.csmPair;
  export type csmPair<K, V> = $.csmPair<K, V>;
  export const iterator = $.iterator;
  export type iterator<K, V> = $.iterator<K, V>;
}
