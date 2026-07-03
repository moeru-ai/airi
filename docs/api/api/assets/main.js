'use strict'
window.translations = { copy: 'Copy', copied: 'Copied!', normally_hidden: 'This member is normally hidden due to your filter settings.', hierarchy_expand: 'Expand', hierarchy_collapse: 'Collapse', folder: 'Folder', search_index_not_available: 'The search index is not available', search_no_results_found_for_0: 'No results found for {0}', kind_1: 'Project', kind_2: 'Module', kind_4: 'Namespace', kind_8: 'Enumeration', kind_16: 'Enumeration Member', kind_32: 'Variable', kind_64: 'Function', kind_128: 'Class', kind_256: 'Interface', kind_512: 'Constructor', kind_1024: 'Property', kind_2048: 'Method', kind_4096: 'Call Signature', kind_8192: 'Index Signature', kind_16384: 'Constructor Signature', kind_32768: 'Parameter', kind_65536: 'Type Literal', kind_131072: 'Type Parameter', kind_262144: 'Accessor', kind_524288: 'Get Signature', kind_1048576: 'Set Signature', kind_2097152: 'Type Alias', kind_4194304: 'Reference', kind_8388608: 'Document' }
'use strict'; (() => {
  const Ke = Object.create; const he = Object.defineProperty; const Ge = Object.getOwnPropertyDescriptor; const Ze = Object.getOwnPropertyNames; const Xe = Object.getPrototypeOf; const Ye = Object.prototype.hasOwnProperty; const et = (t, e) => () => (e || t((e = { exports: {} }).exports, e), e.exports); const tt = (t, e, n, r) => {
    if (e && typeof e == 'object' || typeof e == 'function') {
      for (const i of Ze(e))!Ye.call(t, i) && i !== n && he(t, i, { get: () => e[i], enumerable: !(r = Ge(e, i)) || r.enumerable })
    } return t
  }; const nt = (t, e, n) => (n = t != null ? Ke(Xe(t)) : {}, tt(e || !t || !t.__esModule ? he(n, 'default', { value: t, enumerable: !0 }) : n, t)); const ye = et((me, ge) => {
    (function () {
      const t = function (e) { const n = new t.Builder(); return n.pipeline.add(t.trimmer, t.stopWordFilter, t.stemmer), n.searchPipeline.add(t.stemmer), e.call(n, n), n.build() }; t.version = '2.3.9'; t.utils = {}, t.utils.warn = (function (e) { return function (n) { e.console && console.warn && console.warn(n) } })(this), t.utils.asString = function (e) { return e == null ? '' : e.toString() }, t.utils.clone = function (e) {
        if (e == null)
          return e; for (var n = Object.create(null), r = Object.keys(e), i = 0; i < r.length; i++) { const s = r[i]; const o = e[s]; if (Array.isArray(o)) { n[s] = o.slice(); continue } if (typeof o == 'string' || typeof o == 'number' || typeof o == 'boolean') { n[s] = o; continue } throw new TypeError('clone is not deep and does not support nested objects') } return n
      }, t.FieldRef = function (e, n, r) { this.docRef = e, this.fieldName = n, this._stringValue = r }, t.FieldRef.joiner = '/', t.FieldRef.fromString = function (e) {
        const n = e.indexOf(t.FieldRef.joiner); if (n === -1)
          throw 'malformed field ref string'; const r = e.slice(0, n); const i = e.slice(n + 1); return new t.FieldRef(i, r, e)
      }, t.FieldRef.prototype.toString = function () { return this._stringValue == null && (this._stringValue = this.fieldName + t.FieldRef.joiner + this.docRef), this._stringValue }; t.Set = function (e) {
        if (this.elements = Object.create(null), e) { this.length = e.length; for (let n = 0; n < this.length; n++) this.elements[e[n]] = !0 }
        else {
          this.length = 0
        }
      }, t.Set.complete = { intersect(e) { return e }, union() { return this }, contains() { return !0 } }, t.Set.empty = { intersect() { return this }, union(e) { return e }, contains() { return !1 } }, t.Set.prototype.contains = function (e) { return !!this.elements[e] }, t.Set.prototype.intersect = function (e) {
        let n; let r; let i; const s = []; if (e === t.Set.complete)
          return this; if (e === t.Set.empty)
          return e; this.length < e.length ? (n = this, r = e) : (n = e, r = this), i = Object.keys(n.elements); for (let o = 0; o < i.length; o++) { const a = i[o]; a in r.elements && s.push(a) } return new t.Set(s)
      }, t.Set.prototype.union = function (e) { return e === t.Set.complete ? t.Set.complete : e === t.Set.empty ? this : new t.Set(Object.keys(this.elements).concat(Object.keys(e.elements))) }, t.idf = function (e, n) { let r = 0; for (const i in e)i != '_index' && (r += Object.keys(e[i]).length); const s = (n - r + 0.5) / (r + 0.5); return Math.log(1 + Math.abs(s)) }, t.Token = function (e, n) { this.str = e || '', this.metadata = n || {} }, t.Token.prototype.toString = function () { return this.str }, t.Token.prototype.update = function (e) { return this.str = e(this.str, this.metadata), this }, t.Token.prototype.clone = function (e) { return e = e || function (n) { return n }, new t.Token(e(this.str, this.metadata), this.metadata) }; t.tokenizer = function (e, n) {
        if (e == null || e == null)
          return []; if (Array.isArray(e))
          return e.map((f) => { return new t.Token(t.utils.asString(f).toLowerCase(), t.utils.clone(n)) }); for (var r = e.toString().toLowerCase(), i = r.length, s = [], o = 0, a = 0; o <= i; o++) { const c = r.charAt(o); const l = o - a; if (c.match(t.tokenizer.separator) || o == i) { if (l > 0) { const d = t.utils.clone(n) || {}; d.position = [a, l], d.index = s.length, s.push(new t.Token(r.slice(a, o), d)) }a = o + 1 } } return s
      }, t.tokenizer.separator = /[\s\-]+/; t.Pipeline = function () { this._stack = [] }, t.Pipeline.registeredFunctions = Object.create(null), t.Pipeline.registerFunction = function (e, n) { n in this.registeredFunctions && t.utils.warn(`Overwriting existing registered function: ${n}`), e.label = n, t.Pipeline.registeredFunctions[e.label] = e }, t.Pipeline.warnIfFunctionNotRegistered = function (e) {
        const n = e.label && e.label in this.registeredFunctions; n || t.utils.warn(`Function is not registered with pipeline. This may cause problems when serialising the index.
`, e)
      }, t.Pipeline.load = function (e) {
        const n = new t.Pipeline(); return e.forEach((r) => {
          const i = t.Pipeline.registeredFunctions[r]; if (i)
            n.add(i); else throw new Error(`Cannot load unregistered function: ${r}`)
        }), n
      }, t.Pipeline.prototype.add = function () { const e = Array.prototype.slice.call(arguments); e.forEach(function (n) { t.Pipeline.warnIfFunctionNotRegistered(n), this._stack.push(n) }, this) }, t.Pipeline.prototype.after = function (e, n) {
        t.Pipeline.warnIfFunctionNotRegistered(n); let r = this._stack.indexOf(e); if (r == -1)
          throw new Error('Cannot find existingFn'); r = r + 1, this._stack.splice(r, 0, n)
      }, t.Pipeline.prototype.before = function (e, n) {
        t.Pipeline.warnIfFunctionNotRegistered(n); const r = this._stack.indexOf(e); if (r == -1)
          throw new Error('Cannot find existingFn'); this._stack.splice(r, 0, n)
      }, t.Pipeline.prototype.remove = function (e) { const n = this._stack.indexOf(e); n != -1 && this._stack.splice(n, 1) }, t.Pipeline.prototype.run = function (e) {
        for (let n = this._stack.length, r = 0; r < n; r++) {
          for (var i = this._stack[r], s = [], o = 0; o < e.length; o++) {
            const a = i(e[o], o, e); if (!(a == null || a === '')) {
              if (Array.isArray(a)) {
                for (let c = 0; c < a.length; c++)s.push(a[c])
              }
              else {
                s.push(a)
              }
            }
          }e = s
        } return e
      }, t.Pipeline.prototype.runString = function (e, n) { const r = new t.Token(e, n); return this.run([r]).map((i) => { return i.toString() }) }, t.Pipeline.prototype.reset = function () { this._stack = [] }, t.Pipeline.prototype.toJSON = function () { return this._stack.map((e) => { return t.Pipeline.warnIfFunctionNotRegistered(e), e.label }) }; t.Vector = function (e) { this._magnitude = 0, this.elements = e || [] }, t.Vector.prototype.positionForIndex = function (e) {
        if (this.elements.length == 0)
          return 0; for (var n = 0, r = this.elements.length / 2, i = r - n, s = Math.floor(i / 2), o = this.elements[s * 2]; i > 1 && (o < e && (n = s), o > e && (r = s), o != e);)i = r - n, s = n + Math.floor(i / 2), o = this.elements[s * 2]; if (o == e || o > e)
          return s * 2; if (o < e)
          return (s + 1) * 2
      }, t.Vector.prototype.insert = function (e, n) { this.upsert(e, n, () => { throw 'duplicate index' }) }, t.Vector.prototype.upsert = function (e, n, r) { this._magnitude = 0; const i = this.positionForIndex(e); this.elements[i] == e ? this.elements[i + 1] = r(this.elements[i + 1], n) : this.elements.splice(i, 0, e, n) }, t.Vector.prototype.magnitude = function () {
        if (this._magnitude)
          return this._magnitude; for (var e = 0, n = this.elements.length, r = 1; r < n; r += 2) { const i = this.elements[r]; e += i * i } return this._magnitude = Math.sqrt(e)
      }, t.Vector.prototype.dot = function (e) { for (var n = 0, r = this.elements, i = e.elements, s = r.length, o = i.length, a = 0, c = 0, l = 0, d = 0; l < s && d < o;)a = r[l], c = i[d], a < c ? l += 2 : a > c ? d += 2 : a == c && (n += r[l + 1] * i[d + 1], l += 2, d += 2); return n }, t.Vector.prototype.similarity = function (e) { return this.dot(e) / this.magnitude() || 0 }, t.Vector.prototype.toArray = function () { for (var e = Array.from({ length: this.elements.length / 2 }), n = 1, r = 0; n < this.elements.length; n += 2, r++)e[r] = this.elements[n]; return e }, t.Vector.prototype.toJSON = function () { return this.elements }; t.stemmer = (function () {
        const e = { ational: 'ate', tional: 'tion', enci: 'ence', anci: 'ance', izer: 'ize', bli: 'ble', alli: 'al', entli: 'ent', eli: 'e', ousli: 'ous', ization: 'ize', ation: 'ate', ator: 'ate', alism: 'al', iveness: 'ive', fulness: 'ful', ousness: 'ous', aliti: 'al', iviti: 'ive', biliti: 'ble', logi: 'log' }; const n = { icate: 'ic', ative: '', alize: 'al', iciti: 'ic', ical: 'ic', ful: '', ness: '' }; const r = '[^aeiou]'; const i = '[aeiouy]'; const s = `${r}[^aeiouy]*`; const o = `${i}[aeiou]*`; const a = `^(${s})?${o}${s}`; const c = `^(${s})?${o}${s}(${o})?$`; const l = `^(${s})?${o}${s}${o}${s}`; const d = `^(${s})?${i}`; const f = new RegExp(a); const p = new RegExp(l); const v = new RegExp(c); const E = new RegExp(d); const L = /^(.+?)(ss|i)es$/; const m = /^(.+?)([^s])s$/; const g = /^(.+?)eed$/; const T = /^(.+?)(ed|ing)$/; const w = /.$/; const C = /(at|bl|iz)$/; const O = new RegExp('([^aeiouylsz])\\1$'); const j = new RegExp(`^${s}${i}[^aeiouwxy]$`); const N = /^(.+?[^aeiou])y$/; const q = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/; const W = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/; const V = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/; const z = /^(.+?)(s|t)(ion)$/; const _ = /^(.+?)e$/; const U = /ll$/; const J = new RegExp(`^${s}${i}[^aeiouwxy]$`); const B = function (u) {
          let y, P, k, h, x, Q, H; if (u.length < 3)
            return u; if (k = u.substr(0, 1), k == 'y' && (u = k.toUpperCase() + u.substr(1)), h = L, x = m, h.test(u) ? u = u.replace(h, '$1$2') : x.test(u) && (u = u.replace(x, '$1$2')), h = g, x = T, h.test(u)) { var b = h.exec(u); h = f, h.test(b[1]) && (h = w, u = u.replace(h, '')) }
          else if (x.test(u)) { var b = x.exec(u); y = b[1], x = E, x.test(y) && (u = y, x = C, Q = O, H = j, x.test(u) ? u = `${u}e` : Q.test(u) ? (h = w, u = u.replace(h, '')) : H.test(u) && (u = `${u}e`)) } if (h = N, h.test(u)) { var b = h.exec(u); y = b[1], u = `${y}i` } if (h = q, h.test(u)) { var b = h.exec(u); y = b[1], P = b[2], h = f, h.test(y) && (u = y + e[P]) } if (h = W, h.test(u)) { var b = h.exec(u); y = b[1], P = b[2], h = f, h.test(y) && (u = y + n[P]) } if (h = V, x = z, h.test(u)) { var b = h.exec(u); y = b[1], h = p, h.test(y) && (u = y) }
          else if (x.test(u)) { var b = x.exec(u); y = b[1] + b[2], x = p, x.test(y) && (u = y) } if (h = _, h.test(u)) { var b = h.exec(u); y = b[1], h = p, x = v, Q = J, (h.test(y) || x.test(y) && !Q.test(y)) && (u = y) } return h = U, x = p, h.test(u) && x.test(u) && (h = w, u = u.replace(h, '')), k == 'y' && (u = k.toLowerCase() + u.substr(1)), u
        }; return function (A) { return A.update(B) }
      })(), t.Pipeline.registerFunction(t.stemmer, 'stemmer'); t.generateStopWordFilter = function (e) {
        const n = e.reduce((r, i) => { return r[i] = i, r }, {}); return function (r) {
          if (r && n[r.toString()] !== r.toString())
            return r
        }
      }, t.stopWordFilter = t.generateStopWordFilter(['a', 'able', 'about', 'across', 'after', 'all', 'almost', 'also', 'am', 'among', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'but', 'by', 'can', 'cannot', 'could', 'dear', 'did', 'do', 'does', 'either', 'else', 'ever', 'every', 'for', 'from', 'get', 'got', 'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his', 'how', 'however', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'least', 'let', 'like', 'likely', 'may', 'me', 'might', 'most', 'must', 'my', 'neither', 'no', 'nor', 'not', 'of', 'off', 'often', 'on', 'only', 'or', 'other', 'our', 'own', 'rather', 'said', 'say', 'says', 'she', 'should', 'since', 'so', 'some', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'tis', 'to', 'too', 'twas', 'us', 'wants', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'yet', 'you', 'your']), t.Pipeline.registerFunction(t.stopWordFilter, 'stopWordFilter'); t.trimmer = function (e) { return e.update((n) => { return n.replace(/^\W+/, '').replace(/\W+$/, '') }) }, t.Pipeline.registerFunction(t.trimmer, 'trimmer'); t.TokenSet = function () { this.final = !1, this.edges = {}, this.id = t.TokenSet._nextId, t.TokenSet._nextId += 1 }, t.TokenSet._nextId = 1, t.TokenSet.fromArray = function (e) { for (var n = new t.TokenSet.Builder(), r = 0, i = e.length; r < i; r++)n.insert(e[r]); return n.finish(), n.root }, t.TokenSet.fromClause = function (e) { return 'editDistance' in e ? t.TokenSet.fromFuzzyString(e.term, e.editDistance) : t.TokenSet.fromString(e.term) }, t.TokenSet.fromFuzzyString = function (e, n) {
        for (var r = new t.TokenSet(), i = [{ node: r, editsRemaining: n, str: e }]; i.length;) {
          const s = i.pop(); if (s.str.length > 0) { const o = s.str.charAt(0); var a; o in s.node.edges ? a = s.node.edges[o] : (a = new t.TokenSet(), s.node.edges[o] = a), s.str.length == 1 && (a.final = !0), i.push({ node: a, editsRemaining: s.editsRemaining, str: s.str.slice(1) }) } if (s.editsRemaining != 0) {
            if ('*' in s.node.edges) {
              var c = s.node.edges['*']
            }
            else { var c = new t.TokenSet(); s.node.edges['*'] = c } if (s.str.length == 0 && (c.final = !0), i.push({ node: c, editsRemaining: s.editsRemaining - 1, str: s.str }), s.str.length > 1 && i.push({ node: s.node, editsRemaining: s.editsRemaining - 1, str: s.str.slice(1) }), s.str.length == 1 && (s.node.final = !0), s.str.length >= 1) {
              if ('*' in s.node.edges) {
                var l = s.node.edges['*']
              }
              else { var l = new t.TokenSet(); s.node.edges['*'] = l }s.str.length == 1 && (l.final = !0), i.push({ node: l, editsRemaining: s.editsRemaining - 1, str: s.str.slice(1) })
            } if (s.str.length > 1) { const d = s.str.charAt(0); const f = s.str.charAt(1); var p; f in s.node.edges ? p = s.node.edges[f] : (p = new t.TokenSet(), s.node.edges[f] = p), s.str.length == 1 && (p.final = !0), i.push({ node: p, editsRemaining: s.editsRemaining - 1, str: d + s.str.slice(2) }) }
          }
        } return r
      }, t.TokenSet.fromString = function (e) {
        for (var n = new t.TokenSet(), r = n, i = 0, s = e.length; i < s; i++) {
          const o = e[i]; const a = i == s - 1; if (o == '*') {
            n.edges[o] = n, n.final = a
          }
          else { const c = new t.TokenSet(); c.final = a, n.edges[o] = c, n = c }
        } return r
      }, t.TokenSet.prototype.toArray = function () { for (var e = [], n = [{ prefix: '', node: this }]; n.length;) { const r = n.pop(); const i = Object.keys(r.node.edges); const s = i.length; r.node.final && (r.prefix.charAt(0), e.push(r.prefix)); for (let o = 0; o < s; o++) { const a = i[o]; n.push({ prefix: r.prefix.concat(a), node: r.node.edges[a] }) } } return e }, t.TokenSet.prototype.toString = function () {
        if (this._str)
          return this._str; for (var e = this.final ? '1' : '0', n = Object.keys(this.edges).sort(), r = n.length, i = 0; i < r; i++) { const s = n[i]; const o = this.edges[s]; e = e + s + o.id } return e
      }, t.TokenSet.prototype.intersect = function (e) {
        for (var n = new t.TokenSet(), r = void 0, i = [{ qNode: e, output: n, node: this }]; i.length;) {
          r = i.pop(); for (let s = Object.keys(r.qNode.edges), o = s.length, a = Object.keys(r.node.edges), c = a.length, l = 0; l < o; l++) {
            for (let d = s[l], f = 0; f < c; f++) { const p = a[f]; if (p == d || d == '*') { const v = r.node.edges[p]; const E = r.qNode.edges[d]; const L = v.final && E.final; let m = void 0; p in r.output.edges ? (m = r.output.edges[p], m.final = m.final || L) : (m = new t.TokenSet(), m.final = L, r.output.edges[p] = m), i.push({ qNode: E, output: m, node: v }) } }
          }
        } return n
      }, t.TokenSet.Builder = function () { this.previousWord = '', this.root = new t.TokenSet(), this.uncheckedNodes = [], this.minimizedNodes = {} }, t.TokenSet.Builder.prototype.insert = function (e) {
        let n; let r = 0; if (e < this.previousWord)
          throw new Error('Out of order word insertion'); for (var i = 0; i < e.length && i < this.previousWord.length && e[i] == this.previousWord[i]; i++)r++; this.minimize(r), this.uncheckedNodes.length == 0 ? n = this.root : n = this.uncheckedNodes[this.uncheckedNodes.length - 1].child; for (var i = r; i < e.length; i++) { const s = new t.TokenSet(); const o = e[i]; n.edges[o] = s, this.uncheckedNodes.push({ parent: n, char: o, child: s }), n = s }n.final = !0, this.previousWord = e
      }, t.TokenSet.Builder.prototype.finish = function () { this.minimize(0) }, t.TokenSet.Builder.prototype.minimize = function (e) { for (let n = this.uncheckedNodes.length - 1; n >= e; n--) { const r = this.uncheckedNodes[n]; const i = r.child.toString(); i in this.minimizedNodes ? r.parent.edges[r.char] = this.minimizedNodes[i] : (r.child._str = i, this.minimizedNodes[i] = r.child), this.uncheckedNodes.pop() } }; t.Index = function (e) { this.invertedIndex = e.invertedIndex, this.fieldVectors = e.fieldVectors, this.tokenSet = e.tokenSet, this.fields = e.fields, this.pipeline = e.pipeline }, t.Index.prototype.search = function (e) { return this.query((n) => { const r = new t.QueryParser(e, n); r.parse() }) }, t.Index.prototype.query = function (e) {
        for (var n = new t.Query(this.fields), r = Object.create(null), i = Object.create(null), s = Object.create(null), o = Object.create(null), a = Object.create(null), c = 0; c < this.fields.length; c++)i[this.fields[c]] = new t.Vector(); e.call(n, n); for (var c = 0; c < n.clauses.length; c++) {
          const l = n.clauses[c]; let d = null; let f = t.Set.empty; l.usePipeline ? d = this.pipeline.runString(l.term, { fields: l.fields }) : d = [l.term]; for (let p = 0; p < d.length; p++) {
            const v = d[p]; l.term = v; const E = t.TokenSet.fromClause(l); const L = this.tokenSet.intersect(E).toArray(); if (L.length === 0 && l.presence === t.Query.presence.REQUIRED) { for (var m = 0; m < l.fields.length; m++) { var g = l.fields[m]; o[g] = t.Set.empty } break } for (let T = 0; T < L.length; T++) {
              for (var w = L[T], C = this.invertedIndex[w], O = C._index, m = 0; m < l.fields.length; m++) { var g = l.fields[m]; const j = C[g]; const N = Object.keys(j); const q = `${w}/${g}`; const W = new t.Set(N); if (l.presence == t.Query.presence.REQUIRED && (f = f.union(W), o[g] === void 0 && (o[g] = t.Set.complete)), l.presence == t.Query.presence.PROHIBITED) { a[g] === void 0 && (a[g] = t.Set.empty), a[g] = a[g].union(W); continue } if (i[g].upsert(O, l.boost, (Ue, Je) => { return Ue + Je }), !s[q]) { for (let V = 0; V < N.length; V++) { const z = N[V]; var _ = new t.FieldRef(z, g); const U = j[z]; var J; (J = r[_]) === void 0 ? r[_] = new t.MatchData(w, g, U) : J.add(w, g, U) }s[q] = !0 } }
            }
          } if (l.presence === t.Query.presence.REQUIRED) {
            for (var m = 0; m < l.fields.length; m++) { var g = l.fields[m]; o[g] = o[g].intersect(f) }
          }
        } for (var B = t.Set.complete, A = t.Set.empty, c = 0; c < this.fields.length; c++) { var g = this.fields[c]; o[g] && (B = B.intersect(o[g])), a[g] && (A = A.union(a[g])) } let u = Object.keys(r); const y = []; const P = Object.create(null); if (n.isNegated()) { u = Object.keys(this.fieldVectors); for (var c = 0; c < u.length; c++) { var _ = u[c]; var k = t.FieldRef.fromString(_); r[_] = new t.MatchData() } } for (var c = 0; c < u.length; c++) {
          var k = t.FieldRef.fromString(u[c]); const h = k.docRef; if (B.contains(h) && !A.contains(h)) {
            const x = this.fieldVectors[k]; const Q = i[k.fieldName].similarity(x); var H; if ((H = P[h]) !== void 0) {
              H.score += Q, H.matchData.combine(r[k])
            }
            else { const b = { ref: h, score: Q, matchData: r[k] }; P[h] = b, y.push(b) }
          }
        } return y.sort((We, ze) => { return ze.score - We.score })
      }, t.Index.prototype.toJSON = function () { const e = Object.keys(this.invertedIndex).sort().map(function (r) { return [r, this.invertedIndex[r]] }, this); const n = Object.keys(this.fieldVectors).map(function (r) { return [r, this.fieldVectors[r].toJSON()] }, this); return { version: t.version, fields: this.fields, fieldVectors: n, invertedIndex: e, pipeline: this.pipeline.toJSON() } }, t.Index.load = function (e) { const n = {}; const r = {}; const i = e.fieldVectors; const s = Object.create(null); const o = e.invertedIndex; const a = new t.TokenSet.Builder(); const c = t.Pipeline.load(e.pipeline); e.version != t.version && t.utils.warn(`Version mismatch when loading serialised index. Current version of lunr '${t.version}' does not match serialized index '${e.version}'`); for (var l = 0; l < i.length; l++) { var d = i[l]; const f = d[0]; const p = d[1]; r[f] = new t.Vector(p) } for (var l = 0; l < o.length; l++) { var d = o[l]; const v = d[0]; const E = d[1]; a.insert(v), s[v] = E } return a.finish(), n.fields = e.fields, n.fieldVectors = r, n.invertedIndex = s, n.tokenSet = a.root, n.pipeline = c, new t.Index(n) }; t.Builder = function () { this._ref = 'id', this._fields = Object.create(null), this._documents = Object.create(null), this.invertedIndex = Object.create(null), this.fieldTermFrequencies = {}, this.fieldLengths = {}, this.tokenizer = t.tokenizer, this.pipeline = new t.Pipeline(), this.searchPipeline = new t.Pipeline(), this.documentCount = 0, this._b = 0.75, this._k1 = 1.2, this.termIndex = 0, this.metadataWhitelist = [] }, t.Builder.prototype.ref = function (e) { this._ref = e }, t.Builder.prototype.field = function (e, n) {
        if (/\//.test(e))
          throw new RangeError(`Field '${e}' contains illegal character '/'`); this._fields[e] = n || {}
      }, t.Builder.prototype.b = function (e) { e < 0 ? this._b = 0 : e > 1 ? this._b = 1 : this._b = e }, t.Builder.prototype.k1 = function (e) { this._k1 = e }, t.Builder.prototype.add = function (e, n) { const r = e[this._ref]; const i = Object.keys(this._fields); this._documents[r] = n || {}, this.documentCount += 1; for (let s = 0; s < i.length; s++) { const o = i[s]; const a = this._fields[o].extractor; const c = a ? a(e) : e[o]; const l = this.tokenizer(c, { fields: [o] }); const d = this.pipeline.run(l); const f = new t.FieldRef(r, o); const p = Object.create(null); this.fieldTermFrequencies[f] = p, this.fieldLengths[f] = 0, this.fieldLengths[f] += d.length; for (let v = 0; v < d.length; v++) { const E = d[v]; if (p[E] == null && (p[E] = 0), p[E] += 1, this.invertedIndex[E] == null) { const L = Object.create(null); L._index = this.termIndex, this.termIndex += 1; for (let m = 0; m < i.length; m++)L[i[m]] = Object.create(null); this.invertedIndex[E] = L } this.invertedIndex[E][o][r] == null && (this.invertedIndex[E][o][r] = Object.create(null)); for (let g = 0; g < this.metadataWhitelist.length; g++) { const T = this.metadataWhitelist[g]; const w = E.metadata[T]; this.invertedIndex[E][o][r][T] == null && (this.invertedIndex[E][o][r][T] = []), this.invertedIndex[E][o][r][T].push(w) } } } }, t.Builder.prototype.calculateAverageFieldLengths = function () { for (var e = Object.keys(this.fieldLengths), n = e.length, r = {}, i = {}, s = 0; s < n; s++) { const o = t.FieldRef.fromString(e[s]); const a = o.fieldName; i[a] || (i[a] = 0), i[a] += 1, r[a] || (r[a] = 0), r[a] += this.fieldLengths[o] } for (var c = Object.keys(this._fields), s = 0; s < c.length; s++) { const l = c[s]; r[l] = r[l] / i[l] } this.averageFieldLength = r }, t.Builder.prototype.createFieldVectors = function () { for (var e = {}, n = Object.keys(this.fieldTermFrequencies), r = n.length, i = Object.create(null), s = 0; s < r; s++) { for (var o = t.FieldRef.fromString(n[s]), a = o.fieldName, c = this.fieldLengths[o], l = new t.Vector(), d = this.fieldTermFrequencies[o], f = Object.keys(d), p = f.length, v = this._fields[a].boost || 1, E = this._documents[o.docRef].boost || 1, L = 0; L < p; L++) { const m = f[L]; const g = d[m]; const T = this.invertedIndex[m]._index; var w; var C; var O; i[m] === void 0 ? (w = t.idf(this.invertedIndex[m], this.documentCount), i[m] = w) : w = i[m], C = w * ((this._k1 + 1) * g) / (this._k1 * (1 - this._b + this._b * (c / this.averageFieldLength[a])) + g), C *= v, C *= E, O = Math.round(C * 1e3) / 1e3, l.insert(T, O) }e[o] = l } this.fieldVectors = e }, t.Builder.prototype.createTokenSet = function () { this.tokenSet = t.TokenSet.fromArray(Object.keys(this.invertedIndex).sort()) }, t.Builder.prototype.build = function () { return this.calculateAverageFieldLengths(), this.createFieldVectors(), this.createTokenSet(), new t.Index({ invertedIndex: this.invertedIndex, fieldVectors: this.fieldVectors, tokenSet: this.tokenSet, fields: Object.keys(this._fields), pipeline: this.searchPipeline }) }, t.Builder.prototype.use = function (e) { const n = Array.prototype.slice.call(arguments, 1); n.unshift(this), e.apply(this, n) }, t.MatchData = function (e, n, r) { for (var i = Object.create(null), s = Object.keys(r || {}), o = 0; o < s.length; o++) { const a = s[o]; i[a] = r[a].slice() } this.metadata = Object.create(null), e !== void 0 && (this.metadata[e] = Object.create(null), this.metadata[e][n] = i) }, t.MatchData.prototype.combine = function (e) { for (let n = Object.keys(e.metadata), r = 0; r < n.length; r++) { const i = n[r]; const s = Object.keys(e.metadata[i]); this.metadata[i] == null && (this.metadata[i] = Object.create(null)); for (let o = 0; o < s.length; o++) { const a = s[o]; const c = Object.keys(e.metadata[i][a]); this.metadata[i][a] == null && (this.metadata[i][a] = Object.create(null)); for (let l = 0; l < c.length; l++) { const d = c[l]; this.metadata[i][a][d] == null ? this.metadata[i][a][d] = e.metadata[i][a][d] : this.metadata[i][a][d] = this.metadata[i][a][d].concat(e.metadata[i][a][d]) } } } }, t.MatchData.prototype.add = function (e, n, r) { if (!(e in this.metadata)) { this.metadata[e] = Object.create(null), this.metadata[e][n] = r; return } if (!(n in this.metadata[e])) { this.metadata[e][n] = r; return } for (let i = Object.keys(r), s = 0; s < i.length; s++) { const o = i[s]; o in this.metadata[e][n] ? this.metadata[e][n][o] = this.metadata[e][n][o].concat(r[o]) : this.metadata[e][n][o] = r[o] } }, t.Query = function (e) { this.clauses = [], this.allFields = e }, t.Query.wildcard = new String('*'), t.Query.wildcard.NONE = 0, t.Query.wildcard.LEADING = 1, t.Query.wildcard.TRAILING = 2, t.Query.presence = { OPTIONAL: 1, REQUIRED: 2, PROHIBITED: 3 }, t.Query.prototype.clause = function (e) { return 'fields' in e || (e.fields = this.allFields), 'boost' in e || (e.boost = 1), 'usePipeline' in e || (e.usePipeline = !0), 'wildcard' in e || (e.wildcard = t.Query.wildcard.NONE), e.wildcard & t.Query.wildcard.LEADING && e.term.charAt(0) != t.Query.wildcard && (e.term = `*${e.term}`), e.wildcard & t.Query.wildcard.TRAILING && e.term.slice(-1) != t.Query.wildcard && (e.term = `${e.term}*`), 'presence' in e || (e.presence = t.Query.presence.OPTIONAL), this.clauses.push(e), this }, t.Query.prototype.isNegated = function () {
        for (let e = 0; e < this.clauses.length; e++) {
          if (this.clauses[e].presence != t.Query.presence.PROHIBITED)
            return !1
        } return !0
      }, t.Query.prototype.term = function (e, n) {
        if (Array.isArray(e))
          return e.forEach(function (i) { this.term(i, t.utils.clone(n)) }, this), this; const r = n || {}; return r.term = e.toString(), this.clause(r), this
      }, t.QueryParseError = function (e, n, r) { this.name = 'QueryParseError', this.message = e, this.start = n, this.end = r }, t.QueryParseError.prototype = new Error(), t.QueryLexer = function (e) { this.lexemes = [], this.str = e, this.length = e.length, this.pos = 0, this.start = 0, this.escapeCharPositions = [] }, t.QueryLexer.prototype.run = function () { for (let e = t.QueryLexer.lexText; e;)e = e(this) }, t.QueryLexer.prototype.sliceString = function () { for (var e = [], n = this.start, r = this.pos, i = 0; i < this.escapeCharPositions.length; i++)r = this.escapeCharPositions[i], e.push(this.str.slice(n, r)), n = r + 1; return e.push(this.str.slice(n, this.pos)), this.escapeCharPositions.length = 0, e.join('') }, t.QueryLexer.prototype.emit = function (e) { this.lexemes.push({ type: e, str: this.sliceString(), start: this.start, end: this.pos }), this.start = this.pos }, t.QueryLexer.prototype.escapeCharacter = function () { this.escapeCharPositions.push(this.pos - 1), this.pos += 1 }, t.QueryLexer.prototype.next = function () {
        if (this.pos >= this.length)
          return t.QueryLexer.EOS; const e = this.str.charAt(this.pos); return this.pos += 1, e
      }, t.QueryLexer.prototype.width = function () { return this.pos - this.start }, t.QueryLexer.prototype.ignore = function () { this.start == this.pos && (this.pos += 1), this.start = this.pos }, t.QueryLexer.prototype.backup = function () { this.pos -= 1 }, t.QueryLexer.prototype.acceptDigitRun = function () { let e, n; do e = this.next(), n = e.charCodeAt(0); while (n > 47 && n < 58); e != t.QueryLexer.EOS && this.backup() }, t.QueryLexer.prototype.more = function () { return this.pos < this.length }, t.QueryLexer.EOS = 'EOS', t.QueryLexer.FIELD = 'FIELD', t.QueryLexer.TERM = 'TERM', t.QueryLexer.EDIT_DISTANCE = 'EDIT_DISTANCE', t.QueryLexer.BOOST = 'BOOST', t.QueryLexer.PRESENCE = 'PRESENCE', t.QueryLexer.lexField = function (e) { return e.backup(), e.emit(t.QueryLexer.FIELD), e.ignore(), t.QueryLexer.lexText }, t.QueryLexer.lexTerm = function (e) {
        if (e.width() > 1 && (e.backup(), e.emit(t.QueryLexer.TERM)), e.ignore(), e.more())
          return t.QueryLexer.lexText
      }, t.QueryLexer.lexEditDistance = function (e) { return e.ignore(), e.acceptDigitRun(), e.emit(t.QueryLexer.EDIT_DISTANCE), t.QueryLexer.lexText }, t.QueryLexer.lexBoost = function (e) { return e.ignore(), e.acceptDigitRun(), e.emit(t.QueryLexer.BOOST), t.QueryLexer.lexText }, t.QueryLexer.lexEOS = function (e) { e.width() > 0 && e.emit(t.QueryLexer.TERM) }, t.QueryLexer.termSeparator = t.tokenizer.separator, t.QueryLexer.lexText = function (e) {
        for (;;) {
          const n = e.next(); if (n == t.QueryLexer.EOS)
            return t.QueryLexer.lexEOS; if (n.charCodeAt(0) == 92) { e.escapeCharacter(); continue } if (n == ':')
            return t.QueryLexer.lexField; if (n == '~')
            return e.backup(), e.width() > 0 && e.emit(t.QueryLexer.TERM), t.QueryLexer.lexEditDistance; if (n == '^')
            return e.backup(), e.width() > 0 && e.emit(t.QueryLexer.TERM), t.QueryLexer.lexBoost; if (n == '+' && e.width() === 1 || n == '-' && e.width() === 1)
            return e.emit(t.QueryLexer.PRESENCE), t.QueryLexer.lexText; if (n.match(t.QueryLexer.termSeparator))
            return t.QueryLexer.lexTerm
        }
      }, t.QueryParser = function (e, n) { this.lexer = new t.QueryLexer(e), this.query = n, this.currentClause = {}, this.lexemeIdx = 0 }, t.QueryParser.prototype.parse = function () { this.lexer.run(), this.lexemes = this.lexer.lexemes; for (let e = t.QueryParser.parseClause; e;)e = e(this); return this.query }, t.QueryParser.prototype.peekLexeme = function () { return this.lexemes[this.lexemeIdx] }, t.QueryParser.prototype.consumeLexeme = function () { const e = this.peekLexeme(); return this.lexemeIdx += 1, e }, t.QueryParser.prototype.nextClause = function () { const e = this.currentClause; this.query.clause(e), this.currentClause = {} }, t.QueryParser.parseClause = function (e) {
        const n = e.peekLexeme(); if (n != null)
          switch (n.type) { case t.QueryLexer.PRESENCE:return t.QueryParser.parsePresence; case t.QueryLexer.FIELD:return t.QueryParser.parseField; case t.QueryLexer.TERM:return t.QueryParser.parseTerm; default:var r = `expected either a field or a term, found ${n.type}`; throw n.str.length >= 1 && (r += ` with value '${n.str}'`), new t.QueryParseError(r, n.start, n.end) }
      }, t.QueryParser.parsePresence = function (e) { const n = e.consumeLexeme(); if (n != null) { switch (n.str) { case '-':e.currentClause.presence = t.Query.presence.PROHIBITED; break; case '+':e.currentClause.presence = t.Query.presence.REQUIRED; break; default:var r = `unrecognised presence operator'${n.str}'`; throw new t.QueryParseError(r, n.start, n.end) } const i = e.peekLexeme(); if (i == null) { var r = 'expecting term or field, found nothing'; throw new t.QueryParseError(r, n.start, n.end) } switch (i.type) { case t.QueryLexer.FIELD:return t.QueryParser.parseField; case t.QueryLexer.TERM:return t.QueryParser.parseTerm; default:var r = `expecting term or field, found '${i.type}'`; throw new t.QueryParseError(r, i.start, i.end) } } }, t.QueryParser.parseField = function (e) {
        const n = e.consumeLexeme(); if (n != null) {
          if (!e.query.allFields.includes(n.str)) { const r = e.query.allFields.map((o) => { return `'${o}'` }).join(', '); var i = `unrecognised field '${n.str}', possible fields: ${r}`; throw new t.QueryParseError(i, n.start, n.end) }e.currentClause.fields = [n.str]; const s = e.peekLexeme(); if (s == null) { var i = 'expecting term, found nothing'; throw new t.QueryParseError(i, n.start, n.end) } if (s.type === t.QueryLexer.TERM)
            return t.QueryParser.parseTerm; var i = `expecting term, found '${s.type}'`; throw new t.QueryParseError(i, s.start, s.end)
        }
      }, t.QueryParser.parseTerm = function (e) { const n = e.consumeLexeme(); if (n != null) { e.currentClause.term = n.str.toLowerCase(), n.str.includes('*') && (e.currentClause.usePipeline = !1); const r = e.peekLexeme(); if (r == null) { e.nextClause(); return } switch (r.type) { case t.QueryLexer.TERM:return e.nextClause(), t.QueryParser.parseTerm; case t.QueryLexer.FIELD:return e.nextClause(), t.QueryParser.parseField; case t.QueryLexer.EDIT_DISTANCE:return t.QueryParser.parseEditDistance; case t.QueryLexer.BOOST:return t.QueryParser.parseBoost; case t.QueryLexer.PRESENCE:return e.nextClause(), t.QueryParser.parsePresence; default:var i = `Unexpected lexeme type '${r.type}'`; throw new t.QueryParseError(i, r.start, r.end) } } }, t.QueryParser.parseEditDistance = function (e) { const n = e.consumeLexeme(); if (n != null) { const r = Number.parseInt(n.str, 10); if (isNaN(r)) { var i = 'edit distance must be numeric'; throw new t.QueryParseError(i, n.start, n.end) }e.currentClause.editDistance = r; const s = e.peekLexeme(); if (s == null) { e.nextClause(); return } switch (s.type) { case t.QueryLexer.TERM:return e.nextClause(), t.QueryParser.parseTerm; case t.QueryLexer.FIELD:return e.nextClause(), t.QueryParser.parseField; case t.QueryLexer.EDIT_DISTANCE:return t.QueryParser.parseEditDistance; case t.QueryLexer.BOOST:return t.QueryParser.parseBoost; case t.QueryLexer.PRESENCE:return e.nextClause(), t.QueryParser.parsePresence; default:var i = `Unexpected lexeme type '${s.type}'`; throw new t.QueryParseError(i, s.start, s.end) } } }, t.QueryParser.parseBoost = function (e) { const n = e.consumeLexeme(); if (n != null) { const r = Number.parseInt(n.str, 10); if (isNaN(r)) { var i = 'boost must be numeric'; throw new t.QueryParseError(i, n.start, n.end) }e.currentClause.boost = r; const s = e.peekLexeme(); if (s == null) { e.nextClause(); return } switch (s.type) { case t.QueryLexer.TERM:return e.nextClause(), t.QueryParser.parseTerm; case t.QueryLexer.FIELD:return e.nextClause(), t.QueryParser.parseField; case t.QueryLexer.EDIT_DISTANCE:return t.QueryParser.parseEditDistance; case t.QueryLexer.BOOST:return t.QueryParser.parseBoost; case t.QueryLexer.PRESENCE:return e.nextClause(), t.QueryParser.parsePresence; default:var i = `Unexpected lexeme type '${s.type}'`; throw new t.QueryParseError(i, s.start, s.end) } } }, (function (e, n) { typeof define == 'function' && define.amd ? define(n) : typeof me == 'object' ? ge.exports = n() : e.lunr = n() })(this, () => { return t })
    })()
  }); let M; const G = { getItem() { return null }, setItem() {} }; let K; try { K = localStorage, M = K }
  catch { K = G, M = G } const S = { getItem: t => M.getItem(t), setItem: (t, e) => M.setItem(t, e), disableWritingLocalStorage() { M = G }, disable() { localStorage.clear(), M = G }, enable() { M = K } }; window.TypeDoc ||= { disableWritingLocalStorage() { S.disableWritingLocalStorage() }, disableLocalStorage: () => { S.disable() }, enableLocalStorage: () => { S.enable() } }; window.translations ||= { copy: 'Copy', copied: 'Copied!', normally_hidden: 'This member is normally hidden due to your filter settings.', hierarchy_expand: 'Expand', hierarchy_collapse: 'Collapse', search_index_not_available: 'The search index is not available', search_no_results_found_for_0: 'No results found for {0}', folder: 'Folder', kind_1: 'Project', kind_2: 'Module', kind_4: 'Namespace', kind_8: 'Enumeration', kind_16: 'Enumeration Member', kind_32: 'Variable', kind_64: 'Function', kind_128: 'Class', kind_256: 'Interface', kind_512: 'Constructor', kind_1024: 'Property', kind_2048: 'Method', kind_4096: 'Call Signature', kind_8192: 'Index Signature', kind_16384: 'Constructor Signature', kind_32768: 'Parameter', kind_65536: 'Type Literal', kind_131072: 'Type Parameter', kind_262144: 'Accessor', kind_524288: 'Get Signature', kind_1048576: 'Set Signature', kind_2097152: 'Type Alias', kind_4194304: 'Reference', kind_8388608: 'Document' }; const pe = []; function X(t, e) { pe.push({ selector: e, constructor: t }) } const Z = class {
    alwaysVisibleMember = null; constructor() { this.createComponents(document.body), this.ensureFocusedElementVisible(), this.listenForCodeCopies(), window.addEventListener('hashchange', () => this.ensureFocusedElementVisible()), document.body.style.display || (this.ensureFocusedElementVisible(), this.updateIndexVisibility(), this.scrollToHash()) }createComponents(e) { pe.forEach((n) => { e.querySelectorAll(n.selector).forEach((r) => { r.dataset.hasInstance || (new n.constructor({ el: r, app: this }), r.dataset.hasInstance = String(!0)) }) }) }filterChanged() { this.ensureFocusedElementVisible() }showPage() { document.body.style.display && (document.body.style.removeProperty('display'), this.ensureFocusedElementVisible(), this.updateIndexVisibility(), this.scrollToHash()) }scrollToHash() {
      if (location.hash) {
        const e = document.getElementById(location.hash.substring(1)); if (!e)
          return; e.scrollIntoView({ behavior: 'instant', block: 'start' })
      }
    }

    ensureActivePageVisible() { const e = document.querySelector('.tsd-navigation .current'); let n = e?.parentElement; for (;n && !n.classList.contains('.tsd-navigation');)n instanceof HTMLDetailsElement && (n.open = !0), n = n.parentElement; if (e && !rt(e)) { const r = e.getBoundingClientRect().top - document.documentElement.clientHeight / 4; document.querySelector('.site-menu').scrollTop = r, document.querySelector('.col-sidebar').scrollTop = r } }updateIndexVisibility() { const e = document.querySelector('.tsd-index-content'); const n = e?.open; e && (e.open = !0), document.querySelectorAll('.tsd-index-section').forEach((r) => { r.style.display = 'block'; const i = Array.from(r.querySelectorAll('.tsd-index-link')).every(s => s.offsetParent == null); r.style.display = i ? 'none' : 'block' }), e && (e.open = n) }ensureFocusedElementVisible() {
      if (this.alwaysVisibleMember && (this.alwaysVisibleMember.classList.remove('always-visible'), this.alwaysVisibleMember.firstElementChild.remove(), this.alwaysVisibleMember = null), !location.hash)
        return; const e = document.getElementById(location.hash.substring(1)); if (!e)
        return; let n = e.parentElement; for (;n && n.tagName !== 'SECTION';)n = n.parentElement; if (!n)
        return; const r = n.offsetParent == null; let i = n; for (;i !== document.body;)i instanceof HTMLDetailsElement && (i.open = !0), i = i.parentElement; if (n.offsetParent == null) { this.alwaysVisibleMember = n, n.classList.add('always-visible'); const s = document.createElement('p'); s.classList.add('warning'), s.textContent = window.translations.normally_hidden, n.prepend(s) }r && e.scrollIntoView()
    }

    listenForCodeCopies() { document.querySelectorAll('pre > button').forEach((e) => { let n; e.addEventListener('click', () => { e.previousElementSibling instanceof HTMLElement && navigator.clipboard.writeText(e.previousElementSibling.innerText.trim()), e.textContent = window.translations.copied, e.classList.add('visible'), clearTimeout(n), n = setTimeout(() => { e.classList.remove('visible'), n = setTimeout(() => { e.textContent = window.translations.copy }, 100) }, 1e3) }) }) }
  }; function rt(t) { const e = t.getBoundingClientRect(); const n = Math.max(document.documentElement.clientHeight, window.innerHeight); return !(e.bottom < 0 || e.top - n >= 0) } const fe = (t, e = 100) => { let n; return () => { clearTimeout(n), n = setTimeout(t, e) } }; const Ie = nt(ye(), 1); async function R(t) { const e = Uint8Array.from(atob(t), s => s.charCodeAt(0)); const r = new Blob([e]).stream().pipeThrough(new DecompressionStream('deflate')); const i = await new Response(r).text(); return JSON.parse(i) } const Y = 'closing'; const ae = 'tsd-overlay'; function it() { const t = Math.abs(window.innerWidth - document.documentElement.clientWidth); document.body.style.overflow = 'hidden', document.body.style.paddingRight = `${t}px` } function st() { document.body.style.removeProperty('overflow'), document.body.style.removeProperty('padding-right') } function Ee(t, e) { t.addEventListener('animationend', () => { t.classList.contains(Y) && (t.classList.remove(Y), document.getElementById(ae)?.remove(), t.close(), st()) }), t.addEventListener('cancel', (n) => { n.preventDefault(), ve(t) }), e?.closeOnClick && document.addEventListener('click', (n) => { t.open && !t.contains(n.target) && ve(t) }, !0) } function xe(t) {
    if (t.open)
      return; const e = document.createElement('div'); e.id = ae, document.body.appendChild(e), t.showModal(), it()
  } function ve(t) {
    if (!t.open)
      return; document.getElementById(ae)?.classList.add(Y), t.classList.add(Y)
  } const I = class {el; app; constructor(e) { this.el = e.el, this.app = e.app }}; const be = document.head.appendChild(document.createElement('style')); be.dataset.for = 'filters'; const le = {}; function Le(t) {
    for (const e of t.split(/\s+/)) {
      if (Object.hasOwn(le, e) && !le[e])
        return !0
    } return !1
  } const ee = class extends I {
    key; value; constructor(e) {
      super(e), this.key = `filter-${this.el.name}`, this.value = this.el.checked, this.el.addEventListener('change', () => { this.setLocalStorage(this.el.checked) }), this.setLocalStorage(this.fromLocalStorage()), be.innerHTML += `html:not(.${this.key}) .tsd-is-${this.el.name} { display: none; }
`, this.app.updateIndexVisibility()
    }

    fromLocalStorage() { const e = S.getItem(this.key); return e ? e === 'true' : this.el.checked }setLocalStorage(e) { S.setItem(this.key, e.toString()), this.value = e, this.handleValueChange() }handleValueChange() { this.el.checked = this.value, document.documentElement.classList.toggle(this.key, this.value), le[`tsd-is-${this.el.name}`] = this.value, this.app.filterChanged(), this.app.updateIndexVisibility() }
  }; let we = 0; async function Se(t, e) {
    if (!window.searchData)
      return; const n = await R(window.searchData); t.data = n, t.index = Ie.Index.load(n.index), e.innerHTML = ''
  } function _e() {
    const t = document.getElementById('tsd-search-trigger'); const e = document.getElementById('tsd-search'); const n = document.getElementById('tsd-search-input'); const r = document.getElementById('tsd-search-results'); const i = document.getElementById('tsd-search-script'); const s = document.getElementById('tsd-search-status'); if (!(t && e && n && r && i && s))
      throw new Error('Search controls missing'); const o = { base: document.documentElement.dataset.base }; o.base.endsWith('/') || (o.base += '/'), i.addEventListener('error', () => { const a = window.translations.search_index_not_available; Pe(s, a) }), i.addEventListener('load', () => { Se(o, s) }), Se(o, s), ot({ trigger: t, searchEl: e, results: r, field: n, status: s }, o)
  } function ot(t, e) {
    const { field: n, results: r, searchEl: i, status: s, trigger: o } = t; Ee(i, { closeOnClick: !0 }); function a() { xe(i), n.setSelectionRange(0, n.value.length) }o.addEventListener('click', a), n.addEventListener('input', fe(() => { at(r, n, s, e) }, 200)), n.addEventListener('keydown', (l) => {
      if (r.childElementCount === 0 || l.ctrlKey || l.metaKey || l.altKey)
        return; const d = n.getAttribute('aria-activedescendant'); const f = d ? document.getElementById(d) : null; if (f) { let p = !1; let v = !1; switch (l.key) { case 'Home':case 'End':case 'ArrowLeft':case 'ArrowRight':v = !0; break; case 'ArrowDown':case 'ArrowUp':p = l.shiftKey; break }(p || v) && ke(n) } if (!l.shiftKey)
        switch (l.key) { case 'Enter':f?.querySelector('a')?.click(); break; case 'ArrowUp':Te(r, n, f, -1), l.preventDefault(); break; case 'ArrowDown':Te(r, n, f, 1), l.preventDefault(); break }
    }); function c() { ke(n) }n.addEventListener('change', c), n.addEventListener('blur', c), n.addEventListener('click', c), document.body.addEventListener('keydown', (l) => {
      if (l.altKey || l.metaKey || l.shiftKey)
        return; const d = l.ctrlKey && l.key === 'k'; const f = !l.ctrlKey && !ut() && l.key === '/'; (d || f) && (l.preventDefault(), a())
    })
  } function at(t, e, n, r) {
    if (!r.index || !r.data)
      return; t.innerHTML = '', n.innerHTML = '', we += 1; const i = e.value.trim(); let s; if (i) { const a = i.split(' ').map(c => c.length ? `*${c}*` : '').join(' '); s = r.index.search(a).filter(({ ref: c }) => { const l = r.data.rows[Number(c)].classes; return !l || !Le(l) }) }
    else {
      s = []
    } if (s.length === 0 && i) { const a = window.translations.search_no_results_found_for_0.replace('{0}', ` "<strong>${te(i)}</strong>" `); Pe(n, a); return } for (let a = 0; a < s.length; a++) { const c = s[a]; const l = r.data.rows[Number(c.ref)]; let d = 1; l.name.toLowerCase().startsWith(i.toLowerCase()) && (d *= 10 / (1 + Math.abs(l.name.length - i.length))), c.score *= d }s.sort((a, c) => c.score - a.score); const o = Math.min(10, s.length); for (let a = 0; a < o; a++) {
      const c = r.data.rows[Number(s[a].ref)]; const d = `<svg width="20" height="20" class="tsd-kind-icon" aria-label="${window.translations[`kind_${c.kind}`].replaceAll('"', '&quot;')}"><use href="#icon-${c.icon || c.kind}"></use></svg>`; let f = Ce(c.name, i); globalThis.DEBUG_SEARCH_WEIGHTS && (f += ` (score: ${s[a].score.toFixed(2)})`), c.parent && (f = `<span class="parent">
                ${Ce(c.parent, i)}.</span>${f}`); const p = document.createElement('li'); p.id = `tsd-search:${we}-${a}`, p.role = 'option', p.ariaSelected = 'false', p.classList.value = c.classes ?? ''; const v = document.createElement('a'); v.tabIndex = -1, v.href = r.base + c.url, v.innerHTML = `${d}<span class="text">${f}</span>`, p.append(v), t.appendChild(p)
    }
  } function Te(t, e, n, r) { let i; if (r === 1 ? i = n?.nextElementSibling || t.firstElementChild : i = n?.previousElementSibling || t.lastElementChild, i !== n) { if (!i || i.role !== 'option') { console.error('Option missing'); return }i.ariaSelected = 'true', i.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), e.setAttribute('aria-activedescendant', i.id), n?.setAttribute('aria-selected', 'false') } } function ke(t) { const e = t.getAttribute('aria-activedescendant'); (e ? document.getElementById(e) : null)?.setAttribute('aria-selected', 'false'), t.setAttribute('aria-activedescendant', '') } function Ce(t, e) {
    if (e === '')
      return t; const n = t.toLocaleLowerCase(); const r = e.toLocaleLowerCase(); const i = []; let s = 0; let o = n.indexOf(r); for (;o != -1;)i.push(te(t.substring(s, o)), `<mark>${te(t.substring(o, o + r.length))}</mark>`), s = o + r.length, o = n.indexOf(r, s); return i.push(te(t.substring(s))), i.join('')
  } const lt = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\'': '&#039;', '"': '&quot;' }; function te(t) { return t.replace(/[&<>"']/g, e => lt[e]) } function Pe(t, e) { t.innerHTML = e ? `<div>${e}</div>` : '' } const ct = ['button', 'checkbox', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']; function ut() { const t = document.activeElement; return t ? t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SEARCH' ? !0 : t.tagName === 'INPUT' && !ct.includes(t.type) : !1 } let D = 'mousedown'; let Me = 'mousemove'; let $ = 'mouseup'; const ne = { x: 0, y: 0 }; let Qe = !1; let ce = !1; let dt = !1; let F = !1; const Oe = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent); document.documentElement.classList.add(Oe ? 'is-mobile' : 'not-mobile'); Oe && 'ontouchstart' in document.documentElement && (dt = !0, D = 'touchstart', Me = 'touchmove', $ = 'touchend'); document.addEventListener(D, (t) => { ce = !0, F = !1; const e = D == 'touchstart' ? t.targetTouches[0] : t; ne.y = e.pageY || 0, ne.x = e.pageX || 0 }); document.addEventListener(Me, (t) => { if (ce && !F) { const e = D == 'touchstart' ? t.targetTouches[0] : t; const n = ne.x - (e.pageX || 0); const r = ne.y - (e.pageY || 0); F = Math.sqrt(n * n + r * r) > 10 } }); document.addEventListener($, () => { ce = !1 }); document.addEventListener('click', (t) => { Qe && (t.preventDefault(), t.stopImmediatePropagation(), Qe = !1) }); const re = class extends I {
    active; className; constructor(e) { super(e), this.className = this.el.dataset.toggle || '', this.el.addEventListener($, n => this.onPointerUp(n)), this.el.addEventListener('click', n => n.preventDefault()), document.addEventListener(D, n => this.onDocumentPointerDown(n)), document.addEventListener($, n => this.onDocumentPointerUp(n)) }setActive(e) {
      if (this.active == e)
        return; this.active = e, document.documentElement.classList.toggle(`has-${this.className}`, e), this.el.classList.toggle('active', e); const n = (this.active ? 'to-has-' : 'from-has-') + this.className; document.documentElement.classList.add(n), setTimeout(() => document.documentElement.classList.remove(n), 500)
    }

    onPointerUp(e) { F || (this.setActive(!0), e.preventDefault()) }onDocumentPointerDown(e) {
      if (this.active) {
        if (e.target.closest('.col-sidebar, .tsd-filter-group'))
          return; this.setActive(!1)
      }
    }

    onDocumentPointerUp(e) { if (!F && this.active && e.target.closest('.col-sidebar')) { const n = e.target.closest('a'); if (n) { let r = window.location.href; r.includes('#') && (r = r.substring(0, r.indexOf('#'))), n.href.substring(0, r.length) == r && setTimeout(() => this.setActive(!1), 250) } } }
  }; const ue = new Map(); const de = class {open; accordions = []; key; constructor(e, n) { this.key = e, this.open = n }add(e) { this.accordions.push(e), e.open = this.open, e.addEventListener('toggle', () => { this.toggle(e.open) }) }toggle(e) { for (const n of this.accordions)n.open = e; S.setItem(this.key, e.toString()) }}; const ie = class extends I {
    constructor(e) {
      super(e); const n = this.el.querySelector('summary'); const r = n.querySelector('a'); r && r.addEventListener('click', () => { location.assign(r.href) }); const i = `tsd-accordion-${n.dataset.key ?? n.textContent.trim().replace(/\s+/g, '-').toLowerCase()}`; let s; if (ue.has(i)) {
        s = ue.get(i)
      }
      else { const o = S.getItem(i); const a = o ? o === 'true' : this.el.open; s = new de(i, a), ue.set(i, s) }s.add(this.el)
    }
  }; function He(t) { const e = S.getItem('tsd-theme') || 'os'; t.value = e, Ae(e), t.addEventListener('change', () => { S.setItem('tsd-theme', t.value), Ae(t.value) }) } function Ae(t) { document.documentElement.dataset.theme = t } let se; function Ne() { const t = document.getElementById('tsd-nav-script'); t && (t.addEventListener('load', Re), Re()) } async function Re() {
    const t = document.getElementById('tsd-nav-container'); if (!t || !window.navigationData)
      return; const e = await R(window.navigationData); se = document.documentElement.dataset.base, se.endsWith('/') || (se += '/'), t.innerHTML = ''; for (const n of e)Ve(n, t, []); window.app.createComponents(t), window.app.showPage(), window.app.ensureActivePageVisible()
  } function Ve(t, e, n) {
    const r = e.appendChild(document.createElement('li')); if (t.children) { const i = [...n, t.text]; const s = r.appendChild(document.createElement('details')); s.className = t.class ? `${t.class} tsd-accordion` : 'tsd-accordion'; const o = s.appendChild(document.createElement('summary')); o.className = 'tsd-accordion-summary', o.dataset.key = i.join('$'), o.innerHTML = '<svg width="20" height="20"><use href="#icon-chevronDown"></use></svg>', De(t, o); const a = s.appendChild(document.createElement('div')); a.className = 'tsd-accordion-details'; const c = a.appendChild(document.createElement('ul')); c.className = 'tsd-nested-navigation'; for (const l of t.children)Ve(l, c, i) }
    else {
      De(t, r, t.class)
    }
  } function De(t, e, n) {
    if (t.path) { const r = e.appendChild(document.createElement('a')); if (r.href = se + t.path, n && (r.className = n), location.pathname === r.pathname && !r.href.includes('#') && (r.classList.add('current'), r.ariaCurrent = 'page'), t.kind) { const i = window.translations[`kind_${t.kind}`].replaceAll('"', '&quot;'); r.innerHTML = `<svg width="20" height="20" class="tsd-kind-icon" aria-label="${i}"><use href="#icon-${t.icon || t.kind}"></use></svg>` }r.appendChild(Fe(t.text, document.createElement('span'))) }
    else { const r = e.appendChild(document.createElement('span')); const i = window.translations.folder.replaceAll('"', '&quot;'); r.innerHTML = `<svg width="20" height="20" class="tsd-kind-icon" aria-label="${i}"><use href="#icon-folder"></use></svg>`, r.appendChild(Fe(t.text, document.createElement('span'))) }
  } function Fe(t, e) { const n = t.split(/(?<=[^A-Z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[_-])(?=[^_-])/); for (let r = 0; r < n.length; ++r)r !== 0 && e.appendChild(document.createElement('wbr')), e.appendChild(document.createTextNode(n[r])); return e } let oe = document.documentElement.dataset.base; oe.endsWith('/') || (oe += '/'); function $e() { document.querySelector('.tsd-full-hierarchy') ? ht() : document.querySelector('.tsd-hierarchy') && pt() } function ht() { document.addEventListener('click', (r) => { let i = r.target; for (;i.parentElement && i.parentElement.tagName != 'LI';)i = i.parentElement; i.dataset.dropdown && (i.dataset.dropdown = String(i.dataset.dropdown !== 'true')) }); const t = new Map(); const e = new Set(); for (const r of document.querySelectorAll('.tsd-full-hierarchy [data-refl]')) { const i = r.querySelector('ul'); t.has(r.dataset.refl) ? e.add(r.dataset.refl) : i && t.set(r.dataset.refl, i) } for (const r of e)n(r); function n(r) { const i = t.get(r).cloneNode(!0); i.querySelectorAll('[id]').forEach((s) => { s.removeAttribute('id') }), i.querySelectorAll('[data-dropdown]').forEach((s) => { s.dataset.dropdown = 'false' }); for (const s of document.querySelectorAll(`[data-refl="${r}"]`)) { const o = gt(); const a = s.querySelector('ul'); s.insertBefore(o, a), o.dataset.dropdown = String(!!a), a || s.appendChild(i.cloneNode(!0)) } } } function pt() { const t = document.getElementById('tsd-hierarchy-script'); t && (t.addEventListener('load', Be), Be()) } async function Be() {
    const t = document.querySelector('.tsd-panel.tsd-hierarchy:has(h4 a)'); if (!t || !window.hierarchyData)
      return; const e = +t.dataset.refl; const n = await R(window.hierarchyData); const r = t.querySelector('ul'); const i = document.createElement('ul'); if (i.classList.add('tsd-hierarchy'), ft(i, n, e), r.querySelectorAll('li').length == i.querySelectorAll('li').length)
      return; const s = document.createElement('span'); s.classList.add('tsd-hierarchy-toggle'), s.textContent = window.translations.hierarchy_expand, t.querySelector('h4 a')?.insertAdjacentElement('afterend', s), s.insertAdjacentText('beforebegin', ', '), s.addEventListener('click', () => { s.textContent === window.translations.hierarchy_expand ? (r.insertAdjacentElement('afterend', i), r.remove(), s.textContent = window.translations.hierarchy_collapse) : (i.insertAdjacentElement('afterend', r), i.remove(), s.textContent = window.translations.hierarchy_expand) })
  } function ft(t, e, n) { const r = e.roots.filter(i => mt(e, i, n)); for (const i of r)t.appendChild(je(e, i, n)) } function je(t, e, n, r = new Set()) {
    if (r.has(e))
      return; r.add(e); const i = t.reflections[e]; const s = document.createElement('li'); if (s.classList.add('tsd-hierarchy-item'), e === n) { const o = s.appendChild(document.createElement('span')); o.textContent = i.name, o.classList.add('tsd-hierarchy-target') }
    else { for (const a of i.uniqueNameParents || []) { const c = t.reflections[a]; const l = s.appendChild(document.createElement('a')); l.textContent = c.name, l.href = oe + c.url, l.className = `${c.class} tsd-signature-type`, s.append(document.createTextNode('.')) } const o = s.appendChild(document.createElement('a')); o.textContent = t.reflections[e].name, o.href = oe + i.url, o.className = `${i.class} tsd-signature-type` } if (i.children) { const o = s.appendChild(document.createElement('ul')); o.classList.add('tsd-hierarchy'); for (const a of i.children) { const c = je(t, a, n, r); c && o.appendChild(c) } } return r.delete(e), s
  } function mt(t, e, n) {
    if (e === n)
      return !0; const r = new Set(); const i = [t.reflections[e]]; for (;i.length;) {
      const s = i.pop(); if (!r.has(s)) {
        r.add(s); for (const o of s.children || []) {
          if (o === n)
            return !0; i.push(t.reflections[o])
        }
      }
    } return !1
  } function gt() { const t = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); return t.setAttribute('width', '20'), t.setAttribute('height', '20'), t.innerHTML = '<use href="#icon-chevronDown"></use>', t }X(re, 'a[data-toggle]'); X(ie, '.tsd-accordion'); X(ee, '.tsd-filter-item input[type=checkbox]'); const qe = document.getElementById('tsd-theme'); qe && He(qe); const yt = new Z(); Object.defineProperty(window, 'app', { value: yt }); _e(); Ne(); $e(); 'virtualKeyboard' in navigator && (navigator.virtualKeyboard.overlaysContent = !0)
})()
/*! Bundled license information:

lunr/lunr.js:
  (**
   * lunr - http://lunrjs.com - A bit like Solr, but much smaller and not as bright - 2.3.9
   * Copyright (C) 2020 Oliver Nightingale
   * @license MIT
   *)
  (*!
   * lunr.utils
   * Copyright (C) 2020 Oliver Nightingale
   *)
  (*!
   * lunr.Set
   * Copyright (C) 2020 Oliver Nightingale
   *)
  (*!
   * lunr.tokenizer
   * Copyright (C) 2020 Oliver Nightingale
   *)
  (*!
   * lunr.Pipeline
   * Copyright (C) 2020 Oliver Nightingale
   *)
  (*!
   * lunr.Vector
   * Copyright (C) 2020 Oliver Nightingale
   *)
  (*!
   * lunr.stemmer
   * Copyright (C) 2020 Oliver Nightingale
   * Includes code from - http://tartarus.org/~martin/PorterStemmer/js.txt
   *)
  (*!
   * lunr.stopWordFilter
   * Copyright (C) 2020 Oliver Nightingale
   *)
  (*!
   * lunr.trimmer
   * Copyright (C) 2020 Oliver Nightingale
   *)
  (*!
   * lunr.TokenSet
   * Copyright (C) 2020 Oliver Nightingale
   *)
  (*!
   * lunr.Index
   * Copyright (C) 2020 Oliver Nightingale
   *)
  (*!
   * lunr.Builder
   * Copyright (C) 2020 Oliver Nightingale
   *)
*/
