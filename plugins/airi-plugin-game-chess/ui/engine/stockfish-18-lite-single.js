/*!
 * Stockfish.js 18 (c) 2026, Chess.com, LLC
 * https://github.com/nmrugg/stockfish.js
 * License: GPLv3
 *
 * Based on Stockfish (c) T. Romstad, M. Costalba, J. Kiiski, G. Linscott and other contributors.
 * https://github.com/official-stockfish/Stockfish
 *
 * Nets by Linmiao Xu (linrock)
 * https://tests.stockfishchess.org/nns?network_name=nn-9067e33176e
 */!(function () {
  let a, u, s, e, r, o, n; function t() {
    function e(e) {
      e = e || {}, (l = l || (void 0 !== e ? e : {})).ready = new Promise((e, n) => { T = e, i = n }), typeof global != 'undefined' && Object.prototype.toString.call(global.process) === '[object process]' && typeof fetch != 'undefined' && (typeof XMLHttpRequest == 'undefined' && (global.XMLHttpRequest = function () { let t; var r = { open(e, n) { t = n }, send() { require('node:fs').readFile(t, (e, n) => { r.readyState = 4, e ? (console.error(e), r.status = 404, r.onerror(e)) : (r.status = 200, r.response = n, r.onreadystatechange(), r.onload()) }) } }; return r }), fetch = null), l.print = function (e) { l.listener ? l.listener(e) : console.log(e) }, l.printErr = function (e) { l.listener ? l.listener(e) : console.error(e) }, l.terminate = function () { typeof PThread != 'undefined' && PThread.Z() }; var l; var T; var i; let n; let t; let U; let r; let H; let a; let o = Object.assign({}, l); let u = []; let s = './this.program'; let c = (e, n) => { throw n }; const k = typeof window == 'object'; const f = typeof importScripts == 'function'; const L = typeof process == 'object' && typeof process.versions == 'object' && typeof process.versions.node == 'string'; let p = ''; const q = (L
        ? (p = f ? `${require('node:path').dirname(p)}/` : `${__dirname}/`, H = () => { r || (U = require('node:fs'), r = require('node:path')) }, n = function (e, n) { return H(), e = r.normalize(e), U.readFileSync(e, n ? void 0 : 'utf8') }, t = e => e = (e = n(e, !0)).buffer ? e : new Uint8Array(e), process.argv.length > 1 && (s = process.argv[1].replace(/\\/g, '/')), u = process.argv.slice(2), process.on('uncaughtException', (e) => {
            if (!(e instanceof j))
              throw e
          }), process.on('unhandledRejection', (e) => { throw e }), c = (e, n) => {
            if (d || _ > 0)
              throw process.exitCode = e, n; n instanceof j || m(`exiting due to exception: ${n}`), process.exit(e)
          }, l.inspect = function () { return '[Emscripten Module object]' })
        : (k || f) && (f ? p = self.location.href : typeof document != 'undefined' && document.currentScript && (p = document.currentScript.src), p = (p = Te || p).indexOf('blob:') !== 0 ? p.substr(0, p.replace(/[?#].*/, '').lastIndexOf('/') + 1) : '', n = (e) => { const n = new XMLHttpRequest(); return n.open('GET', e, !1), n.send(null), n.responseText }, f) && (t = (e) => { const n = new XMLHttpRequest(); return n.open('GET', e, !1), n.responseType = 'arraybuffer', n.send(null), new Uint8Array(n.response) }), l.print || console.log.bind(console)); var m = l.printErr || console.warn.bind(console); var d = (Object.assign(l, o), l.arguments && (u = l.arguments), l.thisProgram && (s = l.thisProgram), l.quit && (c = l.quit), l.wasmBinary && (a = l.wasmBinary), l.noExitRuntime || !0); typeof WebAssembly != 'object' && A('no native wasm support detected'); let W; let B; let h; let y; let g; let N; let v = !1; const K = typeof TextDecoder != 'undefined' ? new TextDecoder('utf8') : void 0; function X(e, n, t) {
        let r = n + t; for (t = n; e[t] && !(r <= t);)++t; if (t - n > 16 && e.subarray && K)
          return K.decode(e.subarray(n, t)); for (r = ''; n < t;) { var o; var i; let a = e[n++]; 128 & a ? (o = 63 & e[n++], (224 & a) == 192 ? r += String.fromCharCode((31 & a) << 6 | o) : (i = 63 & e[n++], (a = (240 & a) == 224 ? (15 & a) << 12 | o << 6 | i : (7 & a) << 18 | o << 12 | i << 6 | 63 & e[n++]) < 65536 ? r += String.fromCharCode(a) : (a -= 65536, r += String.fromCharCode(55296 | a >> 10, 56320 | 1023 & a)))) : r += String.fromCharCode(a) } return r
      } function z(e) { return e ? X(y, e, void 0) : '' } function G(e, n, t, r) {
        if (r > 0) {
          r = t + r - 1; for (let o = 0; o < e.length; ++o) {
            let i = e.charCodeAt(o); if ((i = i >= 55296 && i <= 57343 ? 65536 + ((1023 & i) << 10) | 1023 & e.charCodeAt(++o) : i) <= 127) {
              if (r <= t)
                break; n[t++] = i
            }
            else {
              if (i <= 2047) {
                if (r <= t + 1)
                  break; n[t++] = 192 | i >> 6
              }
              else {
                if (i <= 65535) {
                  if (r <= t + 2)
                    break; n[t++] = 224 | i >> 12
                }
                else {
                  if (r <= t + 3)
                    break; n[t++] = 240 | i >> 18, n[t++] = 128 | i >> 12 & 63
                }n[t++] = 128 | i >> 6 & 63
              }n[t++] = 128 | 63 & i
            }
          }n[t] = 0
        }
      } function V(e) { for (var n = 0, t = 0; t < e.length; ++t) { let r = e.charCodeAt(t); (r = r >= 55296 && r <= 57343 ? 65536 + ((1023 & r) << 10) | 1023 & e.charCodeAt(++t) : r) <= 127 ? ++n : n = r <= 2047 ? n + 2 : r <= 65535 ? n + 3 : n + 4 } return n } function J(e) { const n = V(e) + 1; const t = Y(n); return G(e, h, t, n), t } function Z() { const e = W.buffer; B = e, l.HEAP8 = h = new Int8Array(e), l.HEAP16 = new Int16Array(e), l.HEAP32 = g = new Int32Array(e), l.HEAPU8 = y = new Uint8Array(e), l.HEAPU16 = new Uint16Array(e), l.HEAPU32 = new Uint32Array(e), l.HEAPF32 = new Float32Array(e), l.HEAPF64 = N = new Float64Array(e) } let w; const $ = []; const Q = []; const ee = []; const ne = []; let te = !1; var _ = 0; let b = 0; let re = null; let S = null; function A(e) { throw l.onAbort && l.onAbort(e), m(e = `Aborted(${e})`), v = !0, e = new WebAssembly.RuntimeError(`${e}. Build with -s ASSERTIONS=1 for more info.`), i(e), e } function oe() { return w.startsWith('data:application/octet-stream;base64,') } function ie() {
        const e = w; try {
          if (e == w && a)
            return new Uint8Array(a); if (t)
            return t(e); throw 'both async and sync fetching of the wasm failed'
        }
        catch (e) { A(e) }
      }l.preloadedImages = {}, l.preloadedAudios = {}, w = 'stockfish.wasm', oe() || (o = w, w = l.locateFile ? l.locateFile(o, p) : p + o); const ae = { 6678104() {
        try { l.onDoneSearching() }
        catch (e) {}
      } }; function D(e) { for (;e.length > 0;) { var n; const t = e.shift(); typeof t == 'function' ? t(l) : typeof (n = t.S) == 'number' ? void 0 === t.P ? Ie.call(null, n) : Ee.apply(null, [n, t.P]) : n(void 0 === t.P ? null : t.P) } } function ue(e) { e instanceof j || e == 'unwind' || c(1, e) } const se = [null, [], []]; const ce = {}; const fe = L ? () => { const e = process.hrtime(); return 1e3 * e[0] + e[1] / 1e6 } : () => performance.now(); const le = []; function pe(e) {
        if (!te && !v) {
          try { e() }
          catch (e) { ue(e) }
        }
      } let me; const de = {}; function he() { if (!me) { let e; const n = { USER: 'web_user', LOGNAME: 'web_user', PATH: '/', PWD: '/', HOME: '/home/web_user', LANG: `${(typeof navigator == 'object' && navigator.languages && navigator.languages[0] || 'C').replace('-', '_')}.UTF-8`, _: s || './this.program' }; for (e in de) void 0 === de[e] ? delete n[e] : n[e] = de[e]; const t = []; for (e in n)t.push(`${e}=${n[e]}`); me = t } return me } function C(e) { return e % 4 == 0 && (e % 100 != 0 || e % 400 == 0) } function ye(e, n) { for (var t = 0, r = 0; r <= n; t += e[r++]);return t } const M = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; const R = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; function x(e, n) { for (e = new Date(e.getTime()); n > 0;) { const t = e.getMonth(); const r = (C(e.getFullYear()) ? M : R)[t]; if (!(n > r - e.getDate())) { e.setDate(e.getDate() + n); break }n -= r - e.getDate() + 1, e.setDate(1), t < 11 ? e.setMonth(t + 1) : (e.setMonth(0), e.setFullYear(e.getFullYear() + 1)) } return e } function ge(e, n, t, r) { function o(e, n, t) { for (e = typeof e == 'number' ? e.toString() : e || ''; e.length < n;)e = t[0] + e; return e } function i(e, n) { return o(e, n, '0') } function a(e, n) { function t(e) { return e < 0 ? -1 : e > 0 ? 1 : 0 } let r; return r = (r = t(e.getFullYear() - n.getFullYear())) === 0 && (r = t(e.getMonth() - n.getMonth())) === 0 ? t(e.getDate() - n.getDate()) : r } function u(e) { switch (e.getDay()) { case 0:return new Date(e.getFullYear() - 1, 11, 29); case 1:return e; case 2:return new Date(e.getFullYear(), 0, 3); case 3:return new Date(e.getFullYear(), 0, 2); case 4:return new Date(e.getFullYear(), 0, 1); case 5:return new Date(e.getFullYear() - 1, 11, 31); case 6:return new Date(e.getFullYear() - 1, 11, 30) } } function s(e) { e = x(new Date(e.A + 1900, 0, 1), e.O); var n = new Date(e.getFullYear() + 1, 0, 4); const t = u(new Date(e.getFullYear(), 0, 4)); var n = u(n); return a(t, e) <= 0 ? a(n, e) <= 0 ? e.getFullYear() + 1 : e.getFullYear() : e.getFullYear() - 1 } let c; var f = g[r + 40 >> 2]; for (c in r = { V: g[r >> 2], U: g[r + 4 >> 2], M: g[r + 8 >> 2], L: g[r + 12 >> 2], K: g[r + 16 >> 2], A: g[r + 20 >> 2], N: g[r + 24 >> 2], O: g[r + 28 >> 2], $: g[r + 32 >> 2], T: g[r + 36 >> 2], W: f ? z(f) : '' }, t = z(t), f = { '%c': '%a %b %d %H:%M:%S %Y', '%D': '%m/%d/%y', '%F': '%Y-%m-%d', '%h': '%b', '%r': '%I:%M:%S %p', '%R': '%H:%M', '%T': '%H:%M:%S', '%x': '%m/%d/%y', '%X': '%H:%M:%S', '%Ec': '%c', '%EC': '%C', '%Ex': '%m/%d/%y', '%EX': '%H:%M:%S', '%Ey': '%y', '%EY': '%Y', '%Od': '%d', '%Oe': '%e', '%OH': '%H', '%OI': '%I', '%Om': '%m', '%OM': '%M', '%OS': '%S', '%Ou': '%u', '%OU': '%U', '%OV': '%V', '%Ow': '%w', '%OW': '%W', '%Oy': '%y' })t = t.replace(new RegExp(c, 'g'), f[c]); let l; let p; const m = 'Sunday Monday Tuesday Wednesday Thursday Friday Saturday'.split(' '); const d = 'January February March April May June July August September October November December'.split(' '); var f = { '%a': function (e) { return m[e.N].substring(0, 3) }, '%A': function (e) { return m[e.N] }, '%b': function (e) { return d[e.K].substring(0, 3) }, '%B': function (e) { return d[e.K] }, '%C': function (e) { return i((e.A + 1900) / 100 | 0, 2) }, '%d': function (e) { return i(e.L, 2) }, '%e': function (e) { return o(e.L, 2, ' ') }, '%g': function (e) { return s(e).toString().substring(2) }, '%G': s, '%H': function (e) { return i(e.M, 2) }, '%I': function (e) { return (e = e.M) == 0 ? e = 12 : e > 12 && (e -= 12), i(e, 2) }, '%j': function (e) { return i(e.L + ye(C(e.A + 1900) ? M : R, e.K - 1), 3) }, '%m': function (e) { return i(e.K + 1, 2) }, '%M': function (e) { return i(e.U, 2) }, '%n': function () { return '\n' }, '%p': function (e) { return e.M >= 0 && e.M < 12 ? 'AM' : 'PM' }, '%S': function (e) { return i(e.V, 2) }, '%t': function () { return '\t' }, '%u': function (e) { return e.N || 7 }, '%U': function (e) { const n = new Date(e.A + 1900, 0, 1); const t = n.getDay() === 0 ? n : x(n, 7 - n.getDay()); return a(t, e = new Date(e.A + 1900, e.K, e.L)) < 0 ? i(Math.ceil((31 - t.getDate() + (ye(C(e.getFullYear()) ? M : R, e.getMonth() - 1) - 31) + e.getDate()) / 7), 2) : a(t, n) === 0 ? '01' : '00' }, '%V': function (e) { var n = new Date(e.A + 1901, 0, 4); const t = u(new Date(e.A + 1900, 0, 4)); var n = u(n); const r = x(new Date(e.A + 1900, 0, 1), e.O); return a(r, t) < 0 ? '53' : a(n, r) <= 0 ? '01' : i(Math.ceil((t.getFullYear() < e.A + 1900 ? e.O + 32 - t.getDate() : e.O + 1 - t.getDate()) / 7), 2) }, '%w': function (e) { return e.N }, '%W': function (e) { const n = new Date(e.A, 0, 1); const t = n.getDay() === 1 ? n : x(n, n.getDay() === 0 ? 1 : 7 - n.getDay() + 1); return a(t, e = new Date(e.A + 1900, e.K, e.L)) < 0 ? i(Math.ceil((31 - t.getDate() + (ye(C(e.getFullYear()) ? M : R, e.getMonth() - 1) - 31) + e.getDate()) / 7), 2) : a(t, n) === 0 ? '01' : '00' }, '%y': function (e) { return (e.A + 1900).toString().substring(2) }, '%Y': function (e) { return e.A + 1900 }, '%z': function (e) { const n = (e = e.T) >= 0; return e = Math.abs(e) / 60, (n ? '+' : '-') + String(`0000${e / 60 * 100 + e % 60}`).slice(-4) }, '%Z': function (e) { return e.W }, '%%': function () { return '%' } }; for (c in t = t.replace(/%%/g, '\0\0'), f)t.includes(c) && (t = t.replace(new RegExp(c, 'g'), f[c](r))); return t = t.replace(/\0\0/g, '%'), l = t, p = new Array(V(l) + 1), G(l, p, 0, p.length), (c = p).length > n ? 0 : (h.set(c, e), c.length - 1) } function F(e) {
        try { e() }
        catch (e) { A(e) }
      } let O = 0; let E = null; const I = []; const ve = {}; const we = {}; let _e = 0; let be = null; const Se = []; function Ae(t) {
        let e; const r = {}; for (e in t) {
          !(function (e) {
            const n = t[e]; r[e] = typeof n == 'function'
              ? function () {
                I.push(e); try { return n.apply(null, arguments) }
                finally { v || (I.pop() !== e && A(void 0), E && O === 1 && I.length === 0 && (O = 0, F(l._asyncify_stop_unwind), typeof Fibers != 'undefined') && Fibers.aa()) }
              }
              : n
          }(e))
        } return r
      } function De(e) {
        let o, i, n, t; v || (O === 0
          ? (i = o = !1, e(() => {
              if (!v && (o = !0, i)) {
                O = 2, F(() => l._asyncify_start_rewind(E)), typeof Browser != 'undefined' && Browser.R.S && Browser.R.resume(); let n = !1; try { var t = (0, l.asm[we[g[E + 8 >> 2]]])() }
                catch (e) { t = e, n = !0 } let e; let r = !1; if (E || (e = be) && (be = null, (n ? e.reject : e.resolve)(t), r = !0), n && !r)
                  throw t
              }
            }), i = !0, o || (O = 1, e = xe(10485772), n = e + 12, g[e >> 2] = n, g[e + 4 >> 2] = n + 10485760, n = I[0], void 0 === (t = ve[n]) && (t = _e++, ve[n] = t, we[t] = n), g[e + 8 >> 2] = t, E = e, F(() => l._asyncify_start_unwind(E)), typeof Browser != 'undefined' && Browser.R.S && Browser.R.pause()))
          : O === 2 ? (O = 0, F(l._asyncify_stop_rewind), Me(E), E = null, Se.forEach(e => pe(e))) : A(`invalid state: ${O}`))
      } let P; const Ce = { d() { return 0 }, i() {}, r() { return 0 }, f() {}, a() { A('') }, g(e, n) {
        if (e === 0) {
          e = Date.now()
        }
        else {
          if (e !== 1 && e !== 4)
            return g[Re() >> 2] = 28, -1; e = fe()
        } return g[n >> 2] = e / 1e3 | 0, g[n + 4 >> 2] = e % 1e3 * 1e6 | 0, 0
      }, j(e, n, t) { let r; for (le.length = 0, t >>= 2; r = y[n++];)(r = r < 105) && 1 & t && t++, le.push(r ? N[t++ >> 1] : g[t]), ++t; return ae[e].apply(null, le) }, h(e, n, t) { y.copyWithin(e, n, n + t) }, c(e) {
        const n = y.length; if (!((e >>>= 0) > 2147483648)) {
          for (let t = 1; t <= 4; t *= 2) {
            var r = n * (1 + 0.2 / t); var r = Math.min(r, e + 100663296); let o = Math; r = Math.max(e, r), o = o.min.call(o, 2147483648, r + (65536 - r % 65536) % 65536); e: {
              try { W.grow(o - B.byteLength + 65535 >>> 16), Z(); var i = 1; break e }
              catch (e) {}i = void 0
            } if (i)
              return !0
          }
        } return !1
      }, k(t) { De((e) => { return n = e, setTimeout(() => { pe(n) }, t); var n }) }, n(r, o) { let i = 0; return he().forEach((e, n) => { let t = o + i; for (n = g[r + 4 * n >> 2] = t, t = 0; t < e.length; ++t)h[n++ >> 0] = e.charCodeAt(t); h[n >> 0] = 0, i += e.length + 1 }), 0 }, o(e, n) { const t = he(); let r = (g[e >> 2] = t.length, 0); return t.forEach((e) => { r += e.length + 1 }), g[n >> 2] = r, 0 }, b(e) { Ye(e) }, e() { return 0 }, q(e, n, t, r) { return e = ce.Y(e), n = ce.X(e, n, t), g[r >> 2] = n, 0 }, l() {}, p(e, n, t, r) { for (var o = 0, i = 0; i < t; i++) { const a = g[n >> 2]; const u = g[n + 4 >> 2]; n += 8; for (let s = 0; s < u; s++) { const c = y[a + s]; const f = se[e]; c === 0 || c === 10 ? ((e === 1 ? q : m)(X(f, 0)), f.length = 0) : f.push(c) }o += u } return g[r >> 2] = o, 0 }, m: ge }; var Me = (!(function () {
        function n(e) { e = Ae(e = e.exports), l.asm = e, W = l.asm.s, Z(), Q.unshift(l.asm.t), b--, l.monitorRunDependencies && l.monitorRunDependencies(b), b == 0 && (re !== null && (clearInterval(re), re = null), S) && (e = S, S = null, e()) } function t(e) { n(e.instance) } function r(e) {
          return (a || !k && !f || typeof fetch != 'function'
            ? Promise.resolve().then(ie)
            : fetch(w, { credentials: 'same-origin' }).then((e) => {
                if (e.ok)
                  return e.arrayBuffer(); throw `failed to load wasm binary file at '${w}'`
              }).catch(ie)).then((e) => { return WebAssembly.instantiate(e, o) }).then((e) => { return e }).then(e, (e) => { m(`failed to asynchronously prepare wasm: ${e}`), A(e) })
        } var o = { a: Ce }; if (b++, l.monitorRunDependencies && l.monitorRunDependencies(b), l.instantiateWasm) {
          try { const e = l.instantiateWasm(o, n); return Ae(e) }
          catch (e) { return m(`Module.instantiateWasm callback failed with error: ${e}`) }
        }(a || typeof WebAssembly.instantiateStreaming != 'function' || oe() || typeof fetch != 'function' ? r(t) : fetch(w, { credentials: 'same-origin' }).then((e) => { return WebAssembly.instantiateStreaming(e, o).then(t, (e) => { return m(`wasm streaming compile failed: ${e}`), m('falling back to ArrayBuffer instantiation'), r(t) }) })).catch(i)
      }()), l.___wasm_call_ctors = function () { return (l.___wasm_call_ctors = l.asm.t).apply(null, arguments) }, l._main = function () { return (l._main = l.asm.u).apply(null, arguments) }, l._command = function () { return (l._command = l.asm.v).apply(null, arguments) }, l._isSearching = function () { return (l._isSearching = l.asm.w).apply(null, arguments) }, l._free = function () { return (Me = l._free = l.asm.x).apply(null, arguments) }); var Re = l.___errno_location = function () { return (Re = l.___errno_location = l.asm.y).apply(null, arguments) }; var xe = l._malloc = function () { return (xe = l._malloc = l.asm.z).apply(null, arguments) }; var Fe = l.stackSave = function () { return (Fe = l.stackSave = l.asm.B).apply(null, arguments) }; var Oe = l.stackRestore = function () { return (Oe = l.stackRestore = l.asm.C).apply(null, arguments) }; var Y = l.stackAlloc = function () { return (Y = l.stackAlloc = l.asm.D).apply(null, arguments) }; var Ee = l.dynCall_vi = function () { return (Ee = l.dynCall_vi = l.asm.E).apply(null, arguments) }; var Ie = l.dynCall_v = function () { return (Ie = l.dynCall_v = l.asm.F).apply(null, arguments) }; function j(e) { this.name = 'ExitStatus', this.message = `Program terminated with exit(${e})`, this.status = e } function Pe(i) {
        function e() {
          if (!P && (P = !0, l.calledRun = !0, !v)) {
            if (D(Q), D(ee), T(l), l.onRuntimeInitialized && l.onRuntimeInitialized(), je) {
              var e = i; const n = l._main; const t = (e = e || []).length + 1; const r = Y(4 * (t + 1)); g[r >> 2] = J(s); for (let o = 1; o < t; o++)g[(r >> 2) + o] = J(e[o - 1]); g[(r >> 2) + t] = 0; try { Ye(n(t, r)) }
              catch (e) { ue(e) }
            } if (l.postRun) {
              for (typeof l.postRun == 'function' && (l.postRun = [l.postRun]); l.postRun.length;)e = l.postRun.shift(), ne.unshift(e)
            } D(ne)
          }
        } if (i = i || u, !(b > 0)) {
          if (l.preRun) {
            for (typeof l.preRun == 'function' && (l.preRun = [l.preRun]); l.preRun.length;)n = void 0, n = l.preRun.shift(), $.unshift(n)
          } D($), b > 0 || (l.setStatus ? (l.setStatus('Running...'), setTimeout(() => { setTimeout(() => { l.setStatus('') }, 1), e() }, 1)) : e())
        } var n
      } function Ye(e) { d || _ > 0 || (te = !0), d || _ > 0 || (l.onExit && l.onExit(e), v = !0), c(e, new j(e)) } if (l._asyncify_start_unwind = function () { return (l._asyncify_start_unwind = l.asm.G).apply(null, arguments) }, l._asyncify_stop_unwind = function () { return (l._asyncify_stop_unwind = l.asm.H).apply(null, arguments) }, l._asyncify_start_rewind = function () { return (l._asyncify_start_rewind = l.asm.I).apply(null, arguments) }, l._asyncify_stop_rewind = function () { return (l._asyncify_stop_rewind = l.asm.J).apply(null, arguments) }, l.ccall = function (e, n, t, r, o) {
        function i(e) { return --_, s !== 0 && Oe(s), n === 'string' ? z(e) : n === 'boolean' ? !!e : e } const a = { string(e) { let n; let t = 0; return e != null && e !== 0 && (n = 1 + (e.length << 2), t = Y(n), G(e, y, t, n)), t }, array(e) { const n = Y(e.length); return h.set(e, n), n } }; const u = (e = l[`_${e}`], []); var s = 0; if (r) {
          for (let c = 0; c < r.length; c++) { const f = a[t[c]]; f ? (s === 0 && (s = Fe()), u[c] = f(r[c])) : u[c] = r[c] }
        } return t = E, r = e.apply(null, u), _ += 1, o = o && o.async, E != t ? new Promise((e, n) => { be = { resolve: e, reject: n } }).then(i) : (r = i(r), o ? Promise.resolve(r) : r)
      }, S = function e() { P || Pe(), P || (S = e) }, l.run = Pe, l.preInit) {
        for (typeof l.preInit == 'function' && (l.preInit = [l.preInit]); l.preInit.length > 0;)l.preInit.pop()()
      } var je = !0; return l.noInitialRun && (je = !1), Pe(), e.ready
    } var Te; Te = typeof document != 'undefined' && document.currentScript ? document.currentScript.src : void 0, typeof __filename != 'undefined' && (Te = Te || __filename); return typeof exports == 'object' && typeof module == 'object' ? module.exports = e : typeof define == 'function' && define.amd ? define([], () => { return e }) : typeof exports == 'object' && (exports.Stockfish = e), e
  } function i(e) {
    if (r.ccall('command', null, ['string'], [e], { async: typeof IS_ASYNCIFY != 'undefined' && /^go\b/.test(e) }), e === 'quit') {
      try { r.terminate() }
      catch (e) {} try { self.close() }
      catch (e) {} try { process.exit() }
      catch (e) {}
    }
  } function c() { for (;n.length && (!r._isSearching || !r._isSearching());)i(n.shift()) } function f(e) { (e = e.trim()).substring(0, 2) === 'go' || e.substring(0, 9) === 'setoption' ? n.push(e) : i(e), c() } function l() {
    if (r._isReady && !r._isReady())
      return setTimeout(l, 10); let t; typeof IS_ASYNCIFY == 'undefined' ? r.onDoneSearching = c : r.onDoneSearching = function () { setTimeout(c, 1) }, r.processCommand = f, o.length && (t = 0, (function e() {
      for (var n; t < o.length;) {
        if ((n = o[t++]).startsWith('sleep '))
          return setTimeout(e, n.slice(6)); f(n)
      }
    }()))
  } function p(t) { let e; let r = 0; const o = []; const n = a.slice(1 + (a.lastIndexOf('.') - 1 >>> 0)); const i = a.slice(0, -n.length); for (e = 0; e < t; ++e)!(function (e, n) { fetch(new Request(e)).then((e) => { return e.blob() }).then((e) => { n(e) }) }(`${i}-part-${e}${n}`, (function (n) { return function (e) { ++r, o[n] = e, r === t && (e = URL.createObjectURL(new Blob(o, { type: 'application/wasm' })), u(e)) } }(e)))) } typeof self != 'undefined' && self.location.hash.split(',')[1] === 'worker' || typeof global != 'undefined' && Object.prototype.toString.call(global.process) === '[object process]' && !require('node:worker_threads').isMainThread || (typeof onmessage != 'undefined' && (typeof window == 'undefined' || void 0 === window.document) || typeof global != 'undefined' && Object.prototype.toString.call(global.process) === '[object process]'
    ? (e = typeof global != 'undefined' && Object.prototype.toString.call(global.process) === '[object process]', r = {}, o = [], n = [], e
        ? require.main === module ? (s = require('node:path'), a = s.join(__dirname, `${s.basename(__filename, s.extname(__filename))}.wasm`), r = { locateFile(e) { return e.includes('.wasm') ? e.includes('.wasm.map') ? `${a}.map` : a : __filename }, listener(e) { process.stdout.write(`${e}\n`) } }, typeof enginePartsCount == 'number' && (r.wasmBinary = (function (e) { for (var n = require('node:fs'), t = s.extname(a), r = a.slice(0, -t.length), o = [], i = 0; i < e; ++i)o.push(n.readFileSync(`${r}-part-${i}.wasm`)); return Buffer.concat(o) }(enginePartsCount))), o = process.argv.slice(2), t()(r).then(l), require('node:readline').createInterface({ input: process.stdin, output: process.stdout, completer(n) { const e = ['binc ', 'btime ', 'confidence ', 'depth ', 'infinite ', 'mate ', 'maxdepth ', 'maxtime ', 'mindepth ', 'mintime ', 'moves ', 'movestogo ', 'movetime ', 'ponder ', 'searchmoves ', 'shallow ', 'winc ', 'wtime ']; function t(e) { return e.toLowerCase().indexOf(n.toLowerCase()) === 0 } let r = ['compiler', 'd', 'eval', 'flip', 'go ', 'isready', 'ponderhit', 'position fen ', 'position startpos', 'position startpos moves ', 'quit', 'setoption name Clear Hash value true', 'setoption name Hash value ', 'setoption name Minimum Thinking Time value ', 'setoption name Move Overhead value ', 'setoption name MultiPV value ', 'setoption name Ponder value ', 'setoption name Skill Level value ', 'setoption name Slow Mover value ', 'setoption name Threads value ', 'setoption name UCI_Chess960 value false', 'setoption name UCI_Chess960 value true', 'setoption name UCI_LimitStrength value true', 'setoption name UCI_LimitStrength value false', 'setoption name UCI_Elo value ', 'setoption name UCI_ShowWDL value true', 'setoption name UCI_ShowWDL value false', 'setoption name nodestime value ', 'stop', 'uci', 'ucinewgame'].filter(t); return [r = r.length ? r : (n = n.replace(/^.*\s/, '')) ? e.filter(t) : e, n] }, historySize: 100 }).on('line', (e) => { e && (r.processCommand ? r.processCommand(e) : o.push(e), e === 'quit') && process.exit() }).on('close', () => { process.exit() }).setPrompt('')) : module.exports = t
        : (e = self.location.hash.substr(1).split(','), a = decodeURIComponent(e[0] || location.origin + location.pathname.replace(/\.js$/i, '.wasm')), u = function (n) { r = { locateFile(e) { return e.includes('.wasm') ? e.includes('.wasm.map') ? `${a}.map` : n || a : `${self.location.origin + self.location.pathname}#${a},worker` }, listener(e) { postMessage(e) } }, t()(r).then(l).catch((e) => { setTimeout(() => { throw e }, 1) }) }, typeof enginePartsCount == 'number' ? p(enginePartsCount) : u(), onmessage = onmessage || function (e) {
            if (r.processCommand ? r.processCommand(e.data) : o.push(e.data), e.data === 'quit') {
              try { self.close() }
              catch (e) {}
            }
          }))
    : typeof document == 'object' && document.currentScript ? document.currentScript._exports = t() : t())
}())
