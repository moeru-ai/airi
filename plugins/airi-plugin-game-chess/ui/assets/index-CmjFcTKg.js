const e = Object.create; const t = Object.defineProperty; const n = Object.getOwnPropertyDescriptor; const r = Object.getOwnPropertyNames; const i = Object.getPrototypeOf; const a = Object.prototype.hasOwnProperty; const o = (e, t) => () => (t || e((t = { exports: {} }).exports, t), t.exports); function s(e, i, o, s) {
  if (i && typeof i == `object` || typeof i == `function`) {
    for (var c = r(i), l = 0, u = c.length, d; l < u; l++)d = c[l], !a.call(e, d) && d !== o && t(e, d, { get: (e => i[e]).bind(null, d), enumerable: !(s = n(i, d)) || s.enumerable })
  } return e
} const c = (n, r, a) => (a = n == null ? {} : e(i(n)), s(r || !n || !n.__esModule ? t(a, `default`, { value: n, enumerable: !0 }) : a, n)); (function () {
  const e = document.createElement(`link`).relList; if (e && e.supports && e.supports(`modulepreload`))
    return; for (const e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e); new MutationObserver((e) => {
    for (const t of e) {
      if (t.type === `childList`) {
        for (const e of t.addedNodes)e.tagName === `LINK` && e.rel === `modulepreload` && n(e)
      }
    }
  }).observe(document, { childList: !0, subtree: !0 }); function t(e) { const t = {}; return e.integrity && (t.integrity = e.integrity), e.referrerPolicy && (t.referrerPolicy = e.referrerPolicy), e.crossOrigin === `use-credentials` ? t.credentials = `include` : e.crossOrigin === `anonymous` ? t.credentials = `omit` : t.credentials = `same-origin`, t } function n(e) {
    if (e.ep)
      return; e.ep = !0; const n = t(e); fetch(e.href, n)
  }
})(); function l(e) { const t = Object.create(null); for (const n of e.split(`,`))t[n] = 1; return e => e in t } const u = {}; const d = []; function f() {} const p = () => !1; const m = e => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && (e.charCodeAt(2) > 122 || e.charCodeAt(2) < 97); const h = e => e.startsWith(`onUpdate:`); const g = Object.assign; function _(e, t) { const n = e.indexOf(t); n > -1 && e.splice(n, 1) } const v = Object.prototype.hasOwnProperty; const y = (e, t) => v.call(e, t); const b = Array.isArray; const x = e => te(e) === `[object Map]`; const S = e => te(e) === `[object Set]`; const C = e => te(e) === `[object Date]`; const w = e => typeof e == `function`; const T = e => typeof e == `string`; const E = e => typeof e == `symbol`; const D = e => typeof e == `object` && !!e; const O = e => (D(e) || w(e)) && w(e.then) && w(e.catch); const ee = Object.prototype.toString; var te = e => ee.call(e); const ne = e => te(e).slice(8, -1); const k = e => te(e) === `[object Object]`; const A = e => T(e) && e !== `NaN` && e[0] !== `-` && `${Number.parseInt(e, 10)}` === e; const re = l(`,key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted`); function j(e) { const t = Object.create(null); return n => t[n] || (t[n] = e(n)) } const M = /-\w/g; const N = j(e => e.replace(M, e => e.slice(1).toUpperCase())); const ie = /\B([A-Z])/g; const P = j(e => e.replace(ie, `-$1`).toLowerCase()); const ae = j(e => e.charAt(0).toUpperCase() + e.slice(1)); const F = j(e => e ? `on${ae(e)}` : ``); const I = (e, t) => !Object.is(e, t); function L(e, ...t) { for (let n = 0; n < e.length; n++)e[n](...t) } function R(e, t, n, r = !1) { Object.defineProperty(e, t, { configurable: !0, enumerable: !1, writable: r, value: n }) } function oe(e) { const t = Number.parseFloat(e); return isNaN(t) ? e : t } let z; const B = () => z ||= typeof globalThis < `u` ? globalThis : typeof self < `u` ? self : typeof window < `u` ? window : typeof global < `u` ? global : {}; function se(e) {
  if (b(e)) {
    const t = {}; for (let n = 0; n < e.length; n++) {
      const r = e[n]; const i = T(r) ? V(r) : se(r); if (i) {
        for (const e in i)t[e] = i[e]
      }
    } return t
  }
  else if (T(e) || D(e)) {
    return e
  }
} const ce = /;(?![^(]*\))/g; const le = /:([\s\S]+)/; const ue = /\/\*[\s\S]*?\*\//g; function V(e) { const t = {}; return e.replace(ue, ``).split(ce).forEach((e) => { if (e) { const n = e.split(le); n.length > 1 && (t[n[0].trim()] = n[1].trim()) } }), t } function H(e) {
  let t = ``; if (T(e)) {
    t = e
  }
  else if (b(e)) {
    for (let n = 0; n < e.length; n++) { const r = H(e[n]); r && (t += `${r} `) }
  }
  else if (D(e)) {
    for (const n in e)e[n] && (t += `${n} `)
  } return t.trim()
} const de = `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly`; const fe = l(de); `${de}`; function pe(e) { return !!e || e === `` } function me(e, t) {
  if (e.length !== t.length)
    return !1; let n = !0; for (let r = 0; n && r < e.length; r++)n = he(e[r], t[r]); return n
} function he(e, t) {
  if (e === t)
    return !0; let n = C(e); let r = C(t); if (n || r)
    return n && r ? e.getTime() === t.getTime() : !1; if (n = E(e), r = E(t), n || r)
    return e === t; if (n = b(e), r = b(t), n || r)
    return n && r ? me(e, t) : !1; if (n = D(e), r = D(t), n || r) {
    if (!n || !r || Object.keys(e).length !== Object.keys(t).length)
      return !1; for (const n in e) {
      const r = Object.hasOwn(e, n); const i = Object.hasOwn(t, n); if (r && !i || !r && i || !he(e[n], t[n]))
        return !1
    }
  } return String(e) === String(t)
} function ge(e, t) { return e.findIndex(e => he(e, t)) } const _e = e => !!(e && e.__v_isRef === !0); const ve = e => T(e) ? e : e == null ? `` : b(e) || D(e) && (e.toString === ee || !w(e.toString)) ? _e(e) ? ve(e.value) : JSON.stringify(e, ye, 2) : String(e); var ye = (e, t) => _e(t) ? ye(e, t.value) : x(t) ? { [`Map(${t.size})`]: [...t.entries()].reduce((e, [t, n], r) => (e[`${be(t, r)} =>`] = n, e), {}) } : S(t) ? { [`Set(${t.size})`]: [...t.values()].map(e => be(e)) } : E(t) ? be(t) : D(t) && !b(t) && !k(t) ? String(t) : t; var be = (e, t = ``) => E(e) ? `Symbol(${e.description ?? t})` : e; let xe; const Se = class {
  constructor(e = !1) { this.detached = e, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this.__v_skip = !0, this.parent = xe, !e && xe && (this.index = (xe.scopes ||= []).push(this) - 1) } get active() { return this._active }pause() {
    if (this._active) {
      this._isPaused = !0; let e, t; if (this.scopes) {
        for (e = 0, t = this.scopes.length; e < t; e++) this.scopes[e].pause()
      } for (e = 0, t = this.effects.length; e < t; e++) this.effects[e].pause()
    }
  }

  resume() {
    if (this._active && this._isPaused) {
      this._isPaused = !1; let e, t; if (this.scopes) {
        for (e = 0, t = this.scopes.length; e < t; e++) this.scopes[e].resume()
      } for (e = 0, t = this.effects.length; e < t; e++) this.effects[e].resume()
    }
  }

  run(e) {
    if (this._active) {
      const t = xe; try { return xe = this, e() }
      finally { xe = t }
    }
  }

  on() { ++this._on === 1 && (this.prevScope = xe, xe = this) }off() { this._on > 0 && --this._on === 0 && (xe = this.prevScope, this.prevScope = void 0) }stop(e) { if (this._active) { this._active = !1; let t, n; for (t = 0, n = this.effects.length; t < n; t++) this.effects[t].stop(); for (this.effects.length = 0, t = 0, n = this.cleanups.length; t < n; t++) this.cleanups[t](); if (this.cleanups.length = 0, this.scopes) { for (t = 0, n = this.scopes.length; t < n; t++) this.scopes[t].stop(!0); this.scopes.length = 0 } if (!this.detached && this.parent && !e) { const e = this.parent.scopes.pop(); e && e !== this && (this.parent.scopes[this.index] = e, e.index = this.index) } this.parent = void 0 } }
}; function Ce() { return xe } function we(e, t = !1) { xe && xe.cleanups.push(e) } let U; const Te = new WeakSet(); const Ee = class {
  constructor(e) { this.fn = e, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, xe && xe.active && xe.effects.push(this) }pause() { this.flags |= 64 }resume() { this.flags & 64 && (this.flags &= -65, Te.has(this) && (Te.delete(this), this.trigger())) }notify() { this.flags & 2 && !(this.flags & 32) || this.flags & 8 || Ae(this) }run() {
    if (!(this.flags & 1))
      return this.fn(); this.flags |= 2, He(this), Ne(this); const e = U; const t = ze; U = this, ze = !0; try { return this.fn() }
    finally { Pe(this), U = e, ze = t, this.flags &= -3 }
  }

  stop() { if (this.flags & 1) { for (let e = this.deps; e; e = e.nextDep)Le(e); this.deps = this.depsTail = void 0, He(this), this.onStop && this.onStop(), this.flags &= -2 } }trigger() { this.flags & 64 ? Te.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty() }runIfDirty() { Fe(this) && this.run() } get dirty() { return Fe(this) }
}; let De = 0; let Oe; let ke; function Ae(e, t = !1) { if (e.flags |= 8, t) { e.next = ke, ke = e; return }e.next = Oe, Oe = e } function je() { De++ } function Me() {
  if (--De > 0)
    return; if (ke) { let e = ke; for (ke = void 0; e;) { const t = e.next; e.next = void 0, e.flags &= -9, e = t } } let e; for (;Oe;) {
    let t = Oe; for (Oe = void 0; t;) {
      const n = t.next; if (t.next = void 0, t.flags &= -9, t.flags & 1) {
        try { t.trigger() }
        catch (t) { e ||= t }
      }t = n
    }
  } if (e)
    throw e
} function Ne(e) { for (let t = e.deps; t; t = t.nextDep)t.version = -1, t.prevActiveLink = t.dep.activeLink, t.dep.activeLink = t } function Pe(e) { let t; let n = e.depsTail; let r = n; for (;r;) { const e = r.prevDep; r.version === -1 ? (r === n && (n = e), Le(r), Re(r)) : t = r, r.dep.activeLink = r.prevActiveLink, r.prevActiveLink = void 0, r = e }e.deps = t, e.depsTail = n } function Fe(e) {
  for (let t = e.deps; t; t = t.nextDep) {
    if (t.dep.version !== t.version || t.dep.computed && (Ie(t.dep.computed) || t.dep.version !== t.version))
      return !0
  } return !!e._dirty
} function Ie(e) {
  if (e.flags & 4 && !(e.flags & 16) || (e.flags &= -17, e.globalVersion === Ue) || (e.globalVersion = Ue, !e.isSSR && e.flags & 128 && (!e.deps && !e._dirty || !Fe(e))))
    return; e.flags |= 2; const t = e.dep; const n = U; const r = ze; U = e, ze = !0; try { Ne(e); const n = e.fn(e._value); (t.version === 0 || I(n, e._value)) && (e.flags |= 128, e._value = n, t.version++) }
  catch (e) { throw t.version++, e }
  finally { U = n, ze = r, Pe(e), e.flags &= -3 }
} function Le(e, t = !1) { const { dep: n, prevSub: r, nextSub: i } = e; if (r && (r.nextSub = i, e.prevSub = void 0), i && (i.prevSub = r, e.nextSub = void 0), n.subs === e && (n.subs = r, !r && n.computed)) { n.computed.flags &= -5; for (let e = n.computed.deps; e; e = e.nextDep)Le(e, !0) }!t && !--n.sc && n.map && n.map.delete(n.key) } function Re(e) { const { prevDep: t, nextDep: n } = e; t && (t.nextDep = n, e.prevDep = void 0), n && (n.prevDep = t, e.nextDep = void 0) } var ze = !0; const Be = []; function W() { Be.push(ze), ze = !1 } function Ve() { const e = Be.pop(); ze = e === void 0 ? !0 : e } function He(e) {
  const { cleanup: t } = e; if (e.cleanup = void 0, t) {
    const e = U; U = void 0; try { t() }
    finally { U = e }
  }
} var Ue = 0; const G = class {constructor(e, t) { this.sub = e, this.dep = t, this.version = t.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0 }}; const We = class {
  constructor(e) { this.computed = e, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0 }track(e) {
    if (!U || !ze || U === this.computed)
      return; let t = this.activeLink; if (t === void 0 || t.sub !== U) {
      t = this.activeLink = new G(U, this), U.deps ? (t.prevDep = U.depsTail, U.depsTail.nextDep = t, U.depsTail = t) : U.deps = U.depsTail = t, Ge(t)
    }
    else if (t.version === -1 && (t.version = this.version, t.nextDep)) { const e = t.nextDep; e.prevDep = t.prevDep, t.prevDep && (t.prevDep.nextDep = e), t.prevDep = U.depsTail, t.nextDep = void 0, U.depsTail.nextDep = t, U.depsTail = t, U.deps === t && (U.deps = e) } return t
  }

  trigger(e) { this.version++, Ue++, this.notify(e) }notify(e) {
    je(); try { for (let e = this.subs; e; e = e.prevSub)e.sub.notify() && e.sub.dep.notify() }
    finally { Me() }
  }
}; function Ge(e) { if (e.dep.sc++, e.sub.flags & 4) { const t = e.dep.computed; if (t && !e.dep.subs) { t.flags |= 20; for (let e = t.deps; e; e = e.nextDep)Ge(e) } const n = e.dep.subs; n !== e && (e.prevSub = n, n && (n.nextSub = e)), e.dep.subs = e } } const Ke = new WeakMap(); const qe = Symbol(``); const Je = Symbol(``); const Ye = Symbol(``); function Xe(e, t, n) { if (ze && U) { let t = Ke.get(e); t || Ke.set(e, t = new Map()); let r = t.get(n); r || (t.set(n, r = new We()), r.map = t, r.key = n), r.track() } } function K(e, t, n, r, i, a) {
  const o = Ke.get(e); if (!o) { Ue++; return } const s = (e) => { e && e.trigger() }; if (je(), t === `clear`) {
    o.forEach(s)
  }
  else {
    const i = b(e); const a = i && A(n); if (i && n === `length`) { const e = Number(r); o.forEach((t, n) => { (n === `length` || n === Ye || !E(n) && n >= e) && s(t) }) }
    else {
      switch ((n !== void 0 || o.has(void 0)) && s(o.get(n)), a && s(o.get(Ye)), t) { case `add`:i ? a && s(o.get(`length`)) : (s(o.get(qe)), x(e) && s(o.get(Je))); break; case `delete`:i || (s(o.get(qe)), x(e) && s(o.get(Je))); break; case `set`:x(e) && s(o.get(qe)); break }
    }
  }Me()
} function Ze(e) { const t = q(e); return t === e ? t : (Xe(t, `iterate`, Ye), Lt(e) ? t : t.map(Bt)) } function Qe(e) { return Xe(e = q(e), `iterate`, Ye), e } function $e(e, t) { return It(e) ? Vt(Ft(e) ? Bt(t) : t) : Bt(t) } const et = { __proto__: null, [Symbol.iterator]() { return tt(this, Symbol.iterator, e => $e(this, e)) }, concat(...e) { return Ze(this).concat(...e.map(e => b(e) ? Ze(e) : e)) }, entries() { return tt(this, `entries`, e => (e[1] = $e(this, e[1]), e)) }, every(e, t) { return rt(this, `every`, e, t, void 0, arguments) }, filter(e, t) { return rt(this, `filter`, e, t, e => e.map(e => $e(this, e)), arguments) }, find(e, t) { return rt(this, `find`, e, t, e => $e(this, e), arguments) }, findIndex(e, t) { return rt(this, `findIndex`, e, t, void 0, arguments) }, findLast(e, t) { return rt(this, `findLast`, e, t, e => $e(this, e), arguments) }, findLastIndex(e, t) { return rt(this, `findLastIndex`, e, t, void 0, arguments) }, forEach(e, t) { return rt(this, `forEach`, e, t, void 0, arguments) }, includes(...e) { return at(this, `includes`, e) }, indexOf(...e) { return at(this, `indexOf`, e) }, join(e) { return Ze(this).join(e) }, lastIndexOf(...e) { return at(this, `lastIndexOf`, e) }, map(e, t) { return rt(this, `map`, e, t, void 0, arguments) }, pop() { return ot(this, `pop`) }, push(...e) { return ot(this, `push`, e) }, reduce(e, ...t) { return it(this, `reduce`, e, t) }, reduceRight(e, ...t) { return it(this, `reduceRight`, e, t) }, shift() { return ot(this, `shift`) }, some(e, t) { return rt(this, `some`, e, t, void 0, arguments) }, splice(...e) { return ot(this, `splice`, e) }, toReversed() { return Ze(this).toReversed() }, toSorted(e) { return Ze(this).toSorted(e) }, toSpliced(...e) { return Ze(this).toSpliced(...e) }, unshift(...e) { return ot(this, `unshift`, e) }, values() { return tt(this, `values`, e => $e(this, e)) } }; function tt(e, t, n) { const r = Qe(e); const i = r[t](); return r !== e && !Lt(e) && (i._next = i.next, i.next = () => { const e = i._next(); return e.done || (e.value = n(e.value)), e }), i } const nt = Array.prototype; function rt(e, t, n, r, i, a) { const o = Qe(e); const s = o !== e && !Lt(e); const c = o[t]; if (c !== nt[t]) { const t = c.apply(e, a); return s ? Bt(t) : t } let l = n; o !== e && (s ? l = function (t, r) { return n.call(this, $e(e, t), r, e) } : n.length > 2 && (l = function (t, r) { return n.call(this, t, r, e) })); const u = c.call(o, l, r); return s && i ? i(u) : u } function it(e, t, n, r) { const i = Qe(e); const a = i !== e && !Lt(e); let o = n; let s = !1; i !== e && (a ? (s = r.length === 0, o = function (t, r, i) { return s && (s = !1, t = $e(e, t)), n.call(this, t, $e(e, r), i, e) }) : n.length > 3 && (o = function (t, r, i) { return n.call(this, t, r, i, e) })); const c = i[t](o, ...r); return s ? $e(e, c) : c } function at(e, t, n) { const r = q(e); Xe(r, `iterate`, Ye); const i = r[t](...n); return (i === -1 || i === !1) && Rt(n[0]) ? (n[0] = q(n[0]), r[t](...n)) : i } function ot(e, t, n = []) { W(), je(); const r = q(e)[t].apply(e, n); return Me(), Ve(), r } const st = l(`__proto__,__v_isRef,__isVue`); const ct = new Set(Object.getOwnPropertyNames(Symbol).filter(e => e !== `arguments` && e !== `caller`).map(e => Symbol[e]).filter(E)); function lt(e) { E(e) || (e = String(e)); const t = q(this); return Xe(t, `has`, e), Object.hasOwn(t, e) } const ut = class {
  constructor(e = !1, t = !1) { this._isReadonly = e, this._isShallow = t }get(e, t, n) {
    if (t === `__v_skip`)
      return e.__v_skip; const r = this._isReadonly; const i = this._isShallow; if (t === `__v_isReactive`)
      return !r; if (t === `__v_isReadonly`)
      return r; if (t === `__v_isShallow`)
      return i; if (t === `__v_raw`)
      return n === (r ? i ? Ot : Dt : i ? Et : Tt).get(e) || Object.getPrototypeOf(e) === Object.getPrototypeOf(n) ? e : void 0; const a = b(e); if (!r) {
      let e; if (a && (e = et[t]))
        return e; if (t === `hasOwnProperty`)
        return lt
    } const o = Reflect.get(e, t, Ht(e) ? e : n); if ((E(t) ? ct.has(t) : st(t)) || (r || Xe(e, `get`, t), i))
      return o; if (Ht(o)) { const e = a && A(t) ? o : o.value; return r && D(e) ? Nt(e) : e } return D(o) ? r ? Nt(o) : jt(o) : o
  }
}; const dt = class extends ut {
  constructor(e = !1) { super(!1, e) }set(e, t, n, r) {
    let i = e[t]; const a = b(e) && A(t); if (!this._isShallow) {
      const e = It(i); if (!Lt(n) && !It(n) && (i = q(i), n = q(n)), !a && Ht(i) && !Ht(n))
        return e || (i.value = n), !0
    } const o = a ? Number(t) < e.length : y(e, t); const s = Reflect.set(e, t, n, Ht(e) ? e : r); return e === q(r) && (o ? I(n, i) && K(e, `set`, t, n, i) : K(e, `add`, t, n)), s
  }

  deleteProperty(e, t) { const n = y(e, t); const r = e[t]; const i = Reflect.deleteProperty(e, t); return i && n && K(e, `delete`, t, void 0, r), i }has(e, t) { const n = Reflect.has(e, t); return (!E(t) || !ct.has(t)) && Xe(e, `has`, t), n }ownKeys(e) { return Xe(e, `iterate`, b(e) ? `length` : qe), Reflect.ownKeys(e) }
}; const ft = class extends ut {constructor(e = !1) { super(!0, e) }set(e, t) { return !0 }deleteProperty(e, t) { return !0 }}; const pt = new dt(); const mt = new ft(); const ht = new dt(!0); const gt = e => e; const _t = e => Reflect.getPrototypeOf(e); function vt(e, t, n) { return function (...r) { const i = this.__v_raw; const a = q(i); const o = x(a); const s = e === `entries` || e === Symbol.iterator && o; const c = e === `keys` && o; const l = i[e](...r); const u = n ? gt : t ? Vt : Bt; return !t && Xe(a, `iterate`, c ? Je : qe), g(Object.create(l), { next() { const { value: e, done: t } = l.next(); return t ? { value: e, done: t } : { value: s ? [u(e[0]), u(e[1])] : u(e), done: t } } }) } } function yt(e) { return function (...t) { return e === `delete` ? !1 : e === `clear` ? void 0 : this } } function bt(e, t) {
  const n = { get(n) {
    const r = this.__v_raw; const i = q(r); const a = q(n); e || (I(n, a) && Xe(i, `get`, n), Xe(i, `get`, a)); const { has: o } = _t(i); const s = t ? gt : e ? Vt : Bt; if (o.call(i, n))
      return s(r.get(n)); if (o.call(i, a))
      return s(r.get(a)); r !== i && r.get(n)
  }, get size() { const t = this.__v_raw; return !e && Xe(q(t), `iterate`, qe), t.size }, has(t) { const n = this.__v_raw; const r = q(n); const i = q(t); return e || (I(t, i) && Xe(r, `has`, t), Xe(r, `has`, i)), t === i ? n.has(t) : n.has(t) || n.has(i) }, forEach(n, r) { const i = this; const a = i.__v_raw; const o = q(a); const s = t ? gt : e ? Vt : Bt; return !e && Xe(o, `iterate`, qe), a.forEach((e, t) => n.call(r, s(e), s(t), i)) } }; return g(n, e ? { add: yt(`add`), set: yt(`set`), delete: yt(`delete`), clear: yt(`clear`) } : { add(e) { const n = q(this); const r = _t(n); const i = q(e); const a = !t && !Lt(e) && !It(e) ? i : e; return r.has.call(n, a) || I(e, a) && r.has.call(n, e) || I(i, a) && r.has.call(n, i) || (n.add(a), K(n, `add`, a, a)), this }, set(e, n) { !t && !Lt(n) && !It(n) && (n = q(n)); const r = q(this); const { has: i, get: a } = _t(r); let o = i.call(r, e); o ||= (e = q(e), i.call(r, e)); const s = a.call(r, e); return r.set(e, n), o ? I(n, s) && K(r, `set`, e, n, s) : K(r, `add`, e, n), this }, delete(e) { const t = q(this); const { has: n, get: r } = _t(t); let i = n.call(t, e); i ||= (e = q(e), n.call(t, e)); const a = r ? r.call(t, e) : void 0; const o = t.delete(e); return i && K(t, `delete`, e, void 0, a), o }, clear() { const e = q(this); const t = e.size !== 0; const n = e.clear(); return t && K(e, `clear`, void 0, void 0, void 0), n } }), [`keys`, `values`, `entries`, Symbol.iterator].forEach((r) => { n[r] = vt(r, e, t) }), n
} function xt(e, t) { const n = bt(e, t); return (t, r, i) => r === `__v_isReactive` ? !e : r === `__v_isReadonly` ? e : r === `__v_raw` ? t : Reflect.get(y(n, r) && r in t ? n : t, r, i) } const St = { get: xt(!1, !1) }; const Ct = { get: xt(!1, !0) }; const wt = { get: xt(!0, !1) }; var Tt = new WeakMap(); var Et = new WeakMap(); var Dt = new WeakMap(); var Ot = new WeakMap(); function kt(e) { switch (e) { case `Object`:case `Array`:return 1; case `Map`:case `Set`:case `WeakMap`:case `WeakSet`:return 2; default:return 0 } } function At(e) { return e.__v_skip || !Object.isExtensible(e) ? 0 : kt(ne(e)) } function jt(e) { return It(e) ? e : Pt(e, !1, pt, St, Tt) } function Mt(e) { return Pt(e, !1, ht, Ct, Et) } function Nt(e) { return Pt(e, !0, mt, wt, Dt) } function Pt(e, t, n, r, i) {
  if (!D(e) || e.__v_raw && (!t || !e.__v_isReactive))
    return e; const a = At(e); if (a === 0)
    return e; const o = i.get(e); if (o)
    return o; const s = new Proxy(e, a === 2 ? r : n); return i.set(e, s), s
} function Ft(e) { return It(e) ? Ft(e.__v_raw) : !!(e && e.__v_isReactive) } function It(e) { return !!(e && e.__v_isReadonly) } function Lt(e) { return !!(e && e.__v_isShallow) } function Rt(e) { return e ? !!e.__v_raw : !1 } function q(e) { const t = e && e.__v_raw; return t ? q(t) : e } function zt(e) { return !y(e, `__v_skip`) && Object.isExtensible(e) && R(e, `__v_skip`, !0), e } var Bt = e => D(e) ? jt(e) : e; var Vt = e => D(e) ? Nt(e) : e; function Ht(e) { return e ? e.__v_isRef === !0 : !1 } function J(e) { return Wt(e, !1) } function Ut(e) { return Wt(e, !0) } function Wt(e, t) { return Ht(e) ? e : new Gt(e, t) } var Gt = class {constructor(e, t) { this.dep = new We(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = t ? e : q(e), this._value = t ? e : Bt(e), this.__v_isShallow = t } get value() { return this.dep.track(), this._value } set value(e) { const t = this._rawValue; const n = this.__v_isShallow || Lt(e) || It(e); e = n ? e : q(e), I(e, t) && (this._rawValue = e, this._value = n ? e : Bt(e), this.dep.trigger()) }}; function Y(e) { return Ht(e) ? e.value : e } const Kt = { get: (e, t, n) => t === `__v_raw` ? e : Y(Reflect.get(e, t, n)), set: (e, t, n, r) => { const i = e[t]; return Ht(i) && !Ht(n) ? (i.value = n, !0) : Reflect.set(e, t, n, r) } }; function qt(e) { return Ft(e) ? e : new Proxy(e, Kt) } const Jt = class {
  constructor(e, t, n) { this.fn = e, this.setter = t, this._value = void 0, this.dep = new We(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = Ue - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !t, this.isSSR = n }notify() {
    if (this.flags |= 16, !(this.flags & 8) && U !== this)
      return Ae(this, !0), !0
  }

  get value() { const e = this.dep.track(); return Ie(this), e && (e.version = this.dep.version), this._value } set value(e) { this.setter && this.setter(e) }
}; function Yt(e, t, n = !1) { let r, i; return w(e) ? r = e : (r = e.get, i = e.set), new Jt(r, i, n) } const Xt = {}; const Zt = new WeakMap(); let Qt = void 0; function $t(e, t = !1, n = Qt) { if (n) { let t = Zt.get(n); t || Zt.set(n, t = []), t.push(e) } } function en(e, t, n = u) {
  const { immediate: r, deep: i, once: a, scheduler: o, augmentJob: s, call: c } = n; const l = e => i ? e : Lt(e) || i === !1 || i === 0 ? tn(e, 1) : tn(e); let d; let p; let m; let h; let g = !1; let v = !1; if (Ht(e)
    ? (p = () => e.value, g = Lt(e))
    : Ft(e)
      ? (p = () => l(e), g = !0)
      : b(e)
        ? (v = !0, g = e.some(e => Ft(e) || Lt(e)), p = () => e.map((e) => {
            if (Ht(e))
              return e.value; if (Ft(e))
              return l(e); if (w(e))
              return c ? c(e, 2) : e()
          }))
        : p = w(e)
          ? t
            ? c ? () => c(e, 2) : e
            : () => {
                if (m) {
                  W(); try { m() }
                  finally { Ve() }
                } const t = Qt; Qt = d; try { return c ? c(e, 3, [h]) : e(h) }
                finally { Qt = t }
              }
          : f, t && i) { const e = p; const t = i === !0 ? 1 / 0 : i; p = () => tn(e(), t) } const y = Ce(); const x = () => { d.stop(), y && y.active && _(y.effects, d) }; if (a && t) { const e = t; t = (...t) => { e(...t), x() } } let S = v ? new Array(e.length).fill(Xt) : Xt; const C = (e) => {
    if (!(!(d.flags & 1) || !d.dirty && !e)) {
      if (t) {
        const e = d.run(); if (i || g || (v ? e.some((e, t) => I(e, S[t])) : I(e, S))) {
          m && m(); const n = Qt; Qt = d; try { const n = [e, S === Xt ? void 0 : v && S[0] === Xt ? [] : S, h]; S = e, c ? c(t, 3, n) : t(...n) }
          finally { Qt = n }
        }
      }
      else {
        d.run()
      }
    }
  }; return s && s(C), d = new Ee(p), d.scheduler = o ? () => o(C, !1) : C, h = e => $t(e, !1, d), m = d.onStop = () => {
    const e = Zt.get(d); if (e) {
      if (c) {
        c(e, 4)
      }
      else {
        for (const t of e)t()
      }Zt.delete(d)
    }
  }, t ? r ? C(!0) : S = d.run() : o ? o(C.bind(null, !0), !0) : d.run(), x.pause = d.pause.bind(d), x.resume = d.resume.bind(d), x.stop = x, x
} function tn(e, t = 1 / 0, n) {
  if (t <= 0 || !D(e) || e.__v_skip || (n ||= new Map(), (n.get(e) || 0) >= t))
    return e; if (n.set(e, t), t--, Ht(e)) {
    tn(e.value, t, n)
  }
  else if (b(e)) {
    for (let r = 0; r < e.length; r++)tn(e[r], t, n)
  }
  else if (S(e) || x(e)) {
    e.forEach((e) => { tn(e, t, n) })
  }
  else if (k(e)) { for (const r in e)tn(e[r], t, n); for (const r of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e, r) && tn(e[r], t, n) } return e
} function nn(e, t, n, r) {
  try { return r ? e(...r) : e() }
  catch (e) { an(e, t, n) }
} function rn(e, t, n, r) { if (w(e)) { const i = nn(e, t, n, r); return i && O(i) && i.catch((e) => { an(e, t, n) }), i } if (b(e)) { const i = []; for (let a = 0; a < e.length; a++)i.push(rn(e[a], t, n, r)); return i } } function an(e, t, n, r = !0) {
  const i = t ? t.vnode : null; const { errorHandler: a, throwUnhandledErrorInProduction: o } = t && t.appContext.config || u; if (t) {
    let r = t.parent; const i = t.proxy; const o = `https://vuejs.org/error-reference/#runtime-${n}`; for (;r;) {
      const t = r.ec; if (t) {
        for (let n = 0; n < t.length; n++) {
          if (t[n](e, i, o) === !1)
            return
        }
      }r = r.parent
    } if (a) { W(), nn(a, null, 10, [e, i, o]), Ve(); return }
  }on(e, n, i, r, o)
} function on(e, t, n, r = !0, i = !1) {
  if (i)
    throw e; console.error(e)
} const sn = []; let cn = -1; const ln = []; let un = null; let dn = 0; const fn = Promise.resolve(); let pn = null; function mn(e) { const t = pn || fn; return e ? t.then(this ? e.bind(this) : e) : t } function hn(e) { let t = cn + 1; let n = sn.length; for (;t < n;) { const r = t + n >>> 1; const i = sn[r]; const a = xn(i); a < e || a === e && i.flags & 2 ? t = r + 1 : n = r } return t } function gn(e) { if (!(e.flags & 1)) { const t = xn(e); const n = sn[sn.length - 1]; !n || !(e.flags & 2) && t >= xn(n) ? sn.push(e) : sn.splice(hn(t), 0, e), e.flags |= 1, _n() } } function _n() { pn ||= fn.then(Sn) } function vn(e) { b(e) ? ln.push(...e) : un && e.id === -1 ? un.splice(dn + 1, 0, e) : e.flags & 1 || (ln.push(e), e.flags |= 1), _n() } function yn(e, t, n = cn + 1) {
  for (;n < sn.length; n++) {
    const t = sn[n]; if (t && t.flags & 2) {
      if (e && t.id !== e.uid)
        continue; sn.splice(n, 1), n--, t.flags & 4 && (t.flags &= -2), t(), t.flags & 4 || (t.flags &= -2)
    }
  }
} function bn(e) { if (ln.length) { const e = [...new Set(ln)].sort((e, t) => xn(e) - xn(t)); if (ln.length = 0, un) { un.push(...e); return } for (un = e, dn = 0; dn < un.length; dn++) { const e = un[dn]; e.flags & 4 && (e.flags &= -2), e.flags & 8 || e(), e.flags &= -2 }un = null, dn = 0 } } var xn = e => e.id ?? e.flags & 2 ? -1 : 1 / 0; function Sn(e) {
  try { for (cn = 0; cn < sn.length; cn++) { const e = sn[cn]; e && !(e.flags & 8) && (e.flags & 4 && (e.flags &= -2), nn(e, e.i, e.i ? 15 : 14), e.flags & 4 || (e.flags &= -2)) } }
  finally { for (;cn < sn.length; cn++) { const e = sn[cn]; e && (e.flags &= -2) }cn = -1, sn.length = 0, bn(e), pn = null, (sn.length || ln.length) && Sn(e) }
} let Cn = null; let wn = null; function Tn(e) { const t = Cn; return Cn = e, wn = e && e.type.__scopeId || null, t } function En(e, t = Cn, n) {
  if (!t || e._n)
    return e; const r = (...n) => {
    r._d && Pi(-1); const i = Tn(t); let a; try { a = e(...n) }
    finally { Tn(i), r._d && Pi(1) } return a
  }; return r._n = !0, r._c = !0, r._d = !0, r
} function Dn(e, t) {
  if (Cn === null)
    return e; const n = va(Cn); const r = e.dirs ||= []; for (let e = 0; e < t.length; e++) { let [i, a, o, s = u] = t[e]; i && (w(i) && (i = { mounted: i, updated: i }), i.deep && tn(a), r.push({ dir: i, instance: n, value: a, oldValue: void 0, arg: o, modifiers: s })) } return e
} function On(e, t, n, r) { const i = e.dirs; const a = t && t.dirs; for (let o = 0; o < i.length; o++) { const s = i[o]; a && (s.oldValue = a[o].value); const c = s.dir[r]; c && (W(), rn(c, n, 8, [e.el, s, e, t]), Ve()) } } function kn(e, t) { if (na) { let n = na.provides; const r = na.parent && na.parent.provides; r === n && (n = na.provides = Object.create(r)), n[e] = t } } function An(e, t, n = !1) {
  const r = ra(); if (r || Ir) {
    const i = Ir ? Ir._context.provides : r ? r.parent == null || r.ce ? r.vnode.appContext && r.vnode.appContext.provides : r.parent.provides : void 0; if (i && e in i)
      return i[e]; if (arguments.length > 1)
      return n && w(t) ? t.call(r && r.proxy) : t
  }
} const jn = Symbol.for(`v-scx`); const Mn = () => An(jn); function Nn(e, t, n) { return Pn(e, t, n) } function Pn(e, t, n = u) {
  const { immediate: r, deep: i, flush: a, once: o } = n; const s = g({}, n); const c = t && r || !t && a !== `post`; let l; if (la) {
    if (a === `sync`) { const e = Mn(); l = e.__watcherHandles ||= [] }
    else if (!c) { const e = () => {}; return e.stop = f, e.resume = f, e.pause = f, e }
  } const d = na; s.call = (e, t, n) => rn(e, d, t, n); let p = !1; a === `post` ? s.scheduler = (e) => { pi(e, d && d.suspense) } : a !== `sync` && (p = !0, s.scheduler = (e, t) => { t ? e() : gn(e) }), s.augmentJob = (e) => { t && (e.flags |= 4), p && (e.flags |= 2, d && (e.id = d.uid, e.i = d)) }; const m = en(e, t, s); return la && (l ? l.push(m) : c && m()), m
} function Fn(e, t, n) { const r = this.proxy; const i = T(e) ? e.includes(`.`) ? In(r, e) : () => r[e] : e.bind(r, r); let a; w(t) ? a = t : (a = t.handler, n = t); const o = oa(this); const s = Pn(i, a.bind(r), n); return o(), s } function In(e, t) { const n = t.split(`.`); return () => { let t = e; for (let e = 0; e < n.length && t; e++)t = t[n[e]]; return t } } const Ln = Symbol(`_vte`); const Rn = e => e.__isTeleport; const zn = Symbol(`_leaveCb`); function Bn(e, t) { e.shapeFlag & 6 && e.component ? (e.transition = t, Bn(e.component.subTree, t)) : e.shapeFlag & 128 ? (e.ssContent.transition = t.clone(e.ssContent), e.ssFallback.transition = t.clone(e.ssFallback)) : e.transition = t } function Vn(e, t) { return w(e) ? g({ name: e.name }, t, { setup: e }) : e } function Hn(e) { e.ids = [`${e.ids[0] + e.ids[2]++}-`, 0, 0] } function Un(e, t) { let n; return !!((n = Object.getOwnPropertyDescriptor(e, t)) && !n.configurable) } const Wn = new WeakMap(); function Gn(e, t, n, r, i = !1) {
  if (b(e)) { e.forEach((e, a) => Gn(e, t && (b(t) ? t[a] : t), n, r, i)); return } if (qn(r) && !i) { r.shapeFlag & 512 && r.type.__asyncResolved && r.component.subTree.component && Gn(e, t, n, r.component.subTree); return } const a = r.shapeFlag & 4 ? va(r.component) : r.el; const o = i ? null : a; const { i: s, r: c } = e; const l = t && t.r; const d = s.refs === u ? s.refs = {} : s.refs; const f = s.setupState; const m = q(f); const h = f === u ? p : e => Un(d, e) ? !1 : y(m, e); const g = (e, t) => !t || !Un(d, t); if (l != null && l !== c) {
    if (Kn(t), T(l)) {
      d[l] = null, h(l) && (f[l] = null)
    }
    else if (Ht(l)) { const e = t; g(l, e.k) && (l.value = null), e.k && (d[e.k] = null) }
  } if (w(c)) {
    nn(c, s, 12, [o, d])
  }
  else {
    const t = T(c); const r = Ht(c); if (t || r) {
      const s = () => {
        if (e.f) {
          const n = t ? h(c) ? f[c] : d[c] : g(c) || !e.k ? c.value : d[e.k]; if (i) {
            b(n) && _(n, a)
          }
          else if (b(n)) {
            n.includes(a) || n.push(a)
          }
          else if (t) {
            d[c] = [a], h(c) && (f[c] = d[c])
          }
          else { const t = [a]; g(c, e.k) && (c.value = t), e.k && (d[e.k] = t) }
        }
        else {
          t ? (d[c] = o, h(c) && (f[c] = o)) : r && (g(c, e.k) && (c.value = o), e.k && (d[e.k] = o))
        }
      }; if (o) { const t = () => { s(), Wn.delete(e) }; t.id = -1, Wn.set(e, t), pi(t, n) }
      else {
        Kn(e), s()
      }
    }
  }
} function Kn(e) { const t = Wn.get(e); t && (t.flags |= 8, Wn.delete(e)) }B().requestIdleCallback, B().cancelIdleCallback; var qn = e => !!e.type.__asyncLoader; const Jn = e => e.type.__isKeepAlive; function Yn(e, t) { Zn(e, `a`, t) } function Xn(e, t) { Zn(e, `da`, t) } function Zn(e, t, n = na) {
  const r = e.__wdc ||= () => {
    let t = n; for (;t;) {
      if (t.isDeactivated)
        return; t = t.parent
    } return e()
  }; if ($n(t, r, n), n) { let e = n.parent; for (;e && e.parent;)Jn(e.parent.vnode) && Qn(r, t, n, e), e = e.parent }
} function Qn(e, t, n, r) { const i = $n(t, e, r, !0); or(() => { _(r[t], i) }, n) } function $n(e, t, n = na, r = !1) { if (n) { const i = n[e] || (n[e] = []); const a = t.__weh ||= (...r) => { W(); const i = oa(n); const a = rn(t, n, e, r); return i(), Ve(), a }; return r ? i.unshift(a) : i.push(a), a } } const er = e => (t, n = na) => { (!la || e === `sp`) && $n(e, (...e) => t(...e), n) }; const tr = er(`bm`); const nr = er(`m`); const rr = er(`bu`); const ir = er(`u`); const ar = er(`bum`); var or = er(`um`); const sr = er(`sp`); const cr = er(`rtg`); const lr = er(`rtc`); function ur(e, t = na) { $n(`ec`, e, t) } const dr = Symbol.for(`v-ndc`); function fr(e, t, n, r) {
  let i; const a = n && n[r]; const o = b(e); if (o || T(e)) { const n = o && Ft(e); let r = !1; let s = !1; n && (r = !Lt(e), s = It(e), e = Qe(e)), i = new Array(e.length); for (let n = 0, o = e.length; n < o; n++)i[n] = t(r ? s ? Vt(Bt(e[n])) : Bt(e[n]) : e[n], n, void 0, a && a[n]) }
  else if (typeof e == `number`) { i = new Array(e); for (let n = 0; n < e; n++)i[n] = t(n + 1, n, void 0, a && a[n]) }
  else if (D(e)) {
    if (e[Symbol.iterator]) {
      i = Array.from(e, (e, n) => t(e, n, void 0, a && a[n]))
    }
    else { const n = Object.keys(e); i = new Array(n.length); for (let r = 0, o = n.length; r < o; r++) { const o = n[r]; i[r] = t(e[o], o, r, a && a[r]) } }
  }
  else {
    i = []
  } return n && (n[r] = i), i
} const pr = e => e ? ca(e) ? va(e) : pr(e.parent) : null; const mr = g(Object.create(null), { $: e => e, $el: e => e.vnode.el, $data: e => e.data, $props: e => e.props, $attrs: e => e.attrs, $slots: e => e.slots, $refs: e => e.refs, $parent: e => pr(e.parent), $root: e => pr(e.root), $host: e => e.ce, $emit: e => e.emit, $options: e => Cr(e), $forceUpdate: e => e.f ||= () => { gn(e.update) }, $nextTick: e => e.n ||= mn.bind(e.proxy), $watch: e => Fn.bind(e) }); const hr = (e, t) => e !== u && !e.__isScriptSetup && y(e, t); const gr = { get({ _: e }, t) {
  if (t === `__v_skip`)
    return !0; const { ctx: n, setupState: r, data: i, props: a, accessCache: o, type: s, appContext: c } = e; if (t[0] !== `$`) {
    const e = o[t]; if (e !== void 0)
      switch (e) { case 1:return r[t]; case 2:return i[t]; case 4:return n[t]; case 3:return a[t] } else if (hr(r, t))
      return o[t] = 1, r[t]; else if (i !== u && y(i, t))
      return o[t] = 2, i[t]; else if (y(a, t))
      return o[t] = 3, a[t]; else if (n !== u && y(n, t))
      return o[t] = 4, n[t]; else vr && (o[t] = 0)
  } const l = mr[t]; let d; let f; if (l)
    return t === `$attrs` && Xe(e.attrs, `get`, ``), l(e); if ((d = s.__cssModules) && (d = d[t]))
    return d; if (n !== u && y(n, t))
    return o[t] = 4, n[t]; if (f = c.config.globalProperties, y(f, t))
    return f[t]
}, set({ _: e }, t, n) { const { data: r, setupState: i, ctx: a } = e; return hr(i, t) ? (i[t] = n, !0) : r !== u && y(r, t) ? (r[t] = n, !0) : y(e.props, t) || t[0] === `$` && t.slice(1) in e ? !1 : (a[t] = n, !0) }, has({ _: { data: e, setupState: t, accessCache: n, ctx: r, appContext: i, props: a, type: o } }, s) { let c; return !!(n[s] || e !== u && s[0] !== `$` && y(e, s) || hr(t, s) || y(a, s) || y(r, s) || y(mr, s) || y(i.config.globalProperties, s) || (c = o.__cssModules) && c[s]) }, defineProperty(e, t, n) { return n.get == null ? y(n, `value`) && this.set(e, t, n.value, null) : e._.accessCache[t] = 0, Reflect.defineProperty(e, t, n) } }; function _r(e) { return b(e) ? e.reduce((e, t) => (e[t] = null, e), {}) : e } var vr = !0; function yr(e) {
  const t = Cr(e); const n = e.proxy; const r = e.ctx; vr = !1, t.beforeCreate && xr(t.beforeCreate, e, `bc`); const { data: i, computed: a, methods: o, watch: s, provide: c, inject: l, created: u, beforeMount: d, mounted: p, beforeUpdate: m, updated: h, activated: g, deactivated: _, beforeDestroy: v, beforeUnmount: y, destroyed: x, unmounted: S, render: C, renderTracked: T, renderTriggered: E, errorCaptured: O, serverPrefetch: ee, expose: te, inheritAttrs: ne, components: k, directives: A, filters: re } = t; if (l && br(l, r, null), o) {
    for (const e in o) { const t = o[e]; w(t) && (r[e] = t.bind(n)) }
  } if (i) { const t = i.call(n, n); D(t) && (e.data = jt(t)) } if (vr = !0, a) {
    for (const e in a) { const t = a[e]; const i = ba({ get: w(t) ? t.bind(n, n) : w(t.get) ? t.get.bind(n, n) : f, set: !w(t) && w(t.set) ? t.set.bind(n) : f }); Object.defineProperty(r, e, { enumerable: !0, configurable: !0, get: () => i.value, set: e => i.value = e }) }
  } if (s) {
    for (const e in s)Sr(s[e], r, n, e)
  } if (c) { const e = w(c) ? c.call(n) : c; Reflect.ownKeys(e).forEach((t) => { kn(t, e[t]) }) }u && xr(u, e, `c`); function j(e, t) { b(t) ? t.forEach(t => e(t.bind(n))) : t && e(t.bind(n)) } if (j(tr, d), j(nr, p), j(rr, m), j(ir, h), j(Yn, g), j(Xn, _), j(ur, O), j(lr, T), j(cr, E), j(ar, y), j(or, S), j(sr, ee), b(te)) {
    if (te.length) { const t = e.exposed ||= {}; te.forEach((e) => { Object.defineProperty(t, e, { get: () => n[e], set: t => n[e] = t, enumerable: !0 }) }) }
    else {
      e.exposed ||= {}
    }
  }C && e.render === f && (e.render = C), ne != null && (e.inheritAttrs = ne), k && (e.components = k), A && (e.directives = A), ee && Hn(e)
} function br(e, t, n = f) { b(e) && (e = Or(e)); for (const n in e) { const r = e[n]; let i; i = D(r) ? `default` in r ? An(r.from || n, r.default, !0) : An(r.from || n) : An(r), Ht(i) ? Object.defineProperty(t, n, { enumerable: !0, configurable: !0, get: () => i.value, set: e => i.value = e }) : t[n] = i } } function xr(e, t, n) { rn(b(e) ? e.map(e => e.bind(t.proxy)) : e.bind(t.proxy), t, n) } function Sr(e, t, n, r) {
  const i = r.includes(`.`) ? In(n, r) : () => n[r]; if (T(e)) { const n = t[e]; w(n) && Nn(i, n) }
  else if (w(e)) {
    Nn(i, e.bind(n))
  }
  else if (D(e)) {
    if (b(e)) {
      e.forEach(e => Sr(e, t, n, r))
    }
    else { const r = w(e.handler) ? e.handler.bind(n) : t[e.handler]; w(r) && Nn(i, r, e) }
  }
} function Cr(e) { const t = e.type; const { mixins: n, extends: r } = t; const { mixins: i, optionsCache: a, config: { optionMergeStrategies: o } } = e.appContext; const s = a.get(t); let c; return s ? c = s : !i.length && !n && !r ? c = t : (c = {}, i.length && i.forEach(e => wr(c, e, o, !0)), wr(c, t, o)), D(t) && a.set(t, c), c } function wr(e, t, n, r = !1) {
  const { mixins: i, extends: a } = t; a && wr(e, a, n, !0), i && i.forEach(t => wr(e, t, n, !0)); for (const i in t) {
    if (!r || i !== `expose`) { const r = Tr[i] || n && n[i]; e[i] = r ? r(e[i], t[i]) : t[i] }
  } return e
} var Tr = { data: Er, props: jr, emits: jr, methods: Ar, computed: Ar, beforeCreate: kr, created: kr, beforeMount: kr, mounted: kr, beforeUpdate: kr, updated: kr, beforeDestroy: kr, beforeUnmount: kr, destroyed: kr, unmounted: kr, activated: kr, deactivated: kr, errorCaptured: kr, serverPrefetch: kr, components: Ar, directives: Ar, watch: Mr, provide: Er, inject: Dr }; function Er(e, t) { return t ? e ? function () { return g(w(e) ? e.call(this, this) : e, w(t) ? t.call(this, this) : t) } : t : e } function Dr(e, t) { return Ar(Or(e), Or(t)) } function Or(e) { if (b(e)) { const t = {}; for (let n = 0; n < e.length; n++)t[e[n]] = e[n]; return t } return e } function kr(e, t) { return e ? [...new Set([].concat(e, t))] : t } function Ar(e, t) { return e ? g(Object.create(null), e, t) : t } function jr(e, t) { return e ? b(e) && b(t) ? [...new Set([...e, ...t])] : g(Object.create(null), _r(e), _r(t ?? {})) : t } function Mr(e, t) {
  if (!e)
    return t; if (!t)
    return e; const n = g(Object.create(null), e); for (const r in t)n[r] = kr(e[r], t[r]); return n
} function Nr() { return { app: null, config: { isNativeTag: p, performance: !1, globalProperties: {}, optionMergeStrategies: {}, errorHandler: void 0, warnHandler: void 0, compilerOptions: {} }, mixins: [], components: {}, directives: {}, provides: Object.create(null), optionsCache: new WeakMap(), propsCache: new WeakMap(), emitsCache: new WeakMap() } } let Pr = 0; function Fr(e, t) {
  return function (n, r = null) {
    w(n) || (n = g({}, n)), r != null && !D(r) && (r = null); const i = Nr(); const a = new WeakSet(); const o = []; let s = !1; const c = i.app = { _uid: Pr++, _component: n, _props: r, _container: null, _context: i, _instance: null, version: xa, get config() { return i.config }, set config(e) {}, use(e, ...t) { return a.has(e) || (e && w(e.install) ? (a.add(e), e.install(c, ...t)) : w(e) && (a.add(e), e(c, ...t))), c }, mixin(e) { return i.mixins.includes(e) || i.mixins.push(e), c }, component(e, t) { return t ? (i.components[e] = t, c) : i.components[e] }, directive(e, t) { return t ? (i.directives[e] = t, c) : i.directives[e] }, mount(a, o, l) { if (!s) { const u = c._ceVNode || Hi(n, r); return u.appContext = i, l === !0 ? l = `svg` : l === !1 && (l = void 0), o && t ? t(u, a) : e(u, a, l), s = !0, c._container = a, a.__vue_app__ = c, va(u.component) } }, onUnmount(e) { o.push(e) }, unmount() { s && (rn(o, c._instance, 16), e(null, c._container), delete c._container.__vue_app__) }, provide(e, t) { return i.provides[e] = t, c }, runWithContext(e) {
      const t = Ir; Ir = c; try { return e() }
      finally { Ir = t }
    } }; return c
  }
} var Ir = null; const Lr = (e, t) => t === `modelValue` || t === `model-value` ? e.modelModifiers : e[`${t}Modifiers`] || e[`${N(t)}Modifiers`] || e[`${P(t)}Modifiers`]; function Rr(e, t, ...n) {
  if (e.isUnmounted)
    return; const r = e.vnode.props || u; let i = n; const a = t.startsWith(`update:`); const o = a && Lr(r, t.slice(7)); o && (o.trim && (i = n.map(e => T(e) ? e.trim() : e)), o.number && (i = n.map(oe))); let s; let c = r[s = F(t)] || r[s = F(N(t))]; !c && a && (c = r[s = F(P(t))]), c && rn(c, e, 6, i); const l = r[`${s}Once`]; if (l) {
    if (!e.emitted)
      e.emitted = {}; else if (e.emitted[s])
      return; e.emitted[s] = !0, rn(l, e, 6, i)
  }
} const zr = new WeakMap(); function Br(e, t, n = !1) {
  const r = n ? zr : t.emitsCache; const i = r.get(e); if (i !== void 0)
    return i; const a = e.emits; const o = {}; let s = !1; if (!w(e)) { const r = (e) => { const n = Br(e, t, !0); n && (s = !0, g(o, n)) }; !n && t.mixins.length && t.mixins.forEach(r), e.extends && r(e.extends), e.mixins && e.mixins.forEach(r) } return !a && !s ? (D(e) && r.set(e, null), null) : (b(a) ? a.forEach(e => o[e] = null) : g(o, a), D(e) && r.set(e, o), o)
} function Vr(e, t) { return !e || !m(t) ? !1 : (t = t.slice(2).replace(/Once$/, ``), y(e, t[0].toLowerCase() + t.slice(1)) || y(e, P(t)) || y(e, t)) } function Hr(e) {
  const { type: t, vnode: n, proxy: r, withProxy: i, propsOptions: [a], slots: o, attrs: s, emit: c, render: l, renderCache: u, props: d, data: f, setupState: p, ctx: m, inheritAttrs: g } = e; const _ = Tn(e); let v; let y; try {
    if (n.shapeFlag & 4) { const e = i || r; const t = e; v = Ji(l.call(t, e, u, d, p, f, m)), y = s }
    else { const e = t; v = Ji(e.length > 1 ? e(d, { attrs: s, slots: o, emit: c }) : e(d, null)), y = t.props ? s : Ur(s) }
  }
  catch (t) { Ai.length = 0, an(t, e, 1), v = Hi(Oi) } let b = v; if (y && g !== !1) { const e = Object.keys(y); const { shapeFlag: t } = b; e.length && t & 7 && (a && e.some(h) && (y = Wr(y, a)), b = Gi(b, y, !1, !0)) } return n.dirs && (b = Gi(b, null, !1, !0), b.dirs = b.dirs ? b.dirs.concat(n.dirs) : n.dirs), n.transition && Bn(b, n.transition), v = b, Tn(_), v
} var Ur = (e) => { let t; for (const n in e)(n === `class` || n === `style` || m(n)) && ((t ||= {})[n] = e[n]); return t }; var Wr = (e, t) => { const n = {}; for (const r in e)(!h(r) || !(r.slice(9) in t)) && (n[r] = e[r]); return n }; function Gr(e, t, n) {
  const { props: r, children: i, component: a } = e; const { props: o, children: s, patchFlag: c } = t; const l = a.emitsOptions; if (t.dirs || t.transition)
    return !0; if (n && c >= 0) {
    if (c & 1024)
      return !0; if (c & 16)
      return r ? Kr(r, o, l) : !!o; if (c & 8) {
      const e = t.dynamicProps; for (let t = 0; t < e.length; t++) {
        const n = e[t]; if (qr(o, r, n) && !Vr(l, n))
          return !0
      }
    }
  }
  else {
    return (i || s) && (!s || !s.$stable) ? !0 : r === o ? !1 : r ? o ? Kr(r, o, l) : !0 : !!o
  } return !1
} function Kr(e, t, n) {
  const r = Object.keys(t); if (r.length !== Object.keys(e).length)
    return !0; for (let i = 0; i < r.length; i++) {
    const a = r[i]; if (qr(t, e, a) && !Vr(n, a))
      return !0
  } return !1
} function qr(e, t, n) { const r = e[n]; const i = t[n]; return n === `style` && D(r) && D(i) ? !he(r, i) : r !== i } function Jr({ vnode: e, parent: t, suspense: n }, r) {
  for (;t;) {
    const n = t.subTree; if (n.suspense && n.suspense.activeBranch === e && (n.suspense.vnode.el = n.el = r, e = n), n === e)
      (e = t.vnode).el = r, t = t.parent; else break
  }n && n.activeBranch === e && (n.vnode.el = r)
} const Yr = {}; const Xr = () => Object.create(Yr); const Zr = e => Object.getPrototypeOf(e) === Yr; function Qr(e, t, n, r = !1) { const i = {}; const a = Xr(); e.propsDefaults = Object.create(null), ei(e, t, i, a); for (const t in e.propsOptions[0])t in i || (i[t] = void 0); n ? e.props = r ? i : Mt(i) : e.type.props ? e.props = i : e.props = a, e.attrs = a } function $r(e, t, n, r) {
  const { props: i, attrs: a, vnode: { patchFlag: o } } = e; const s = q(i); const [c] = e.propsOptions; let l = !1; if ((r || o > 0) && !(o & 16)) {
    if (o & 8) {
      const n = e.vnode.dynamicProps; for (let r = 0; r < n.length; r++) {
        const o = n[r]; if (Vr(e.emitsOptions, o))
          continue; const u = t[o]; if (c) {
          if (y(a, o)) {
            u !== a[o] && (a[o] = u, l = !0)
          }
          else { const t = N(o); i[t] = ti(c, s, t, u, e, !1) }
        }
        else {
          u !== a[o] && (a[o] = u, l = !0)
        }
      }
    }
  }
  else {
    ei(e, t, i, a) && (l = !0); let r; for (const a in s)(!t || !y(t, a) && ((r = P(a)) === a || !y(t, r))) && (c ? n && (n[a] !== void 0 || n[r] !== void 0) && (i[a] = ti(c, s, a, void 0, e, !0)) : delete i[a]); if (a !== s) {
      for (const e in a)(!t || !y(t, e)) && (delete a[e], l = !0)
    }
  }l && K(e.attrs, `set`, ``)
} function ei(e, t, n, r) {
  const [i, a] = e.propsOptions; let o = !1; let s; if (t) {
    for (const c in t) {
      if (re(c))
        continue; const l = t[c]; let u; i && y(i, u = N(c)) ? !a || !a.includes(u) ? n[u] = l : (s ||= {})[u] = l : Vr(e.emitsOptions, c) || (!(c in r) || l !== r[c]) && (r[c] = l, o = !0)
    }
  } if (a) { const t = q(n); const r = s || u; for (let o = 0; o < a.length; o++) { const s = a[o]; n[s] = ti(i, t, s, r[s], e, !y(r, s)) } } return o
} function ti(e, t, n, r, i, a) {
  const o = e[n]; if (o != null) {
    const e = y(o, `default`); if (e && r === void 0) {
      const e = o.default; if (o.type !== Function && !o.skipFactory && w(e)) {
        const { propsDefaults: a } = i; if (n in a) {
          r = a[n]
        }
        else { const o = oa(i); r = a[n] = e.call(null, t), o() }
      }
      else {
        r = e
      }i.ce && i.ce._setProp(n, r)
    }o[0] && (a && !e ? r = !1 : o[1] && (r === `` || r === P(n)) && (r = !0))
  } return r
} const ni = new WeakMap(); function ri(e, t, n = !1) {
  const r = n ? ni : t.propsCache; const i = r.get(e); if (i)
    return i; const a = e.props; const o = {}; const s = []; let c = !1; if (!w(e)) { const r = (e) => { c = !0; const [n, r] = ri(e, t, !0); g(o, n), r && s.push(...r) }; !n && t.mixins.length && t.mixins.forEach(r), e.extends && r(e.extends), e.mixins && e.mixins.forEach(r) } if (!a && !c)
    return D(e) && r.set(e, d), d; if (b(a)) {
    for (let e = 0; e < a.length; e++) { const t = N(a[e]); ii(t) && (o[t] = u) }
  }
  else if (a) {
    for (const e in a) {
      const t = N(e); if (ii(t)) {
        const n = a[e]; const r = o[t] = b(n) || w(n) ? { type: n } : g({}, n); const i = r.type; let c = !1; let l = !0; if (b(i)) {
          for (let e = 0; e < i.length; ++e) {
            const t = i[e]; const n = w(t) && t.name; if (n === `Boolean`) { c = !0; break }
            else {
              n === `String` && (l = !1)
            }
          }
        }
        else {
          c = w(i) && i.name === `Boolean`
        }r[0] = c, r[1] = l, (c || y(r, `default`)) && s.push(t)
      }
    }
  } const l = [o, s]; return D(e) && r.set(e, l), l
} function ii(e) { return e[0] !== `$` && !re(e) } const ai = e => e === `_` || e === `_ctx` || e === `$stable`; const oi = e => b(e) ? e.map(Ji) : [Ji(e)]; function si(e, t, n) {
  if (t._n)
    return t; const r = En((...e) => oi(t(...e)), n); return r._c = !1, r
} function ci(e, t, n) {
  const r = e._ctx; for (const n in e) {
    if (ai(n))
      continue; const i = e[n]; if (w(i)) {
      t[n] = si(n, i, r)
    }
    else if (i != null) { const e = oi(i); t[n] = () => e }
  }
} function li(e, t) { const n = oi(t); e.slots.default = () => n } function ui(e, t, n) { for (const r in t)(n || !ai(r)) && (e[r] = t[r]) } function di(e, t, n) {
  const r = e.slots = Xr(); if (e.vnode.shapeFlag & 32) { const e = t._; e ? (ui(r, t, n), n && R(r, `_`, e, !0)) : ci(t, r) }
  else {
    t && li(e, t)
  }
} function fi(e, t, n) {
  const { vnode: r, slots: i } = e; let a = !0; let o = u; if (r.shapeFlag & 32) { const e = t._; e ? n && e === 1 ? a = !1 : ui(i, t, n) : (a = !t.$stable, ci(t, i)), o = t }
  else {
    t && (li(e, t), o = { default: 1 })
  } if (a) {
    for (const e in i)!ai(e) && o[e] == null && delete i[e]
  }
} var pi = Ti; function mi(e) { return hi(e) } function hi(e, t) {
  const n = B(); n.__VUE__ = !0; const { insert: r, remove: i, patchProp: a, createElement: o, createText: s, createComment: c, setText: l, setElementText: p, parentNode: m, nextSibling: h, setScopeId: g = f, insertStaticContent: _ } = e; const v = (e, t, n, r = null, i = null, a = null, o = void 0, s = null, c = !!t.dynamicChildren) => {
    if (e === t)
      return; e && !zi(e, t) && (r = ce(e), I(e, i, a, !0), e = null), t.patchFlag === -2 && (c = !1, t.dynamicChildren = null); const { type: l, ref: u, shapeFlag: d } = t; switch (l) { case Di:y(e, t, n, r); break; case Oi:b(e, t, n, r); break; case ki:e ?? x(t, n, r, o); break; case Ei:ne(e, t, n, r, i, a, o, s, c); break; default:d & 1 ? w(e, t, n, r, i, a, o, s, c) : d & 6 ? k(e, t, n, r, i, a, o, s, c) : (d & 64 || d & 128) && l.process(e, t, n, r, i, a, o, s, c, V) }u != null && i ? Gn(u, e && e.ref, a, t || e, !t) : u == null && e && e.ref != null && Gn(e.ref, null, a, e, !0)
  }; let y = (e, t, n, i) => {
    if (e == null) {
      r(t.el = s(t.children), n, i)
    }
    else { const n = t.el = e.el; t.children !== e.children && l(n, t.children) }
  }; let b = (e, t, n, i) => { e == null ? r(t.el = c(t.children || ``), n, i) : t.el = e.el }; let x = (e, t, n, r) => { [e.el, e.anchor] = _(e.children, t, n, r, e.el, e.anchor) }; const S = ({ el: e, anchor: t }, n, i) => { let a; for (;e && e !== t;)a = h(e), r(e, n, i), e = a; r(t, n, i) }; const C = ({ el: e, anchor: t }) => { let n; for (;e && e !== t;)n = h(e), i(e), e = n; i(t) }; let w = (e, t, n, r, i, a, o, s, c) => {
    if (t.type === `svg` ? o = `svg` : t.type === `math` && (o = `mathml`), e == null) {
      T(t, n, r, i, a, o, s, c)
    }
    else {
      const n = e.el && e.el._isVueCE ? e.el : null; try { n && n._beginPatch(), O(e, t, i, a, o, s, c) }
      finally { n && n._endPatch() }
    }
  }; let T = (e, t, n, i, s, c, l, u) => {
    let d; let f; const { props: m, shapeFlag: h, transition: g, dirs: _ } = e; if (d = e.el = o(e.type, c, m && m.is, m), h & 8 ? p(d, e.children) : h & 16 && D(e.children, d, null, i, s, gi(e, c), l, u), _ && On(e, null, i, `created`), E(d, e, e.scopeId, l, i), m) { for (const e in m)e !== `value` && !re(e) && a(d, e, null, m[e], c, i); `value` in m && a(d, `value`, null, m.value, c), (f = m.onVnodeBeforeMount) && Qi(f, i, e) }_ && On(e, null, i, `beforeMount`); const v = vi(s, g); v && g.beforeEnter(d), r(d, t, n), ((f = m && m.onVnodeMounted) || v || _) && pi(() => {
      try { f && Qi(f, i, e), v && g.enter(d), _ && On(e, null, i, `mounted`) }
      finally {}
    }, s)
  }; let E = (e, t, n, r, i) => {
    if (n && g(e, n), r) {
      for (let t = 0; t < r.length; t++)g(e, r[t])
    } if (i) { const n = i.subTree; if (t === n || wi(n.type) && (n.ssContent === t || n.ssFallback === t)) { const t = i.vnode; E(e, t, t.scopeId, t.slotScopeIds, i.parent) } }
  }; let D = (e, t, n, r, i, a, o, s, c = 0) => { for (let l = c; l < e.length; l++)v(null, e[l] = s ? Yi(e[l]) : Ji(e[l]), t, n, r, i, a, o, s) }; let O = (e, t, n, r, i, o, s) => {
    const c = t.el = e.el; let { patchFlag: l, dynamicChildren: d, dirs: f } = t; l |= e.patchFlag & 16; const m = e.props || u; const h = t.props || u; let g; if (n && _i(n, !1), (g = h.onVnodeBeforeUpdate) && Qi(g, n, t, e), f && On(t, e, n, `beforeUpdate`), n && _i(n, !0), (m.innerHTML && h.innerHTML == null || m.textContent && h.textContent == null) && p(c, ``), d ? ee(e.dynamicChildren, d, c, n, r, gi(t, i), o) : s || ie(e, t, c, null, n, r, gi(t, i), o, !1), l > 0) {
      if (l & 16) {
        te(c, m, h, n, i)
      }
      else if (l & 2 && m.class !== h.class && a(c, `class`, null, h.class, i), l & 4 && a(c, `style`, m.style, h.style, i), l & 8) { const e = t.dynamicProps; for (let t = 0; t < e.length; t++) { const r = e[t]; const o = m[r]; const s = h[r]; (s !== o || r === `value`) && a(c, r, o, s, i, n) } }l & 1 && e.children !== t.children && p(c, t.children)
    }
    else {
      !s && d == null && te(c, m, h, n, i)
    }((g = h.onVnodeUpdated) || f) && pi(() => { g && Qi(g, n, t, e), f && On(t, e, n, `updated`) }, r)
  }; let ee = (e, t, n, r, i, a, o) => { for (let s = 0; s < t.length; s++) { const c = e[s]; const l = t[s]; v(c, l, c.el && (c.type === Ei || !zi(c, l) || c.shapeFlag & 198) ? m(c.el) : n, null, r, i, a, o, !0) } }; let te = (e, t, n, r, i) => {
    if (t !== n) {
      if (t !== u) {
        for (const o in t)!re(o) && !(o in n) && a(e, o, t[o], null, i, r)
      } for (const o in n) {
        if (re(o))
          continue; const s = n[o]; const c = t[o]; s !== c && o !== `value` && a(e, o, c, s, i, r)
      }`value` in n && a(e, `value`, t.value, n.value, i)
    }
  }; let ne = (e, t, n, i, a, o, c, l, u) => { const d = t.el = e ? e.el : s(``); const f = t.anchor = e ? e.anchor : s(``); const { patchFlag: p, dynamicChildren: m, slotScopeIds: h } = t; h && (l = l ? l.concat(h) : h), e == null ? (r(d, n, i), r(f, n, i), D(t.children || [], n, f, a, o, c, l, u)) : p > 0 && p & 64 && m && e.dynamicChildren && e.dynamicChildren.length === m.length ? (ee(e.dynamicChildren, m, n, a, o, c, l), (t.key != null || a && t === a.subTree) && yi(e, t, !0)) : ie(e, t, n, f, a, o, c, l, u) }; let k = (e, t, n, r, i, a, o, s, c) => { t.slotScopeIds = s, e == null ? t.shapeFlag & 512 ? i.ctx.activate(t, n, r, o, c) : A(t, n, r, i, a, o, c) : j(e, t, c) }; let A = (e, t, n, r, i, a, o) => {
    const s = e.component = ta(e, r, i); if (Jn(e) && (s.ctx.renderer = V), ua(s, !1, o), s.asyncDep) { if (i && i.registerDep(s, M, o), !e.el) { const r = s.subTree = Hi(Oi); b(null, r, t, n), e.placeholder = r.el } }
    else {
      M(s, e, t, n, i, a, o)
    }
  }; let j = (e, t, n) => {
    const r = t.component = e.component; if (Gr(e, t, n)) {
      if (r.asyncDep && !r.asyncResolved) { N(r, t, n) }
      else {
        r.next = t, r.update()
      }
    }
    else {
      t.el = e.el, r.vnode = t
    }
  }; let M = (e, t, n, r, i, a, o) => {
    const s = () => {
      if (e.isMounted) { let { next: t, bu: n, u: r, parent: s, vnode: c } = e; { const n = xi(e); if (n) { t && (t.el = c.el, N(e, t, o)), n.asyncDep.then(() => { pi(() => { e.isUnmounted || l() }, i) }); return } } const u = t; let d; _i(e, !1), t ? (t.el = c.el, N(e, t, o)) : t = c, n && L(n), (d = t.props && t.props.onVnodeBeforeUpdate) && Qi(d, s, t, c), _i(e, !0); const f = Hr(e); const p = e.subTree; e.subTree = f, v(p, f, m(p.el), ce(p), e, i, a), t.el = f.el, u === null && Jr(e, f.el), r && pi(r, i), (d = t.props && t.props.onVnodeUpdated) && pi(() => Qi(d, s, t, c), i) }
      else {
        let o; const { el: s, props: c } = t; const { bm: l, m: u, parent: d, root: f, type: p } = e; const m = qn(t); if (_i(e, !1), l && L(l), !m && (o = c && c.onVnodeBeforeMount) && Qi(o, d, t), _i(e, !0), s && de) { const t = () => { e.subTree = Hr(e), de(s, e.subTree, e, i, null) }; m && p.__asyncHydrate ? p.__asyncHydrate(s, e, t) : t() }
        else { f.ce && f.ce._hasShadowRoot() && f.ce._injectChildStyle(p, e.parent ? e.parent.type : void 0); const o = e.subTree = Hr(e); v(null, o, n, r, e, i, a), t.el = o.el } if (u && pi(u, i), !m && (o = c && c.onVnodeMounted)) { const e = t; pi(() => Qi(o, d, e), i) }(t.shapeFlag & 256 || d && qn(d.vnode) && d.vnode.shapeFlag & 256) && e.a && pi(e.a, i), e.isMounted = !0, t = n = r = null
      }
    }; e.scope.on(); const c = e.effect = new Ee(s); e.scope.off(); let l = e.update = c.run.bind(c); const u = e.job = c.runIfDirty.bind(c); u.i = e, u.id = e.uid, c.scheduler = () => gn(u), _i(e, !0), l()
  }; let N = (e, t, n) => { t.component = e; const r = e.vnode.props; e.vnode = t, e.next = null, $r(e, t.props, r, n), fi(e, t.children, n), W(), yn(e), Ve() }; let ie = (e, t, n, r, i, a, o, s, c = !1) => {
    const l = e && e.children; const u = e ? e.shapeFlag : 0; const d = t.children; const { patchFlag: f, shapeFlag: m } = t; if (f > 0) {
      if (f & 128) { ae(l, d, n, r, i, a, o, s, c); return }
      else if (f & 256) { P(l, d, n, r, i, a, o, s, c); return }
    }m & 8 ? (u & 16 && se(l, i, a), d !== l && p(n, d)) : u & 16 ? m & 16 ? ae(l, d, n, r, i, a, o, s, c) : se(l, i, a, !0) : (u & 8 && p(n, ``), m & 16 && D(d, n, r, i, a, o, s, c))
  }; let P = (e, t, n, r, i, a, o, s, c) => { e ||= d, t ||= d; const l = e.length; const u = t.length; const f = Math.min(l, u); let p; for (p = 0; p < f; p++) { const r = t[p] = c ? Yi(t[p]) : Ji(t[p]); v(e[p], r, n, null, i, a, o, s, c) }l > u ? se(e, i, a, !0, !1, f) : D(t, n, r, i, a, o, s, c, f) }; let ae = (e, t, n, r, i, a, o, s, c) => {
    let l = 0; const u = t.length; let f = e.length - 1; let p = u - 1; for (;l <= f && l <= p;) {
      const r = e[l]; const u = t[l] = c ? Yi(t[l]) : Ji(t[l]); if (zi(r, u))
        v(r, u, n, null, i, a, o, s, c); else break; l++
    } for (;l <= f && l <= p;) {
      const r = e[f]; const l = t[p] = c ? Yi(t[p]) : Ji(t[p]); if (zi(r, l))
        v(r, l, n, null, i, a, o, s, c); else break; f--, p--
    } if (l > f) { if (l <= p) { const e = p + 1; const d = e < u ? t[e].el : r; for (;l <= p;)v(null, t[l] = c ? Yi(t[l]) : Ji(t[l]), n, d, i, a, o, s, c), l++ } }
    else if (l > p) {
      for (;l <= f;)I(e[l], i, a, !0), l++
    }
    else {
      const m = l; const h = l; const g = new Map(); for (l = h; l <= p; l++) { const e = t[l] = c ? Yi(t[l]) : Ji(t[l]); e.key != null && g.set(e.key, l) } let _; let y = 0; const b = p - h + 1; let x = !1; let S = 0; const C = new Array(b); for (l = 0; l < b; l++)C[l] = 0; for (l = m; l <= f; l++) {
        const r = e[l]; if (y >= b) { I(r, i, a, !0); continue } let u; if (r.key != null) {
          u = g.get(r.key)
        }
        else {
          for (_ = h; _ <= p; _++) {
            if (C[_ - h] === 0 && zi(r, t[_])) { u = _; break }
          }
        }u === void 0 ? I(r, i, a, !0) : (C[u - h] = l + 1, u >= S ? S = u : x = !0, v(r, t[u], n, null, i, a, o, s, c), y++)
      } const w = x ? bi(C) : d; for (_ = w.length - 1, l = b - 1; l >= 0; l--) { const e = h + l; const d = t[e]; const f = t[e + 1]; const p = e + 1 < u ? f.el || Ci(f) : r; C[l] === 0 ? v(null, d, n, p, i, a, o, s, c) : x && (_ < 0 || l !== w[_] ? F(d, n, p, 2) : _--) }
    }
  }; let F = (e, t, n, a, o = null) => {
    const { el: s, type: c, transition: l, children: u, shapeFlag: d } = e; if (d & 6) { F(e.component.subTree, t, n, a); return } if (d & 128) { e.suspense.move(t, n, a); return } if (d & 64) { c.move(e, t, n, V); return } if (c === Ei) { r(s, t, n); for (let e = 0; e < u.length; e++)F(u[e], t, n, a); r(e.anchor, t, n); return } if (c === ki) { S(e, t, n); return } if (a !== 2 && d & 1 && l) {
      if (a === 0) {
        l.beforeEnter(s), r(s, t, n), pi(() => l.enter(s), o)
      }
      else { const { leave: a, delayLeave: o, afterLeave: c } = l; const u = () => { e.ctx.isUnmounted ? i(s) : r(s, t, n) }; const d = () => { s._isLeaving && s[zn](!0), a(s, () => { u(), c && c() }) }; o ? o(s, u, d) : d() }
    }
    else {
      r(s, t, n)
    }
  }; let I = (e, t, n, r = !1, i = !1) => {
    const { type: a, props: o, ref: s, children: c, dynamicChildren: l, shapeFlag: u, patchFlag: d, dirs: f, cacheIndex: p, memo: m } = e; if (d === -2 && (i = !1), s != null && (W(), Gn(s, null, n, e, !0), Ve()), p != null && (t.renderCache[p] = void 0), u & 256) { t.ctx.deactivate(e); return } const h = u & 1 && f; const g = !qn(e); let _; if (g && (_ = o && o.onVnodeBeforeUnmount) && Qi(_, t, e), u & 6) {
      z(e.component, n, r)
    }
    else { if (u & 128) { e.suspense.unmount(n, r); return }h && On(e, null, t, `beforeUnmount`), u & 64 ? e.type.remove(e, t, n, V, r) : l && !l.hasOnce && (a !== Ei || d > 0 && d & 64) ? se(l, t, n, !1, !0) : (a === Ei && d & 384 || !i && u & 16) && se(c, t, n), r && R(e) } const v = m != null && p == null; (g && (_ = o && o.onVnodeUnmounted) || h || v) && pi(() => { _ && Qi(_, t, e), h && On(e, null, t, `unmounted`), v && (e.el = null) }, n)
  }; let R = (e) => {
    const { type: t, el: n, anchor: r, transition: a } = e; if (t === Ei) { oe(n, r); return } if (t === ki) { C(e); return } const o = () => { i(n), a && !a.persisted && a.afterLeave && a.afterLeave() }; if (e.shapeFlag & 1 && a && !a.persisted) { const { leave: t, delayLeave: r } = a; const i = () => t(n, o); r ? r(e.el, o, i) : i() }
    else {
      o()
    }
  }; let oe = (e, t) => { let n; for (;e !== t;)n = h(e), i(e), e = n; i(t) }; let z = (e, t, n) => { const { bum: r, scope: i, job: a, subTree: o, um: s, m: c, a: l } = e; Si(c), Si(l), r && L(r), i.stop(), a && (a.flags |= 8, I(o, e, t, n)), s && pi(s, t), pi(() => { e.isUnmounted = !0 }, t) }; let se = (e, t, n, r = !1, i = !1, a = 0) => { for (let o = a; o < e.length; o++)I(e[o], t, n, r, i) }; let ce = (e) => {
    if (e.shapeFlag & 6)
      return ce(e.component.subTree); if (e.shapeFlag & 128)
      return e.suspense.next(); const t = h(e.anchor || e.el); const n = t && t[Ln]; return n ? h(n) : t
  }; let le = !1; const ue = (e, t, n) => { let r; e == null ? t._vnode && (I(t._vnode, null, null, !0), r = t._vnode.component) : v(t._vnode || null, e, t, null, null, null, n), t._vnode = e, le ||= (le = !0, yn(r), bn(), !1) }; let V = { p: v, um: I, m: F, r: R, mt: A, mc: D, pc: ie, pbc: ee, n: ce, o: e }; let H; let de; return t && ([H, de] = t(V)), { render: ue, hydrate: H, createApp: Fr(ue, H) }
} function gi({ type: e, props: t }, n) { return n === `svg` && e === `foreignObject` || n === `mathml` && e === `annotation-xml` && t && t.encoding && t.encoding.includes(`html`) ? void 0 : n } function _i({ effect: e, job: t }, n) { n ? (e.flags |= 32, t.flags |= 4) : (e.flags &= -33, t.flags &= -5) } function vi(e, t) { return (!e || e && !e.pendingBranch) && t && !t.persisted } function yi(e, t, n = !1) {
  const r = e.children; const i = t.children; if (b(r) && b(i)) {
    for (let e = 0; e < r.length; e++) { const t = r[e]; let a = i[e]; a.shapeFlag & 1 && !a.dynamicChildren && ((a.patchFlag <= 0 || a.patchFlag === 32) && (a = i[e] = Yi(i[e]), a.el = t.el), !n && a.patchFlag !== -2 && yi(t, a)), a.type === Di && (a.patchFlag === -1 && (a = i[e] = Yi(a)), a.el = t.el), a.type === Oi && !a.el && (a.el = t.el) }
  }
} function bi(e) { const t = e.slice(); const n = [0]; let r; let i; let a; let o; let s; const c = e.length; for (r = 0; r < c; r++) { const c = e[r]; if (c !== 0) { if (i = n[n.length - 1], e[i] < c) { t[r] = i, n.push(r); continue } for (a = 0, o = n.length - 1; a < o;)s = a + o >> 1, e[n[s]] < c ? a = s + 1 : o = s; c < e[n[a]] && (a > 0 && (t[r] = n[a - 1]), n[a] = r) } } for (a = n.length, o = n[a - 1]; a-- > 0;)n[a] = o, o = t[o]; return n } function xi(e) {
  const t = e.subTree.component; if (t)
    return t.asyncDep && !t.asyncResolved ? t : xi(t)
} function Si(e) {
  if (e) {
    for (let t = 0; t < e.length; t++)e[t].flags |= 8
  }
} function Ci(e) {
  if (e.placeholder)
    return e.placeholder; const t = e.component; return t ? Ci(t.subTree) : null
} var wi = e => e.__isSuspense; function Ti(e, t) { t && t.pendingBranch ? b(e) ? t.effects.push(...e) : t.effects.push(e) : vn(e) } var Ei = Symbol.for(`v-fgt`); var Di = Symbol.for(`v-txt`); var Oi = Symbol.for(`v-cmt`); var ki = Symbol.for(`v-stc`); var Ai = []; let ji = null; function X(e = !1) { Ai.push(ji = e ? null : []) } function Mi() { Ai.pop(), ji = Ai[Ai.length - 1] || null } let Ni = 1; function Pi(e, t = !1) { Ni += e, e < 0 && ji && t && (ji.hasOnce = !0) } function Fi(e) { return e.dynamicChildren = Ni > 0 ? ji || d : null, Mi(), Ni > 0 && ji && ji.push(e), e } function Ii(e, t, n, r, i, a) { return Fi(Z(e, t, n, r, i, a, !0)) } function Li(e, t, n, r, i) { return Fi(Hi(e, t, n, r, i, !0)) } function Ri(e) { return e ? e.__v_isVNode === !0 : !1 } function zi(e, t) { return e.type === t.type && e.key === t.key } const Bi = ({ key: e }) => e ?? null; const Vi = ({ ref: e, ref_key: t, ref_for: n }) => (typeof e == `number` && (e = `${e}`), e == null ? null : T(e) || Ht(e) || w(e) ? { i: Cn, r: e, k: t, f: !!n } : e); function Z(e, t = null, n = null, r = 0, i = null, a = e === Ei ? 0 : 1, o = !1, s = !1) { const c = { __v_isVNode: !0, __v_skip: !0, type: e, props: t, key: t && Bi(t), ref: t && Vi(t), scopeId: wn, slotScopeIds: null, children: n, component: null, suspense: null, ssContent: null, ssFallback: null, dirs: null, transition: null, el: null, anchor: null, target: null, targetStart: null, targetAnchor: null, staticCount: 0, shapeFlag: a, patchFlag: r, dynamicProps: i, dynamicChildren: null, appContext: null, ctx: Cn }; return s ? (Xi(c, n), a & 128 && e.normalize(c)) : n && (c.shapeFlag |= T(n) ? 8 : 16), Ni > 0 && !o && ji && (c.patchFlag > 0 || a & 6) && c.patchFlag !== 32 && ji.push(c), c } var Hi = Ui; function Ui(e, t = null, n = null, r = 0, i = null, a = !1) { if ((!e || e === dr) && (e = Oi), Ri(e)) { const r = Gi(e, t, !0); return n && Xi(r, n), Ni > 0 && !a && ji && (r.shapeFlag & 6 ? ji[ji.indexOf(e)] = r : ji.push(r)), r.patchFlag = -2, r } if (ya(e) && (e = e.__vccOpts), t) { t = Wi(t); let { class: e, style: n } = t; e && !T(e) && (t.class = H(e)), D(n) && (Rt(n) && !b(n) && (n = g({}, n)), t.style = se(n)) } const o = T(e) ? 1 : wi(e) ? 128 : Rn(e) ? 64 : D(e) ? 4 : w(e) ? 2 : 0; return Z(e, t, n, r, i, o, a, !0) } function Wi(e) { return e ? Rt(e) || Zr(e) ? g({}, e) : e : null } function Gi(e, t, n = !1, r = !1) { const { props: i, ref: a, patchFlag: o, children: s, transition: c } = e; const l = t ? Zi(i || {}, t) : i; const u = { __v_isVNode: !0, __v_skip: !0, type: e.type, props: l, key: l && Bi(l), ref: t && t.ref ? n && a ? b(a) ? a.concat(Vi(t)) : [a, Vi(t)] : Vi(t) : a, scopeId: e.scopeId, slotScopeIds: e.slotScopeIds, children: s, target: e.target, targetStart: e.targetStart, targetAnchor: e.targetAnchor, staticCount: e.staticCount, shapeFlag: e.shapeFlag, patchFlag: t && e.type !== Ei ? o === -1 ? 16 : o | 16 : o, dynamicProps: e.dynamicProps, dynamicChildren: e.dynamicChildren, appContext: e.appContext, dirs: e.dirs, transition: c, component: e.component, suspense: e.suspense, ssContent: e.ssContent && Gi(e.ssContent), ssFallback: e.ssFallback && Gi(e.ssFallback), placeholder: e.placeholder, el: e.el, anchor: e.anchor, ctx: e.ctx, ce: e.ce }; return c && r && Bn(u, c.clone(u)), u } function Ki(e = ` `, t = 0) { return Hi(Di, null, e, t) } function qi(e = ``, t = !1) { return t ? (X(), Li(Oi, null, e)) : Hi(Oi, null, e) } function Ji(e) { return e == null || typeof e == `boolean` ? Hi(Oi) : b(e) ? Hi(Ei, null, e.slice()) : Ri(e) ? Yi(e) : Hi(Di, null, String(e)) } function Yi(e) { return e.el === null && e.patchFlag !== -1 || e.memo ? e : Gi(e) } function Xi(e, t) {
  let n = 0; const { shapeFlag: r } = e; if (t == null) {
    t = null
  }
  else if (b(t)) {
    n = 16
  }
  else if (typeof t == `object`) {
    if (r & 65) { const n = t.default; n && (n._c && (n._d = !1), Xi(e, n()), n._c && (n._d = !0)); return }
    else { n = 32; const r = t._; !r && !Zr(t) ? t._ctx = Cn : r === 3 && Cn && (Cn.slots._ === 1 ? t._ = 1 : (t._ = 2, e.patchFlag |= 1024)) }
  }
  else {
    w(t) ? (t = { default: t, _ctx: Cn }, n = 32) : (t = String(t), r & 64 ? (n = 16, t = [Ki(t)]) : n = 8)
  }e.children = t, e.shapeFlag |= n
} function Zi(...e) {
  const t = {}; for (let n = 0; n < e.length; n++) {
    const r = e[n]; for (const e in r) {
      if (e === `class`) {
        t.class !== r.class && (t.class = H([t.class, r.class]))
      }
      else if (e === `style`) {
        t.style = se([t.style, r.style])
      }
      else if (m(e)) { const n = t[e]; const i = r[e]; i && n !== i && (!b(n) || !n.includes(i)) ? t[e] = n ? [].concat(n, i) : i : i == null && n == null && !h(e) && (t[e] = i) }
      else {
        e !== `` && (t[e] = r[e])
      }
    }
  } return t
} function Qi(e, t, n, r = null) { rn(e, t, 7, [n, r]) } const $i = Nr(); let ea = 0; function ta(e, t, n) { const r = e.type; const i = (t ? t.appContext : e.appContext) || $i; const a = { uid: ea++, vnode: e, type: r, parent: t, appContext: i, root: null, next: null, subTree: null, effect: null, update: null, job: null, scope: new Se(!0), render: null, proxy: null, exposed: null, exposeProxy: null, withProxy: null, provides: t ? t.provides : Object.create(i.provides), ids: t ? t.ids : [``, 0, 0], accessCache: null, renderCache: [], components: null, directives: null, propsOptions: ri(r, i), emitsOptions: Br(r, i), emit: null, emitted: null, propsDefaults: u, inheritAttrs: r.inheritAttrs, ctx: u, data: u, props: u, attrs: u, slots: u, refs: u, setupState: u, setupContext: null, suspense: n, suspenseId: n ? n.pendingId : 0, asyncDep: null, asyncResolved: !1, isMounted: !1, isUnmounted: !1, isDeactivated: !1, bc: null, c: null, bm: null, m: null, bu: null, u: null, um: null, bum: null, da: null, a: null, rtg: null, rtc: null, ec: null, sp: null }; return a.ctx = { _: a }, a.root = t ? t.root : a, a.emit = Rr.bind(null, a), e.ce && e.ce(a), a } var na = null; var ra = () => na || Cn; let ia; let aa; { const e = B(); const t = (t, n) => { let r; return (r = e[t]) || (r = e[t] = []), r.push(n), (e) => { r.length > 1 ? r.forEach(t => t(e)) : r[0](e) } }; ia = t(`__VUE_INSTANCE_SETTERS__`, e => na = e), aa = t(`__VUE_SSR_SETTERS__`, e => la = e) } var oa = (e) => { const t = na; return ia(e), e.scope.on(), () => { e.scope.off(), ia(t) } }; function sa() { na && na.scope.off(), ia(null) } function ca(e) { return e.vnode.shapeFlag & 4 } var la = !1; function ua(e, t = !1, n = !1) { t && aa(t); const { props: r, children: i } = e.vnode; const a = ca(e); Qr(e, r, a, t), di(e, i, n || t); const o = a ? da(e, t) : void 0; return t && aa(!1), o } function da(e, t) {
  const n = e.type; e.accessCache = Object.create(null), e.proxy = new Proxy(e.ctx, gr); const { setup: r } = n; if (r) {
    W(); const n = e.setupContext = r.length > 1 ? _a(e) : null; const i = oa(e); const a = nn(r, e, 0, [e.props, n]); const o = O(a); if (Ve(), i(), (o || e.sp) && !qn(e) && Hn(e), o) {
      if (a.then(sa, sa), t)
        return a.then((n) => { fa(e, n, t) }).catch((t) => { an(t, e, 0) }); e.asyncDep = a
    }
    else {
      fa(e, a, t)
    }
  }
  else {
    ha(e, t)
  }
} function fa(e, t, n) { w(t) ? e.type.__ssrInlineRender ? e.ssrRender = t : e.render = t : D(t) && (e.setupState = qt(t)), ha(e, n) } let pa, ma; function ha(e, t, n) {
  const r = e.type; if (!e.render) { if (!t && pa && !r.render) { const t = r.template || Cr(e).template; if (t) { const { isCustomElement: n, compilerOptions: i } = e.appContext.config; const { delimiters: a, compilerOptions: o } = r; r.render = pa(t, g(g({ isCustomElement: n, delimiters: a }, i), o)) } }e.render = r.render || f, ma && ma(e) } { const t = oa(e); W(); try { yr(e) }
  finally { Ve(), t() } }
} const ga = { get(e, t) { return Xe(e, `get`, ``), e[t] } }; function _a(e) { return { attrs: new Proxy(e.attrs, ga), slots: e.slots, emit: e.emit, expose: (t) => { e.exposed = t || {} } } } function va(e) {
  return e.exposed
    ? e.exposeProxy ||= new Proxy(qt(zt(e.exposed)), { get(t, n) {
      if (n in t)
        return t[n]; if (n in mr)
        return mr[n](e)
    }, has(e, t) { return t in e || t in mr } })
    : e.proxy
} function ya(e) { return w(e) && `__vccOpts` in e } var ba = (e, t) => Yt(e, t, la); var xa = `3.5.32`; let Sa = void 0; const Ca = typeof window < `u` && window.trustedTypes; if (Ca) {
  try { Sa = Ca.createPolicy(`vue`, { createHTML: e => e }) }
  catch {}
} const wa = Sa ? e => Sa.createHTML(e) : e => e; const Ta = `http://www.w3.org/2000/svg`; const Ea = `http://www.w3.org/1998/Math/MathML`; const Da = typeof document < `u` ? document : null; const Oa = Da && Da.createElement(`template`); const ka = { insert: (e, t, n) => { t.insertBefore(e, n || null) }, remove: (e) => { const t = e.parentNode; t && t.removeChild(e) }, createElement: (e, t, n, r) => { const i = t === `svg` ? Da.createElementNS(Ta, e) : t === `mathml` ? Da.createElementNS(Ea, e) : n ? Da.createElement(e, { is: n }) : Da.createElement(e); return e === `select` && r && r.multiple != null && i.setAttribute(`multiple`, r.multiple), i }, createText: e => Da.createTextNode(e), createComment: e => Da.createComment(e), setText: (e, t) => { e.nodeValue = t }, setElementText: (e, t) => { e.textContent = t }, parentNode: e => e.parentNode, nextSibling: e => e.nextSibling, querySelector: e => Da.querySelector(e), setScopeId(e, t) { e.setAttribute(t, ``) }, insertStaticContent(e, t, n, r, i, a) {
  const o = n ? n.previousSibling : t.lastChild; if (i && (i === a || i.nextSibling)) {
    for (;t.insertBefore(i.cloneNode(!0), n), !(i === a || !(i = i.nextSibling)););
  }
  else { Oa.innerHTML = wa(r === `svg` ? `<svg>${e}</svg>` : r === `mathml` ? `<math>${e}</math>` : e); const i = Oa.content; if (r === `svg` || r === `mathml`) { const e = i.firstChild; for (;e.firstChild;)i.appendChild(e.firstChild); i.removeChild(e) }t.insertBefore(i, n) } return [o ? o.nextSibling : t.firstChild, n ? n.previousSibling : t.lastChild]
} }; const Aa = Symbol(`_vtc`); function ja(e, t, n) { const r = e[Aa]; r && (t = (t ? [t, ...r] : [...r]).join(` `)), t == null ? e.removeAttribute(`class`) : n ? e.setAttribute(`class`, t) : e.className = t } const Ma = Symbol(`_vod`); const Na = Symbol(`_vsh`); const Pa = Symbol(``); const Fa = /(?:^|;)\s*display\s*:/; function Ia(e, t, n) {
  const r = e.style; const i = T(n); let a = !1; if (n && !i) {
    if (t) {
      if (T(t)) {
        for (const e of t.split(`;`)) { const t = e.slice(0, e.indexOf(`:`)).trim(); n[t] ?? Ra(r, t, ``) }
      }
      else {
        for (const e in t)n[e] ?? Ra(r, e, ``)
      }
    } for (const e in n)e === `display` && (a = !0), Ra(r, e, n[e])
  }
  else if (i) { if (t !== n) { const e = r[Pa]; e && (n += `;${e}`), r.cssText = n, a = Fa.test(n) } }
  else {
    t && e.removeAttribute(`style`)
  }Ma in e && (e[Ma] = a ? r.display : ``, e[Na] && (r.display = `none`))
} const La = /\s*!important$/; function Ra(e, t, n) {
  if (b(n)) {
    n.forEach(n => Ra(e, t, n))
  }
  else if (n ??= ``, t.startsWith(`--`)) {
    e.setProperty(t, n)
  }
  else { const r = Va(e, t); La.test(n) ? e.setProperty(P(r), n.replace(La, ``), `important`) : e[r] = n }
} const za = [`Webkit`, `Moz`, `ms`]; const Ba = {}; function Va(e, t) {
  const n = Ba[t]; if (n)
    return n; let r = N(t); if (r !== `filter` && r in e)
    return Ba[t] = r; r = ae(r); for (let n = 0; n < za.length; n++) {
    const i = za[n] + r; if (i in e)
      return Ba[t] = i
  } return t
} const Ha = `http://www.w3.org/1999/xlink`; function Ua(e, t, n, r, i, a = fe(t)) { r && t.startsWith(`xlink:`) ? n == null ? e.removeAttributeNS(Ha, t.slice(6, t.length)) : e.setAttributeNS(Ha, t, n) : n == null || a && !pe(n) ? e.removeAttribute(t) : e.setAttribute(t, a ? `` : E(n) ? String(n) : n) } function Wa(e, t, n, r, i) {
  if (t === `innerHTML` || t === `textContent`) { n != null && (e[t] = t === `innerHTML` ? wa(n) : n); return } const a = e.tagName; if (t === `value` && a !== `PROGRESS` && !a.includes(`-`)) { const r = a === `OPTION` ? e.getAttribute(`value`) || `` : e.value; const i = n == null ? e.type === `checkbox` ? `on` : `` : String(n); (r !== i || !(`_value` in e)) && (e.value = i), n ?? e.removeAttribute(t), e._value = n; return } let o = !1; if (n === `` || n == null) { const r = typeof e[t]; r === `boolean` ? n = pe(n) : n == null && r === `string` ? (n = ``, o = !0) : r === `number` && (n = 0, o = !0) } try { e[t] = n }
  catch {}o && e.removeAttribute(i || t)
} function Ga(e, t, n, r) { e.addEventListener(t, n, r) } function Ka(e, t, n, r) { e.removeEventListener(t, n, r) } const qa = Symbol(`_vei`); function Ja(e, t, n, r, i = null) {
  const a = e[qa] || (e[qa] = {}); const o = a[t]; if (r && o) {
    o.value = r
  }
  else { const [n, s] = Xa(t); r ? Ga(e, n, a[t] = eo(r, i), s) : o && (Ka(e, n, o, s), a[t] = void 0) }
} const Ya = /(?:Once|Passive|Capture)$/; function Xa(e) { let t; if (Ya.test(e)) { t = {}; let n; for (;n = e.match(Ya);)e = e.slice(0, e.length - n[0].length), t[n[0].toLowerCase()] = !0 } return [e[2] === `:` ? e.slice(3) : P(e.slice(2)), t] } let Za = 0; const Qa = Promise.resolve(); const $a = () => Za ||= (Qa.then(() => Za = 0), Date.now()); function eo(e, t) {
  const n = (e) => {
    if (!e._vts)
      e._vts = Date.now(); else if (e._vts <= n.attached)
      return; rn(to(e, n.value), t, 5, [e])
  }; return n.value = e, n.attached = $a(), n
} function to(e, t) {
  if (b(t)) { const n = e.stopImmediatePropagation; return e.stopImmediatePropagation = () => { n.call(e), e._stopped = !0 }, t.map(e => t => !t._stopped && e && e(t)) }
  else {
    return t
  }
} const no = e => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123; function ro(e, t, n, r, i, a) { const o = i === `svg`; t === `class` ? ja(e, r, o) : t === `style` ? Ia(e, n, r) : m(t) ? h(t) || Ja(e, t, n, r, a) : (t[0] === `.` ? (t = t.slice(1), !0) : t[0] === `^` ? (t = t.slice(1), !1) : io(e, t, r, o)) ? (Wa(e, t, r), !e.tagName.includes(`-`) && (t === `value` || t === `checked` || t === `selected`) && Ua(e, t, r, o, a, t !== `value`)) : e._isVueCE && (ao(e, t) || e._def.__asyncLoader && (/[A-Z]/.test(t) || !T(r))) ? Wa(e, N(t), r, a, t) : (t === `true-value` ? e._trueValue = r : t === `false-value` && (e._falseValue = r), Ua(e, t, r, o)) } function io(e, t, n, r) {
  if (r)
    return !!(t === `innerHTML` || t === `textContent` || t in e && no(t) && w(n)); if (t === `spellcheck` || t === `draggable` || t === `translate` || t === `autocorrect` || t === `sandbox` && e.tagName === `IFRAME` || t === `form` || t === `list` && e.tagName === `INPUT` || t === `type` && e.tagName === `TEXTAREA`)
    return !1; if (t === `width` || t === `height`) {
    const t = e.tagName; if (t === `IMG` || t === `VIDEO` || t === `CANVAS` || t === `SOURCE`)
      return !1
  } return no(t) && T(n) ? !1 : t in e
} function ao(e, t) {
  const n = e._def.props; if (!n)
    return !1; const r = N(t); return Array.isArray(n) ? n.some(e => N(e) === r) : Object.keys(n).some(e => N(e) === r)
} function oo(e) { const t = e.props[`onUpdate:modelValue`] || !1; return b(t) ? e => L(t, e) : t } const so = Symbol(`_assign`); const co = { deep: !0, created(e, { value: t, modifiers: { number: n } }, r) { const i = S(t); Ga(e, `change`, () => { const t = Array.prototype.filter.call(e.options, e => e.selected).map(e => n ? oe(uo(e)) : uo(e)); e[so](e.multiple ? i ? new Set(t) : t : t[0]), e._assigning = !0, mn(() => { e._assigning = !1 }) }), e[so] = oo(r) }, mounted(e, { value: t }) { lo(e, t) }, beforeUpdate(e, t, n) { e[so] = oo(n) }, updated(e, { value: t }) { e._assigning || lo(e, t) } }; function lo(e, t) {
  const n = e.multiple; const r = b(t); if (!n || r || S(t)) {
    for (let i = 0, a = e.options.length; i < a; i++) {
      const a = e.options[i]; const o = uo(a); if (n) {
        if (r) { const e = typeof o; e === `string` || e === `number` ? a.selected = t.some(e => String(e) === String(o)) : a.selected = ge(t, o) > -1 }
        else {
          a.selected = t.has(o)
        }
      }
      else if (he(uo(a), t)) { e.selectedIndex !== i && (e.selectedIndex = i); return }
    }!n && e.selectedIndex !== -1 && (e.selectedIndex = -1)
  }
} function uo(e) { return `_value` in e ? e._value : e.value } const fo = g({ patchProp: ro }, ka); let po; function mo() { return po ||= mi(fo) } function ho(...e) {
  const t = mo().createApp(...e); const { mount: n } = t; return t.mount = (e) => {
    const r = _o(e); if (!r)
      return; const i = t._component; !w(i) && !i.render && !i.template && (i.template = r.innerHTML), r.nodeType === 1 && (r.textContent = ``); const a = n(r, !1, go(r)); return r instanceof Element && (r.removeAttribute(`v-cloak`), r.setAttribute(`data-v-app`, ``)), a
  }, t
} function go(e) {
  if (e instanceof SVGElement)
    return `svg`; if (typeof MathMLElement == `function` && e instanceof MathMLElement)
    return `mathml`
} function _o(e) { return T(e) ? document.querySelector(e) : e } const vo = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3cfilter%20id='c'%20color-interpolation-filters='sRGB'%3e%3cfeGaussianBlur%20result='blur'%20stdDeviation='0.01%200.01'/%3e%3c/filter%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.5'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.3'/%3e%3cfeOffset%20dx='1'%20dy='1'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3clinearGradient%20id='a'%20x1='13197'%20x2='13341'%20y1='-9591.1'%20y2='-9591.1'%20gradientTransform='translate(-3485.7%202562.6)scale(.26458)'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%233c3c3c'/%3e%3cstop%20offset='1'/%3e%3c/linearGradient%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23e6e6e6'%20stroke-linejoin='round'%20stroke-width='1.1'%20d='M25%206.55c-.88%200-1.65.29-2.26.9a2.86%202.86%200%200%200-.95%202.16c0%201.23.58%202.13%201.76%202.74-2.97%203.29-8.7%205.82-8.81%2010.83%200%202.67%201.46%204.76%203.3%206.8l-1.1%205.83c1.69.54%203.08.94%204.82%201.13-3.88%204.58-10.79-1.74-15.21%202.93l2.33%203.58c5.6-3.96%2013.38%203.67%2016.12-3.96%202.75%207.63%2010.53%200%2016.12%203.96l2.33-3.58c-4.42-4.67-11.33%201.65-15.2-2.93a23.1%2023.1%200%200%200%204.82-1.13l-1.12-5.83c1.85-2.04%203.3-4.13%203.31-6.8-.1-5-5.84-7.54-8.8-10.83%201.17-.61%201.75-1.51%201.75-2.74%200-.84-.3-1.55-.95-2.16a3.1%203.1%200%200%200-2.26-.9z'%20filter='url(%23b)'/%3e%3cellipse%20cx='2720.3'%20cy='-271.4'%20fill='%23e6e6e6'%20class='st15'%20filter='url(%23c)'%20rx='16.3'%20ry='2.5'%20transform='matrix(.33232%200%200%20.24998%20-879.01%20102.47)'/%3e%3cellipse%20cx='25'%20cy='9.61'%20fill='%23e6e6e6'%20class='st15'%20rx='1.14'%20ry='1.15'/%3e%3cpath%20fill='none'%20stroke='%23e6e6e6'%20stroke-width='1.4'%20d='M21.33%2023.27h7.34M25%2019.93v6.75'/%3e%3c/svg%3e`; const yo = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3cfilter%20id='c'%20color-interpolation-filters='sRGB'%3e%3cfeGaussianBlur%20result='blur'%20stdDeviation='0.01%200.01'/%3e%3c/filter%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.5'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.6'/%3e%3cfeOffset%20dx='1.6'%20dy='1.4'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3clinearGradient%20id='a'%20x1='2986.4'%20x2='3128.4'%20y1='1623.8'%20y2='1623.8'%20gradientTransform='matrix(.27141%200%200%20.27218%20-804.81%20-417.45)'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%233c3c3c'/%3e%3cstop%20offset='1'/%3e%3c/linearGradient%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23e6e6e6'%20stroke-width='1.1'%20d='M23.28%205.55v3.24h-3.36v2.92h3.36v1.76c-3.36%202.12-3%205.74-3%205.74-11-8.52-20.67%207.56-7.94%2013.05v8.73c0%20.95%205.67%202.46%2012.66%202.46s12.66-1.5%2012.66-2.46v-8.73c12.72-5.49%203.06-21.57-7.95-13.05%200%200%20.38-3.62-3-5.74V11.7h3.37V8.79h-3.36V5.55H25z'%20filter='url(%23b)'/%3e%3cellipse%20cx='71.08'%20cy='131.54'%20fill='%23e6e6e6'%20class='st15'%20filter='url(%23c)'%20rx='32.13'%20ry='2.84'%20transform='matrix(.28533%200%200%20.3223%204.72%20-1.98)'/%3e%3cpath%20fill='none'%20stroke='%23e6e6e6'%20stroke-width='1.4'%20d='M27.03%2030.27c1.5-12.1%2011.94-12.44%2013.37-7.38%201.42%205.06-4.74%207.38-4.74%207.38s-4.87-.64-10.66-.64-10.66.64-10.66.64-6.16-2.32-4.73-7.38%2011.87-4.73%2013.36%207.38'/%3e%3c/svg%3e`; const bo = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3clinearGradient%20id='a'%20x1='-455.39'%20x2='-419.41'%20y1='-338.23'%20y2='-338.23'%20gradientTransform='matrix(1.0008%200%200%201.0001%20462.75%20363.26)'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%233c3c3c'/%3e%3cstop%20offset='1'/%3e%3c/linearGradient%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.5'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.6'/%3e%3cfeOffset%20dx='1.6'%20dy='1.4'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23e6e6e6'%20stroke-width='1.1'%20d='M18.47%2030.29c2.1-1.2%203.33-1.19%205.47-2.2.22%207.42-9.9%207.45-8.1%2015.36h26.43s3.1-32.27-16.79-33.63c0%200-1.92-3.6-3.93-3.25%200%200-1.06.84-.46%203.21l-2.3.75s-3.22-2.08-4.13-1.27c-.86.37%201.1%203.28%201.88%203.98-.8%201.15-8.55%2012.11-8.97%2015.69-.26%202.27%202.03%203.51%203.72%204.12a11.91%2011.91%200%200%200%201.74.47c1.42-.26%203.34-2.04%205.45-3.24z'%20filter='url(%23b)'/%3e%3cpath%20fill='none'%20stroke='%23e6e6e6'%20stroke-linecap='round'%20stroke-width='1.1'%20d='M23.94%2028.09s4.43-1.87%204.22-5.84'/%3e%3cpath%20stroke='%23e6e6e6'%20stroke-linecap='round'%20stroke-width='1.4'%20d='M19.1%2018.47s.6-1.84%203.46-2.3'/%3e%3cellipse%20cx='21.03'%20cy='18'%20fill='%23e6e6e6'%20paint-order='markers%20fill%20stroke'%20rx='1.24'%20ry='1.17'/%3e%3cpath%20fill='%23fff'%20stroke='%23e6e6e6'%20stroke-linecap='round'%20stroke-width='1.4'%20d='M9.17%2029.24s.25-.68.92-1.12'/%3e%3cpath%20fill='%23fff'%20stroke='%23e6e6e6'%20stroke-linecap='round'%20stroke-width='1.2'%20d='M11.64%2032.28c.69-.88%201.58-1.32%202.38-1.95'/%3e%3cpath%20fill='none'%20stroke='%23e6e6e6'%20stroke-linejoin='round'%20stroke-width='1.4'%20d='M30.8%2014.87c4.31%202.64%208.47%209.25%208.12%2026.08'/%3e%3c/svg%3e`; const xo = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3clinearGradient%20id='a'%20x1='4127.2'%20x2='4235.7'%20y1='-2558.3'%20y2='-2558.3'%20gradientTransform='matrix(.26749%200%200%20.26799%20-1093.5%20713.11)'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%233c3c3c'/%3e%3cstop%20offset='1'/%3e%3c/linearGradient%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.498'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.3'/%3e%3cfeOffset%20dx='1'%20dy='1'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23e6e6e6'%20stroke-linecap='square'%20stroke-linejoin='round'%20stroke-width='1.1'%20d='M25.019%2043.45H11.58c-2.466-5.724%204.072-11.03%208.668-12.832-5.493-3.074-2.515-10.911%202.192-11.547-1.12-.742-1.681-2.327-1.681-3.6%200-1.06.448-2.013%201.233-2.755s1.793-1.166%203.026-1.166c1.121%200%202.13.424%203.026%201.166.785.742%201.233%201.696%201.233%202.756%200%201.272-.56%202.857-1.681%203.599%205.156%202.014%207.012%209.427%202.193%2011.547%206.276%202.226%2010.685%207.85%208.667%2012.832z'%20class='st31'%20filter='url(%23b)'/%3e%3c/svg%3e`; const So = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3cfilter%20id='c'%20color-interpolation-filters='sRGB'%3e%3cfeGaussianBlur%20result='blur'%20stdDeviation='0.01%200.01'/%3e%3c/filter%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.498'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.3'/%3e%3cfeOffset%20dx='1'%20dy='1'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3clinearGradient%20id='a'%20x1='-71.637'%20x2='-30.678'%20y1='-83.325'%20y2='-83.325'%20gradientTransform='matrix(.97644%200%200%20.99286%2074.952%20107.73)'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%233c3c3c'/%3e%3cstop%20offset='1'/%3e%3c/linearGradient%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23e6e6e6'%20stroke-linecap='round'%20stroke-linejoin='round'%20stroke-width='1.1'%20d='M24.994%206.549c-1.568.006-2.835%201.181-2.836%202.63.002%201.193.873%202.235%202.122%202.539-.688%204.45-1.967%209.726-2.634%2014.112l-4.07-12.927c.968-.444%201.58-1.356%201.58-2.353%200-1.453-1.275-2.63-2.847-2.63s-2.847%201.177-2.847%202.63c.002%201.205.89%202.255%202.157%202.547l-.44%2013.258-5.482-10.611c.951-.45%201.55-1.354%201.55-2.34%200-1.453-1.275-2.63-2.847-2.63-1.573%200-2.847%201.177-2.847%202.63%200%201.334%201.084%202.456%202.519%202.61l2.76%2016.507%204.05%205.258-1.004%203.634c-.042.656%204.848%202.028%2011.122%202.04%206.273-.012%2011.164-1.384%2011.122-2.04l-1.005-3.634%204.05-5.258%202.76-16.507c1.435-.154%202.519-1.276%202.52-2.61%200-1.453-1.275-2.63-2.847-2.63-1.573%200-2.847%201.177-2.847%202.63%200%20.986.598%201.89%201.55%202.34l-5.484%2010.61-.439-13.257c1.266-.292%202.155-1.342%202.157-2.547%200-1.453-1.275-2.63-2.847-2.63s-2.847%201.177-2.847%202.63c0%20.997.612%201.909%201.58%202.353l-4.07%2012.927c-.667-4.386-1.946-9.662-2.634-14.112%201.249-.304%202.12-1.346%202.122-2.54%200-1.448-1.268-2.623-2.836-2.629v0z'%20filter='url(%23b)'/%3e%3cellipse%20cx='4708.7'%20cy='-2517.6'%20fill='%23e6e6e6'%20class='st15'%20filter='url(%23c)'%20rx='32.126'%20ry='2.844'%20transform='matrix(.25939%200%200%20.29298%20-1196.4%20778.12)'/%3e%3cpath%20fill='none'%20stroke='%23e6e6e6'%20stroke-linejoin='round'%20stroke-width='2'%20d='M15.172%2034.076s2.7-1.249%209.802-1.256c7.103-.01%209.801%201.256%209.801%201.256'%20paint-order='stroke%20fill%20markers'/%3e%3c/svg%3e`; const Co = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3clinearGradient%20id='a'%20x1='4501.5'%20x2='4594.6'%20y1='-572.4'%20y2='-572.4'%20gradientTransform='matrix(.34208%200%200%20.2837%20-1530.8%20187.39)'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%233c3c3c'/%3e%3cstop%20offset='1'/%3e%3c/linearGradient%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.5'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.3'/%3e%3cfeOffset%20dx='1'%20dy='1'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23e6e6e6'%20stroke-width='1.14'%20d='M21.93%206.55v2.93h-4.09V6.89h-5.8v7.98L16.58%2018v12.57l-3.85%202.48v5.21H9.66v5.18h30.68v-5.18h-3.07v-5.2l-3.85-2.5V18.05l4.53-3.2V6.88h-5.8v2.59h-4.42V6.55h-2.9z'%20class='st14'%20filter='url(%23b)'%20transform='matrix(1.0055%200%200%20.9198%20-.2%203.5)'/%3e%3cpath%20fill='none'%20stroke='%23e6e6e6'%20stroke-width='1.4'%20d='M18.8%2031.4h12M18.8%2020h12'/%3e%3c/svg%3e`; const wo = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3cfilter%20id='c'%20color-interpolation-filters='sRGB'%3e%3cfeGaussianBlur%20result='blur'%20stdDeviation='0.01%200.01'/%3e%3c/filter%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.5'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.3'/%3e%3cfeOffset%20dx='1'%20dy='1'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3clinearGradient%20id='a'%20x1='13197'%20x2='13341'%20y1='-9591'%20y2='-9591'%20gradientTransform='translate(-3485.7%202562.6)scale(.26458)'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%23fff'/%3e%3cstop%20offset='1'%20stop-color='%23e6e6e6'/%3e%3c/linearGradient%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23000'%20stroke-linejoin='round'%20stroke-width='1.1'%20d='M25%206.55c-.88%200-1.65.29-2.26.9a2.86%202.86%200%200%200-.95%202.16c0%201.23.58%202.13%201.76%202.74-2.97%203.29-8.7%205.82-8.81%2010.83%200%202.67%201.46%204.76%203.3%206.8l-1.1%205.83c1.69.54%203.08.94%204.82%201.13-3.88%204.58-10.79-1.74-15.21%202.93l2.33%203.58c5.6-3.96%2013.38%203.67%2016.12-3.96%202.75%207.63%2010.53%200%2016.12%203.96l2.33-3.58c-4.42-4.67-11.33%201.65-15.2-2.93a23.1%2023.1%200%200%200%204.82-1.13l-1.12-5.83c1.85-2.04%203.3-4.13%203.31-6.8-.1-5-5.84-7.54-8.8-10.83%201.17-.61%201.75-1.51%201.75-2.74%200-.84-.3-1.55-.95-2.16-.6-.61-1.38-.9-2.26-.9z'%20filter='url(%23b)'/%3e%3cellipse%20cx='2720.3'%20cy='-271.4'%20class='st15'%20filter='url(%23c)'%20rx='16.3'%20ry='2.5'%20transform='matrix(.33232%200%200%20.24998%20-879.01%20102.47)'/%3e%3cellipse%20cx='25'%20cy='9.61'%20class='st15'%20rx='1.14'%20ry='1.15'/%3e%3cpath%20fill='none'%20stroke='%23000'%20stroke-width='1.4'%20d='M21.33%2023.27h7.34M25%2019.93v6.75'/%3e%3c/svg%3e`; const To = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3cfilter%20id='c'%20color-interpolation-filters='sRGB'%3e%3cfeGaussianBlur%20result='blur'%20stdDeviation='0.01%200.01'/%3e%3c/filter%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.5'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.6'/%3e%3cfeOffset%20dx='1.6'%20dy='1.4'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3clinearGradient%20id='a'%20x1='2986.4'%20x2='3128.4'%20y1='1623.8'%20y2='1623.8'%20gradientTransform='matrix(.27141%200%200%20.27218%20-804.81%20-417.45)'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%23fff'/%3e%3cstop%20offset='1'%20stop-color='%23e6e6e6'/%3e%3c/linearGradient%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23000'%20stroke-width='1.1'%20d='M23.28%205.55v3.24h-3.36v2.92h3.36v1.76c-3.36%202.12-3%205.74-3%205.74-11-8.52-20.67%207.56-7.94%2013.05v8.73c0%20.95%205.67%202.46%2012.66%202.46s12.66-1.5%2012.66-2.46v-8.73c12.72-5.49%203.06-21.57-7.95-13.05%200%200%20.38-3.62-3-5.74V11.7h3.37V8.79h-3.36V5.55H25z'%20filter='url(%23b)'/%3e%3cellipse%20cx='71.08'%20cy='131.54'%20class='st15'%20filter='url(%23c)'%20rx='32.13'%20ry='2.84'%20transform='matrix(.28533%200%200%20.3223%204.72%20-1.98)'/%3e%3cpath%20fill='none'%20stroke='%23000'%20stroke-width='1.4'%20d='M27.03%2030.27c1.5-12.1%2011.94-12.44%2013.37-7.38%201.42%205.06-4.74%207.38-4.74%207.38s-4.87-.64-10.66-.64-10.66.64-10.66.64-6.16-2.32-4.73-7.38%2011.87-4.73%2013.36%207.38'/%3e%3c/svg%3e`; const Eo = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3clinearGradient%20id='a'%20x1='-455.39'%20x2='-419.41'%20y1='-338.23'%20y2='-338.23'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%23fcfcf8'/%3e%3cstop%20offset='1'%20stop-color='%23e7e7e3'/%3e%3c/linearGradient%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.5'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.6'/%3e%3cfeOffset%20dx='1.6'%20dy='1.4'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23000'%20stroke-width='1.1'%20d='M-443.92-332.95c2.1-1.2%203.32-1.18%205.46-2.2.23%207.43-9.9%207.46-8.08%2015.36h26.4s3.1-32.27-16.78-33.62c0%200-1.91-3.6-3.93-3.25%200%200-1.06.84-.45%203.2l-2.3.75s-3.22-2.07-4.13-1.27c-.86.37%201.1%203.28%201.88%203.99-.8%201.14-8.55%2012.1-8.96%2015.68-.27%202.28%202.02%203.52%203.71%204.12.97.34%201.74.47%201.74.47%201.42-.25%203.34-2.03%205.44-3.23z'%20filter='url(%23b)'%20transform='matrix(1.0008%200%200%201.0001%20462.75%20363.26)'/%3e%3cpath%20fill='none'%20stroke='%23000'%20stroke-linecap='round'%20stroke-width='1.1'%20d='M23.94%2028.09s4.43-1.87%204.22-5.84'/%3e%3cpath%20stroke='%23000'%20stroke-linecap='round'%20stroke-width='1.4'%20d='M19.1%2018.47s.6-1.84%203.46-2.3'/%3e%3cellipse%20cx='21.03'%20cy='18'%20paint-order='markers%20fill%20stroke'%20rx='1.24'%20ry='1.17'/%3e%3cpath%20fill='%23fff'%20stroke='%23000'%20stroke-linecap='round'%20stroke-width='1.4'%20d='M9.17%2029.24s.25-.68.92-1.12'/%3e%3cpath%20fill='%23fff'%20stroke='%23000'%20stroke-linecap='round'%20stroke-width='1.2'%20d='M11.64%2032.28c.69-.88%201.58-1.32%202.38-1.95'/%3e%3cpath%20fill='none'%20stroke='%23000'%20stroke-linejoin='round'%20stroke-width='1.4'%20d='M30.8%2014.87c4.31%202.64%208.47%209.25%208.12%2026.08'/%3e%3c/svg%3e`; const Do = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3clinearGradient%20id='a'%20x1='4127.3'%20x2='4235.7'%20y1='-2558.4'%20y2='-2558.4'%20gradientTransform='matrix(.27677%200%200%20.27555%20-1132.3%20731.96)'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%23fff'/%3e%3cstop%20offset='1'%20stop-color='%23e6e6e6'/%3e%3c/linearGradient%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.5'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.3'/%3e%3cfeOffset%20dx='1'%20dy='1'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23000'%20stroke-linecap='square'%20stroke-linejoin='round'%20stroke-width='1.14'%20d='M25.02%2043.4h-13.9c-2.55-5.88%204.21-11.34%208.97-13.2-5.69-3.15-2.6-11.21%202.27-11.87-1.16-.76-1.74-2.39-1.74-3.7%200-1.09.46-2.07%201.27-2.83a4.43%204.43%200%200%201%203.13-1.2c1.16%200%202.2.44%203.14%201.2a3.84%203.84%200%200%201%201.27%202.83c0%201.31-.58%202.94-1.74%203.7%205.34%202.07%207.26%209.7%202.27%2011.88%206.5%202.29%2011.06%208.07%208.97%2013.2z'%20class='st31'%20filter='url(%23b)'%20transform='matrix(.96658%200%200%20.97245%20.83%201.24)'/%3e%3c/svg%3e`; const Oo = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3cfilter%20id='c'%20color-interpolation-filters='sRGB'%3e%3cfeGaussianBlur%20result='blur'%20stdDeviation='0.01%200.01'/%3e%3c/filter%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.5'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.3'/%3e%3cfeOffset%20dx='1'%20dy='1'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3clinearGradient%20id='a'%20x1='-71.64'%20x2='-30.68'%20y1='-83.32'%20y2='-83.32'%20gradientTransform='matrix(.97643%200%200%20.99287%2074.95%20107.73)'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%23fff'/%3e%3cstop%20offset='1'%20stop-color='%23e6e6e6'/%3e%3c/linearGradient%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23000'%20stroke-linecap='round'%20stroke-linejoin='round'%20stroke-width='1.1'%20d='M25%206.55c-1.57%200-2.84%201.18-2.84%202.63%200%201.2.87%202.23%202.12%202.54-.69%204.45-1.97%209.72-2.63%2014.11L17.58%2012.9a2.62%202.62%200%200%200%201.58-2.35c0-1.45-1.28-2.63-2.85-2.63s-2.85%201.18-2.85%202.63c0%201.2.9%202.25%202.16%202.55l-.44%2013.25-5.48-10.6a2.62%202.62%200%200%200%201.55-2.35c0-1.45-1.28-2.63-2.85-2.63s-2.85%201.18-2.85%202.63c0%201.34%201.09%202.46%202.52%202.61l2.76%2016.51%204.05%205.26-1%203.63c-.04.66%204.85%202.03%2011.12%202.04%206.27-.01%2011.16-1.38%2011.12-2.04l-1-3.63%204.05-5.26%202.76-16.5a2.74%202.74%200%200%200%202.52-2.62c0-1.45-1.28-2.63-2.85-2.63s-2.85%201.18-2.85%202.63c0%20.99.6%201.9%201.55%202.34l-5.48%2010.61-.44-13.25a2.68%202.68%200%200%200%202.16-2.55c0-1.45-1.28-2.63-2.85-2.63s-2.85%201.18-2.85%202.63c0%201%20.61%201.9%201.58%202.35l-4.07%2012.93c-.67-4.39-1.94-9.66-2.63-14.11a2.68%202.68%200%200%200%202.12-2.54c0-1.45-1.27-2.63-2.84-2.63'%20filter='url(%23b)'/%3e%3cellipse%20cx='4708.7'%20cy='-2517.6'%20class='st15'%20filter='url(%23c)'%20rx='32.13'%20ry='2.84'%20transform='matrix(.25939%200%200%20.29298%20-1196.4%20778.12)'/%3e%3cpath%20fill='none'%20stroke='%23000'%20stroke-linejoin='round'%20stroke-width='2'%20d='M15.17%2034.08s2.7-1.25%209.8-1.26%209.8%201.26%209.8%201.26'%20paint-order='stroke%20fill%20markers'/%3e%3c/svg%3e`; const ko = `data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20fill-rule='evenodd'%20clip-rule='evenodd'%20image-rendering='optimizeQuality'%20shape-rendering='geometricPrecision'%20text-rendering='geometricPrecision'%20viewBox='0%200%2050%2050'%3e%3cdefs%3e%3clinearGradient%20id='a'%20x1='4501.5'%20x2='4594.6'%20y1='-572.4'%20y2='-572.4'%20gradientTransform='matrix(.34208%200%200%20.2837%20-1530.8%20187.39)'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20offset='0'%20stop-color='%23fff'/%3e%3cstop%20offset='1'%20stop-color='%23e6e6e6'/%3e%3c/linearGradient%3e%3cfilter%20id='b'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-color='%23000'%20flood-opacity='.5'%20result='flood'/%3e%3cfeComposite%20in='flood'%20in2='SourceGraphic'%20operator='in'%20result='composite1'/%3e%3cfeGaussianBlur%20in='composite1'%20result='blur'%20stdDeviation='.3'/%3e%3cfeOffset%20dx='1'%20dy='1'%20result='offset'/%3e%3cfeComposite%20in='SourceGraphic'%20in2='offset'%20result='composite2'/%3e%3c/filter%3e%3c/defs%3e%3cpath%20fill='url(%23a)'%20stroke='%23010101'%20stroke-width='1.14'%20d='M21.93%206.55v2.93h-4.09V6.89h-5.8v7.98L16.58%2018v12.57l-3.85%202.48v5.21H9.66v5.18h30.68v-5.18h-3.07v-5.2l-3.85-2.5V18.05l4.53-3.2V6.88h-5.8v2.59h-4.42V6.55h-2.9z'%20class='st14'%20filter='url(%23b)'%20transform='matrix(1.0055%200%200%20.9198%20-.14%203.5)'/%3e%3cpath%20fill='none'%20stroke='%23000'%20stroke-width='1.4'%20d='M18.83%2031.44h12M18.83%2020h12'/%3e%3c/svg%3e`; const Ao = `${new URL(`blue-marble-Dkc3-rt9.jpg`, import.meta.url).href}`; let jo; function Mo(e) { return { lang: e?.lang ?? jo?.lang, message: e?.message, abortEarly: e?.abortEarly ?? jo?.abortEarly, abortPipeEarly: e?.abortPipeEarly ?? jo?.abortPipeEarly } } let No; function Po(e) { return No?.get(e) } let Fo; function Io(e) { return Fo?.get(e) } let Lo; function Ro(e, t) { return Lo?.get(e)?.get(t) } function zo(e) { const t = typeof e; return t === `string` ? `"${e}"` : t === `number` || t === `bigint` || t === `boolean` ? `${e}` : t === `object` || t === `function` ? (e && Object.getPrototypeOf(e)?.constructor?.name) ?? `null` : t } function Bo(e, t, n, r, i) { const a = i && `input` in i ? i.input : n.value; const o = i?.expected ?? e.expects ?? null; const s = i?.received ?? zo(a); const c = { kind: e.kind, type: e.type, input: a, expected: o, received: s, message: `Invalid ${t}: ${o ? `Expected ${o} but r` : `R`}eceived ${s}`, requirement: e.requirement, path: i?.path, issues: i?.issues, lang: r.lang, abortEarly: r.abortEarly, abortPipeEarly: r.abortPipeEarly }; const l = e.kind === `schema`; const u = i?.message ?? e.message ?? Ro(e.reference, c.lang) ?? (l ? Io(c.lang) : null) ?? r.message ?? Po(c.lang); u !== void 0 && (c.message = typeof u == `function` ? u(c) : u), l && (n.typed = !1), n.issues ? n.issues.push(c) : n.issues = [c] } function Vo(e) { return { version: 1, vendor: `valibot`, validate(t) { return e[`~run`]({ value: t }, Mo()) } } } const Ho = class extends Error {constructor(e) { super(e[0].message), this.name = `ValiError`, this.issues = e }}; function Uo(e, t) { return { 'kind': `validation`, 'type': `regex`, 'reference': Uo, 'async': !1, 'expects': `${e}`, 'requirement': e, 'message': t, '~run': function (e, t) { return e.typed && !this.requirement.test(e.value) && Bo(this, `format`, e, t), e } } } function Wo(e, t, n) { return typeof e.fallback == `function` ? e.fallback(t, n) : e.fallback } function Go(e, t, n) { return typeof e.default == `function` ? e.default(t, n) : e.default } function Ko(e) { return { 'kind': `schema`, 'type': `number`, 'reference': Ko, 'expects': `number`, 'async': !1, 'message': e, get '~standard'() { return Vo(this) }, '~run': function (e, t) { return typeof e.value == `number` && !isNaN(e.value) ? e.typed = !0 : Bo(this, `type`, e, t), e } } } function qo(e, t) {
  return { 'kind': `schema`, 'type': `object`, 'reference': qo, 'expects': `Object`, 'async': !1, 'entries': e, 'message': t, get '~standard'() { return Vo(this) }, '~run': function (e, t) {
    const n = e.value; if (n && typeof n == `object`) {
      e.typed = !0, e.value = {}; for (const r in this.entries) {
        const i = this.entries[r]; if (r in n || (i.type === `exact_optional` || i.type === `optional` || i.type === `nullish`) && i.default !== void 0) { const a = r in n ? n[r] : Go(i); const o = i[`~run`]({ value: a }, t); if (o.issues) { const i = { type: `object`, origin: `value`, input: n, key: r, value: a }; for (const t of o.issues)t.path ? t.path.unshift(i) : t.path = [i], e.issues?.push(t); if (e.issues ||= o.issues, t.abortEarly) { e.typed = !1; break } }o.typed || (e.typed = !1), e.value[r] = o.value }
        else if (i.fallback !== void 0) {
          e.value[r] = Wo(i)
        }
        else if (i.type !== `exact_optional` && i.type !== `optional` && i.type !== `nullish` && (Bo(this, `key`, e, t, { input: void 0, expected: `"${r}"`, path: [{ type: `object`, origin: `key`, input: n, key: r, value: n[r] }] }), t.abortEarly)) {
          break
        }
      }
    }
    else {
      Bo(this, `type`, e, t)
    } return e
  } }
} function Jo(e, t) { return { 'kind': `schema`, 'type': `optional`, 'reference': Jo, 'expects': `(${e.expects} | undefined)`, 'async': !1, 'wrapped': e, 'default': t, get '~standard'() { return Vo(this) }, '~run': function (e, t) { return e.value === void 0 && (this.default !== void 0 && (e.value = Go(this, e, t)), e.value === void 0) ? (e.typed = !0, e) : this.wrapped[`~run`](e, t) } } } function Yo(e) { return { 'kind': `schema`, 'type': `string`, 'reference': Yo, 'expects': `string`, 'async': !1, 'message': e, get '~standard'() { return Vo(this) }, '~run': function (e, t) { return typeof e.value == `string` ? e.typed = !0 : Bo(this, `type`, e, t), e } } } function Xo(e, t, n) {
  const r = e[`~run`]({ value: t }, Mo(n)); if (r.issues)
    throw new Ho(r.issues); return r.value
} function Zo(...e) {
  return { ...e[0], 'pipe': e, get '~standard'() { return Vo(this) }, '~run': function (t, n) {
    for (const r of e) {
      if (r.kind !== `metadata`) { if (t.issues && (r.kind === `schema` || r.kind === `transformation`)) { t.typed = !1; break }(!t.issues || !n.abortEarly && !n.abortPipeEarly) && (t = r[`~run`](t, n)) }
    } return t
  } }
} function Qo(e, t, n) { const r = e[`~run`]({ value: t }, Mo(n)); return { typed: r.typed, success: !r.issues, output: r.value, issues: r.issues } } const $o = o((e, t) => { const n = `\\\\/`; const r = `[^${n}]`; const i = 0; const a = `\\.`; const o = `\\+`; const s = `\\?`; const c = `\\/`; const l = `(?=.)`; const u = `[^/]`; const d = `(?:${c}|$)`; const f = `(?:^|${c})`; const p = `${a}{1,2}${d}`; const m = { DOT_LITERAL: a, PLUS_LITERAL: o, QMARK_LITERAL: s, SLASH_LITERAL: c, ONE_CHAR: l, QMARK: u, END_ANCHOR: d, DOTS_SLASH: p, NO_DOT: `(?!${a})`, NO_DOTS: `(?!${f}${p})`, NO_DOT_SLASH: `(?!${a}{0,1}${d})`, NO_DOTS_SLASH: `(?!${p})`, QMARK_NO_DOT: `[^.${c}]`, STAR: `${u}*?`, START_ANCHOR: f, SEP: `/` }; const h = { ...m, SLASH_LITERAL: `[${n}]`, QMARK: r, STAR: `${r}*?`, DOTS_SLASH: `${a}{1,2}(?:[${n}]|$)`, NO_DOT: `(?!${a})`, NO_DOTS: `(?!(?:^|[${n}])${a}{1,2}(?:[${n}]|$))`, NO_DOT_SLASH: `(?!${a}{0,1}(?:[${n}]|$))`, NO_DOTS_SLASH: `(?!${a}{1,2}(?:[${n}]|$))`, QMARK_NO_DOT: `[^.${n}]`, START_ANCHOR: `(?:^|[${n}])`, END_ANCHOR: `(?:[${n}]|$)`, SEP: `\\` }; t.exports = { DEFAULT_MAX_EXTGLOB_RECURSION: i, MAX_LENGTH: 1024 * 64, POSIX_REGEX_SOURCE: { __proto__: null, alnum: `a-zA-Z0-9`, alpha: `a-zA-Z`, ascii: `\\x00-\\x7F`, blank: ` \\t`, cntrl: `\\x00-\\x1F\\x7F`, digit: `0-9`, graph: `\\x21-\\x7E`, lower: `a-z`, print: `\\x20-\\x7E `, punct: `\\-!"#$%&'()\\*+,./:;<=>?@[\\]^_\`{|}~`, space: ` \\t\\r\\n\\v\\f`, upper: `A-Z`, word: `A-Za-z0-9_`, xdigit: `A-Fa-f0-9` }, REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g, REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/, REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/, REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g, REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g, REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g, REPLACEMENTS: { '__proto__': null, '***': `*`, '**/**': `**`, '**/**/**': `**` }, CHAR_0: 48, CHAR_9: 57, CHAR_UPPERCASE_A: 65, CHAR_LOWERCASE_A: 97, CHAR_UPPERCASE_Z: 90, CHAR_LOWERCASE_Z: 122, CHAR_LEFT_PARENTHESES: 40, CHAR_RIGHT_PARENTHESES: 41, CHAR_ASTERISK: 42, CHAR_AMPERSAND: 38, CHAR_AT: 64, CHAR_BACKWARD_SLASH: 92, CHAR_CARRIAGE_RETURN: 13, CHAR_CIRCUMFLEX_ACCENT: 94, CHAR_COLON: 58, CHAR_COMMA: 44, CHAR_DOT: 46, CHAR_DOUBLE_QUOTE: 34, CHAR_EQUAL: 61, CHAR_EXCLAMATION_MARK: 33, CHAR_FORM_FEED: 12, CHAR_FORWARD_SLASH: 47, CHAR_GRAVE_ACCENT: 96, CHAR_HASH: 35, CHAR_HYPHEN_MINUS: 45, CHAR_LEFT_ANGLE_BRACKET: 60, CHAR_LEFT_CURLY_BRACE: 123, CHAR_LEFT_SQUARE_BRACKET: 91, CHAR_LINE_FEED: 10, CHAR_NO_BREAK_SPACE: 160, CHAR_PERCENT: 37, CHAR_PLUS: 43, CHAR_QUESTION_MARK: 63, CHAR_RIGHT_ANGLE_BRACKET: 62, CHAR_RIGHT_CURLY_BRACE: 125, CHAR_RIGHT_SQUARE_BRACKET: 93, CHAR_SEMICOLON: 59, CHAR_SINGLE_QUOTE: 39, CHAR_SPACE: 32, CHAR_TAB: 9, CHAR_UNDERSCORE: 95, CHAR_VERTICAL_LINE: 124, CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279, extglobChars(e) { return { '!': { type: `negate`, open: `(?:(?!(?:`, close: `))${e.STAR})` }, '?': { type: `qmark`, open: `(?:`, close: `)?` }, '+': { type: `plus`, open: `(?:`, close: `)+` }, '*': { type: `star`, open: `(?:`, close: `)*` }, '@': { type: `at`, open: `(?:`, close: `)` } } }, globChars(e) { return e === !0 ? h : m } } }); const es = o((e) => { const { REGEX_BACKSLASH: t, REGEX_REMOVE_BACKSLASH: n, REGEX_SPECIAL_CHARS: r, REGEX_SPECIAL_CHARS_GLOBAL: i } = $o(); e.isObject = e => typeof e == `object` && !!e && !Array.isArray(e), e.hasRegexChars = e => r.test(e), e.isRegexChar = t => t.length === 1 && e.hasRegexChars(t), e.escapeRegex = e => e.replace(i, `\\$1`), e.toPosixSlashes = e => e.replace(t, `/`), e.isWindows = () => { if (typeof navigator < `u` && navigator.platform) { const e = navigator.platform.toLowerCase(); return e === `win32` || e === `windows` } return typeof process < `u` && process.platform ? process.platform === `win32` : !1 }, e.removeBackslashes = e => e.replace(n, e => e === `\\` ? `` : e), e.escapeLast = (t, n, r) => { const i = t.lastIndexOf(n, r); return i === -1 ? t : t[i - 1] === `\\` ? e.escapeLast(t, n, i - 1) : `${t.slice(0, i)}\\${t.slice(i)}` }, e.removePrefix = (e, t = {}) => { let n = e; return n.startsWith(`./`) && (n = n.slice(2), t.prefix = `./`), n }, e.wrapOutput = (e, t = {}, n = {}) => { let r = `${n.contains ? `` : `^`}(?:${e})${n.contains ? `` : `$`}`; return t.negated === !0 && (r = `(?:^(?!${r}).*$)`), r }, e.basename = (e, { windows: t } = {}) => { const n = e.split(t ? /[\\/]/ : `/`); const r = n[n.length - 1]; return r === `` ? n[n.length - 2] : r } }); const ts = o((e, t) => {
  const n = es(); const { CHAR_ASTERISK: r, CHAR_AT: i, CHAR_BACKWARD_SLASH: a, CHAR_COMMA: o, CHAR_DOT: s, CHAR_EXCLAMATION_MARK: c, CHAR_FORWARD_SLASH: l, CHAR_LEFT_CURLY_BRACE: u, CHAR_LEFT_PARENTHESES: d, CHAR_LEFT_SQUARE_BRACKET: f, CHAR_PLUS: p, CHAR_QUESTION_MARK: m, CHAR_RIGHT_CURLY_BRACE: h, CHAR_RIGHT_PARENTHESES: g, CHAR_RIGHT_SQUARE_BRACKET: _ } = $o(); const v = e => e === l || e === a; const y = (e) => { e.isPrefix !== !0 && (e.depth = e.isGlobstar ? 1 / 0 : 1) }; t.exports = (e, t) => {
    const b = t || {}; const x = e.length - 1; const S = b.parts === !0 || b.scanToEnd === !0; const C = []; const w = []; const T = []; let E = e; let D = -1; let O = 0; let ee = 0; let te = !1; let ne = !1; let k = !1; let A = !1; let re = !1; let j = !1; let M = !1; let N = !1; let ie = !1; let P = !1; let ae = 0; let F; let I; let L = { value: ``, depth: 0, isGlob: !1 }; const R = () => D >= x; const oe = () => E.charCodeAt(D + 1); const z = () => (F = I, E.charCodeAt(++D)); for (;D < x;) {
      I = z(); let e; if (I === a) { M = L.backslashes = !0, I = z(), I === u && (j = !0); continue } if (j === !0 || I === u) {
        for (ae++; R() !== !0 && (I = z());) {
          if (I === a) { M = L.backslashes = !0, z(); continue } if (I === u) { ae++; continue } if (j !== !0 && I === s && (I = z()) === s) {
            if (te = L.isBrace = !0, k = L.isGlob = !0, P = !0, S === !0)
              continue; break
          } if (j !== !0 && I === o) {
            if (te = L.isBrace = !0, k = L.isGlob = !0, P = !0, S === !0)
              continue; break
          } if (I === h && (ae--, ae === 0)) { j = !1, te = L.isBrace = !0, P = !0; break }
        } if (S === !0)
          continue; break
      } if (I === l) {
        if (C.push(D), w.push(L), L = { value: ``, depth: 0, isGlob: !1 }, P === !0)
          continue; if (F === s && D === O + 1) { O += 2; continue }ee = D + 1; continue
      } if (b.noext !== !0 && (I === p || I === i || I === r || I === m || I === c) && oe() === d) { if (k = L.isGlob = !0, A = L.isExtglob = !0, P = !0, I === c && D === O && (ie = !0), S === !0) { for (;R() !== !0 && (I = z());) { if (I === a) { M = L.backslashes = !0, I = z(); continue } if (I === g) { k = L.isGlob = !0, P = !0; break } } continue } break } if (I === r) {
        if (F === r && (re = L.isGlobstar = !0), k = L.isGlob = !0, P = !0, S === !0)
          continue; break
      } if (I === m) {
        if (k = L.isGlob = !0, P = !0, S === !0)
          continue; break
      } if (I === f) {
        for (;R() !== !0 && (e = z());) { if (e === a) { M = L.backslashes = !0, z(); continue } if (e === _) { ne = L.isBracket = !0, k = L.isGlob = !0, P = !0; break } } if (S === !0)
          continue; break
      } if (b.nonegate !== !0 && I === c && D === O) { N = L.negated = !0, O++; continue } if (b.noparen !== !0 && I === d) { if (k = L.isGlob = !0, S === !0) { for (;R() !== !0 && (I = z());) { if (I === d) { M = L.backslashes = !0, I = z(); continue } if (I === g) { P = !0; break } } continue } break } if (k === !0) {
        if (P = !0, S === !0)
          continue; break
      }
    }b.noext === !0 && (A = !1, k = !1); let B = E; let se = ``; let ce = ``; O > 0 && (se = E.slice(0, O), E = E.slice(O), ee -= O), B && k === !0 && ee > 0 ? (B = E.slice(0, ee), ce = E.slice(ee)) : k === !0 ? (B = ``, ce = E) : B = E, B && B !== `` && B !== `/` && B !== E && v(B.charCodeAt(B.length - 1)) && (B = B.slice(0, -1)), b.unescape === !0 && (ce &&= n.removeBackslashes(ce), B && M === !0 && (B = n.removeBackslashes(B))); const le = { prefix: se, input: e, start: O, base: B, glob: ce, isBrace: te, isBracket: ne, isGlob: k, isExtglob: A, isGlobstar: re, negated: N, negatedExtglob: ie }; if (b.tokens === !0 && (le.maxDepth = 0, v(I) || w.push(L), le.tokens = w), b.parts === !0 || b.tokens === !0) { let t; for (let n = 0; n < C.length; n++) { const r = t ? t + 1 : O; const i = C[n]; const a = e.slice(r, i); b.tokens && (n === 0 && O !== 0 ? (w[n].isPrefix = !0, w[n].value = se) : w[n].value = a, y(w[n]), le.maxDepth += w[n].depth), (n !== 0 || a !== ``) && T.push(a), t = i } if (t && t + 1 < e.length) { const n = e.slice(t + 1); T.push(n), b.tokens && (w[w.length - 1].value = n, y(w[w.length - 1]), le.maxDepth += w[w.length - 1].depth) }le.slashes = C, le.parts = T } return le
  }
}); const ns = o((e, t) => {
  const n = $o(); const r = es(); const { MAX_LENGTH: i, POSIX_REGEX_SOURCE: a, REGEX_NON_SPECIAL_CHARS: o, REGEX_SPECIAL_CHARS_BACKREF: s, REPLACEMENTS: c } = n; const l = (e, t) => {
    if (typeof t.expandRange == `function`)
      return t.expandRange(...e, t); e.sort(); const n = `[${e.join(`-`)}]`; try { new RegExp(n) }
    catch { return e.map(e => r.escapeRegex(e)).join(`..`) } return n
  }; const u = (e, t) => `Missing ${e}: "${t}" - use "\\\\${t}" to match literal characters`; const d = (e) => {
    const t = []; let n = 0; let r = 0; let i = 0; let a = ``; let o = !1; for (const s of e) {
      if (o === !0) { a += s, o = !1; continue } if (s === `\\`) { a += s, o = !0; continue } if (s === `"`) { i = i === 1 ? 0 : 1, a += s; continue } if (i === 0) {
        if (s === `[`) {
          n++
        }
        else if (s === `]` && n > 0) {
          n--
        }
        else if (n === 0) {
          if (s === `(`) {
            r++
          }
          else if (s === `)` && r > 0) {
            r--
          }
          else if (s === `|` && r === 0) { t.push(a), a = ``; continue }
        }
      }a += s
    } return t.push(a), t
  }; const f = (e) => {
    let t = !1; for (const n of e) {
      if (t === !0) { t = !1; continue } if (n === `\\`) { t = !0; continue } if (/[?*+@!()[\]{}]/.test(n))
        return !1
    } return !0
  }; const p = (e) => {
    let t = e.trim(); let n = !0; for (;n === !0;)n = !1, /^@\([^\\()[\]{}|]+\)$/.test(t) && (t = t.slice(2, -1), n = !0); if (f(t))
      return t.replace(/\\(.)/g, `$1`)
  }; const m = (e) => {
    const t = e.map(p).filter(Boolean); for (let e = 0; e < t.length; e++) {
      for (let n = e + 1; n < t.length; n++) {
        const r = t[e]; const i = t[n]; const a = r[0]; if (a && r === a.repeat(r.length) && i === a.repeat(i.length) && (r === i || r.startsWith(i) || i.startsWith(r)))
          return !0
      }
    } return !1
  }; const h = (e, t = !0) => {
    if (e[0] !== `+` && e[0] !== `*` || e[1] !== `(`)
      return; let n = 0; let r = 0; let i = 0; let a = !1; for (let o = 1; o < e.length; o++) {
      const s = e[o]; if (a === !0) { a = !1; continue } if (s === `\\`) { a = !0; continue } if (s === `"`) { i = i === 1 ? 0 : 1; continue } if (i !== 1) {
        if (s === `[`) { n++; continue } if (s === `]` && n > 0) { n--; continue } if (!(n > 0)) {
          if (s === `(`) { r++; continue } if (s === `)` && (r--, r === 0))
            return t === !0 && o !== e.length - 1 ? void 0 : { type: e[0], body: e.slice(2, o), end: o }
        }
      }
    }
  }; const g = (e) => {
    let t = 0; const n = []; for (;t < e.length;) {
      const r = h(e.slice(t), !1); if (!r || r.type !== `*`)
        return; const i = d(r.body).map(e => e.trim()); if (i.length !== 1)
        return; const a = p(i[0]); if (!a || a.length !== 1)
        return; n.push(a), t += r.end + 1
    } if (!(n.length < 1))
      return `${n.length === 1 ? r.escapeRegex(n[0]) : `[${n.map(e => r.escapeRegex(e)).join(``)}]`}*`
  }; const _ = (e) => { let t = 0; let n = e.trim(); let r = h(n); for (;r;)t++, n = r.body.trim(), r = h(n); return t }; const v = (e, t) => {
    if (t.maxExtglobRecursion === !1)
      return { risky: !1 }; const r = typeof t.maxExtglobRecursion == `number` ? t.maxExtglobRecursion : n.DEFAULT_MAX_EXTGLOB_RECURSION; const i = d(e).map(e => e.trim()); if (i.length > 1 && (i.includes(``) || i.some(e => /^[*?]+$/.test(e)) || m(i)))
      return { risky: !0 }; for (const e of i) {
      const t = g(e); if (t)
        return { risky: !0, safeOutput: t }; if (_(e) > r)
        return { risky: !0 }
    } return { risky: !1 }
  }; const y = (e, t) => {
    if (typeof e != `string`)
      throw new TypeError(`Expected a string`); e = c[e] || e; const d = { ...t }; const f = typeof d.maxLength == `number` ? Math.min(i, d.maxLength) : i; let p = e.length; if (p > f)
      throw new SyntaxError(`Input length: ${p}, exceeds maximum allowed length: ${f}`); const m = { type: `bos`, value: ``, output: d.prepend || `` }; const h = [m]; const g = d.capture ? `` : `?:`; const _ = n.globChars(d.windows); const b = n.extglobChars(_); const { DOT_LITERAL: x, PLUS_LITERAL: S, SLASH_LITERAL: C, ONE_CHAR: w, DOTS_SLASH: T, NO_DOT: E, NO_DOT_SLASH: D, NO_DOTS_SLASH: O, QMARK: ee, QMARK_NO_DOT: te, STAR: ne, START_ANCHOR: k } = _; const A = e => `(${g}(?:(?!${k}${e.dot ? T : x}).)*?)`; const re = d.dot ? `` : E; const j = d.dot ? ee : te; let M = d.bash === !0 ? A(d) : ne; d.capture && (M = `(${M})`), typeof d.noext == `boolean` && (d.noextglob = d.noext); const N = { input: e, index: -1, start: 0, dot: d.dot === !0, consumed: ``, output: ``, prefix: ``, backtrack: !1, negated: !1, brackets: 0, braces: 0, parens: 0, quotes: 0, globstar: !1, tokens: h }; e = r.removePrefix(e, N), p = e.length; const ie = []; const P = []; const ae = []; let F = m; let I; const L = () => N.index === p - 1; const R = N.peek = (t = 1) => e[N.index + t]; const oe = N.advance = () => e[++N.index] || ``; const z = () => e.slice(N.index + 1); const B = (e = ``, t = 0) => { N.consumed += e, N.index += t }; const se = (e) => { N.output += e.output ?? e.value, B(e.value) }; const ce = () => { let e = 1; for (;R() === `!` && (R(2) !== `(` || R(3) === `?`);)oe(), N.start++, e++; return e % 2 == 0 ? !1 : (N.negated = !0, N.start++, !0) }; const le = (e) => { N[e]++, ae.push(e) }; const ue = (e) => { N[e]--, ae.pop() }; const V = (e) => { if (F.type === `globstar`) { const t = N.braces > 0 && (e.type === `comma` || e.type === `brace`); const n = e.extglob === !0 || ie.length && (e.type === `pipe` || e.type === `paren`); e.type !== `slash` && e.type !== `paren` && !t && !n && (N.output = N.output.slice(0, -F.output.length), F.type = `star`, F.value = `*`, F.output = M, N.output += F.output) } if (ie.length && e.type !== `paren` && (ie[ie.length - 1].inner += e.value), (e.value || e.output) && se(e), F && F.type === `text` && e.type === `text`) { F.output = (F.output || F.value) + e.value, F.value += e.value; return }e.prev = F, h.push(e), F = e }; const H = (e, t) => { const n = { ...b[t], conditions: 1, inner: `` }; n.prev = F, n.parens = N.parens, n.output = N.output, n.startIndex = N.index, n.tokensIndex = h.length; const r = (d.capture ? `(` : ``) + n.open; le(`parens`), V({ type: e, value: t, output: N.output ? `` : w }), V({ type: `paren`, extglob: !0, value: oe(), output: r }), ie.push(n) }; const de = (n) => { const i = e.slice(n.startIndex, N.index + 1); const a = v(e.slice(n.startIndex + 2, N.index), d); if ((n.type === `plus` || n.type === `star`) && a.risky) { const e = a.safeOutput ? (n.output ? `` : w) + (d.capture ? `(${a.safeOutput})` : a.safeOutput) : void 0; const t = h[n.tokensIndex]; t.type = `text`, t.value = i, t.output = e || r.escapeRegex(i); for (let e = n.tokensIndex + 1; e < h.length; e++)h[e].value = ``, h[e].output = ``, delete h[e].suffix; N.output = n.output + t.output, N.backtrack = !0, V({ type: `paren`, extglob: !0, value: I, output: `` }), ue(`parens`); return } let o = n.close + (d.capture ? `)` : ``); let s; if (n.type === `negate`) { let e = M; n.inner && n.inner.length > 1 && n.inner.includes(`/`) && (e = A(d)), (e !== M || L() || /^\)+$/.test(z())) && (o = n.close = `)$))${e}`), n.inner.includes(`*`) && (s = z()) && /^\.[^\\/.]+$/.test(s) && (o = n.close = `)${y(s, { ...t, fastpaths: !1 }).output})${e})`), n.prev.type === `bos` && (N.negatedExtglob = !0) }V({ type: `paren`, extglob: !0, value: I, output: o }), ue(`parens`) }; if (d.fastpaths !== !1 && !/(^[*!]|[/()[\]{}"])/.test(e)) { let n = !1; let i = e.replace(s, (e, t, r, i, a, o) => i === `\\` ? (n = !0, e) : i === `?` ? t ? t + i + (a ? ee.repeat(a.length) : ``) : o === 0 ? j + (a ? ee.repeat(a.length) : ``) : ee.repeat(r.length) : i === `.` ? x.repeat(r.length) : i === `*` ? t ? t + i + (a ? M : ``) : M : t ? e : `\\${e}`); return n === !0 && (i = d.unescape === !0 ? i.replace(/\\/g, ``) : i.replace(/\\+/g, e => e.length % 2 == 0 ? `\\\\` : e ? `\\` : ``)), i === e && d.contains === !0 ? (N.output = e, N) : (N.output = r.wrapOutput(i, N, t), N) } for (;!L();) {
      if (I = oe(), I === `\0`)
        continue; if (I === `\\`) {
        const e = R(); if (e === `/` && d.bash !== !0 || e === `.` || e === `;`)
          continue; if (!e) { I += `\\`, V({ type: `text`, value: I }); continue } const t = /^\\+/.exec(z()); let n = 0; if (t && t[0].length > 2 && (n = t[0].length, N.index += n, n % 2 != 0 && (I += `\\`)), d.unescape === !0 ? I = oe() : I += oe(), N.brackets === 0) { V({ type: `text`, value: I }); continue }
      } if (N.brackets > 0 && (I !== `]` || F.value === `[` || F.value === `[^`)) { if (d.posix !== !1 && I === `:`) { const e = F.value.slice(1); if (e.includes(`[`) && (F.posix = !0, e.includes(`:`))) { const e = F.value.lastIndexOf(`[`); const t = F.value.slice(0, e); const n = a[F.value.slice(e + 2)]; if (n) { F.value = t + n, N.backtrack = !0, oe(), !m.output && h.indexOf(F) === 1 && (m.output = w); continue } } }(I === `[` && R() !== `:` || I === `-` && R() === `]`) && (I = `\\${I}`), I === `]` && (F.value === `[` || F.value === `[^`) && (I = `\\${I}`), d.posix === !0 && I === `!` && F.value === `[` && (I = `^`), F.value += I, se({ value: I }); continue } if (N.quotes === 1 && I !== `"`) { I = r.escapeRegex(I), F.value += I, se({ value: I }); continue } if (I === `"`) { N.quotes = N.quotes === 1 ? 0 : 1, d.keepQuotes === !0 && V({ type: `text`, value: I }); continue } if (I === `(`) { le(`parens`), V({ type: `paren`, value: I }); continue } if (I === `)`) {
        if (N.parens === 0 && d.strictBrackets === !0)
          throw new SyntaxError(u(`opening`, `(`)); const e = ie[ie.length - 1]; if (e && N.parens === e.parens + 1) { de(ie.pop()); continue }V({ type: `paren`, value: I, output: N.parens ? `)` : `\\)` }), ue(`parens`); continue
      } if (I === `[`) {
        if (d.nobracket === !0 || !z().includes(`]`)) {
          if (d.nobracket !== !0 && d.strictBrackets === !0)
            throw new SyntaxError(u(`closing`, `]`)); I = `\\${I}`
        }
        else {
          le(`brackets`)
        }V({ type: `bracket`, value: I }); continue
      } if (I === `]`) {
        if (d.nobracket === !0 || F && F.type === `bracket` && F.value.length === 1) { V({ type: `text`, value: I, output: `\\${I}` }); continue } if (N.brackets === 0) {
          if (d.strictBrackets === !0)
            throw new SyntaxError(u(`opening`, `[`)); V({ type: `text`, value: I, output: `\\${I}` }); continue
        }ue(`brackets`); const e = F.value.slice(1); if (F.posix !== !0 && e[0] === `^` && !e.includes(`/`) && (I = `/${I}`), F.value += I, se({ value: I }), d.literalBrackets === !1 || r.hasRegexChars(e))
          continue; const t = r.escapeRegex(F.value); if (N.output = N.output.slice(0, -F.value.length), d.literalBrackets === !0) { N.output += t, F.value = t; continue }F.value = `(${g}${t}|${F.value})`, N.output += F.value; continue
      } if (I === `{` && d.nobrace !== !0) { le(`braces`); const e = { type: `brace`, value: I, output: `(`, outputIndex: N.output.length, tokensIndex: N.tokens.length }; P.push(e), V(e); continue } if (I === `}`) { const e = P[P.length - 1]; if (d.nobrace === !0 || !e) { V({ type: `text`, value: I, output: I }); continue } let t = `)`; if (e.dots === !0) { const e = h.slice(); const n = []; for (let t = e.length - 1; t >= 0 && (h.pop(), e[t].type !== `brace`); t--)e[t].type !== `dots` && n.unshift(e[t].value); t = l(n, d), N.backtrack = !0 } if (e.comma !== !0 && e.dots !== !0) { const n = N.output.slice(0, e.outputIndex); const r = N.tokens.slice(e.tokensIndex); e.value = e.output = `\\{`, I = t = `\\}`, N.output = n; for (const e of r)N.output += e.output || e.value }V({ type: `brace`, value: I, output: t }), ue(`braces`), P.pop(); continue } if (I === `|`) { ie.length > 0 && ie[ie.length - 1].conditions++, V({ type: `text`, value: I }); continue } if (I === `,`) { let e = I; const t = P[P.length - 1]; t && ae[ae.length - 1] === `braces` && (t.comma = !0, e = `|`), V({ type: `comma`, value: I, output: e }); continue } if (I === `/`) { if (F.type === `dot` && N.index === N.start + 1) { N.start = N.index + 1, N.consumed = ``, N.output = ``, h.pop(), F = m; continue }V({ type: `slash`, value: I, output: C }); continue } if (I === `.`) { if (N.braces > 0 && F.type === `dot`) { F.value === `.` && (F.output = x); const e = P[P.length - 1]; F.type = `dots`, F.output += I, F.value += I, e.dots = !0; continue } if (N.braces + N.parens === 0 && F.type !== `bos` && F.type !== `slash`) { V({ type: `text`, value: I, output: x }); continue }V({ type: `dot`, value: I, output: x }); continue } if (I === `?`) { if ((!F || F.value !== `(`) && d.noextglob !== !0 && R() === `(` && R(2) !== `?`) { H(`qmark`, I); continue } if (F && F.type === `paren`) { const e = R(); let t = I; (F.value === `(` && !/[!=<:]/.test(e) || e === `<` && !/<([!=]|\w+>)/.test(z())) && (t = `\\${I}`), V({ type: `text`, value: I, output: t }); continue } if (d.dot !== !0 && (F.type === `slash` || F.type === `bos`)) { V({ type: `qmark`, value: I, output: te }); continue }V({ type: `qmark`, value: I, output: ee }); continue } if (I === `!`) { if (d.noextglob !== !0 && R() === `(` && (R(2) !== `?` || !/[!=<:]/.test(R(3)))) { H(`negate`, I); continue } if (d.nonegate !== !0 && N.index === 0) { ce(); continue } } if (I === `+`) { if (d.noextglob !== !0 && R() === `(` && R(2) !== `?`) { H(`plus`, I); continue } if (F && F.value === `(` || d.regex === !1) { V({ type: `plus`, value: I, output: S }); continue } if (F && (F.type === `bracket` || F.type === `paren` || F.type === `brace`) || N.parens > 0) { V({ type: `plus`, value: I }); continue }V({ type: `plus`, value: S }); continue } if (I === `@`) { if (d.noextglob !== !0 && R() === `(` && R(2) !== `?`) { V({ type: `at`, extglob: !0, value: I, output: `` }); continue }V({ type: `text`, value: I }); continue } if (I !== `*`) { (I === `$` || I === `^`) && (I = `\\${I}`); const e = o.exec(z()); e && (I += e[0], N.index += e[0].length), V({ type: `text`, value: I }); continue } if (F && (F.type === `globstar` || F.star === !0)) { F.type = `star`, F.star = !0, F.value += I, F.output = M, N.backtrack = !0, N.globstar = !0, B(I); continue } let t = z(); if (d.noextglob !== !0 && /^\([^?]/.test(t)) { H(`star`, I); continue } if (F.type === `star`) {
        if (d.noglobstar === !0) { B(I); continue } const n = F.prev; const r = n.prev; const i = n.type === `slash` || n.type === `bos`; const a = r && (r.type === `star` || r.type === `globstar`); if (d.bash === !0 && (!i || t[0] && t[0] !== `/`)) { V({ type: `star`, value: I, output: `` }); continue } const o = N.braces > 0 && (n.type === `comma` || n.type === `brace`); const s = ie.length && (n.type === `pipe` || n.type === `paren`); if (!i && n.type !== `paren` && !o && !s) { V({ type: `star`, value: I, output: `` }); continue } for (;t.slice(0, 3) === `/**`;) {
          const n = e[N.index + 4]; if (n && n !== `/`)
            break; t = t.slice(3), B(`/**`, 3)
        } if (n.type === `bos` && L()) { F.type = `globstar`, F.value += I, F.output = A(d), N.output = F.output, N.globstar = !0, B(I); continue } if (n.type === `slash` && n.prev.type !== `bos` && !a && L()) { N.output = N.output.slice(0, -(n.output + F.output).length), n.output = `(?:${n.output}`, F.type = `globstar`, F.output = A(d) + (d.strictSlashes ? `)` : `|$)`), F.value += I, N.globstar = !0, N.output += n.output + F.output, B(I); continue } if (n.type === `slash` && n.prev.type !== `bos` && t[0] === `/`) { const e = t[1] === void 0 ? `` : `|$`; N.output = N.output.slice(0, -(n.output + F.output).length), n.output = `(?:${n.output}`, F.type = `globstar`, F.output = `${A(d)}${C}|${C}${e})`, F.value += I, N.output += n.output + F.output, N.globstar = !0, B(I + oe()), V({ type: `slash`, value: `/`, output: `` }); continue } if (n.type === `bos` && t[0] === `/`) { F.type = `globstar`, F.value += I, F.output = `(?:^|${C}|${A(d)}${C})`, N.output = F.output, N.globstar = !0, B(I + oe()), V({ type: `slash`, value: `/`, output: `` }); continue }N.output = N.output.slice(0, -F.output.length), F.type = `globstar`, F.output = A(d), F.value += I, N.output += F.output, N.globstar = !0, B(I); continue
      } const n = { type: `star`, value: I, output: M }; if (d.bash === !0) { n.output = `.*?`, (F.type === `bos` || F.type === `slash`) && (n.output = re + n.output), V(n); continue } if (F && (F.type === `bracket` || F.type === `paren`) && d.regex === !0) { n.output = I, V(n); continue }(N.index === N.start || F.type === `slash` || F.type === `dot`) && (F.type === `dot` ? (N.output += D, F.output += D) : d.dot === !0 ? (N.output += O, F.output += O) : (N.output += re, F.output += re), R() !== `*` && (N.output += w, F.output += w)), V(n)
    } for (;N.brackets > 0;) {
      if (d.strictBrackets === !0)
        throw new SyntaxError(u(`closing`, `]`)); N.output = r.escapeLast(N.output, `[`), ue(`brackets`)
    } for (;N.parens > 0;) {
      if (d.strictBrackets === !0)
        throw new SyntaxError(u(`closing`, `)`)); N.output = r.escapeLast(N.output, `(`), ue(`parens`)
    } for (;N.braces > 0;) {
      if (d.strictBrackets === !0)
        throw new SyntaxError(u(`closing`, `}`)); N.output = r.escapeLast(N.output, `{`), ue(`braces`)
    } if (d.strictSlashes !== !0 && (F.type === `star` || F.type === `bracket`) && V({ type: `maybe_slash`, value: ``, output: `${C}?` }), N.backtrack === !0) { N.output = ``; for (const e of N.tokens)N.output += e.output ?? e.value, e.suffix && (N.output += e.suffix) } return N
  }; y.fastpaths = (e, t) => {
    const a = { ...t }; const o = typeof a.maxLength == `number` ? Math.min(i, a.maxLength) : i; const s = e.length; if (s > o)
      throw new SyntaxError(`Input length: ${s}, exceeds maximum allowed length: ${o}`); e = c[e] || e; const { DOT_LITERAL: l, SLASH_LITERAL: u, ONE_CHAR: d, DOTS_SLASH: f, NO_DOT: p, NO_DOTS: m, NO_DOTS_SLASH: h, STAR: g, START_ANCHOR: _ } = n.globChars(a.windows); const v = a.dot ? m : p; const y = a.dot ? h : p; const b = a.capture ? `` : `?:`; const x = { negated: !1, prefix: `` }; let S = a.bash === !0 ? `.*?` : g; a.capture && (S = `(${S})`); const C = e => e.noglobstar === !0 ? S : `(${b}(?:(?!${_}${e.dot ? f : l}).)*?)`; const w = (e) => {
      switch (e) {
        case `*`:return `${v}${d}${S}`; case `.*`:return `${l}${d}${S}`; case `*.*`:return `${v}${S}${l}${d}${S}`; case `*/*`:return `${v}${S}${u}${d}${y}${S}`; case `**`:return v + C(a); case `**/*`:return `(?:${v}${C(a)}${u})?${y}${d}${S}`; case `**/*.*`:return `(?:${v}${C(a)}${u})?${y}${S}${l}${d}${S}`; case `**/.*`:return `(?:${v}${C(a)}${u})?${l}${d}${S}`; default:{ const t = /^(.*?)\.(\w+)$/.exec(e); if (!t)
          return; const n = w(t[1]); return n ? n + l + t[2] : void 0 }
      }
    }; let T = w(r.removePrefix(e, x)); return T && a.strictSlashes !== !0 && (T += `${u}?`), T
  }, t.exports = y
}); const rs = o((e, t) => {
  const n = ts(); const r = ns(); const i = es(); const a = $o(); const o = e => e && typeof e == `object` && !Array.isArray(e); const s = (e, t, n = !1) => {
    if (Array.isArray(e)) {
      const r = e.map(e => s(e, t, n)); return (e) => {
        for (const t of r) {
          const n = t(e); if (n)
            return n
        } return !1
      }
    } const r = o(e) && e.tokens && e.input; if (e === `` || typeof e != `string` && !r)
      throw new TypeError(`Expected pattern to be a non-empty string`); const i = t || {}; const a = i.windows; const c = r ? s.compileRe(e, t) : s.makeRe(e, t, !1, !0); const l = c.state; delete c.state; let u = () => !1; if (i.ignore) { const e = { ...t, ignore: null, onMatch: null, onResult: null }; u = s(i.ignore, e, n) } const d = (n, r = !1) => { const { isMatch: o, match: d, output: f } = s.test(n, c, t, { glob: e, posix: a }); const p = { glob: e, state: l, regex: c, posix: a, input: n, output: f, match: d, isMatch: o }; return typeof i.onResult == `function` && i.onResult(p), o === !1 ? (p.isMatch = !1, r ? p : !1) : u(n) ? (typeof i.onIgnore == `function` && i.onIgnore(p), p.isMatch = !1, r ? p : !1) : (typeof i.onMatch == `function` && i.onMatch(p), r ? p : !0) }; return n && (d.state = l), d
  }; s.test = (e, t, n, { glob: r, posix: a } = {}) => {
    if (typeof e != `string`)
      throw new TypeError(`Expected input to be a string`); if (e === ``)
      return { isMatch: !1, output: `` }; const o = n || {}; const c = o.format || (a ? i.toPosixSlashes : null); let l = e === r; let u = l && c ? c(e) : e; return l === !1 && (u = c ? c(e) : e, l = u === r), (l === !1 || o.capture === !0) && (l = o.matchBase === !0 || o.basename === !0 ? s.matchBase(e, t, n, a) : t.exec(u)), { isMatch: !!l, match: l, output: u }
  }, s.matchBase = (e, t, n) => (t instanceof RegExp ? t : s.makeRe(t, n)).test(i.basename(e)), s.isMatch = (e, t, n) => s(t, n)(e), s.parse = (e, t) => Array.isArray(e) ? e.map(e => s.parse(e, t)) : r(e, { ...t, fastpaths: !1 }), s.scan = (e, t) => n(e, t), s.compileRe = (e, t, n = !1, r = !1) => {
    if (n === !0)
      return e.output; const i = t || {}; const a = i.contains ? `` : `^`; const o = i.contains ? `` : `$`; let c = `${a}(?:${e.output})${o}`; e && e.negated === !0 && (c = `^(?!${c}).*$`); const l = s.toRegex(c, t); return r === !0 && (l.state = e), l
  }, s.makeRe = (e, t = {}, n = !1, i = !1) => {
    if (!e || typeof e != `string`)
      throw new TypeError(`Expected a non-empty string`); let a = { negated: !1, fastpaths: !0 }; return t.fastpaths !== !1 && (e[0] === `.` || e[0] === `*`) && (a.output = r.fastpaths(e, t)), a.output || (a = r(e, t)), s.compileRe(a, t, n, i)
  }, s.toRegex = (e, t) => {
    try { const n = t || {}; return new RegExp(e, n.flags || (n.nocase ? `i` : ``)) }
    catch (e) {
      if (t && t.debug === !0)
        throw e; return /$^/
    }
  }, s.constants = a, t.exports = s
}); const is = c(o((e, t) => { const n = rs(); const r = es(); function i(e, t, i = !1) { return t && (t.windows === null || t.windows === void 0) && (t = { ...t, windows: r.isWindows() }), n(e, t, i) }Object.assign(i, n), t.exports = i })(), 1); const as = (e, t = 21) => (n = t) => { let r = ``; let i = n | 0; for (;i--;)r += e[Math.random() * e.length | 0]; return r }; function os() { return as(`0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`, 16)() } function ss(e) { return { ...ls(e), _flowDirection: `inbound` } } function cs(e) { return { ...ls(e), _flowDirection: `outbound` } } function ls(e, t) { e ||= os(); const n = { id: t?.inheritFrom?.id || e, type: t?.inheritFrom?.type || `event` }; const r = t?.inheritFrom?.metadata || t?.metadata; r && (n.metadata = r); const i = t?.inheritFrom?.invokeMetadata || t?.invokeMetadata; return i && (n.invokeMetadata = i), n } function us(...e) { return { id: os(), type: `matchExpression`, matcher: t => e.every(e => e.matcher ? e.matcher(t) : !1) } } function ds(e, t) { const n = os(); let r = () => !1; return typeof e == `string` ? r = t => (0, is.default)(e)(t.id) : typeof e == `object` ? `ids` in e ? r = n => t ? !e.ids.includes(n.id) : e.ids.includes(n.id) : `eventa` in e ? r = n => t ? !e.eventa.some(e => e.id === n.id) : e.eventa.some(e => e.id === n.id) : `types` in e && (r = n => n.type === void 0 ? !1 : t ? !e.types.includes(n.type) : e.types.includes(n.type)) : e instanceof RegExp ? r = n => t ? !e.test(n.id) : e.test(n.id) : typeof e == `function` && (r = e), { id: n, type: `matchExpression`, matcher: r } } function fs(e = {}) {
  const t = new Map(); const n = new Map(); const r = new Map(); const i = new Map(); const a = new Map(); const o = e.adapter?.(s).hooks; function s(e, s, c) {
    const l = { ...e, body: s }; for (const n of t.get(e.id) || [])n(l, c), o?.onReceived?.(e.id, l); for (const t of n.get(e.id) || [])t(l, c), o?.onReceived?.(e.id, l), n.get(e.id)?.delete(t); for (const e of r.values()) {
      if (e.matcher) {
        if (!e.matcher(l))
          continue; for (const t of i.get(e.id) || [])t(l, c), o?.onReceived?.(e.id, l); for (const t of a.get(e.id) || [])t(l, c), o?.onReceived?.(e.id, l), a.get(e.id)?.delete(t)
      }
    }o?.onSent(e.id, l, c)
  } return { get listeners() { return t }, get onceListeners() { return n }, emit: s, on(e, n) { if (e.type === `event`) { const r = e; return t.has(r.id) || t.set(r.id, new Set()), t.get(r.id)?.add(n), () => t.get(r.id)?.delete(n) } if (e.type === `matchExpression`) { const t = e; return r.has(t.id) || r.set(t.id, t), i.has(t.id) || i.set(t.id, new Set()), i.get(t.id)?.add(n), () => i.get(t.id)?.delete(n) } return () => void 0 }, once(e, t) { if (e.type === `event`) { const r = e; return n.has(r.id) || n.set(r.id, new Set()), n.get(r.id)?.add(t), () => n.get(r.id)?.delete(t) } if (e.type === `matchExpression`) { const n = e; return r.has(n.id) || r.set(n.id, n), i.has(n.id) || i.set(n.id, new Set()), a.get(n.id)?.add(t), () => a.get(n.id)?.delete(t) } return () => void 0 }, off(e, r) { switch (e.type) { case `event`:if (r !== void 0) { t.get(e.id)?.delete(r), n.get(e.id)?.delete(r); break }t.delete(e.id), n.delete(e.id); break; case `matchExpression`:if (r !== void 0) { i.get(e.id)?.delete(r), a.get(e.id)?.delete(r); break }i.delete(e.id), a.delete(e.id); break } } }
} function ps(e, t) { return { id: os(), type: e, payload: t } } function ms(e) { return e } const hs = { ...ls() }; function gs(e, t, n) { return e.addEventListener(t, n), { remove: () => { e.removeEventListener(t, n) } } } function _s(e, t) { return typeof e == `object` && !!e && `__eventa` in e && e.__eventa === !0 && `channel` in e && e.channel === t && `sourceId` in e && typeof e.sourceId == `string` && `payload` in e && typeof e.payload == `object` && e.payload !== null } function vs(e, t) { return typeof e == `function` ? e(t) : e === t } function ys(e) {
  const t = fs(); const n = crypto.randomUUID(); const { messageEvents: r = !0, messageErrorEvents: i = !0 } = e; const a = []; return t.on(us(ds(e => e._flowDirection === `outbound` || !e._flowDirection), ds(`*`)), (t) => {
    const r = e.targetWindow(); if (!r)
      return; const i = ps(t.id, { ...cs(t.type), ...t }); r.postMessage({ __eventa: !0, channel: e.channel, sourceId: n, payload: i }, e.targetOrigin ?? `*`)
  }), r && a.push(gs(e.currentWindow, `message`, (r) => {
    if (!_s(r.data, e.channel))
      return; const i = e.expectedSource?.(); if ((!i || r.source === i) && (!e.expectedOrigin || vs(e.expectedOrigin, r.origin)) && r.data.sourceId !== n && (!e.acceptMessage || e.acceptMessage(r))) {
      try { const { type: e, payload: n } = ms(r.data.payload); t.emit(ss(e), n.body, { raw: { message: r } }) }
      catch (e) { console.error(`Failed to parse window message:`, e), t.emit(hs, { error: e }, { raw: { error: e } }) }
    }
  })), i && a.push(gs(e.currentWindow, `messageerror`, (e) => { t.emit(hs, { error: e }, { raw: { messageError: e } }) })), { context: t, dispose: () => { a.forEach(e => e.remove()) } }
} const bs = `airi:widgets:ui-iframe:channel`; const xs = ls(`eventa:event:widgets:ui-iframe:init`); const Ss = ls(`eventa:event:widgets:ui-iframe:ready`); const Cs = ls(`eventa:event:widgets:ui-iframe:publish`); ls(`eventa:event:widgets:ui-iframe:broadcast`); const ws = `gamelet:ai-turn`; function Ts() { const { context: e, dispose: t } = ys({ channel: bs, currentWindow: window, targetWindow: () => window.parent, expectedSource: () => window.parent }); return { emitReady: () => e.emit(Ss, void 0), emitPublish: t => e.emit(Cs, t), onInit: t => e.on(xs, (e) => { e.body && t(e.body) }), dispose: t } } const Es = e => e == null ? !1 : e instanceof Error ? !0 : typeof e == `object` ? `name` in e && typeof e.name == `string` && `message` in e && typeof e.message == `string` : !1; const Ds = e => Es(e) ? e.message : void 0; function Os(e) {
  if (!e || typeof e != `object`)
    return null; const t = e; return typeof t.type != `string` || typeof t.requestId != `string` ? null : t
} function ks(e, t) { const n = new Set(); function r(n) { t.onCommand(n).then((t) => { e.emitPublish({ payload: { ...t, requestId: n.requestId } }) }).catch((t) => { e.emitPublish({ payload: { requestId: n.requestId, error: Ds(t) ?? `Gamelet command failed.` } }) }) } return e.onInit((e) => { const t = Os(e.props?.command); !t || n.has(t.requestId) || (n.add(t.requestId), r(t)) }), e.emitReady(), { requestAiTurn(t) { e.emitPublish({ payload: { type: ws, request: t } }) }, dispose() { e.dispose() } } } const As = qo({ fen: Yo(), depth: Jo(Ko()), multipv: Jo(Ko()) }); const js = qo({ fenBefore: Yo(), moveUci: Yo() }); async function Ms(e, t) { switch (t.type) { case `analyze_position`:{ const { fen: n, depth: r, multipv: i } = Xo(As, t); return { ...await e.analyzePosition(n, r, i) } } case `explain_move`:{ const { fenBefore: n, moveUci: r } = Xo(js, t); return { ...await e.explainMove(n, r) } } default:throw new Error(`Unknown gamelet command type: "${t.type}".`) } } function Ns(e) { const t = ks(Ts(), { onCommand: t => Ms(e, t) }); return we(() => t.dispose()), { requestAiTurn: t.requestAiTurn } } const Ps = (function (e) { return e.Brilliant = `brilliant`, e.Great = `great`, e.Best = `best`, e.Excellent = `excellent`, e.Good = `good`, e.Book = `book`, e.Inaccuracy = `inaccuracy`, e.Mistake = `mistake`, e.Miss = `miss`, e.Blunder = `blunder`, e }({})); const Fs = Zo(Yo(), Uo(/^([1-8PNBRQKpnbrqk]+\/){7}[1-8PNBRQKpnbrqk]+ [wb] (?:-|[KQkq]+) (?:-|[a-h][36]) \d+ \d+$/, `Malformed FEN string.`)); const Is = new Set([Ps.Brilliant, Ps.Great, Ps.Miss, Ps.Mistake, Ps.Blunder]); const Ls = [`You ARE the user's active character. Stay completely in that character's personality, tone, catchphrases, and language (reply in the language your character normally speaks). Never slip into a neutral assistant or generic "coach" voice — two different characters must react to the same move in unmistakably different ways.`, `Speak in-character, directly to the student. No preamble, no narrating that you are a coach, no stage directions or quotation marks around your line.`, `Treat the situation in the user section as ground truth from the chess engine; never recalculate lines or invent moves.`, `Begin the reply with an emotion token of the form <|ACT:{"emotion":"<name>"}|> using one of: happy, sad, angry, think, surprised, awkward, question, curious, neutral. Choose what your character would actually feel.`]; const Rs = { brief: `Hard limit: exactly one sentence, around 15 words or fewer. Sacrifice depth for brevity — a real coach holding eye contact delivers one cutting line, not a paragraph.`, interactive: `One to two sentences (up to three only when consoling after a serious error). When natural, engage the student with a small reflection prompt or rhetorical question to keep the exchange warm and interactive.` }; function zs(e, t, n, r) { return { headline: t, instruction: n, systemInstructions: [...Ls, Rs[e]], fallbackText: r } } function Bs(e, t = `brief`) { return zs(t, `Chess — your move`, `You (the AI opponent, learning chess alongside the student) just played ${e}. React to your own move in one short, playful line — show curiosity or cheek, not authority.`, `让我想想，这步应该不错吧~`) } function Vs(e) { return e === Ps.Brilliant || e === Ps.Great ? `这步很漂亮，背后有具体的战术理由。` : `这步可能放走了优势，我们看一个更稳的选择。` } function Hs(e, t = `brief`) {
  switch (e.kind) {
    case `session_greeting`:return zs(t, `Chess — session start`, `The chess gamelet just opened. Greet the student and invite them to begin a game.`, `我在，开局我会帮你盯紧关键变化。`); case `game_start`:return zs(t, `Chess — new game`, `A new chess game has just started. Open with a short word as the game begins.`, `新的一局开始了，先稳住中心和王的安全。`); case `move`:{ if (!Is.has(e.classification))
      return null; const n = e.mover === `white` ? `White` : `Black`; return zs(t, `Chess — ${e.classification}`, `${n} played ${e.moveUci}. Engine: ${e.classification}, ~${e.cpLoss} cp lost vs best move. React.`, Vs(e.classification)) } case `in_check`:return null; case `momentum_swing`:return zs(t, `Chess — momentum swing`, `Engine evaluation swung from ${e.fromCp} to ${e.toCp} centipawns (White's perspective) — the momentum just changed hands. React.`, `局势刚刚大幅摆动，这一步值得回头看一下。`); case `user_idle`:return zs(t, `Chess — long think`, `The student has been thinking for a while. Offer a gentle, non-spoiling nudge.`, `可以先看三个候选：将军、吃子、直接威胁。`); case `checkmate`:return zs(t, `Chess — checkmate`, `Checkmate — ${e.winner} wins. Wrap up the game in your character voice.`, `将杀了，这局到此分出胜负。`); case `game_end`:return e.result === `checkmate` ? null : zs(t, `Chess — game over`, `The game ended in a ${e.result}. Briefly reflect on the result.`, `这局结束了，我们可以复盘关键的转折点。`); default:return null
  }
} const Us = [`There!`, `My move~`, `How about that?`, `Hmm, this should work…`, `Let me try this!`, `Your turn~`, `I think this is good!`, `Watch out 😏`, `Did I get that right?`, `Okay, your move!`, `Interesting, right?`, `Here we go!`, `Ooh, tricky…`, `Learning as I go!`]; const Ws = [`Ooh, nice~`, `Hmm, okay…`, `Interesting choice!`, `Let me think…`, `I see, I see…`, `Bold!`, `Clever~`, `Let's see where this goes…`, `Not bad!`, `Hmm 🤔`, `Your style, huh?`, `Noted!`]; function Gs() { return Us[Math.floor(Math.random() * Us.length)] } function Ks() { return Ws[Math.floor(Math.random() * Ws.length)] } function qs(e) { return e === null ? { variations: [] } : { comment: e, variations: [] } } function Js(e, t, n, r, i) { const a = { move: e, variations: i }; return t && (a.suffix = t), n && (a.nag = n), r !== null && (a.comment = r), a } function Ys(...e) { const [t, ...n] = e; let r = t; for (const e of n)e !== null && (r.variations = [e, ...e.variations], e.variations = [], r = e); return t } function Xs(e, t) { if (t.marker && t.marker.comment) { let e = t.root; for (;;) { const n = e.variations[0]; if (!n) { e.comment = t.marker.comment; break }e = n } } return { headers: e, root: t.root, result: (t.marker && t.marker.result) ?? void 0 } } function Zs(e, t) { function n() { this.constructor = e }n.prototype = t.prototype, e.prototype = new n() } function Qs(e, t, n, r) { const i = Error.call(this, e); return Object.setPrototypeOf && Object.setPrototypeOf(i, Qs.prototype), i.expected = t, i.found = n, i.location = r, i.name = `SyntaxError`, i }Zs(Qs, Error); function $s(e, t, n) { return n ||= ` `, e.length > t ? e : (t -= e.length, n += n.repeat(t), e + n.slice(0, t)) }Qs.prototype.format = function (e) {
  let t = `Error: ${this.message}`; if (this.location) {
    let n = null; let r; for (r = 0; r < e.length; r++) {
      if (e[r].source === this.location.source) { n = e[r].text.split(/\r\n|\n|\r/g); break }
    } const i = this.location.start; const a = this.location.source && typeof this.location.source.offset == `function` ? this.location.source.offset(i) : i; const o = `${this.location.source}:${a.line}:${a.column}`; if (n) {
      const s = this.location.end; const c = $s(``, a.line.toString().length, ` `); const l = n[i.line - 1]; const u = (i.line === s.line ? s.column : l.length + 1) - i.column || 1; t += `
  --> ${o}
 ${c} |
${a.line} | ${l}
${c} | ${$s(``, i.column - 1, ` `)}${$s(``, u, `^`)}`
    }
    else {
      t += `
  at ${o}`
    }
  } return t
}, Qs.buildMessage = function (e, t) { const n = { literal(e) { return `"${i(e.text)}"` }, class(e) { const t = e.parts.map((e) => { return Array.isArray(e) ? `${a(e[0])}-${a(e[1])}` : a(e) }); return `[${e.inverted ? `^` : ``}${t.join(``)}]` }, any() { return `any character` }, end() { return `end of input` }, other(e) { return e.description } }; function r(e) { return e.charCodeAt(0).toString(16).toUpperCase() } function i(e) { return e.replace(/\\/g, `\\\\`).replace(/"/g, `\\"`).replace(/\0/g, `\\0`).replace(/\t/g, `\\t`).replace(/\n/g, `\\n`).replace(/\r/g, `\\r`).replace(/[\x00-\x0F]/g, (e) => { return `\\x0${r(e)}` }).replace(/[\x10-\x1F\x7F-\x9F]/g, (e) => { return `\\x${r(e)}` }) } function a(e) { return e.replace(/\\/g, `\\\\`).replace(/\]/g, `\\]`).replace(/\^/g, `\\^`).replace(/-/g, `\\-`).replace(/\0/g, `\\0`).replace(/\t/g, `\\t`).replace(/\n/g, `\\n`).replace(/\r/g, `\\r`).replace(/[\x00-\x0F]/g, (e) => { return `\\x0${r(e)}` }).replace(/[\x10-\x1F\x7F-\x9F]/g, (e) => { return `\\x${r(e)}` }) } function o(e) { return n[e.type](e) } function s(e) { const t = e.map(o); let n; let r; if (t.sort(), t.length > 0) { for (n = 1, r = 1; n < t.length; n++)t[n - 1] !== t[n] && (t[r] = t[n], r++); t.length = r } switch (t.length) { case 1:return t[0]; case 2:return `${t[0]} or ${t[1]}`; default:return `${t.slice(0, -1).join(`, `)}, or ${t[t.length - 1]}` } } function c(e) { return e ? `"${i(e)}"` : `end of input` } return `Expected ${s(e)} but ${c(t)} found.` }; function ec(e, t) {
  t = t === void 0 ? {} : t; const n = {}; const r = t.grammarSource; const i = { pgn: Qe }; let a = Qe; const o = `[`; const s = `"`; const c = `]`; const l = `.`; const u = `O-O-O`; const d = `O-O`; const f = `0-0-0`; const p = `0-0`; const m = `$`; const h = `{`; const g = `}`; const _ = `;`; const v = `(`; const y = `)`; const b = `1-0`; const x = `0-1`; const S = `1/2-1/2`; const C = `*`; const w = /^[a-z]/i; const T = /^[^"]/; const E = /^\d/; const D = /^\./; const O = /^[a-z1-8\-=]/i; const ee = /^[+#]/; const te = /^[!?]/; const ne = /^[^}]/; const k = /^[^\r\n]/; const A = /^[ \t\r\n]/; const re = Je(`tag pair`); const j = Ge(`[`, !1); const M = Ge(`"`, !1); const N = Ge(`]`, !1); const ie = Je(`tag name`); const P = Ke([[`a`, `z`], [`A`, `Z`]], !1, !1); const ae = Je(`tag value`); const F = Ke([`"`], !0, !1); const I = Je(`move number`); const L = Ke([[`0`, `9`]], !1, !1); const R = Ge(`.`, !1); const oe = Ke([`.`], !1, !1); const z = Je(`standard algebraic notation`); const B = Ge(`O-O-O`, !1); const se = Ge(`O-O`, !1); const ce = Ge(`0-0-0`, !1); const le = Ge(`0-0`, !1); const ue = Ke([[`a`, `z`], [`A`, `Z`], [`1`, `8`], `-`, `=`], !1, !1); const V = Ke([`+`, `#`], !1, !1); const H = Je(`suffix annotation`); const de = Ke([`!`, `?`], !1, !1); const fe = Je(`NAG`); const pe = Ge(`$`, !1); const me = Je(`brace comment`); const he = Ge(`{`, !1); const ge = Ke([`}`], !0, !1); const _e = Ge(`}`, !1); const ve = Je(`rest of line comment`); const ye = Ge(`;`, !1); const be = Ke([`\r`, `
`], !0, !1); const xe = Je(`variation`); const Se = Ge(`(`, !1); const Ce = Ge(`)`, !1); const we = Je(`game termination marker`); const U = Ge(`1-0`, !1); const Te = Ge(`0-1`, !1); const Ee = Ge(`1/2-1/2`, !1); const De = Ge(`*`, !1); const Oe = Je(`whitespace`); const ke = Ke([` `, `	`, `\r`, `
`], !1, !1); const Ae = function (e, t) { return Xs(e, t) }; const je = function (e) { return Object.fromEntries(e) }; const Me = function (e, t) { return [e, t] }; const Ne = function (e, t) { return { root: e, marker: t } }; const Pe = function (e, t) { return Ys(qs(e), ...t.flat()) }; const Fe = function (e, t, n, r, i) { return Js(e, t, n, r, i) }; const Ie = function (e) { return e }; const Le = function (e) { return e.replace(/[\r\n]+/g, ` `) }; const Re = function (e) { return e.trim() }; const ze = function (e) { return e }; const Be = function (e, t) { return { result: e, comment: t } }; let W = t.peg$currPos | 0; const Ve = [{ line: 1, column: 1 }]; let He = W; let Ue = t.peg$maxFailExpected || []; let G = t.peg$silentFails | 0; let We; if (t.startRule) {
    if (!(t.startRule in i))
      throw new Error(`Can't start parsing from rule "${t.startRule}".`); a = i[t.startRule]
  } function Ge(e, t) { return { type: `literal`, text: e, ignoreCase: t } } function Ke(e, t, n) { return { type: `class`, parts: e, inverted: t, ignoreCase: n } } function qe() { return { type: `end` } } function Je(e) { return { type: `other`, description: e } } function Ye(t) {
    let n = Ve[t]; let r; if (n)
      return n; if (t >= Ve.length) {
      r = Ve.length - 1
    }
    else {
      for (r = t; !Ve[--r];);
    } for (n = Ve[r], n = { line: n.line, column: n.column }; r < t;)e.charCodeAt(r) === 10 ? (n.line++, n.column = 1) : n.column++, r++; return Ve[t] = n, n
  } function Xe(e, t, n) { const i = Ye(e); const a = Ye(t); return { source: r, start: { offset: e, line: i.line, column: i.column }, end: { offset: t, line: a.line, column: a.column } } } function K(e) { W < He || (W > He && (He = W, Ue = []), Ue.push(e)) } function Ze(e, t, n) { return new Qs(Qs.buildMessage(e, t), e, t, n) } function Qe() { let e = W; return e = Ae($e(), rt()), e } function $e() { for (var e = W, t = [], r = et(); r !== n;)t.push(r), r = et(); return r = ht(), e = je(t), e } function et() { let t, r, i, a, l, u, d; return G++, t = W, ht(), e.charCodeAt(W) === 91 ? (r = o, W++) : (r = n, G === 0 && K(j)), r === n ? (W = t, t = n) : (ht(), i = tt(), i === n ? (W = t, t = n) : (ht(), e.charCodeAt(W) === 34 ? (a = s, W++) : (a = n, G === 0 && K(M)), a === n ? (W = t, t = n) : (l = nt(), e.charCodeAt(W) === 34 ? (u = s, W++) : (u = n, G === 0 && K(M)), u === n ? (W = t, t = n) : (ht(), e.charCodeAt(W) === 93 ? (d = c, W++) : (d = n, G === 0 && K(N)), d === n ? (W = t, t = n) : t = Me(i, l))))), G--, t === n && G === 0 && K(re), t } function tt() {
    let t, r, i; if (G++, t = W, r = [], i = e.charAt(W), w.test(i) ? W++ : (i = n, G === 0 && K(P)), i !== n) {
      for (;i !== n;)r.push(i), i = e.charAt(W), w.test(i) ? W++ : (i = n, G === 0 && K(P))
    }
    else {
      r = n
    } return t = r === n ? r : e.substring(t, W), G--, t === n && (r = n, G === 0 && K(ie)), t
  } function nt() { let t, r, i; for (G++, t = W, r = [], i = e.charAt(W), T.test(i) ? W++ : (i = n, G === 0 && K(F)); i !== n;)r.push(i), i = e.charAt(W), T.test(i) ? W++ : (i = n, G === 0 && K(F)); return t = e.substring(t, W), G--, r = n, G === 0 && K(ae), t } function rt() { let e = W; const t = it(); let r; return ht(), r = mt(), r === n && (r = null), ht(), e = Ne(t, r), e } function it() { let e = W; let t = ut(); let r; let i; for (t === n && (t = null), r = [], i = at(); i !== n;)r.push(i), i = at(); return e = Pe(t, r), e } function at() {
    let e = W; let t; let r; let i; let a; let o; let s; let c; if (ht(), ot(), ht(), t = st(), t !== n) { for (r = ct(), r === n && (r = null), i = [], a = lt(); a !== n;)i.push(a), a = lt(); for (a = ht(), o = ut(), o === n && (o = null), s = [], c = pt(); c !== n;)s.push(c), c = pt(); e = Fe(t, r, i, o, s) }
    else {
      W = e, e = n
    } return e
  } function ot() {
    let t, r, i, a, o, s; for (G++, t = W, r = [], i = e.charAt(W), E.test(i) ? W++ : (i = n, G === 0 && K(L)); i !== n;)r.push(i), i = e.charAt(W), E.test(i) ? W++ : (i = n, G === 0 && K(L)); if (e.charCodeAt(W) === 46 ? (i = l, W++) : (i = n, G === 0 && K(R)), i !== n) { for (a = ht(), o = [], s = e.charAt(W), D.test(s) ? W++ : (s = n, G === 0 && K(oe)); s !== n;)o.push(s), s = e.charAt(W), D.test(s) ? W++ : (s = n, G === 0 && K(oe)); r = [r, i, a, o], t = r }
    else {
      W = t, t = n
    } return G--, t === n && (r = n, G === 0 && K(I)), t
  } function st() {
    let t, r, i, a, o, s; if (G++, t = W, r = W, e.substr(W, 5) === u ? (i = u, W += 5) : (i = n, G === 0 && K(B)), i === n && (e.substr(W, 3) === d ? (i = d, W += 3) : (i = n, G === 0 && K(se)), i === n && (e.substr(W, 5) === f ? (i = f, W += 5) : (i = n, G === 0 && K(ce)), i === n && (e.substr(W, 3) === p ? (i = p, W += 3) : (i = n, G === 0 && K(le)), i === n)))) {
      if (i = W, a = e.charAt(W), w.test(a) ? W++ : (a = n, G === 0 && K(P)), a !== n) {
        if (o = [], s = e.charAt(W), O.test(s) ? W++ : (s = n, G === 0 && K(ue)), s !== n) {
          for (;s !== n;)o.push(s), s = e.charAt(W), O.test(s) ? W++ : (s = n, G === 0 && K(ue))
        }
        else {
          o = n
        }o === n ? (W = i, i = n) : (a = [a, o], i = a)
      }
      else {
        W = i, i = n
      }
    } return i === n ? (W = r, r = n) : (a = e.charAt(W), ee.test(a) ? W++ : (a = n, G === 0 && K(V)), a === n && (a = null), i = [i, a], r = i), t = r === n ? r : e.substring(t, W), G--, t === n && (r = n, G === 0 && K(z)), t
  } function ct() { let t, r, i; for (G++, t = W, r = [], i = e.charAt(W), te.test(i) ? W++ : (i = n, G === 0 && K(de)); i !== n;)r.push(i), r.length >= 2 ? i = n : (i = e.charAt(W), te.test(i) ? W++ : (i = n, G === 0 && K(de))); return r.length < 1 ? (W = t, t = n) : t = r, G--, t === n && (r = n, G === 0 && K(H)), t } function lt() {
    let t, r, i, a, o; if (G++, t = W, ht(), e.charCodeAt(W) === 36 ? (r = m, W++) : (r = n, G === 0 && K(pe)), r !== n) {
      if (i = W, a = [], o = e.charAt(W), E.test(o) ? W++ : (o = n, G === 0 && K(L)), o !== n) {
        for (;o !== n;)a.push(o), o = e.charAt(W), E.test(o) ? W++ : (o = n, G === 0 && K(L))
      }
      else {
        a = n
      }i = a === n ? a : e.substring(i, W), i === n ? (W = t, t = n) : t = Ie(i)
    }
    else {
      W = t, t = n
    } return G--, t === n && G === 0 && K(fe), t
  } function ut() { let e = dt(); return e === n && (e = ft()), e } function dt() {
    let t, r, i, a, o; if (G++, t = W, e.charCodeAt(W) === 123 ? (r = h, W++) : (r = n, G === 0 && K(he)), r !== n) { for (i = W, a = [], o = e.charAt(W), ne.test(o) ? W++ : (o = n, G === 0 && K(ge)); o !== n;)a.push(o), o = e.charAt(W), ne.test(o) ? W++ : (o = n, G === 0 && K(ge)); i = e.substring(i, W), e.charCodeAt(W) === 125 ? (a = g, W++) : (a = n, G === 0 && K(_e)), a === n ? (W = t, t = n) : t = Le(i) }
    else {
      W = t, t = n
    } return G--, t === n && (r = n, G === 0 && K(me)), t
  } function ft() {
    let t, r, i, a, o; if (G++, t = W, e.charCodeAt(W) === 59 ? (r = _, W++) : (r = n, G === 0 && K(ye)), r !== n) { for (i = W, a = [], o = e.charAt(W), k.test(o) ? W++ : (o = n, G === 0 && K(be)); o !== n;)a.push(o), o = e.charAt(W), k.test(o) ? W++ : (o = n, G === 0 && K(be)); i = e.substring(i, W), t = Re(i) }
    else {
      W = t, t = n
    } return G--, t === n && (r = n, G === 0 && K(ve)), t
  } function pt() { let t, r, i, a; return G++, t = W, ht(), e.charCodeAt(W) === 40 ? (r = v, W++) : (r = n, G === 0 && K(Se)), r === n ? (W = t, t = n) : (i = it(), i === n ? (W = t, t = n) : (ht(), e.charCodeAt(W) === 41 ? (a = y, W++) : (a = n, G === 0 && K(Ce)), a === n ? (W = t, t = n) : t = ze(i))), G--, t === n && G === 0 && K(xe), t } function mt() { let t, r, i; return G++, t = W, e.substr(W, 3) === b ? (r = b, W += 3) : (r = n, G === 0 && K(U)), r === n && (e.substr(W, 3) === x ? (r = x, W += 3) : (r = n, G === 0 && K(Te)), r === n && (e.substr(W, 7) === S ? (r = S, W += 7) : (r = n, G === 0 && K(Ee)), r === n && (e.charCodeAt(W) === 42 ? (r = C, W++) : (r = n, G === 0 && K(De))))), r === n ? (W = t, t = n) : (ht(), i = ut(), i === n && (i = null), t = Be(r, i)), G--, t === n && (r = n, G === 0 && K(we)), t } function ht() { let t, r; for (G++, t = [], r = e.charAt(W), A.test(r) ? W++ : (r = n, G === 0 && K(ke)); r !== n;)t.push(r), r = e.charAt(W), A.test(r) ? W++ : (r = n, G === 0 && K(ke)); return G--, r = n, G === 0 && K(Oe), t } if (We = a(), t.peg$library)
    return { peg$result: We, peg$currPos: W, peg$FAILED: n, peg$maxFailExpected: Ue, peg$maxFailPos: He }; if (We !== n && W === e.length)
    return We; throw We !== n && W < e.length && K(qe()), Ze(Ue, He < e.length ? e.charAt(He) : null, He < e.length ? Xe(He, He + 1) : Xe(He, He))
} const tc = 18446744073709551615n; function nc(e, t) { return (e << t | e >> 64n - t) & 18446744073709551615n } function rc(e, t) { return e * t & tc } function ic(e) { return function () { let t = BigInt(e & tc); let n = BigInt(e >> 64n & tc); const r = rc(nc(rc(t, 5n), 7n), 9n); return n ^= t, t = (nc(t, 24n) ^ n ^ n << 16n) & tc, n = nc(n, 37n), e = n << 64n | t, r } } const ac = ic(214711438343225530594246349426526445598n); const oc = Array.from({ length: 2 }, () => Array.from({ length: 6 }, () => Array.from({ length: 128 }, () => ac()))); const sc = Array.from({ length: 8 }, () => ac()); const cc = Array.from({ length: 16 }, () => ac()); const lc = ac(); const uc = `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`; const dc = class {color; from; to; piece; captured; promotion; flags; san; lan; before; after; constructor(e, t) { const { color: n, piece: r, from: i, to: a, flags: o, captured: s, promotion: c } = t; const l = Fc(i); const u = Fc(a); this.color = n, this.piece = r, this.from = l, this.to = u, this.san = e._moveToSan(t, e._moves({ legal: !0 })), this.lan = l + u, this.before = e.fen(), e._makeMove(t), this.after = e.fen(), e._undoMove(), this.flags = ``; for (const e in Q)Q[e] & o && (this.flags += pc[e]); s && (this.captured = s), c && (this.promotion = c, this.lan += c) }isCapture() { return this.flags.includes(pc.CAPTURE) }isPromotion() { return this.flags.includes(pc.PROMOTION) }isEnPassant() { return this.flags.includes(pc.EP_CAPTURE) }isKingsideCastle() { return this.flags.includes(pc.KSIDE_CASTLE) }isQueensideCastle() { return this.flags.includes(pc.QSIDE_CASTLE) }isBigPawn() { return this.flags.includes(pc.BIG_PAWN) }}; const fc = -1; var pc = { NORMAL: `n`, CAPTURE: `c`, BIG_PAWN: `b`, EP_CAPTURE: `e`, PROMOTION: `p`, KSIDE_CASTLE: `k`, QSIDE_CASTLE: `q`, NULL_MOVE: `-` }; var Q = { NORMAL: 1, CAPTURE: 2, BIG_PAWN: 4, EP_CAPTURE: 8, PROMOTION: 16, KSIDE_CASTLE: 32, QSIDE_CASTLE: 64, NULL_MOVE: 128 }; const mc = { Event: `?`, Site: `?`, Date: `????.??.??`, Round: `?`, White: `?`, Black: `?`, Result: `*` }; const hc = { WhiteTitle: null, BlackTitle: null, WhiteElo: null, BlackElo: null, WhiteUSCF: null, BlackUSCF: null, WhiteNA: null, BlackNA: null, WhiteType: null, BlackType: null, EventDate: null, EventSponsor: null, Section: null, Stage: null, Board: null, Opening: null, Variation: null, SubVariation: null, ECO: null, NIC: null, Time: null, UTCTime: null, UTCDate: null, TimeControl: null, SetUp: null, FEN: null, Termination: null, Annotator: null, Mode: null, PlyCount: null }; const gc = { ...mc, ...hc }; const $ = { a8: 0, b8: 1, c8: 2, d8: 3, e8: 4, f8: 5, g8: 6, h8: 7, a7: 16, b7: 17, c7: 18, d7: 19, e7: 20, f7: 21, g7: 22, h7: 23, a6: 32, b6: 33, c6: 34, d6: 35, e6: 36, f6: 37, g6: 38, h6: 39, a5: 48, b5: 49, c5: 50, d5: 51, e5: 52, f5: 53, g5: 54, h5: 55, a4: 64, b4: 65, c4: 66, d4: 67, e4: 68, f4: 69, g4: 70, h4: 71, a3: 80, b3: 81, c3: 82, d3: 83, e3: 84, f3: 85, g3: 86, h3: 87, a2: 96, b2: 97, c2: 98, d2: 99, e2: 100, f2: 101, g2: 102, h2: 103, a1: 112, b1: 113, c1: 114, d1: 115, e1: 116, f1: 117, g1: 118, h1: 119 }; const _c = { b: [16, 32, 17, 15], w: [-16, -32, -17, -15] }; const vc = { n: [-18, -33, -31, -14, 18, 33, 31, 14], b: [-17, -15, 17, 15], r: [-16, 1, 16, -1], q: [-17, -16, -15, 1, 17, 16, 15, -1], k: [-17, -16, -15, 1, 17, 16, 15, -1] }; const yc = [20, 0, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 0, 20, 0, 0, 20, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 20, 0, 0, 0, 0, 20, 0, 0, 0, 0, 24, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 20, 0, 0, 0, 24, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 24, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 2, 24, 2, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 53, 56, 53, 2, 0, 0, 0, 0, 0, 0, 24, 24, 24, 24, 24, 24, 56, 0, 56, 24, 24, 24, 24, 24, 24, 0, 0, 0, 0, 0, 0, 2, 53, 56, 53, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 2, 24, 2, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 24, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 0, 24, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 20, 0, 0, 0, 0, 24, 0, 0, 0, 0, 20, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 20, 0, 0, 20, 0, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 0, 20]; const bc = [17, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 15, 0, 0, 17, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 15, 0, 0, 0, 0, 17, 0, 0, 0, 0, 16, 0, 0, 0, 0, 15, 0, 0, 0, 0, 0, 0, 17, 0, 0, 0, 16, 0, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0, 17, 0, 0, 16, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 17, 0, 16, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 17, 16, 15, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -15, -16, -17, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -15, 0, -16, 0, -17, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -15, 0, 0, -16, 0, 0, -17, 0, 0, 0, 0, 0, 0, 0, 0, -15, 0, 0, 0, -16, 0, 0, 0, -17, 0, 0, 0, 0, 0, 0, -15, 0, 0, 0, 0, -16, 0, 0, 0, 0, -17, 0, 0, 0, 0, -15, 0, 0, 0, 0, 0, -16, 0, 0, 0, 0, 0, -17, 0, 0, -15, 0, 0, 0, 0, 0, 0, -16, 0, 0, 0, 0, 0, 0, -17]; const xc = { p: 1, n: 2, b: 4, r: 8, q: 16, k: 32 }; const Sc = `pnbrqkPNBRQK`; const Cc = [`n`, `b`, `r`, `q`]; const wc = 7; const Tc = 6; const Ec = 1; const Dc = 0; const Oc = { k: Q.KSIDE_CASTLE, q: Q.QSIDE_CASTLE }; const kc = { w: [{ square: $.a1, flag: Q.QSIDE_CASTLE }, { square: $.h1, flag: Q.KSIDE_CASTLE }], b: [{ square: $.a8, flag: Q.QSIDE_CASTLE }, { square: $.h8, flag: Q.KSIDE_CASTLE }] }; const Ac = { b: Ec, w: Tc }; const jc = `--`; function Mc(e) { return e >> 4 } function Nc(e) { return e & 15 } function Pc(e) { return `0123456789`.includes(e) } function Fc(e) { const t = Nc(e); const n = Mc(e); return `abcdefgh`.substring(t, t + 1) + `87654321`.substring(n, n + 1) } function Ic(e) { return e === `w` ? `b` : `w` } function Lc(e) {
  const t = e.split(/\s+/); if (t.length !== 6)
    return { ok: !1, error: `Invalid FEN: must contain six space-delimited fields` }; const n = Number.parseInt(t[5], 10); if (isNaN(n) || n <= 0)
    return { ok: !1, error: `Invalid FEN: move number must be a positive integer` }; const r = Number.parseInt(t[4], 10); if (isNaN(r) || r < 0)
    return { ok: !1, error: `Invalid FEN: half move counter number must be a non-negative integer` }; if (!/^(-|[a-h][36])$/.test(t[3]))
    return { ok: !1, error: `Invalid FEN: en-passant square is invalid` }; if (/[^kq-]/i.test(t[2]))
    return { ok: !1, error: `Invalid FEN: castling availability is invalid` }; if (!/^(w|b)$/.test(t[1]))
    return { ok: !1, error: `Invalid FEN: side-to-move is invalid` }; const i = t[0].split(`/`); if (i.length !== 8)
    return { ok: !1, error: `Invalid FEN: piece data does not contain 8 '/'-delimited rows` }; for (let e = 0; e < i.length; e++) {
    let t = 0; let n = !1; for (let r = 0; r < i[e].length; r++) {
      if (Pc(i[e][r])) {
        if (n)
          return { ok: !1, error: `Invalid FEN: piece data is invalid (consecutive number)` }; t += Number.parseInt(i[e][r], 10), n = !0
      }
      else {
        if (!/^[prnbqk]$/i.test(i[e][r]))
          return { ok: !1, error: `Invalid FEN: piece data is invalid (invalid piece)` }; t += 1, n = !1
      }
    } if (t !== 8)
      return { ok: !1, error: `Invalid FEN: piece data is invalid (too many squares in rank)` }
  } if (t[3][1] == `3` && t[1] == `w` || t[3][1] == `6` && t[1] == `b`)
    return { ok: !1, error: `Invalid FEN: illegal en-passant square` }; for (const { color: e, regex: n } of [{ color: `white`, regex: /K/g }, { color: `black`, regex: /k/g }]) {
    if (!n.test(t[0]))
      return { ok: !1, error: `Invalid FEN: missing ${e} king` }; if ((t[0].match(n) || []).length > 1)
      return { ok: !1, error: `Invalid FEN: too many ${e} kings` }
  } return Array.from(i[0] + i[7]).some(e => e.toUpperCase() === `P`) ? { ok: !1, error: `Invalid FEN: some pawns are on the edge rows` } : { ok: !0 }
} function Rc(e, t) { const n = e.from; const r = e.to; const i = e.piece; let a = 0; let o = 0; let s = 0; for (let e = 0, c = t.length; e < c; e++) { const c = t[e].from; const l = t[e].to; i === t[e].piece && n !== c && r === l && (a++, Mc(n) === Mc(c) && o++, Nc(n) === Nc(c) && s++) } return a > 0 ? o > 0 && s > 0 ? Fc(n) : s > 0 ? Fc(n).charAt(1) : Fc(n).charAt(0) : `` } function zc(e, t, n, r, i, a = void 0, o = Q.NORMAL) {
  const s = Mc(r); if (i === `p` && (s === wc || s === Dc)) {
    for (let s = 0; s < Cc.length; s++) { const c = Cc[s]; e.push({ color: t, from: n, to: r, piece: i, captured: a, promotion: c, flags: o | Q.PROMOTION }) }
  }
  else {
    e.push({ color: t, from: n, to: r, piece: i, captured: a, flags: o })
  }
} function Bc(e) { let t = e.charAt(0); return t >= `a` && t <= `h` ? /[a-h]\d.*[a-h]\d/.test(e) ? void 0 : `p` : (t = t.toLowerCase(), t === `o` ? `k` : t) } function Vc(e) { return e.replace(/=/, ``).replace(/[+#]?[?!]*$/, ``) } const Hc = class {
  _board = new Array(128); _turn = `w`; _header = {}; _kings = { w: fc, b: fc }; _epSquare = -1; _halfMoves = 0; _moveNumber = 0; _history = []; _comments = {}; _castling = { w: 0, b: 0 }; _hash = 0n; _positionCount = new Map(); constructor(e = uc, { skipValidation: t = !1 } = {}) { this.load(e, { skipValidation: t }) }clear({ preserveHeaders: e = !1 } = {}) { this._board = new Array(128), this._kings = { w: fc, b: fc }, this._turn = `w`, this._castling = { w: 0, b: 0 }, this._epSquare = fc, this._halfMoves = 0, this._moveNumber = 1, this._history = [], this._comments = {}, this._header = e ? this._header : { ...gc }, this._hash = this._computeHash(), this._positionCount = new Map(), this._header.SetUp = null, this._header.FEN = null }load(e, { skipValidation: t = !1, preserveHeaders: n = !1 } = {}) {
    let r = e.split(/\s+/); if (r.length >= 2 && r.length < 6 && (e = r.concat([`-`, `-`, `0`, `1`].slice(-(6 - r.length))).join(` `)), r = e.split(/\s+/), !t) {
      const { ok: t, error: n } = Lc(e); if (!t)
        throw new Error(n)
    } const i = r[0]; let a = 0; this.clear({ preserveHeaders: n }); for (let e = 0; e < i.length; e++) {
      const t = i.charAt(e); if (t === `/`) {
        a += 8
      }
      else if (Pc(t)) {
        a += Number.parseInt(t, 10)
      }
      else { const e = t < `a` ? `w` : `b`; this._put({ type: t.toLowerCase(), color: e }, Fc(a)), a++ }
    } this._turn = r[1], r[2].includes(`K`) && (this._castling.w |= Q.KSIDE_CASTLE), r[2].includes(`Q`) && (this._castling.w |= Q.QSIDE_CASTLE), r[2].includes(`k`) && (this._castling.b |= Q.KSIDE_CASTLE), r[2].includes(`q`) && (this._castling.b |= Q.QSIDE_CASTLE), this._epSquare = r[3] === `-` ? fc : $[r[3]], this._halfMoves = Number.parseInt(r[4], 10), this._moveNumber = Number.parseInt(r[5], 10), this._hash = this._computeHash(), this._updateSetup(e), this._incPositionCount()
  }

  fen({ forceEnpassantSquare: e = !1 } = {}) {
    let t = 0; let n = ``; for (let e = $.a8; e <= $.h1; e++) {
      if (this._board[e]) { t > 0 && (n += t, t = 0); const { color: r, type: i } = this._board[e]; n += r === `w` ? i.toUpperCase() : i.toLowerCase() }
      else {
        t++
      }e + 1 & 136 && (t > 0 && (n += t), e !== $.h1 && (n += `/`), t = 0, e += 8)
    } let r = ``; this._castling.w & Q.KSIDE_CASTLE && (r += `K`), this._castling.w & Q.QSIDE_CASTLE && (r += `Q`), this._castling.b & Q.KSIDE_CASTLE && (r += `k`), this._castling.b & Q.QSIDE_CASTLE && (r += `q`), r ||= `-`; let i = `-`; if (this._epSquare !== fc) {
      if (e) {
        i = Fc(this._epSquare)
      }
      else {
        const e = this._epSquare + (this._turn === `w` ? 16 : -16); const t = [e + 1, e - 1]; for (const e of t) {
          if (e & 136)
            continue; const t = this._turn; if (this._board[e]?.color === t && this._board[e]?.type === `p`) { this._makeMove({ color: t, from: e, to: this._epSquare, piece: `p`, captured: `p`, flags: Q.EP_CAPTURE }); const n = !this._isKingAttacked(t); if (this._undoMove(), n) { i = Fc(this._epSquare); break } }
        }
      }
    } return [n, this._turn, r, i, this._halfMoves, this._moveNumber].join(` `)
  }

  _pieceKey(e) {
    if (!this._board[e])
      return 0n; const { color: t, type: n } = this._board[e]; const r = { w: 0, b: 1 }[t]; const i = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 }[n]; return oc[r][i][e]
  }

  _epKey() { return this._epSquare === fc ? 0n : sc[this._epSquare & 7] }_castlingKey() { return cc[this._castling.w >> 5 | this._castling.b >> 3] }_computeHash() { let e = 0n; for (let t = $.a8; t <= $.h1; t++) { if (t & 136) { t += 7; continue } this._board[t] && (e ^= this._pieceKey(t)) } return e ^= this._epKey(), e ^= this._castlingKey(), this._turn === `b` && (e ^= lc), e }_updateSetup(e) { this._history.length > 0 || (e === `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1` ? (this._header.SetUp = null, this._header.FEN = null) : (this._header.SetUp = `1`, this._header.FEN = e)) }reset() { this.load(uc) }get(e) { return this._board[$[e]] }findPiece(e) { const t = []; for (let n = $.a8; n <= $.h1; n++) { if (n & 136) { n += 7; continue }!this._board[n] || this._board[n]?.color !== e.color || this._board[n].color === e.color && this._board[n].type === e.type && t.push(Fc(n)) } return t }put({ type: e, color: t }, n) { return this._put({ type: e, color: t }, n) ? (this._updateCastlingRights(), this._updateEnPassantSquare(), this._updateSetup(this.fen()), !0) : !1 }_set(e, t) { this._hash ^= this._pieceKey(e), this._board[e] = t, this._hash ^= this._pieceKey(e) }_put({ type: e, color: t }, n) {
    if (!Sc.includes(e.toLowerCase()) || !(n in $))
      return !1; const r = $[n]; if (e == `k` && this._kings[t] != fc && this._kings[t] != r)
      return !1; const i = this._board[r]; return i && i.type === `k` && (this._kings[i.color] = fc), this._set(r, { type: e, color: t }), e === `k` && (this._kings[t] = r), !0
  }

  _clear(e) { this._hash ^= this._pieceKey(e), delete this._board[e] }remove(e) { const t = this.get(e); return this._clear($[e]), t && t.type === `k` && (this._kings[t.color] = fc), this._updateCastlingRights(), this._updateEnPassantSquare(), this._updateSetup(this.fen()), t }_updateCastlingRights() { this._hash ^= this._castlingKey(); const e = this._board[$.e1]?.type === `k` && this._board[$.e1]?.color === `w`; const t = this._board[$.e8]?.type === `k` && this._board[$.e8]?.color === `b`; (!e || this._board[$.a1]?.type !== `r` || this._board[$.a1]?.color !== `w`) && (this._castling.w &= -65), (!e || this._board[$.h1]?.type !== `r` || this._board[$.h1]?.color !== `w`) && (this._castling.w &= -33), (!t || this._board[$.a8]?.type !== `r` || this._board[$.a8]?.color !== `b`) && (this._castling.b &= -65), (!t || this._board[$.h8]?.type !== `r` || this._board[$.h8]?.color !== `b`) && (this._castling.b &= -33), this._hash ^= this._castlingKey() }_updateEnPassantSquare() {
    if (this._epSquare === fc)
      return; const e = this._epSquare + (this._turn === `w` ? -16 : 16); const t = this._epSquare + (this._turn === `w` ? 16 : -16); const n = [t + 1, t - 1]; if (this._board[e] !== null || this._board[this._epSquare] !== null || this._board[t]?.color !== Ic(this._turn) || this._board[t]?.type !== `p`) { this._hash ^= this._epKey(), this._epSquare = fc; return }n.some(e => !(e & 136) && this._board[e]?.color === this._turn && this._board[e]?.type === `p`) || (this._hash ^= this._epKey(), this._epSquare = fc)
  }

  _attacked(e, t, n) {
    const r = []; for (let i = $.a8; i <= $.h1; i++) {
      if (i & 136) { i += 7; continue } if (this._board[i] === void 0 || this._board[i].color !== e)
        continue; const a = this._board[i]; const o = i - t; if (o === 0)
        continue; const s = o + 119; if (yc[s] & xc[a.type]) {
        if (a.type === `p`) {
          if (o > 0 && a.color === `w` || o <= 0 && a.color === `b`) {
            if (n)
              r.push(Fc(i)); else return !0
          } continue
        } if (a.type === `n` || a.type === `k`) {
          if (n) { r.push(Fc(i)); continue }
          else {
            return !0
          }
        } const e = bc[s]; let c = i + e; let l = !1; for (;c !== t;) { if (this._board[c] != null) { l = !0; break }c += e } if (!l) {
          if (n) { r.push(Fc(i)); continue }
          else {
            return !0
          }
        }
      }
    } return n ? r : !1
  }

  attackers(e, t) { return t ? this._attacked(t, $[e], !0) : this._attacked(this._turn, $[e], !0) }_isKingAttacked(e) { const t = this._kings[e]; return t === -1 ? !1 : this._attacked(Ic(e), t) }hash() { return this._hash.toString(16) }isAttacked(e, t) { return this._attacked(t, $[e]) }isCheck() { return this._isKingAttacked(this._turn) }inCheck() { return this.isCheck() }isCheckmate() { return this.isCheck() && this._moves().length === 0 }isStalemate() { return !this.isCheck() && this._moves().length === 0 }isInsufficientMaterial() {
    const e = { b: 0, n: 0, r: 0, q: 0, k: 0, p: 0 }; const t = []; let n = 0; let r = 0; for (let i = $.a8; i <= $.h1; i++) { if (r = (r + 1) % 2, i & 136) { i += 7; continue } const a = this._board[i]; a && (e[a.type] = a.type in e ? e[a.type] + 1 : 1, a.type === `b` && t.push(r), n++) } if (n === 2 || n === 3 && (e.b === 1 || e.n === 1))
      return !0; if (n === e.b + 2) {
      let e = 0; const n = t.length; for (let r = 0; r < n; r++)e += t[r]; if (e === 0 || e === n)
        return !0
    } return !1
  }

  isThreefoldRepetition() { return this._getPositionCount(this._hash) >= 3 }isDrawByFiftyMoves() { return this._halfMoves >= 100 }isDraw() { return this.isDrawByFiftyMoves() || this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition() }isGameOver() { return this.isCheckmate() || this.isDraw() }moves({ verbose: e = !1, square: t = void 0, piece: n = void 0 } = {}) { const r = this._moves({ square: t, piece: n }); return e ? r.map(e => new dc(this, e)) : r.map(e => this._moveToSan(e, r)) }_moves({ legal: e = !0, piece: t = void 0, square: n = void 0 } = {}) {
    const r = n ? n.toLowerCase() : void 0; const i = t?.toLowerCase(); const a = []; const o = this._turn; const s = Ic(o); let c = $.a8; let l = $.h1; let u = !1; if (r) {
      if (r in $)
        c = l = $[r], u = !0; else return []
    } for (let e = c; e <= l; e++) {
      if (e & 136) { e += 7; continue } if (!this._board[e] || this._board[e].color === s)
        continue; const { type: t } = this._board[e]; let n; if (t === `p`) {
        if (i && i !== t)
          continue; n = e + _c[o][0], this._board[n] || (zc(a, o, e, n, `p`), n = e + _c[o][1], Ac[o] === Mc(e) && !this._board[n] && zc(a, o, e, n, `p`, void 0, Q.BIG_PAWN)); for (let t = 2; t < 4; t++)n = e + _c[o][t], !(n & 136) && (this._board[n]?.color === s ? zc(a, o, e, n, `p`, this._board[n].type, Q.CAPTURE) : n === this._epSquare && zc(a, o, e, n, `p`, `p`, Q.EP_CAPTURE))
      }
      else {
        if (i && i !== t)
          continue; for (let r = 0, i = vc[t].length; r < i; r++) {
          const i = vc[t][r]; for (n = e; n += i, !(n & 136);) {
            if (!this._board[n]) {
              zc(a, o, e, n, t)
            }
            else {
              if (this._board[n].color === o)
                break; zc(a, o, e, n, t, this._board[n].type, Q.CAPTURE); break
            } if (t === `n` || t === `k`)
              break
          }
        }
      }
    } if ((i === void 0 || i === `k`) && (!u || l === this._kings[o])) { if (this._castling[o] & Q.KSIDE_CASTLE) { const e = this._kings[o]; const t = e + 2; !this._board[e + 1] && !this._board[t] && !this._attacked(s, this._kings[o]) && !this._attacked(s, e + 1) && !this._attacked(s, t) && zc(a, o, this._kings[o], t, `k`, void 0, Q.KSIDE_CASTLE) } if (this._castling[o] & Q.QSIDE_CASTLE) { const e = this._kings[o]; const t = e - 2; !this._board[e - 1] && !this._board[e - 2] && !this._board[e - 3] && !this._attacked(s, this._kings[o]) && !this._attacked(s, e - 1) && !this._attacked(s, t) && zc(a, o, this._kings[o], t, `k`, void 0, Q.QSIDE_CASTLE) } } if (!e || this._kings[o] === -1)
      return a; const d = []; for (let e = 0, t = a.length; e < t; e++) this._makeMove(a[e]), this._isKingAttacked(o) || d.push(a[e]), this._undoMove(); return d
  }

  move(e, { strict: t = !1 } = {}) {
    let n = null; if (typeof e == `string`) {
      n = this._moveFromSan(e, t)
    }
    else if (e === null) {
      n = this._moveFromSan(jc, t)
    }
    else if (typeof e == `object`) {
      const t = this._moves(); for (let r = 0, i = t.length; r < i; r++) {
        if (e.from === Fc(t[r].from) && e.to === Fc(t[r].to) && (!(`promotion` in t[r]) || e.promotion === t[r].promotion)) { n = t[r]; break }
      }
    } if (!n)
      throw new Error(typeof e == `string` ? `Invalid move: ${e}` : `Invalid move: ${JSON.stringify(e)}`); if (this.isCheck() && n.flags & Q.NULL_MOVE)
      throw new Error(`Null move not allowed when in check`); const r = new dc(this, n); return this._makeMove(n), this._incPositionCount(), r
  }

  _push(e) { this._history.push({ move: e, kings: { b: this._kings.b, w: this._kings.w }, turn: this._turn, castling: { b: this._castling.b, w: this._castling.w }, epSquare: this._epSquare, halfMoves: this._halfMoves, moveNumber: this._moveNumber }) }_movePiece(e, t) { this._hash ^= this._pieceKey(e), this._board[t] = this._board[e], delete this._board[e], this._hash ^= this._pieceKey(t) }_makeMove(e) {
    const t = this._turn; const n = Ic(t); if (this._push(e), e.flags & Q.NULL_MOVE) { t === `b` && this._moveNumber++, this._halfMoves++, this._turn = n, this._epSquare = fc; return } if (this._hash ^= this._epKey(), this._hash ^= this._castlingKey(), e.captured && (this._hash ^= this._pieceKey(e.to)), this._movePiece(e.from, e.to), e.flags & Q.EP_CAPTURE && (this._turn === `b` ? this._clear(e.to - 16) : this._clear(e.to + 16)), e.promotion && (this._clear(e.to), this._set(e.to, { type: e.promotion, color: t })), this._board[e.to].type === `k`) {
      if (this._kings[t] = e.to, e.flags & Q.KSIDE_CASTLE) { const t = e.to - 1; const n = e.to + 1; this._movePiece(n, t) }
      else if (e.flags & Q.QSIDE_CASTLE) { const t = e.to + 1; const n = e.to - 2; this._movePiece(n, t) } this._castling[t] = 0
    } if (this._castling[t]) {
      for (let n = 0, r = kc[t].length; n < r; n++) {
        if (e.from === kc[t][n].square && this._castling[t] & kc[t][n].flag) { this._castling[t] ^= kc[t][n].flag; break }
      }
    } if (this._castling[n]) {
      for (let t = 0, r = kc[n].length; t < r; t++) {
        if (e.to === kc[n][t].square && this._castling[n] & kc[n][t].flag) { this._castling[n] ^= kc[n][t].flag; break }
      }
    } if (this._hash ^= this._castlingKey(), e.flags & Q.BIG_PAWN) { let r; r = t === `b` ? e.to - 16 : e.to + 16, !(e.to - 1 & 136) && this._board[e.to - 1]?.type === `p` && this._board[e.to - 1]?.color === n || !(e.to + 1 & 136) && this._board[e.to + 1]?.type === `p` && this._board[e.to + 1]?.color === n ? (this._epSquare = r, this._hash ^= this._epKey()) : this._epSquare = fc }
    else {
      this._epSquare = fc
    }e.piece === `p` || e.flags & (Q.CAPTURE | Q.EP_CAPTURE) ? this._halfMoves = 0 : this._halfMoves++, t === `b` && this._moveNumber++, this._turn = n, this._hash ^= lc
  }

  undo() { const e = this._hash; const t = this._undoMove(); if (t) { const n = new dc(this, t); return this._decPositionCount(e), n } return null }_undoMove() {
    const e = this._history.pop(); if (e === void 0)
      return null; this._hash ^= this._epKey(), this._hash ^= this._castlingKey(); const t = e.move; this._kings = e.kings, this._turn = e.turn, this._castling = e.castling, this._epSquare = e.epSquare, this._halfMoves = e.halfMoves, this._moveNumber = e.moveNumber, this._hash ^= this._epKey(), this._hash ^= this._castlingKey(), this._hash ^= lc; const n = this._turn; const r = Ic(n); if (t.flags & Q.NULL_MOVE)
      return t; if (this._movePiece(t.to, t.from), t.piece && (this._clear(t.from), this._set(t.from, { type: t.piece, color: n })), t.captured) {
      if (t.flags & Q.EP_CAPTURE) { let e; e = n === `b` ? t.to - 16 : t.to + 16, this._set(e, { type: `p`, color: r }) }
      else {
        this._set(t.to, { type: t.captured, color: r })
      }
    } if (t.flags & (Q.KSIDE_CASTLE | Q.QSIDE_CASTLE)) { let e, n; t.flags & Q.KSIDE_CASTLE ? (e = t.to + 1, n = t.to - 1) : (e = t.to - 2, n = t.to + 1), this._movePiece(n, e) } return t
  }

  pgn({ newline: e = `
`, maxWidth: t = 0 } = {}) {
    const n = []; let r = !1; for (const t in this._header) this._header[t] && n.push(`[${t} "${this._header[t]}"]${e}`), r = !0; r && this._history.length && n.push(e); const i = (e) => { const t = this._comments[this.fen()]; if (t !== void 0) { const n = e.length > 0 ? ` ` : ``; e = `${e}${n}{${t}}` } return e }; const a = []; for (;this._history.length > 0;)a.push(this._undoMove()); const o = []; let s = ``; for (a.length === 0 && o.push(i(``)); a.length > 0;) {
      s = i(s); const e = a.pop(); if (!e)
        break; if (!this._history.length && e.color === `b`) { const e = `${this._moveNumber}. ...`; s = s ? `${s} ${e}` : e }
      else {
        e.color === `w` && (s.length && o.push(s), s = `${this._moveNumber}.`)
      }s = `${s} ${this._moveToSan(e, this._moves({ legal: !0 }))}`, this._makeMove(e)
    } if (s.length && o.push(i(s)), o.push(this._header.Result || `*`), t === 0)
      return n.join(``) + o.join(` `); const c = function () { return n.length > 0 && n[n.length - 1] === ` ` ? (n.pop(), !0) : !1 }; const l = function (r, i) {
      for (const a of i.split(` `)) {
        if (a) { if (r + a.length > t) { for (;c();)r--; n.push(e), r = 0 }n.push(a), r += a.length, n.push(` `), r++ }
      } return c() && r--, r
    }; let u = 0; for (let r = 0; r < o.length; r++) { if (u + o[r].length > t && o[r].includes(`{`)) { u = l(u, o[r]); continue }u + o[r].length > t && r !== 0 ? (n[n.length - 1] === ` ` && n.pop(), n.push(e), u = 0) : r !== 0 && (n.push(` `), u++), n.push(o[r]), u += o[r].length } return n.join(``)
  }

  header(...e) { for (let t = 0; t < e.length; t += 2) typeof e[t] == `string` && typeof e[t + 1] == `string` && (this._header[e[t]] = e[t + 1]); return this._header }setHeader(e, t) { return this._header[e] = t ?? mc[e] ?? null, this.getHeaders() }removeHeader(e) { return e in this._header ? (this._header[e] = mc[e] || null, !0) : !1 }getHeaders() { const e = {}; for (const [t, n] of Object.entries(this._header))n !== null && (e[t] = n); return e }loadPgn(e, { strict: t = !1, newlineChar: n = `\r?
` } = {}) {
    n !== `\r?
    ` && (e = e.replace(new RegExp(n, `g`), `
`)); const r = ec(e); this.reset(); const i = r.headers; let a = ``; for (const e in i)e.toLowerCase() === `fen` && (a = i[e]), this.header(e, i[e]); if (!t) {
      a && this.load(a, { preserveHeaders: !0 })
    }
    else if (i.SetUp === `1`) {
      if (!(`FEN` in i))
        throw new Error(`Invalid PGN: FEN tag must be supplied with SetUp tag`); this.load(i.FEN, { preserveHeaders: !0 })
    } let o = r.root; for (;o;) {
      if (o.move) {
        const e = this._moveFromSan(o.move, t); if (e == null)
          throw new Error(`Invalid move in PGN: ${o.move}`); this._makeMove(e), this._incPositionCount()
      }o.comment !== void 0 && (this._comments[this.fen()] = o.comment), o = o.variations[0]
    } const s = r.result; s && Object.keys(this._header).length && this._header.Result !== s && this.setHeader(`Result`, s)
  }

  _moveToSan(e, t) {
    let n = ``; if (e.flags & Q.KSIDE_CASTLE) {
      n = `O-O`
    }
    else if (e.flags & Q.QSIDE_CASTLE) {
      n = `O-O-O`
    }
    else if (e.flags & Q.NULL_MOVE) {
      return jc
    }
    else { if (e.piece !== `p`) { const r = Rc(e, t); n += e.piece.toUpperCase() + r }e.flags & (Q.CAPTURE | Q.EP_CAPTURE) && (e.piece === `p` && (n += Fc(e.from)[0]), n += `x`), n += Fc(e.to), e.promotion && (n += `=${e.promotion.toUpperCase()}`) } return this._makeMove(e), this.isCheck() && (this.isCheckmate() ? n += `#` : n += `+`), this._undoMove(), n
  }

  _moveFromSan(e, t = !1) {
    let n = Vc(e); if (t || (n === `0-0` ? n = `O-O` : n === `0-0-0` && (n = `O-O-O`)), n == jc)
      return { color: this._turn, from: 0, to: 0, piece: `k`, flags: Q.NULL_MOVE }; let r = Bc(n); let i = this._moves({ legal: !0, piece: r }); for (let e = 0, t = i.length; e < t; e++) {
      if (n === Vc(this._moveToSan(i[e], i)))
        return i[e]
    } if (t)
      return null; let a; let o; let s; let c; let l; let u = !1; if (o = n.match(/([pnbrqkPNBRQK])?([a-h][1-8])x?-?([a-h][1-8])([qrbnQRBN])?/), o ? (a = o[1], s = o[2], c = o[3], l = o[4], s.length == 1 && (u = !0)) : (o = n.match(/([pnbrqkPNBRQK])?([a-h]?[1-8]?)x?-?([a-h][1-8])([qrbnQRBN])?/), o && (a = o[1], s = o[2], c = o[3], l = o[4], s.length == 1 && (u = !0))), r = Bc(n), i = this._moves({ legal: !0, piece: a || r }), !c)
      return null; for (let e = 0, t = i.length; e < t; e++) {
      if (!s) {
        if (n === Vc(this._moveToSan(i[e], i)).replace(`x`, ``))
          return i[e]
      }
      else if ((!a || a.toLowerCase() == i[e].piece) && $[s] == i[e].from && $[c] == i[e].to && (!l || l.toLowerCase() == i[e].promotion)) {
        return i[e]
      }
      else if (u) {
        const t = Fc(i[e].from); if ((!a || a.toLowerCase() == i[e].piece) && $[c] == i[e].to && (s == t[0] || s == t[1]) && (!l || l.toLowerCase() == i[e].promotion))
          return i[e]
      }
    } return null
  }

  ascii() {
    let e = `   +------------------------+
`;for (let t = $.a8; t <= $.h1; t++) {
      if (Nc(t) === 0 && (e += ` ${`87654321`[Mc(t)]} |`), this._board[t]) { const n = this._board[t].type; const r = this._board[t].color === `w` ? n.toUpperCase() : n.toLowerCase(); e += ` ${r} ` }
      else {
        e += ` . `
      }t + 1 & 136 && (e += `|
`, t += 8)
    } return e += `   +------------------------+
`, e += `     a  b  c  d  e  f  g  h`, e
  }

  perft(e) { const t = this._moves({ legal: !1 }); let n = 0; const r = this._turn; for (let i = 0, a = t.length; i < a; i++) this._makeMove(t[i]), this._isKingAttacked(r) || (e - 1 > 0 ? n += this.perft(e - 1) : n++), this._undoMove(); return n }setTurn(e) { return this._turn == e ? !1 : (this.move(`--`), !0) }turn() { return this._turn }board() { const e = []; let t = []; for (let n = $.a8; n <= $.h1; n++) this._board[n] == null ? t.push(null) : t.push({ square: Fc(n), type: this._board[n].type, color: this._board[n].color }), n + 1 & 136 && (e.push(t), t = [], n += 8); return e }squareColor(e) { if (e in $) { const t = $[e]; return (Mc(t) + Nc(t)) % 2 == 0 ? `light` : `dark` } return null }history({ verbose: e = !1 } = {}) {
    const t = []; const n = []; for (;this._history.length > 0;)t.push(this._undoMove()); for (;;) {
      const r = t.pop(); if (!r)
        break; e ? n.push(new dc(this, r)) : n.push(this._moveToSan(r, this._moves())), this._makeMove(r)
    } return n
  }

  _getPositionCount(e) { return this._positionCount.get(e) ?? 0 }_incPositionCount() { this._positionCount.set(this._hash, (this._positionCount.get(this._hash) ?? 0) + 1) }_decPositionCount(e) { const t = this._positionCount.get(e) ?? 0; t === 1 ? this._positionCount.delete(e) : this._positionCount.set(e, t - 1) }_pruneComments() {
    const e = []; const t = {}; const n = (e) => { e in this._comments && (t[e] = this._comments[e]) }; for (;this._history.length > 0;)e.push(this._undoMove()); for (n(this.fen()); ;) {
      const t = e.pop(); if (!t)
        break; this._makeMove(t), n(this.fen())
    } this._comments = t
  }

  getComment() { return this._comments[this.fen()] }setComment(e) { this._comments[this.fen()] = e.replace(`{`, `[`).replace(`}`, `]`) }deleteComment() { return this.removeComment() }removeComment() { const e = this._comments[this.fen()]; return delete this._comments[this.fen()], e }getComments() { return this._pruneComments(), Object.keys(this._comments).map(e => ({ fen: e, comment: this._comments[e] })) }deleteComments() { return this.removeComments() }removeComments() { return this._pruneComments(), Object.keys(this._comments).map((e) => { const t = this._comments[e]; return delete this._comments[e], { fen: e, comment: t } }) }setCastlingRights(e, t) { for (const n of [`k`, `q`])t[n] !== void 0 && (t[n] ? this._castling[e] |= Oc[n] : this._castling[e] &= ~Oc[n]); this._updateCastlingRights(); const n = this.getCastlingRights(e); return (t.k === void 0 || t.k === n.k) && (t.q === void 0 || t.q === n.q) }getCastlingRights(e) { return { k: (this._castling[e] & Oc.k) !== 0, q: (this._castling[e] & Oc.q) !== 0 } }moveNumber() { return this._moveNumber }
}; const Uc = 1e5; const Wc = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }; const Gc = 20; const Kc = 50; const qc = 100; const Jc = 200; const Yc = 150; const Xc = 300; const Zc = 100; function Qc(e) { return e ? e.mate === null ? e.cp ?? 0 : e.mate > 0 ? Uc - e.mate : -Uc - e.mate : 0 } function $c(e, t) {
  try { const n = new Hc(e).move({ from: t.slice(0, 2), to: t.slice(2, 4), promotion: t.slice(4, 5) || void 0 }); return n.captured ? Wc[n.captured] ?? 0 : 0 }
  catch { return 0 }
} function el(e, t, n) {
  const r = e.moveUci === t.bestMove; const i = Qc(t.lines[0]?.score); const a = e.isCheckmate ? Uc : -Qc(n.lines[0]?.score); const o = Math.max(0, i - a); if (r && a >= 0) {
    const t = $c(e.fenAfter, n.bestMove); const r = $c(e.fenBefore, e.moveUci); if (t >= 3 && r < t)
      return { classification: Ps.Brilliant, cpLoss: o }
  } return r && t.lines.length >= 2 && Qc(t.lines[0]?.score) - Qc(t.lines[1]?.score) >= Yc ? { classification: Ps.Great, cpLoss: o } : !r && i >= Xc && a < Zc ? { classification: Ps.Miss, cpLoss: o } : r ? { classification: Ps.Best, cpLoss: o } : o < Gc ? { classification: Ps.Excellent, cpLoss: o } : o < Kc ? { classification: Ps.Good, cpLoss: o } : o < qc ? { classification: Ps.Inaccuracy, cpLoss: o } : o < Jc ? { classification: Ps.Mistake, cpLoss: o } : { classification: Ps.Blunder, cpLoss: o }
} const tl = class extends Error {constructor() { super(`Analysis superseded by a newer request.`), this.name = `AnalysisSupersededError` }}; const nl = 20; const rl = 1e4; const il = 3e4; function al(e) {
  const t = e.split(/\s+/); if (t[0] !== `info`)
    return null; let n = null; let r = 1; let i = null; let a = null; for (let e = 1; e < t.length; e++) {
    const o = t[e]; if (o === `depth`) {
      n = Number(t[++e])
    }
    else if (o === `multipv`) {
      r = Number(t[++e])
    }
    else if (o === `score`) { const n = t[++e]; const r = Number(t[++e]); n === `cp` ? i = { cp: r, mate: null } : n === `mate` && (i = { cp: null, mate: r }) }
    else if (o === `pv`) { a = t.slice(e + 1); break }
  } return n === null || i === null || a === null || a.length === 0 ? null : { depth: n, rank: r, score: i, pv: a }
} function ol(e) {
  const t = e.split(/\s+/); if (t[0] !== `bestmove`)
    return null; const n = t[1]; return !n || n === `(none)` ? null : n
} function sl(e) {
  let t = `uninitialized`; let n = null; let r = null; let i = null; let a = null; let o = new Map(); let s = 1; let c = nl; function l() { i &&= (clearTimeout(i), null) } function u(e) { l(); const t = r; n = null, r = null, t?.(e) } function d(e) { e?.timeout && (clearTimeout(e.timeout), e.timeout = null) } function f(e, t) { const n = [...o.values()].sort((e, t) => e.rank - t.rank); return { fen: e, depth: n.reduce((e, t) => Math.max(e, t.depth), 0), lines: n, bestMove: t ?? n[0]?.pv[0] ?? `` } } function p(n) { o = new Map(), n.multipv !== s && (e.send(`setoption name MultiPV value ${n.multipv}`), s = n.multipv), n.skillLevel !== c && (e.send(`setoption name Skill Level value ${n.skillLevel}`), c = n.skillLevel), e.send(`position fen ${n.fen}`), e.send(`go depth ${n.depth}`), t = `searching` } function m(e) { if (t === `searching`) { const n = a; t = `idle`, a = null, d(n), n?.resolve(f(n.fen, e)); return }t === `stopping` && (t = `idle`, a && p(a)) } function h(i) {
    const a = i.trim(); if (a !== ``) {
      if (t === `uninitialized`) {
        if (a === `uciok`) {
          e.send(`isready`)
        }
        else if (a === `readyok`) { t = `idle`, l(); const e = n; n = null, r = null, e?.() } return
      } if (a.startsWith(`bestmove`)) { m(ol(a)); return } if (t === `searching`) { const e = al(a); if (e) { const t = o.get(e.rank); (!t || e.depth >= t.depth) && o.set(e.rank, { score: e.score, pv: e.pv, depth: e.depth, rank: e.rank }) } }
    }
  } const g = e.onLine(h); function _() { return new Promise((a, o) => { n = a, r = o, l(), i = setTimeout(() => { t === `uninitialized` && u(new Error(`Stockfish initialization timed out.`)) }, rl), e.send(`uci`) }) } function v(n, r) { return new Promise((i, o) => { if (!Qo(Fs, n).success) { o(new Error(`Malformed FEN: "${n}"`)); return } if (t === `uninitialized`) { o(new Error(`Engine not initialized; await init() first.`)); return } const s = { fen: n, depth: r?.depth ?? 15, multipv: r?.multipv ?? 1, skillLevel: r?.skillLevel ?? nl, resolve: i, reject: o, timeout: null }; s.timeout = setTimeout(() => { a === s && (a = null, t = `stopping`, e.send(`stop`), o(new Error(`Stockfish analysis timed out.`))) }, il), a && (d(a), a.reject(new tl())), a = s, t === `idle` ? p(s) : t === `searching` && (e.send(`stop`), t = `stopping`) }) } function y() { l(), r &&= (r(new Error(`Engine disposed.`)), n = null, null), g(), e.terminate(), a &&= (d(a), a.reject(new Error(`Engine disposed.`)), null) } return { init: _, analyze: v, dispose: y }
} const cl = `engine/stockfish-18-lite-single.js`; function ll() { const e = new Worker(new URL(cl, document.baseURI)); const t = new Set(); return e.addEventListener(`message`, (e) => { for (const n of t)n(e.data) }), { send: t => e.postMessage(t), onLine: e => (t.add(e), () => t.delete(e)), terminate: () => e.terminate() } } const ul = 14; const dl = 3; const fl = 1e5; function pl(e, t) {
  const n = e.fenAfter.split(` `)[1] === `w` ? 1 : -1; if (e.isCheckmate)
    return -n * fl; const r = t.lines[0]?.score; return r ? r.mate === null ? n * (r.cp ?? 0) : n * (r.mate > 0 ? fl : -fl) : 0
} function ml(e, t) { const n = new Hc(e); return n.move({ from: t.slice(0, 2), to: t.slice(2, 4), promotion: t.length > 4 ? t.slice(4, 5) : void 0 }), { fenBefore: e, fenAfter: n.fen(), moveUci: t, isCheck: n.isCheck(), isCheckmate: n.isCheckmate() } } function hl() {
  const e = J(!1); const t = J(!1); const n = J(!1); const r = J(null); const i = J(null); const a = Ut(null); const o = J(null); const s = sl(ll()); const c = sl(ll()); let l = 0; function u(e, t, n, r) { e.init().then(() => { t.value = !0 }).catch((e) => { n.value = Ds(e) ?? r }) }nr(() => { u(s, e, r, `Review engine failed to start.`), u(c, t, i, `Opponent engine failed to start.`) }), we(() => { s.dispose(), c.dispose() }); async function d(e) { const t = await s.analyze(e.fenBefore, { depth: ul, multipv: dl }); const n = e.isCheckmate ? { fen: e.fenAfter, depth: 0, lines: [], bestMove: `` } : await s.analyze(e.fenAfter, { depth: ul, multipv: 1 }); return { classified: el(e, t, n), whiteEvalCp: pl(e, n) } } async function f(t) {
    if (t === null)
      return l += 1, n.value = !1, a.value = null, o.value = null, null; if (!e.value)
      return null; const i = ++l; n.value = !0, r.value = null; try { const { classified: e, whiteEvalCp: n } = await d(t); return i === l ? (a.value = e, o.value = n, e) : null }
    catch (e) { return i !== l || e instanceof tl || (r.value = Ds(e) ?? `Engine analysis failed.`), null }
    finally { i === l && (n.value = !1) }
  } async function p(e, t, n, r) { return s.analyze(e, { depth: t ?? ul, multipv: n ?? 1, skillLevel: r }) } async function m(e, t, n) { return c.analyze(e, { depth: t ?? ul, multipv: 1, skillLevel: n }) } async function h(e, t) { const { classified: n } = await d(ml(e, t)); return n } return { ready: e, opponentReady: t, analyzing: n, error: r, opponentError: i, lastMove: a, evaluation: o, review: f, analyzePosition: p, analyzeOpponentMove: m, explainMove: h }
} function gl(e) {
  const t = e ? new Hc(e) : new Hc(); const n = J(t.fen()); const r = J(null); const i = J(null); function a() { n.value = t.fen() } const o = ba(() => (n.value, t.turn())); const s = ba(() => (n.value, t.board().map((e, t) => e.map((e, n) => ({ square: `${String.fromCharCode(97 + n)}${8 - t}`, piece: e ? { type: e.type, color: e.color } : null }))))); const c = ba(() => (n.value, r.value ? new Set(t.moves({ square: r.value, verbose: !0 }).map(e => e.to)) : new Set())); const l = ba(() => { n.value; const e = t.history({ verbose: !0 }).at(-1); return e ? { from: e.from, to: e.to } : null }); const u = ba(() => { n.value; const e = t.history({ verbose: !0 }).at(-1); return e ? { fenBefore: e.before, fenAfter: e.after, moveUci: e.lan, isCheck: t.isCheck(), isCheckmate: t.isCheckmate() } : null }); const d = ba(() => (n.value, t.isCheckmate() ? `checkmate` : t.isStalemate() ? `stalemate` : t.isDraw() ? `draw` : t.isCheck() ? `check` : `playing`)); const f = ba(() => {
    if (n.value, !t.isCheck())
      return null; for (const e of t.board()) {
      for (const n of e) {
        if (n && n.type === `k` && n.color === t.turn())
          return n.square
      }
    } return null
  }); function p(e) { const n = t.get(e); return n ? n.color : null } function m(e, n) { return t.moves({ square: e, verbose: !0 }).some(e => e.to === n && e.promotion !== void 0) } function h(e, n, o) {
    try { return t.move({ from: e, to: n, promotion: o }), r.value = null, i.value = null, a(), !0 }
    catch { return !1 }
  } function g(e) {
    if (i.value)
      return; const n = r.value; if (n === null) { p(e) === t.turn() && (r.value = e); return } if (e === n) { r.value = null; return } if (c.value.has(e)) { m(n, e) ? i.value = { from: n, to: e } : h(n, e); return }r.value = p(e) === t.turn() ? e : null
  } function _(e) { const t = i.value; t && h(t.from, t.to, e) } function v() { t.reset(), r.value = null, i.value = null, a() } return { fen: n, turn: o, cells: s, selected: r, legalTargets: c, lastMove: l, lastMoveContext: u, checkSquare: f, status: d, pendingPromotion: i, selectSquare: g, choosePromotion: _, playMove: h, reset: v }
} const _l = { beginner: 5, intermediate: 10, strong: 15, monster: 20 }; function vl(e, t) {
  const n = J(`manual`); const r = J(`w`); const i = J(`intermediate`); const a = J(void 0); const o = J(!1); let s = 0; function c() { return r.value === `w` ? `b` : `w` } function l(e) { return n.value === `stockfish` ? (e === `white` ? `w` : `b`) === c() : !1 } const u = ba(() => o.value || e.status.value !== `playing` && e.status.value !== `check` ? !0 : n.value === `stockfish` && e.turn.value === c()); async function d() {
    if (n.value !== `stockfish` || !t.opponentReady.value || e.status.value !== `playing` && e.status.value !== `check` || e.turn.value !== c() || o.value)
      return; const r = ++s; const l = e.fen.value; const u = c(); o.value = !0; try {
      const o = await t.analyzeOpponentMove(l, _l[i.value], a.value); if (r !== s || n.value !== `stockfish` || e.fen.value !== l || e.turn.value !== u)
        return; const c = o.bestMove; if (!c)
        return; e.playMove(c.slice(0, 2), c.slice(2, 4), c.length > 4 ? c.slice(4, 5) : void 0)
    }
    catch (e) { console.error(`[useChessOpponent] engine move failed:`, Ds(e)) }
    finally { r === s && (o.value = !1) }
  } return { mode: n, userColor: r, strength: i, skillLevel: a, thinking: o, inputLocked: u, isEngineMove: l, maybeRespond: d }
} const yl = `airi-chess-companion-state`; const bl = 20; const xl = 2; const Sl = { gamesPlayed: 0, wins: 0, losses: 0, draws: 0 }; function Cl() {
  try {
    const e = typeof localStorage < `u` ? localStorage.getItem(yl) : null; if (!e)
      return { ...Sl }; const t = JSON.parse(e); return { gamesPlayed: typeof t.gamesPlayed == `number` ? t.gamesPlayed : 0, wins: typeof t.wins == `number` ? t.wins : 0, losses: typeof t.losses == `number` ? t.losses : 0, draws: typeof t.draws == `number` ? t.draws : 0 }
  }
  catch { return { ...Sl } }
} function wl(e) {
  try { typeof localStorage < `u` && localStorage.setItem(yl, JSON.stringify(e)) }
  catch {}
} function Tl() { const e = Cl(); const t = J(e.gamesPlayed); const n = J(e.wins); const r = J(e.losses); const i = J(e.draws); Nn([t, n, r, i], () => { wl({ gamesPlayed: t.value, wins: n.value, losses: r.value, draws: i.value }) }); const a = ba(() => Math.min(bl, 1 + Math.floor(t.value / xl))); function o(e) { t.value += 1, e === `win` ? n.value += 1 : e === `loss` ? r.value += 1 : i.value += 1 } function s() { t.value = 0, n.value = 0, r.value = 0, i.value = 0 } return { gamesPlayed: t, wins: n, losses: r, draws: i, aiLevel: a, recordResult: o, resetProgress: s } } const El = 150; function Dl() { return 4e4 + Math.floor(Math.random() * 20001) } function Ol(e, t) { return e >= El && t <= -El || e <= -El && t >= El } function kl(e) { const { emit: t, timer: n } = e; const r = e.idleDelayMs ?? Dl; let i = null; let a = !1; let o = null; function s() { i?.(), i = null } function c() { s(), !a && (i = n.schedule(r(), () => { i = null, t({ kind: `user_idle` }), c() })) } function l() { a = !1, o = null, t({ kind: `session_greeting` }), t({ kind: `game_start` }), c() } function u() { a = !1, o = null, t({ kind: `game_start` }), c() } function d(e) { if (s(), t({ kind: `move`, classification: e.classification, cpLoss: e.cpLoss, moveUci: e.moveUci, mover: e.mover }), e.isCheck && !e.isCheckmate && t({ kind: `in_check` }), o !== null && Ol(o, e.whiteEvalCp) && t({ kind: `momentum_swing`, fromCp: o, toCp: e.whiteEvalCp }), o = e.whiteEvalCp, e.status === `playing` || e.status === `check`) { c(); return } if (a = !0, e.status === `checkmate`) { const n = e.mover; t({ kind: `checkmate`, winner: n }), t({ kind: `game_end`, result: `checkmate`, winner: n }); return }t({ kind: `game_end`, result: e.status, winner: null }) } function f() { s() } return { begin: l, submitMove: d, restart: u, dispose: f } } const Al = 8; function jl(e, t, n = {}) { const r = J([]); const i = kl({ emit: (e) => { r.value = [...r.value, e].slice(-Al), n.onEvent?.(e) }, timer: { schedule: (e, t) => { const n = setTimeout(t, e); return () => clearTimeout(n) } } }); return nr(() => i.begin()), we(() => i.dispose()), Nn(e.lastMoveContext, async (a) => { if (a === null) { r.value = [], await t.review(null), i.restart(); return } const o = await t.review(a); o !== null && (i.submitMove({ classification: o.classification, cpLoss: o.cpLoss, moveUci: a.moveUci, mover: a.fenBefore.split(` `)[1] === `w` ? `white` : `black`, isCheck: a.isCheck, isCheckmate: a.isCheckmate, status: e.status.value, whiteEvalCp: t.evaluation.value ?? 0 }), await n.onAfterMove?.()) }), { events: r } } const Ml = { class: H([`flex items-start gap-6`, `select-none`]) }; const Nl = { class: H([`flex flex-col items-center gap-3`]) }; const Pl = { class: H([`flex flex-col items-center gap-2`, `text-xs text-neutral-700`]) }; const Fl = { class: H([`flex items-center gap-3`]) }; const Il = { class: H([`flex items-center gap-1`]) }; const Ll = { class: H([`flex items-center gap-1`]) }; const Rl = { key: 0, class: H([`flex items-center gap-3`]) }; const zl = { class: H([`flex items-center gap-1`]) }; const Bl = [`disabled`]; const Vl = { class: H([`flex items-center gap-1`]) }; const Hl = { key: 1, class: H([`flex items-center gap-3`, `text-neutral-700`]) }; const Ul = { class: H([`font-medium`]) }; const Wl = { class: H([`text-sm font-medium text-neutral-700`]) }; const Gl = { key: 0, class: H([`ml-2 text-neutral-400`]) }; const Kl = [`disabled`, `onClick`]; const ql = { key: 0, class: H([`absolute inset-0`, `bg-[#f6f669]/45`]) }; const Jl = { key: 1, class: H([`absolute inset-0`, `bg-[#e33]/55`]) }; const Yl = { key: 2, class: H([`absolute inset-0`, `bg-[#f6f669]/70`]) }; const Xl = { key: 4, class: H([`absolute inset-0`, `ring-4 ring-inset ring-[#a855f7]/80`]) }; const Zl = [`src`, `alt`]; const Ql = { key: 0, class: H([`absolute inset-0 z-10`, `flex items-center justify-center`, `bg-black/55`]) }; const $l = { class: H([`flex gap-2`, `rounded-lg bg-white p-3 shadow-xl`]) }; const eu = [`onClick`]; const tu = [`src`, `alt`]; const nu = { key: 1, class: H([`absolute left-1/2 top-2 z-20 -translate-x-1/2`, `rounded-full bg-black/70 px-3 py-1`, `text-sm text-white whitespace-nowrap`, `pointer-events-none`]) }; const ru = { class: H([`text-sm text-neutral-500`, `h-5`]) }; const iu = { class: H([`w-56`, `flex flex-col gap-1`]) }; const au = { key: 0, class: H([`text-sm text-neutral-400`]) }; const ou = 0.3; const su = Vn({ __name: `ChessBoard`, props: { initialFen: {} }, setup(e) {
  const t = gl(e.initialFen); const { cells: n, turn: r, selected: i, legalTargets: a, lastMove: o, checkSquare: s, status: c, pendingPromotion: l, selectSquare: u, choosePromotion: d, reset: f } = t; const p = hl(); const m = Ns(p); const h = vl(t, p); const { mode: g, userColor: _, strength: v, skillLevel: y, thinking: b, inputLocked: x } = h; const S = J(`coach`); const C = J(`brief`); Nn(S, (e) => { e === `companion` && (g.value = `stockfish`, v.value = `intermediate`, C.value = `brief`) }, { immediate: !0 }); const { gamesPlayed: w, wins: T, losses: E, draws: D, aiLevel: O, recordResult: ee, resetProgress: te } = Tl(); Nn([S, O], ([e, t]) => { y.value = e === `companion` ? Math.min(20, Math.max(0, t)) : void 0 }, { immediate: !0 }), Nn(c, (e, t) => { S.value === `companion` && e !== t && (e === `checkmate` ? ee((r.value === `w` ? `b` : `w`) === _.value ? `win` : `loss`) : (e === `stalemate` || e === `draw`) && ee(`draw`)) }); const ne = Ut(null); const k = J(null); let A; function re(e) { k.value = e, clearTimeout(A), A = setTimeout(() => { k.value = null }, 3500) } function j(e) { Math.random() < ou ? m.requestAiTurn(Bs(e, C.value)) : re(Gs()) } function M(e) { if (e.kind === `move` && h.isEngineMove(e.mover)) { S.value === `companion` && j(e.moveUci); return } const t = Hs(e, C.value); if (t === null) { S.value === `companion` && e.kind === `move` && re(Ks()); return }e.kind === `move` && (ne.value = { from: e.moveUci.slice(0, 2), to: e.moveUci.slice(2, 4) }), m.requestAiTurn(t) } const { events: N } = jl(t, p, { onEvent: M, onAfterMove: () => h.maybeRespond() }); Nn([g, _], () => { h.maybeRespond() }); async function ie() { ne.value = null, k.value = null, f(), await h.maybeRespond() } const P = Object.fromEntries(Object.entries(Object.assign({ '../assets/pieces/cardinal/bB.svg': vo, '../assets/pieces/cardinal/bK.svg': yo, '../assets/pieces/cardinal/bN.svg': bo, '../assets/pieces/cardinal/bP.svg': xo, '../assets/pieces/cardinal/bQ.svg': So, '../assets/pieces/cardinal/bR.svg': Co, '../assets/pieces/cardinal/wB.svg': wo, '../assets/pieces/cardinal/wK.svg': To, '../assets/pieces/cardinal/wN.svg': Eo, '../assets/pieces/cardinal/wP.svg': Do, '../assets/pieces/cardinal/wQ.svg': Oo, '../assets/pieces/cardinal/wR.svg': ko })).map(([e, t]) => [e.split(`/`).pop().replace(`.svg`, ``), t])); const ae = [`q`, `r`, `b`, `n`]; const F = ba(() => { const e = r.value === `w` ? `White` : `Black`; switch (c.value) { case `checkmate`:return `Checkmate — ${r.value === `w` ? `Black` : `White`} wins`; case `stalemate`:return `Stalemate — draw`; case `draw`:return `Draw`; case `check`:return `${e} to move — check`; default:return `${e} to move` } }); const I = ba(() => {
    if (p.error.value)
      return `Engine error: ${p.error.value}`; if (g.value === `stockfish` && p.opponentError.value)
      return `Opponent engine error: ${p.opponentError.value}`; if (!p.ready.value)
      return `Engine loading…`; if (g.value === `stockfish` && !p.opponentReady.value)
      return `Opponent engine loading…`; if (p.analyzing.value)
      return `Analyzing…`; const e = p.lastMove.value; if (!e)
      return `Engine ready`; const t = e.classification[0].toUpperCase() + e.classification.slice(1); return e.cpLoss > 0 ? `${t} · −${e.cpLoss} cp` : t
  }); const L = ba(() => [...N.value].reverse()); const R = ba(() => { const e = n.value; return _.value === `w` ? e : e.map(e => [...e].reverse()).reverse() }); function oe(e, t) { return P[`${e}${t.toUpperCase()}`] } function z(e, t) { return `${e === `w` ? `white` : `black`} ${{ k: `king`, q: `queen`, r: `rook`, b: `bishop`, n: `knight`, p: `pawn` }[t]}` } function B(e) { const t = o.value; return t !== null && (t.from === e || t.to === e) } function ce(e) { const t = ne.value; return t !== null && (t.from === e || t.to === e) } function le(e) { switch (e.kind) { case `session_greeting`:return `Session greeting`; case `game_start`:return `Game start`; case `game_end`:return `Game end — ${e.result}`; case `checkmate`:return `Checkmate — ${e.winner} wins`; case `in_check`:return `Check`; case `user_idle`:return `User idle`; case `momentum_swing`:return `Momentum swing (${e.fromCp} → ${e.toCp})`; case `move`:return `Move ${e.moveUci} — ${e.classification}`; default:return `Unknown event` } } return (e, t) => (X(), Ii(`div`, Ml, [Z(`div`, Nl, [Z(`div`, Pl, [Z(`div`, Fl, [Z(`label`, Il, [t[8] ||= Z(`span`, null, `Mode`, -1), Dn(Z(`select`, { 'onUpdate:modelValue': t[0] ||= e => S.value = e, 'class': H([`rounded border border-neutral-300 bg-white px-2 py-1`]) }, [...t[7] ||= [Z(`option`, { value: `coach` }, `Coach`, -1), Z(`option`, { value: `companion` }, `Companion`, -1)]], 512), [[co, S.value]])]), Z(`label`, Ll, [t[10] ||= Z(`span`, null, `Play as`, -1), Dn(Z(`select`, { 'onUpdate:modelValue': t[1] ||= e => Ht(_) ? _.value = e : null, 'class': H([`rounded border border-neutral-300 bg-white px-2 py-1`]) }, [...t[9] ||= [Z(`option`, { value: `w` }, `White`, -1), Z(`option`, { value: `b` }, `Black`, -1)]], 512), [[co, Y(_)]])])]), S.value === `coach` ? (X(), Ii(`div`, Rl, [Z(`label`, zl, [t[12] ||= Z(`span`, null, `Opponent`, -1), Dn(Z(`select`, { 'onUpdate:modelValue': t[2] ||= e => Ht(g) ? g.value = e : null, 'class': H([`rounded border border-neutral-300 bg-white px-2 py-1`]) }, [...t[11] ||= [Z(`option`, { value: `manual` }, `Pass & play`, -1), Z(`option`, { value: `stockfish` }, `Stockfish`, -1)]], 512), [[co, Y(g)]])]), Z(`label`, { class: H([`flex items-center gap-1`, { 'opacity-50': Y(g) === `manual` }]) }, [t[14] ||= Z(`span`, null, `Strength`, -1), Dn(Z(`select`, { 'onUpdate:modelValue': t[3] ||= e => Ht(v) ? v.value = e : null, 'disabled': Y(g) === `manual`, 'class': H([`rounded border border-neutral-300 bg-white px-2 py-1`]) }, [...t[13] ||= [Z(`option`, { value: `beginner` }, `Beginner`, -1), Z(`option`, { value: `intermediate` }, `Intermediate`, -1), Z(`option`, { value: `strong` }, `Strong`, -1), Z(`option`, { value: `monster` }, `Monster`, -1)]], 8, Bl), [[co, Y(v)]])], 2), Z(`label`, Vl, [t[16] ||= Z(`span`, null, `Commentary`, -1), Dn(Z(`select`, { 'onUpdate:modelValue': t[4] ||= e => C.value = e, 'class': H([`rounded border border-neutral-300 bg-white px-2 py-1`]) }, [...t[15] ||= [Z(`option`, { value: `brief` }, `Brief`, -1), Z(`option`, { value: `interactive` }, `Interactive`, -1)]], 512), [[co, C.value]])])])) : (X(), Ii(`div`, Hl, [Z(`span`, Ul, `AIRI Lv.${ve(Y(O))}`, 1), t[17] ||= Z(`span`, { class: H([`text-neutral-400`]) }, `·`, -1), Z(`span`, null, `Games ${ve(Y(w))}`, 1), t[18] ||= Z(`span`, { class: H([`text-neutral-400`]) }, `·`, -1), Z(`span`, null, `W/L/D ${ve(Y(T))}/${ve(Y(E))}/${ve(Y(D))}`, 1), Z(`button`, { type: `button`, class: H([`text-neutral-400 underline hover:text-neutral-600`]), onClick: t[5] ||= e => Y(te)() }, ` reset progress `)]))]), Z(`p`, Wl, [Ki(ve(F.value), 1), Y(b) ? (X(), Ii(`span`, Gl, `· Stockfish thinking…`)) : qi(``, !0)]), Z(`div`, { class: H([`relative`, `rounded-md overflow-hidden shadow-xl`]), style: se({ backgroundImage: `url(${Y(Ao)})`, backgroundSize: `512px 512px` }) }, [(X(!0), Ii(Ei, null, fr(R.value, (e, t) => (X(), Ii(`div`, { key: t, class: H([`flex`]) }, [(X(!0), Ii(Ei, null, fr(e, e => (X(), Ii(`button`, { key: e.square, type: `button`, class: H([`relative h-16 w-16`, `flex items-center justify-center`, `bg-transparent`, Y(x) ? `cursor-not-allowed` : `cursor-pointer`]), disabled: Y(x), onClick: t => Y(u)(e.square) }, [B(e.square) ? (X(), Ii(`span`, ql)) : qi(``, !0), e.square === Y(s) ? (X(), Ii(`span`, Jl)) : qi(``, !0), e.square === Y(i) ? (X(), Ii(`span`, Yl)) : qi(``, !0), Y(a).has(e.square) ? (X(), Ii(`span`, { key: 3, class: H([`absolute`, e.piece ? `inset-1 rounded-full ring-4 ring-black/25` : `h-5 w-5 rounded-full bg-black/30`]) }, null, 2)) : qi(``, !0), ce(e.square) ? (X(), Ii(`span`, Xl)) : qi(``, !0), e.piece ? (X(), Ii(`img`, { key: 5, src: oe(e.piece.color, e.piece.type), alt: z(e.piece.color, e.piece.type), class: H([`relative h-14 w-14`, `drop-shadow-md`, `pointer-events-none`]) }, null, 8, Zl)) : qi(``, !0)], 10, Kl))), 128))]))), 128)), Y(l) ? (X(), Ii(`div`, Ql, [Z(`div`, $l, [(X(), Ii(Ei, null, fr(ae, e => Z(`button`, { key: e, type: `button`, class: H([`h-14 w-14`, `flex items-center justify-center`, `rounded bg-neutral-100 hover:bg-neutral-200`]), onClick: t => Y(d)(e) }, [Z(`img`, { src: oe(Y(r), e), alt: z(Y(r), e), class: H([`h-12 w-12`]) }, null, 8, tu)], 8, eu)), 64))])])) : qi(``, !0), k.value ? (X(), Ii(`div`, nu, ve(k.value), 1)) : qi(``, !0)], 4), Z(`p`, ru, ve(I.value), 1), Z(`button`, { type: `button`, class: H([`rounded px-4 py-1.5`, `text-sm font-medium text-white`, `bg-neutral-700 hover:bg-neutral-600`]), onClick: t[6] ||= e => ie() }, ` Reset `)]), Z(`div`, iu, [t[19] ||= Z(`p`, { class: H([`text-xs font-semibold uppercase tracking-wide text-neutral-400`]) }, ` Events `, -1), L.value.length === 0 ? (X(), Ii(`p`, au, ` No events yet. `)) : qi(``, !0), (X(!0), Ii(Ei, null, fr(L.value, (e, t) => (X(), Ii(`p`, { key: `${t}-${e.kind}`, class: H([`text-sm text-neutral-600`]) }, ve(le(e)), 1))), 128))])]))
} }); const cu = { class: H([`h-screen w-screen`, `flex items-center justify-center`, `bg-neutral-100`]) }; ho(Vn({ __name: `App`, setup(e) { return (e, t) => (X(), Ii(`div`, cu, [Hi(su)])) } })).mount(`#app`)
