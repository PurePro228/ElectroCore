/* ElectroCore — модель схемы и транзиентный анализ.
 *
 * Схема = список компонентов + список проводов. Провода соединяют выводы;
 * связанные выводы объединяются в узлы (система непересекающихся множеств),
 * после чего строится и решается система МУП на каждом шаге по времени.
 */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util, SOL = EC.solver;
  var GRID = EC.GRID;

  var PREFIX = {
    resistor: 'R', capacitor: 'C', capacitor_pol: 'C', inductor: 'L', pot: 'RV',
    lamp: 'HL', fuse: 'FU', battery: 'GB', vsource: 'G', isource: 'I',
    switch: 'SA', button: 'SB', spdt: 'SA', relay: 'K', diode: 'VD', zener: 'VD',
    led: 'HL', npn: 'VT', pnp: 'VT', nmos: 'VT', pmos: 'VT', opamp: 'DA',
    voltmeter: 'PV', ammeter: 'PA', wattmeter: 'PW', probe: 'X', ground: '', junction: ''
  };

  /* ------------------------------------------------------------------ */
  /*  Компонент                                                          */
  /* ------------------------------------------------------------------ */

  function Component(type, x, y) {
    var def = EC.defs[type];
    if (!def) throw new Error('Неизвестный тип: ' + type);
    this.id = U.uid('c');
    this.type = type;
    this.x = x; this.y = y;          // положение в клетках сетки
    this.rot = 0;                    // 0..3 (повороты по 90°)
    this.props = {};
    for (var i = 0; i < def.props.length; i++) {
      var p = def.props[i];
      this.props[p.key] = p.def;
    }
    this.name = '';
    this.v = 0; this.i = 0;
    if (def.init) def.init(this);
  }

  Component.prototype.def = function () { return EC.defs[this.type]; };

  /** Позиция вывода index в координатах сетки с учётом поворота. */
  Component.prototype.pinPos = function (index) {
    var pin = this.def().pins[index];
    var px = pin.x, py = pin.y, r = ((this.rot % 4) + 4) % 4, rx, ry;
    if (r === 0) { rx = px; ry = py; }
    else if (r === 1) { rx = -py; ry = px; }
    else if (r === 2) { rx = -px; ry = -py; }
    else { rx = py; ry = -px; }
    return { x: this.x + rx, y: this.y + ry };
  };

  Component.prototype.pinCount = function () { return this.def().pins.length; };

  /** Габаритный прямоугольник в клетках (для попадания курсором). */
  Component.prototype.bounds = function () {
    var def = this.def();
    var minX = -1, maxX = 1, minY = -1, maxY = 1;
    for (var i = 0; i < def.pins.length; i++) {
      var p = this.pinPos(i);
      minX = Math.min(minX, p.x - this.x); maxX = Math.max(maxX, p.x - this.x);
      minY = Math.min(minY, p.y - this.y); maxY = Math.max(maxY, p.y - this.y);
    }
    var pad = def.tiny ? 0.35 : 0.85;
    return {
      x: this.x + minX - pad, y: this.y + minY - pad,
      w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2
    };
  };

  Component.prototype.power = function () {
    if (this.type === 'wattmeter') return this.reading || 0;
    return (this.v || 0) * (this.i || 0);
  };

  /* ------------------------------------------------------------------ */
  /*  Система непересекающихся множеств                                  */
  /* ------------------------------------------------------------------ */

  function DisjointSet() { this.parent = {}; }
  DisjointSet.prototype.find = function (k) {
    if (this.parent[k] === undefined) { this.parent[k] = k; return k; }
    var root = k;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[k] !== root) { var nxt = this.parent[k]; this.parent[k] = root; k = nxt; }
    return root;
  };
  DisjointSet.prototype.union = function (a, b) {
    var ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  };

  /* ------------------------------------------------------------------ */
  /*  Схема                                                              */
  /* ------------------------------------------------------------------ */

  function Circuit() {
    this.components = [];
    this.wires = [];
    this.time = 0;
    this.dt = 5e-5;
    this.method = 'trap';
    this.gmin = 1e-12;
    this.temp = 300.15;
    this.dirty = true;
    this.error = null;
    this.warnings = [];
    this.iterations = 0;
    this.nodeVoltages = [];
  }

  Circuit.prototype.add = function (type, x, y) {
    var c = new Component(type, x, y);
    c.name = this.autoName(type);
    this.components.push(c);
    this._idMap = null;
    this.dirty = true;
    return c;
  };

  Circuit.prototype.autoName = function (type) {
    var pref = PREFIX[type];
    if (!pref) return '';
    var n = 1;
    for (var i = 0; i < this.components.length; i++) {
      var m = new RegExp('^' + pref + '(\\d+)$').exec(this.components[i].name || '');
      if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
    }
    return pref + n;
  };

  /** Поиск по идентификатору; указатель кешируется до изменения состава схемы. */
  Circuit.prototype.byId = function (id) {
    if (!this._idMap) {
      this._idMap = {};
      for (var i = 0; i < this.components.length; i++) this._idMap[this.components[i].id] = this.components[i];
    }
    return this._idMap[id] || null;
  };

  Circuit.prototype.remove = function (comp) {
    var idx = this.components.indexOf(comp);
    if (idx >= 0) this.components.splice(idx, 1);
    this._idMap = null;
    this.wires = this.wires.filter(function (w) {
      return w.a.c !== comp.id && w.b.c !== comp.id;
    });
    this.dirty = true;
  };

  Circuit.prototype.removeWire = function (wire) {
    var idx = this.wires.indexOf(wire);
    if (idx >= 0) this.wires.splice(idx, 1);
    this.dirty = true;
  };

  Circuit.prototype.connect = function (ca, pa, cb, pb) {
    if (ca === cb && pa === pb) return null;
    for (var i = 0; i < this.wires.length; i++) {
      var w = this.wires[i];
      if ((w.a.c === ca && w.a.p === pa && w.b.c === cb && w.b.p === pb) ||
        (w.a.c === cb && w.a.p === pb && w.b.c === ca && w.b.p === pa)) return w;
    }
    var wire = { id: U.uid('w'), a: { c: ca, p: pa }, b: { c: cb, p: pb }, current: 0 };
    this.wires.push(wire);
    this.dirty = true;
    return wire;
  };

  /** Ломаная провода в координатах сетки (ортогональная разводка). */
  Circuit.prototype.wirePath = function (wire) {
    var ca = this.byId(wire.a.c), cb = this.byId(wire.b.c);
    if (!ca || !cb) return null;
    var pa = ca.pinPos(wire.a.p), pb = cb.pinPos(wire.b.p);
    if (Math.abs(pa.x - pb.x) < 1e-6 || Math.abs(pa.y - pb.y) < 1e-6) return [pa, pb];
    // выбираем изгиб так, чтобы провод отходил вдоль направления вывода
    var defA = ca.def().pins[wire.a.p];
    var horizFirst = Math.abs(defA.x) >= Math.abs(defA.y);
    if (ca.rot % 2 === 1) horizFirst = !horizFirst;
    return horizFirst
      ? [pa, { x: pb.x, y: pa.y }, pb]
      : [pa, { x: pa.x, y: pb.y }, pb];
  };

  /* ---------------------- построение узлов --------------------------- */

  var key = function (cid, p) { return cid + '#' + p; };

  Circuit.prototype.build = function () {
    var i, j, c, ds = new DisjointSet();
    var terminals = [];

    for (i = 0; i < this.components.length; i++) {
      c = this.components[i];
      c.n = new Array(c.pinCount());
      for (j = 0; j < c.pinCount(); j++) {
        var k = key(c.id, j);
        ds.find(k);
        terminals.push({ key: k, comp: c, pin: j, pos: c.pinPos(j) });
      }
    }

    // соединения проводами
    for (i = 0; i < this.wires.length; i++) {
      var w = this.wires[i];
      if (!this.byId(w.a.c) || !this.byId(w.b.c)) continue;
      ds.union(key(w.a.c, w.a.p), key(w.b.c, w.b.p));
    }

    // выводы, совпадающие по координатам, тоже соединены
    var byPos = {};
    for (i = 0; i < terminals.length; i++) {
      var t = terminals[i];
      var pk = Math.round(t.pos.x * 2) + ',' + Math.round(t.pos.y * 2);
      if (byPos[pk] !== undefined) ds.union(byPos[pk], t.key);
      else byPos[pk] = t.key;
    }

    // группировка в узлы
    var netOf = {}, nets = [];
    for (i = 0; i < terminals.length; i++) {
      var root = ds.find(terminals[i].key);
      if (netOf[root] === undefined) { netOf[root] = nets.length; nets.push({ terminals: [], ground: false }); }
      var ni = netOf[root];
      nets[ni].terminals.push(terminals[i]);
      terminals[i].net = ni;
    }

    // земля
    var hasGround = false;
    for (i = 0; i < this.components.length; i++) {
      c = this.components[i];
      if (c.def().isGround) {
        var r = ds.find(key(c.id, 0));
        nets[netOf[r]].ground = true;
        hasGround = true;
      }
    }
    // без явной земли опорным становится самый «населённый» узел
    if (!hasGround && nets.length) {
      var best = 0;
      for (i = 1; i < nets.length; i++) if (nets[i].terminals.length > nets[best].terminals.length) best = i;
      nets[best].ground = true;
    }

    // нумерация неизвестных
    var nodeCount = 0;
    for (i = 0; i < nets.length; i++) nets[i].node = nets[i].ground ? -1 : nodeCount++;
    for (i = 0; i < terminals.length; i++) {
      terminals[i].comp.n[terminals[i].pin] = nets[terminals[i].net].node;
    }
    for (i = 0; i < this.components.length; i++) {
      c = this.components[i];
      var def = c.def();
      c.ni = [];
      for (j = 0; j < def.internals; j++) c.ni.push(nodeCount++);
    }
    var branchStart = nodeCount, branchCount = 0;
    for (i = 0; i < this.components.length; i++) {
      c = this.components[i];
      if (c.def().branches) { c.br = branchStart + branchCount; branchCount += c.def().branches; }
      else c.br = -1;
    }

    this.buildWireGraph();
    this.nets = nets;
    this.terminals = terminals;
    this.nodeCount = nodeCount;
    this.size = nodeCount + branchCount;
    this.hasNonlinear = this.components.some(function (cc) { return cc.def().nonlinear; });
    this.mna = this.size > 0 ? new SOL.MnaBuilder(this.size) : null;
    this.x = new Float64Array(Math.max(this.size, 1));
    this.dirty = false;
    this.error = null;
    return this;
  };

  Circuit.prototype.reset = function () {
    this.time = 0;
    for (var i = 0; i < this.components.length; i++) {
      var c = this.components[i];
      var def = c.def();
      c.v = 0; c.i = 0; c.glow = 0; c.warn = null;
      c.avg = undefined; c.reading = 0;
      c._vd = undefined; c._vbe = undefined; c._vbc = undefined; c._vdLast = undefined;
      if (def.init) def.init(c);
    }
    for (i = 0; i < this.wires.length; i++) this.wires[i].current = 0;
    this.dirty = true;
    this.error = null;
  };

  /* --------------------------- расчёт шага --------------------------- */

  var ABSTOL = 1e-7, RELTOL = 1e-4, MAX_ITER = 80;

  Circuit.prototype.step = function (dt) {
    if (this.dirty) this.build();
    if (!this.size || !this.mna) { this.time += dt; return true; }

    var self = this, forced = false;
    var ctx = {
      mna: this.mna,
      dt: dt,
      time: this.time + dt,
      gmin: this.gmin,
      vt: SOL.thermalVoltage(this.temp),
      method: this.method,
      x: this.x,
      nv: function (n) { return n < 0 ? 0 : self.x[n]; },
      forceIterate: function () { forced = true; }
    };

    var comps = this.components;
    var maxIter = this.hasNonlinear ? MAX_ITER : 1;
    var iter, i, converged = false;
    var prev = new Float64Array(this.size);

    for (iter = 0; iter < maxIter; iter++) {
      forced = false;
      prev.set(this.x);
      this.mna.clear();
      for (i = 0; i < comps.length; i++) comps[i].def().stamp(comps[i], ctx);
      if (!this.mna.solve()) {
        // вырожденная матрица — усиливаем утечки на землю и пробуем ещё раз
        ctx.gmin *= 1e3;
        if (ctx.gmin > 1e-3) {
          this.error = 'Схема не решается: проверьте наличие земли и разрывы цепи';
          return false;
        }
        iter--;
        continue;
      }
      this.x.set(this.mna.x);
      if (maxIter === 1) { converged = true; break; }
      var ok = !forced;
      if (ok) {
        for (i = 0; i < this.size; i++) {
          var d = Math.abs(this.x[i] - prev[i]);
          if (d > ABSTOL + RELTOL * Math.abs(this.x[i])) { ok = false; break; }
        }
      }
      if (ok && iter > 0) { converged = true; break; }
    }

    this.iterations = iter + 1;
    this.converged = converged;
    this.time += dt;

    // постобработка: U, I, P каждого элемента
    ctx.dt = dt;
    for (i = 0; i < comps.length; i++) {
      var c = comps[i];
      c.def().post(c, ctx);
      if (!c.pinI) c.pinI = [];
      if (c.pinCount() === 2 && !c.def().pinIcustom) { c.pinI[0] = c.i; c.pinI[1] = -c.i; }
      c.p = c.power();
    }
    return true;
  };

  /** Величины, нужные только для отображения — обновляются раз в кадр. */
  Circuit.prototype.refreshDisplay = function () {
    if (this.dirty) return;
    this.computeWireCurrents();
    this.collectWarnings();
  };

  /**
   * Граф проводов: вершины — выводы элементов, рёбра — провода.
   * Пересобирается только при изменении схемы.
   */
  Circuit.prototype.buildWireGraph = function () {
    var vmap = {}, verts = [], edges = [];
    var i, w, self = this;
    function vertex(cid, pin) {
      var k = cid + '#' + pin;
      if (vmap[k] === undefined) {
        vmap[k] = verts.length;
        verts.push({ comp: self.byId(cid), pin: pin, inc: [] });
      }
      return vmap[k];
    }
    for (i = 0; i < this.wires.length; i++) {
      w = this.wires[i];
      if (!this.byId(w.a.c) || !this.byId(w.b.c)) { w.current = 0; continue; }
      var va = vertex(w.a.c, w.a.p), vb = vertex(w.b.c, w.b.p);
      var e = edges.length;
      edges.push({ wire: w, a: va, b: vb });
      verts[va].inc.push({ e: e, s: -1 });
      verts[vb].inc.push({ e: e, s: 1 });
    }
    this._wg = {
      verts: verts, edges: edges,
      cur: new Float64Array(edges.length), done: new Uint8Array(edges.length),
      left: new Int32Array(verts.length), acc: new Float64Array(verts.length),
      out: new Float64Array(verts.length)
    };
  };

  /**
   * Токи в проводах. Для древовидных соединений задача решается точно
   * последовательным «отрыванием листьев» за O(число проводов);
   * в замкнутых контурах ток распределить однозначно нельзя — там остаётся ноль.
   */
  Circuit.prototype.computeWireCurrents = function () {
    var wg = this._wg;
    if (!wg || !wg.edges.length) return;
    var verts = wg.verts, edges = wg.edges;
    var nv = verts.length, ne = edges.length;
    var i, v, e;

    var cur = wg.cur, done = wg.done;
    var left = wg.left;                     // сколько неизвестных рёбер у вершины
    var acc = wg.acc;                       // вклад уже найденных рёбер
    var out = wg.out;                       // ток, уходящий из вершины в элемент
    done.fill(0); acc.fill(0);
    var queue = [];

    for (v = 0; v < nv; v++) {
      var vt = verts[v];
      left[v] = vt.inc.length;
      var c = vt.comp;
      out[v] = (c && c.pinI && c.pinI[vt.pin] !== undefined) ? c.pinI[vt.pin] : 0;
      if (left[v] === 1) queue.push(v);
    }

    for (var qi = 0; qi < queue.length; qi++) {
      v = queue[qi];
      if (left[v] !== 1) continue;
      var inc = verts[v].inc, pick = null;
      for (i = 0; i < inc.length; i++) if (!done[inc[i].e]) { pick = inc[i]; break; }
      if (!pick) continue;
      e = pick.e;
      var val = (out[v] - acc[v]) / pick.s;
      cur[e] = val;
      done[e] = 1;
      var ed = edges[e];
      acc[ed.a] += -val; left[ed.a]--;
      if (left[ed.a] === 1) queue.push(ed.a);
      acc[ed.b] += val; left[ed.b]--;
      if (left[ed.b] === 1) queue.push(ed.b);
    }

    for (e = 0; e < ne; e++) edges[e].wire.current = done[e] ? cur[e] : 0;
  };

  Circuit.prototype.collectWarnings = function () {
    var list = [];
    for (var i = 0; i < this.components.length; i++) {
      var c = this.components[i];
      if (c.warn) list.push((c.name || c.def().name) + ': ' + c.warn);
    }
    this.warnings = list;
  };

  /* ----------------------- сохранение / загрузка --------------------- */

  Circuit.prototype.toJSON = function () {
    return {
      version: 1,
      components: this.components.map(function (c) {
        return { id: c.id, type: c.type, x: c.x, y: c.y, rot: c.rot, name: c.name, props: c.props };
      }),
      wires: this.wires.map(function (w) { return { id: w.id, a: w.a, b: w.b }; })
    };
  };

  Circuit.fromJSON = function (data) {
    var ct = new Circuit();
    if (!data || !data.components) return ct;
    data.components.forEach(function (d) {
      if (!EC.defs[d.type]) return;
      var c = new Component(d.type, d.x, d.y);
      c.id = d.id || c.id;
      c.rot = d.rot || 0;
      c.name = d.name || '';
      for (var k in (d.props || {})) if (c.props[k] !== undefined || true) c.props[k] = d.props[k];
      ct.components.push(c);
    });
    (data.wires || []).forEach(function (w) {
      ct.wires.push({ id: w.id || U.uid('w'), a: w.a, b: w.b, current: 0 });
    });
    ct.dirty = true;
    return ct;
  };

  EC.Component = Component;
  EC.Circuit = Circuit;
})(window);
