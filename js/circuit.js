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

  /* Цвета изоляции как в наборах перемычек Dupont. */
  var WIRE_COLORS = [
    { name: 'красный',   core: '#d8413a', dark: '#7d1f1a', hi: 'rgba(255,190,180,.45)' },
    { name: 'синий',     core: '#2f74c8', dark: '#153a6b', hi: 'rgba(185,215,255,.45)' },
    { name: 'зелёный',   core: '#35a35c', dark: '#155c2f', hi: 'rgba(190,255,210,.42)' },
    { name: 'жёлтый',    core: '#e3c02e', dark: '#836a10', hi: 'rgba(255,245,190,.5)' },
    { name: 'белый',     core: '#e6ecf2', dark: '#8d97a1', hi: 'rgba(255,255,255,.6)' },
    { name: 'оранжевый', core: '#e2802a', dark: '#824212', hi: 'rgba(255,215,175,.45)' },
    { name: 'фиолетовый',core: '#8b5cc9', dark: '#452a6b', hi: 'rgba(225,200,255,.42)' },
    { name: 'коричневый',core: '#8a5a33', dark: '#432a15', hi: 'rgba(230,200,175,.35)' },
    { name: 'чёрный',    core: '#333b44', dark: '#14181d', hi: 'rgba(255,255,255,.18)' },
    { name: 'серый',     core: '#8b97a3', dark: '#454e57', hi: 'rgba(255,255,255,.35)' }
  ];
  EC.WIRE_COLORS = WIRE_COLORS;

  var PREFIX = {
    resistor: 'R', capacitor: 'C', capacitor_pol: 'C', inductor: 'L', pot: 'RV',
    lamp: 'HL', fuse: 'FU', battery: 'GB', vsource: 'G', isource: 'I',
    switch: 'SA', button: 'SB', spdt: 'SA', relay: 'K', diode: 'VD', zener: 'VD',
    led: 'HL', npn: 'VT', pnp: 'VT', nmos: 'VT', pmos: 'VT', opamp: 'DA',
    voltmeter: 'PV', ammeter: 'PA', wattmeter: 'PW', probe: 'X', ground: '', junction: '',
    thermistor: 'RK', photoresistor: 'RL', transformer: 'TV', schottky: 'VD', bridge: 'VD',
    regulator: 'DA', motor: 'M', buzzer: 'HA',
    not_gate: 'DD', and_gate: 'DD', or_gate: 'DD', ne555: 'DD', cpu8: 'DD', cpu_bus: 'DD', memory: 'DD'
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

  /**
   * Прямоугольник самого корпуса, без выводов: по нему провода понимают,
   * где деталь, и не лезут поперёк неё.
   */
  Component.prototype.body = function () {
    var def = this.def();
    var minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (var i = 0; i < def.pins.length; i++) {
      var p = this.pinPos(i);
      minX = Math.min(minX, p.x - this.x); maxX = Math.max(maxX, p.x - this.x);
      minY = Math.min(minY, p.y - this.y); maxY = Math.max(maxY, p.y - this.y);
    }
    var lead = def.tiny ? 0.35 : 0.85;           // длина вывода от корпуса
    var hw = Math.max((maxX - minX) / 2 - lead, 0.35);
    var hh = Math.max((maxY - minY) / 2 - lead, 0.35);
    return {
      x: this.x + (minX + maxX) / 2 - hw, y: this.y + (minY + maxY) / 2 - hh,
      w: hw * 2, h: hh * 2
    };
  };

  /** Мощность. Элемент может считать её по-своему — например, стабилизатор. */
  Component.prototype.power = function () {
    var def = this.def();
    if (def.power) return def.power(this);
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
    var compA = this.byId(ca);
    var wire = {
      id: U.uid('w'),
      a: { c: ca, p: pa }, b: { c: cb, p: pb },
      current: 0,
      color: this.wires.length % WIRE_COLORS.length,
      axis: 'h'
    };
    this.wires.push(wire);
    this.chooseRoute(wire);
    this.dirty = true;
    return wire;
  };

  /* ------------------------ разводка проводов ------------------------ */

  /** Вдоль какой оси отходит провод от вывода: 'h' или 'v'. */
  Circuit.prototype.pinAxis = function (comp, pinIndex) {
    var def = comp.def();
    var pin = def.pins[pinIndex];
    if (!pin) return 'h';
    if (def._span === undefined) {
      var mx = 0, my = 0;
      for (var i = 0; i < def.pins.length; i++) {
        mx = Math.max(mx, Math.abs(def.pins[i].x));
        my = Math.max(my, Math.abs(def.pins[i].y));
      }
      def._span = { x: mx, y: my };
    }
    var sx = def._span.x, sy = def._span.y;
    var horiz = sx < 1e-9 ? false
      : (sy < 1e-9 ? true : Math.abs(pin.x) / sx >= Math.abs(pin.y) / sy);
    if (comp.rot % 2 === 1) horiz = !horiz;
    return horiz ? 'h' : 'v';
  };

  /** Концы провода в координатах сетки. */
  Circuit.prototype.wireEnds = function (wire) {
    var ca = this.byId(wire.a.c), cb = this.byId(wire.b.c);
    if (!ca || !cb) return null;
    return { a: ca.pinPos(wire.a.p), b: cb.pinPos(wire.b.p) };
  };

  /** Разбивает ломаную на горизонтальные и вертикальные отрезки. */
  function segmentsOf(path) {
    var out = [];
    for (var i = 1; i < path.length; i++) {
      var a = path[i - 1], b = path[i];
      var horiz = Math.abs(a.y - b.y) < 1e-6;
      var vert = Math.abs(a.x - b.x) < 1e-6;
      if (horiz && vert) continue;                 // нулевой отрезок
      out.push(horiz
        ? { horiz: true, fixed: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) }
        : { horiz: false, fixed: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
    }
    return out;
  }

  /** Длина участка, на котором два отрезка лежат друг на друге. */
  function overlapLen(p, q) {
    if (p.horiz !== q.horiz) return 0;
    if (Math.abs(p.fixed - q.fixed) > 0.01) return 0;
    return Math.max(0, Math.min(p.hi, q.hi) - Math.max(p.lo, q.lo));
  }

  /** Длина части отрезка, попавшей внутрь прямоугольника. */
  function crossLen(seg, b) {
    var x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.h;
    if (seg.horiz) {
      if (seg.fixed <= y0 || seg.fixed >= y1) return 0;
      return Math.max(0, Math.min(seg.hi, x1) - Math.max(seg.lo, x0));
    }
    if (seg.fixed <= x0 || seg.fixed >= x1) return 0;
    return Math.max(0, Math.min(seg.hi, y1) - Math.max(seg.lo, y0));
  }

  /** Есть ли у проводов общий вывод (тогда наложение у него неизбежно). */
  function sharesTerminal(w1, w2) {
    var t = [w1.a, w1.b], u = [w2.a, w2.b];
    for (var i = 0; i < 2; i++) {
      for (var j = 0; j < 2; j++) if (t[i].c === u[j].c && t[i].p === u[j].p) return true;
    }
    return false;
  }

  /** Суммарная длина наложений маршрута на уже проложенные провода. */
  Circuit.prototype.routeOverlap = function (wire, path) {
    var mine = segmentsOf(path), total = 0;
    for (var i = 0; i < this.wires.length; i++) {
      var w = this.wires[i];
      if (w === wire || sharesTerminal(wire, w)) continue;
      var other = this.wirePath(w);
      if (!other) continue;
      var segs = segmentsOf(other);
      for (var m = 0; m < mine.length; m++) {
        for (var k = 0; k < segs.length; k++) total += overlapLen(mine[m], segs[k]);
      }
    }
    return total;
  };

  /** Длина участков маршрута, проходящих сквозь корпуса деталей. */
  Circuit.prototype.routeCross = function (path) {
    var segs = segmentsOf(path), total = 0;
    for (var i = 0; i < this.components.length; i++) {
      var b = this.components[i].body();
      for (var k = 0; k < segs.length; k++) total += crossLen(segs[k], b);
    }
    return total;
  };

  /** Во что обходится маршрут: наложения плюс проход сквозь детали. */
  Circuit.prototype.routeCost = function (wire, path) {
    return this.routeOverlap(wire, path) + 2 * this.routeCross(path);
  };

  /**
   * Подбирает маршрут целиком: ось и линию коврика. Если выводы смотрят
   * в одну сторону, эта сторона и задаёт ось; иначе берётся направление
   * дальнего вывода, чтобы провод подходил к нему как положено.
   * Когда предпочтительная ось не даёт развести провод, пробуется вторая.
   */
  Circuit.prototype.chooseRoute = function (wire) {
    var ca = this.byId(wire.a.c), cb = this.byId(wire.b.c);
    if (!ca || !cb) return;
    var da = this.pinAxis(ca, wire.a.p), db = this.pinAxis(cb, wire.b.p);
    var preferred = da === db ? da : db;
    var other = preferred === 'h' ? 'v' : 'h';
    var best = null;
    [preferred, other].forEach(function (axis, k) {
      wire.axis = axis;
      var mid = this.chooseMid(wire);
      wire.mid = mid;
      var path = this.wirePath(wire);
      var score = (path ? this.routeCost(wire, path) : Infinity) + k * 0.1;
      if (!best || score < best.score) best = { axis: axis, mid: mid, score: score };
    }, this);
    wire.axis = best.axis;
    wire.mid = best.mid;
  };

  /** Подбирает линию коврика, на которой маршрут ни на что не ложится. */
  Circuit.prototype.chooseMid = function (wire) {
    var e = this.wireEnds(wire);
    if (!e) return 0;
    var horiz = wire.axis !== 'v';
    var base = Math.round(horiz ? (e.a.x + e.b.x) / 2 : (e.a.y + e.b.y) / 2);
    var saved = wire.mid, best = base, bestScore = Infinity;
    for (var d = 0; d <= 24 && bestScore > 0.01; d++) {
      for (var k = 0; k < (d ? 2 : 1); k++) {
        var m = base + (k ? -d : d);
        wire.mid = m;
        var path = this.wirePath(wire);
        // небольшая надбавка за удаление от середины: при прочих равных ближе
        var score = path ? this.routeCost(wire, path) + d * 0.02 : Infinity;
        if (score < bestScore) { bestScore = score; best = m; }
        if (bestScore <= 0.01) break;
      }
    }
    wire.mid = saved;
    return best;
  };

  /**
   * Ломаная провода: два поворота под прямым углом, средний участок
   * лежит на выбранной линии коврика и может переставляться на соседнюю.
   */
  Circuit.prototype.wirePath = function (wire) {
    var e = this.wireEnds(wire);
    if (!e) return null;
    var pa = e.a, pb = e.b;
    if (Math.abs(pa.x - pb.x) < 1e-6 || Math.abs(pa.y - pb.y) < 1e-6) return [pa, pb];
    if (wire.mid === undefined) wire.mid = this.chooseMid(wire);
    if (wire.axis === 'v') {
      return [pa, { x: pa.x, y: wire.mid }, { x: pb.x, y: wire.mid }, pb];
    }
    return [pa, { x: wire.mid, y: pa.y }, { x: wire.mid, y: pb.y }, pb];
  };

  /**
   * Пересчитывает разводку всех проводов. За один проход поздние провода
   * обходят ранние, но не наоборот, поэтому проходов делается несколько,
   * пока наложения не перестанут убывать.
   */
  Circuit.prototype.reroute = function (passes) {
    var i, prev = Infinity;
    for (i = 0; i < this.wires.length; i++) this.wires[i].mid = undefined;
    for (var pass = 0; pass < (passes || 5); pass++) {
      for (i = 0; i < this.wires.length; i++) this.chooseRoute(this.wires[i]);
      var total = 0;
      for (i = 0; i < this.wires.length; i++) {
        var path = this.wirePath(this.wires[i]);
        if (path) total += this.routeCost(this.wires[i], path);
      }
      if (total <= 0.01 || total >= prev - 0.01) break;
      prev = total;
    }
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
      // утечка со всех узлов на землю: «висящие» участки схемы остаются решаемыми
      for (i = 0; i < this.nodeCount; i++) this.mna.A[i][i] += ctx.gmin;
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
      wires: this.wires.map(function (w) {
        return { id: w.id, a: w.a, b: w.b, color: w.color, axis: w.axis, mid: w.mid };
      })
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
    (data.wires || []).forEach(function (w, i) {
      ct.wires.push({
        id: w.id || U.uid('w'), a: w.a, b: w.b, current: 0,
        color: w.color === undefined ? i % WIRE_COLORS.length : w.color,
        axis: w.axis || 'h',
        mid: w.mid
      });
    });
    ct.dirty = true;
    return ct;
  };

  EC.Component = Component;
  EC.Circuit = Circuit;
})(window);
