/* ElectroCore — библиотека компонентов.
 *
 * Каждый компонент описывается объектом:
 *   pins      — выводы в единицах сетки (1 = GRID пикселей)
 *   props     — редактируемые параметры
 *   branches  — сколько дополнительных неизвестных (токов ветвей) требуется
 *   internals — сколько внутренних узлов нужно элементу
 *   stamp()   — занесение уравнений элемента в матрицу МУП
 *   post()    — расчёт U, I, P после решения системы и обновление состояния
 *   draw()    — отрисовка на холсте
 */
(function (global) {
  'use strict';
  var EC = (global.EC = global.EC || {});
  var U = EC.util;
  var SOL = EC.solver;

  var GRID = 16;                 // размер клетки сетки в пикселях
  EC.GRID = GRID;

  /* Вид рабочего стола: 'real' — реалистичные детали, 'schema' — условные знаки. */
  EC.skin = 'real';
  EC.theme = {
    labelFg: '#dfe7ef',
    labelSub: '#7fd4c1',
    labelPill: null,        // подложка под подписью (в реалистичном виде)
    badgeBg: 'rgba(10,16,23,.72)',
    badgeFg: 'rgba(143,232,205,.82)'
  };

  var defs = {};
  EC.defs = defs;
  var categories = [];
  EC.categories = categories;

  function define(def) {
    def.pins = def.pins || [];
    def.props = def.props || [];
    def.branches = def.branches || 0;
    def.internals = def.internals || 0;
    def.nonlinear = !!def.nonlinear;
    defs[def.key] = def;
    var cat = null;
    for (var i = 0; i < categories.length; i++) if (categories[i].key === def.cat) cat = categories[i];
    if (!cat) { cat = { key: def.cat, name: def.catName || def.cat, items: [] }; categories.push(cat); }
    cat.items.push(def.key);
    return def;
  }
  EC.define = define;

  /* ================================================================== */
  /*  Графические помощники                                             */
  /* ================================================================== */

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  /** Металлический вывод (ножка) от точки к точке. */
  function lead(g, x1, y1, x2, y2) {
    var grad;
    if (Math.abs(y2 - y1) < 0.5) {
      grad = g.createLinearGradient(0, y1 - 2, 0, y1 + 2);
    } else {
      grad = g.createLinearGradient(x1 - 2, 0, x1 + 2, 0);
    }
    grad.addColorStop(0, '#6e7a86');
    grad.addColorStop(0.45, '#cfd8e0');
    grad.addColorStop(0.55, '#aab6c1');
    grad.addColorStop(1, '#5d6771');
    g.strokeStyle = grad;
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  function leadsH(g, inner) {
    lead(g, -2 * GRID, 0, -inner, 0);
    lead(g, inner, 0, 2 * GRID, 0);
  }

  /** Подпись под компонентом; поворот элемента компенсируется. */
  function label(g, c, lines, yOffset) {
    var th = EC.theme;
    g.save();
    g.rotate(-(c.rot || 0) * Math.PI / 2);
    g.font = '600 9px ui-monospace, "SF Mono", Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    var y = yOffset === undefined ? GRID * 1.5 : yOffset;
    var i, txt = [];
    for (i = 0; i < lines.length; i++) if (lines[i]) txt.push(lines[i]);
    if (!txt.length) { g.restore(); return; }

    if (th.labelPill) {                       // наклейка под подписью
      var wmax = 0;
      for (i = 0; i < txt.length; i++) wmax = Math.max(wmax, g.measureText(txt[i]).width);
      var pw = wmax + 9, ph = txt.length * 11 + 4;
      g.fillStyle = th.labelPill;
      roundRect(g, -pw / 2, y - 7.5, pw, ph, 4);
      g.fill();
    }
    for (i = 0; i < txt.length; i++) {
      g.fillStyle = i === 0 ? th.labelFg : th.labelSub;
      g.fillText(txt[i], 0, y + i * 11);
    }
    g.restore();
  }

  /**
   * Кеш градиентов: координаты градиента вычисляются в момент рисования,
   * поэтому один объект можно переиспользовать во всех кадрах.
   * Ключ — контекст, чтобы миниатюры в палитре не мешали основному холсту.
   */
  var gradStore = new WeakMap();
  function grad(g, key, x0, y0, x1, y1, stops) {
    var m = gradStore.get(g);
    if (!m) { m = {}; gradStore.set(g, m); }
    if (m[key]) return m[key];
    var gr = g.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    m[key] = gr;
    return gr;
  }

  function radial(g, key, x0, y0, r0, x1, y1, r1, stops) {
    var m = gradStore.get(g);
    if (!m) { m = {}; gradStore.set(g, m); }
    if (m[key]) return m[key];
    var gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    m[key] = gr;
    return gr;
  }

  /** Экранчик измерительного прибора. */
  function lcd(g, w, h, text, sub, color) {
    g.save();
    var grad = g.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, '#0b2f26');
    grad.addColorStop(1, '#07211b');
    g.fillStyle = grad;
    roundRect(g, -w / 2, -h / 2, w, h, 2.5);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.6)';
    g.lineWidth = 1;
    g.stroke();
    g.font = '700 10px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color || '#54ffbe';
    g.shadowBlur = 6;
    g.fillStyle = color || '#7dffd0';
    g.fillText(text, 0, sub ? -3 : 0);
    g.shadowBlur = 0;
    if (sub) {
      g.font = '600 7px ui-monospace, Menlo, monospace';
      g.fillStyle = 'rgba(125,255,208,.55)';
      g.fillText(sub, 0, 6);
    }
    g.restore();
  }

  /* цветовая маркировка резисторов */
  var BAND_COLORS = ['#101010', '#6b3d1f', '#d0342c', '#e8821e', '#e8d13a',
    '#3fa85a', '#3b6fd4', '#8b4fc9', '#9aa0a6', '#f2f2f2'];

  function resistorBands(r) {
    if (!(r > 0) || !isFinite(r)) return ['#101010', '#101010', '#101010', '#c9a227'];
    var exp = Math.floor(Math.log(r) / Math.LN10) - 1;
    var mant = Math.round(r / Math.pow(10, exp));
    if (mant >= 100) { mant = Math.round(mant / 10); exp += 1; }
    if (mant < 10) { mant *= 10; exp -= 1; }
    var d1 = Math.floor(mant / 10), d2 = mant % 10;
    var mul;
    if (exp < 0) mul = exp === -1 ? '#c9a227' : '#c0c0c0';
    else mul = BAND_COLORS[Math.min(exp, 9)];
    return [BAND_COLORS[d1], BAND_COLORS[d2], mul, '#c9a227'];
  }

  EC.gfx = {
    roundRect: roundRect, lead: lead, leadsH: leadsH, label: label, lcd: lcd,
    grad: grad, radial: radial, bandColors: BAND_COLORS, resistorBands: resistorBands
  };

  /* ================================================================== */
  /*  ПАССИВНЫЕ ЭЛЕМЕНТЫ                                                */
  /* ================================================================== */

  define({
    key: 'resistor', name: 'Резистор', cat: 'passive', catName: 'Пассивные',
    tip: 'Сопротивление по закону Ома: U = I·R',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }],
    props: [{ key: 'R', label: 'Сопротивление', unit: 'Ω', def: 1000, min: 1e-4 }],
    stamp: function (c, ctx) {
      ctx.mna.conductance(c.n[0], c.n[1], 1 / Math.max(c.props.R, 1e-4));
    },
    post: function (c, ctx) {
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = c.v / Math.max(c.props.R, 1e-4);
    },
    draw: function (g, c) {
      leadsH(g, GRID * 1.3);
      var w = GRID * 2.6, h = GRID * 0.95;
      var body = g.createLinearGradient(0, -h / 2, 0, h / 2);
      body.addColorStop(0, '#e8d3ae');
      body.addColorStop(0.35, '#d8bd8f');
      body.addColorStop(0.7, '#c2a374');
      body.addColorStop(1, '#a98c5f');
      g.fillStyle = body;
      roundRect(g, -w / 2, -h / 2, w, h, h * 0.42);
      g.fill();
      g.strokeStyle = 'rgba(60,40,20,.45)';
      g.lineWidth = 0.8;
      g.stroke();
      var bands = resistorBands(c.props.R);
      var xs = [-w * 0.3, -w * 0.13, w * 0.04, w * 0.3];
      for (var i = 0; i < bands.length; i++) {
        g.fillStyle = bands[i];
        g.fillRect(xs[i], -h / 2 + 0.6, i === 3 ? 2.4 : 3.1, h - 1.2);
      }
      g.fillStyle = 'rgba(255,255,255,.18)';
      roundRect(g, -w / 2 + 1.5, -h / 2 + 1, w - 3, h * 0.24, 1.5);
      g.fill();
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(c.props.R, 'Ω')]);
    }
  });

  define({
    key: 'capacitor', name: 'Конденсатор', cat: 'passive',
    tip: 'Накапливает заряд: I = C·dU/dt',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }],
    props: [
      { key: 'C', label: 'Ёмкость', unit: 'Ф', def: 1e-6, min: 1e-15 },
      { key: 'v0', label: 'Начальное U', unit: 'В', def: 0 }
    ],
    init: function (c) { c.state = { v: c.props.v0 || 0, i: 0 }; },
    stamp: function (c, ctx) {
      var C = Math.max(c.props.C, 1e-15);
      var geq = (ctx.method === 'be' ? 1 : 2) * C / ctx.dt;
      var ieq = ctx.method === 'be' ? -geq * c.state.v : (-geq * c.state.v - c.state.i);
      c._geq = geq; c._ieq = ieq;
      ctx.mna.conductance(c.n[0], c.n[1], geq);
      ctx.mna.current(c.n[0], c.n[1], ieq);
    },
    post: function (c, ctx) {
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = c._geq * c.v + c._ieq;
      c.state.v = c.v; c.state.i = c.i;
      c.charge = Math.max(c.props.C, 1e-15) * c.v;
      c.energy = 0.5 * Math.max(c.props.C, 1e-15) * c.v * c.v;
    },
    draw: function (g, c) {
      var gap = GRID * 0.32;
      leadsH(g, gap);
      var h = GRID * 1.5;
      for (var s = -1; s <= 1; s += 2) {
        var grad = g.createLinearGradient(s * gap - 2, 0, s * gap + 2, 0);
        grad.addColorStop(0, '#9fb0bd');
        grad.addColorStop(0.5, '#e6eef5');
        grad.addColorStop(1, '#8b9ba8');
        g.fillStyle = grad;
        g.fillRect(s * gap - 1.6, -h / 2, 3.2, h);
      }
      // заряд на обкладках
      if (c.v !== undefined && Math.abs(c.v) > 0.05) {
        var t = U.clamp(Math.abs(c.v) / 12, 0, 1);
        g.fillStyle = (c.v > 0 ? 'rgba(255,120,90,' : 'rgba(90,150,255,') + (0.15 + 0.5 * t) + ')';
        g.fillRect(-gap - 1.6, -h / 2, 3.2, h);
        g.fillStyle = (c.v > 0 ? 'rgba(90,150,255,' : 'rgba(255,120,90,') + (0.15 + 0.5 * t) + ')';
        g.fillRect(gap - 1.6, -h / 2, 3.2, h);
      }
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(c.props.C, 'Ф')]);
    }
  });

  define({
    key: 'capacitor_pol', name: 'Электролит', cat: 'passive',
    tip: 'Полярный конденсатор большой ёмкости',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }],
    props: [
      { key: 'C', label: 'Ёмкость', unit: 'Ф', def: 100e-6, min: 1e-12 },
      { key: 'v0', label: 'Начальное U', unit: 'В', def: 0 },
      { key: 'vmax', label: 'Макс. U', unit: 'В', def: 25 }
    ],
    init: function (c) { c.state = { v: c.props.v0 || 0, i: 0 }; },
    stamp: function (c, ctx) { defs.capacitor.stamp(c, ctx); },
    post: function (c, ctx) {
      defs.capacitor.post(c, ctx);
      if (c.v < -1.5 || c.v > c.props.vmax * 1.6) c.warn = 'Превышено напряжение / обратная полярность';
      else c.warn = null;
    },
    draw: function (g, c) {
      var gap = GRID * 0.35;
      leadsH(g, gap);
      var h = GRID * 1.55;
      var grad = g.createLinearGradient(-gap - 2, 0, -gap + 2, 0);
      grad.addColorStop(0, '#9fb0bd'); grad.addColorStop(0.5, '#e6eef5'); grad.addColorStop(1, '#8b9ba8');
      g.fillStyle = grad;
      g.fillRect(-gap - 1.6, -h / 2, 3.2, h);
      // изогнутая (отрицательная) обкладка
      g.strokeStyle = '#c4d0da';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(gap + GRID * 0.75, 0, GRID * 0.82, Math.PI * 0.72, Math.PI * 1.28);
      g.stroke();
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.fillStyle = '#ff8b6b';
      g.font = '700 10px sans-serif';
      g.textAlign = 'center';
      g.fillText('+', -GRID * 1.0, -GRID * 0.75);
      g.restore();
      if (c.warn) {
        g.fillStyle = 'rgba(255,90,60,.35)';
        g.beginPath(); g.arc(0, 0, GRID, 0, 7); g.fill();
      }
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(c.props.C, 'Ф')]);
    }
  });

  define({
    key: 'inductor', name: 'Катушка', cat: 'passive',
    tip: 'Индуктивность: U = L·dI/dt',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }],
    props: [
      { key: 'L', label: 'Индуктивность', unit: 'Гн', def: 1e-3, min: 1e-12 },
      { key: 'Rs', label: 'Сопр. обмотки', unit: 'Ω', def: 0.1, min: 0 }
    ],
    internals: 1,
    init: function (c) { c.state = { v: 0, i: 0 }; },
    stamp: function (c, ctx) {
      var L = Math.max(c.props.L, 1e-12);
      var mid = c.ni[0];
      var geq = ctx.dt / ((ctx.method === 'be' ? 1 : 2) * L);
      var ieq = ctx.method === 'be' ? c.state.i : (c.state.i + geq * c.state.v);
      c._geq = geq; c._ieq = ieq;
      ctx.mna.conductance(c.n[0], mid, geq);
      ctx.mna.current(c.n[0], mid, ieq);
      ctx.mna.conductance(mid, c.n[1], 1 / Math.max(c.props.Rs, 1e-4));
    },
    post: function (c, ctx) {
      var vL = ctx.nv(c.n[0]) - ctx.nv(c.ni[0]);
      c.state.v = vL;
      c.state.i = c._geq * vL + c._ieq;
      c.i = c.state.i;
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.energy = 0.5 * Math.max(c.props.L, 1e-12) * c.i * c.i;
    },
    draw: function (g, c) {
      var r = GRID * 0.45, n = 4;
      var span = r * 2 * n;
      leadsH(g, span / 2);
      var grad = g.createLinearGradient(0, -r, 0, r);
      grad.addColorStop(0, '#f0c07a');
      grad.addColorStop(0.5, '#d89b4a');
      grad.addColorStop(1, '#a8702f');
      g.strokeStyle = grad;
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      for (var i = 0; i < n; i++) {
        g.arc(-span / 2 + r + i * 2 * r, 0, r, Math.PI, 0);
      }
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.25)';
      g.lineWidth = 1;
      g.beginPath();
      for (i = 0; i < n; i++) g.arc(-span / 2 + r + i * 2 * r, -0.6, r, Math.PI * 1.15, Math.PI * 1.8);
      g.stroke();
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(c.props.L, 'Гн')]);
    }
  });

  define({
    key: 'pot', name: 'Потенциометр', cat: 'passive',
    tip: 'Переменный резистор с движком',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: -2 }],
    props: [
      { key: 'R', label: 'Полное сопр.', unit: 'Ω', def: 10000, min: 1 },
      { key: 'pos', label: 'Положение', unit: '', def: 0.5, min: 0, max: 1, type: 'range', step: 0.01 }
    ],
    stamp: function (c, ctx) {
      var R = Math.max(c.props.R, 1);
      var p = U.clamp(c.props.pos, 0, 1);
      var ra = Math.max(R * p, 0.05), rb = Math.max(R * (1 - p), 0.05);
      ctx.mna.conductance(c.n[0], c.n[2], 1 / ra);
      ctx.mna.conductance(c.n[2], c.n[1], 1 / rb);
    },
    post: function (c, ctx) {
      var R = Math.max(c.props.R, 1), p = U.clamp(c.props.pos, 0, 1);
      var va = ctx.nv(c.n[0]), vb = ctx.nv(c.n[1]), vw = ctx.nv(c.n[2]);
      c.v = va - vb;
      c.i = (va - vw) / Math.max(R * p, 0.05);
      c.iw = c.i - (vw - vb) / Math.max(R * (1 - p), 0.05);
    },
    draw: function (g, c) {
      leadsH(g, GRID * 1.3);
      var w = GRID * 2.6, h = GRID * 0.95;
      var body = g.createLinearGradient(0, -h / 2, 0, h / 2);
      body.addColorStop(0, '#dcc9a6'); body.addColorStop(1, '#a98c5f');
      g.fillStyle = body;
      roundRect(g, -w / 2, -h / 2, w, h, h * 0.4);
      g.fill();
      g.strokeStyle = 'rgba(50,35,15,.5)'; g.lineWidth = 0.8; g.stroke();
      // движок
      var p = U.clamp(c.props.pos, 0, 1);
      var x = -w / 2 + w * p;
      lead(g, 0, -2 * GRID, 0, -GRID * 1.0);
      g.strokeStyle = '#9fb0bd'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -GRID * 1.0); g.lineTo(x, -h / 2 - 3); g.stroke();
      g.fillStyle = '#e8eef4';
      g.beginPath(); g.moveTo(x, -h / 2 - 1); g.lineTo(x - 4, -h / 2 - 7); g.lineTo(x + 4, -h / 2 - 7); g.closePath(); g.fill();
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(c.props.R, 'Ω'), Math.round(p * 100) + '%']);
    }
  });

  define({
    key: 'lamp', name: 'Лампа', cat: 'passive',
    tip: 'Лампа накаливания: нить нагревается, сопротивление растёт',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }],
    props: [
      { key: 'Vn', label: 'Номин. U', unit: 'В', def: 12, min: 0.1 },
      { key: 'Pn', label: 'Номин. P', unit: 'Вт', def: 3, min: 0.01 }
    ],
    init: function (c) { c.state = { dT: 0 }; },
    stamp: function (c, ctx) {
      ctx.mna.conductance(c.n[0], c.n[1], 1 / lampR(c));
    },
    post: function (c, ctx) {
      var R = lampR(c);
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = c.v / R;
      var p = c.v * c.i;
      // тепловая инерция нити: dT/dt = (P - dT/Rth)/Cth
      var dTn = 2200;                           // перегрев при номинале, К
      var Rth = dTn / Math.max(c.props.Pn, 1e-3);
      var tau = 0.12;                           // постоянная времени, с
      var Cth = tau / Rth;
      c.state.dT += (p - c.state.dT / Rth) / Cth * ctx.dt;
      if (c.state.dT < 0) c.state.dT = 0;
      if (c.state.dT > dTn * 3) c.state.dT = dTn * 3;
      c.glow = U.clamp(Math.pow(c.state.dT / dTn, 1.6), 0, 1.6);
      c.warn = c.state.dT > dTn * 1.45 ? 'Перегрузка — лампа перегорает' : null;
    },
    draw: function (g, c) {
      leadsH(g, GRID * 0.95);
      var r = GRID * 0.95;
      var glow = c.glow || 0;
      if (glow > 0.02) {
        var hal = g.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 3.2);
        hal.addColorStop(0, 'rgba(255,225,150,' + (0.55 * Math.min(glow, 1)) + ')');
        hal.addColorStop(0.4, 'rgba(255,190,90,' + (0.22 * Math.min(glow, 1)) + ')');
        hal.addColorStop(1, 'rgba(255,170,60,0)');
        g.fillStyle = hal;
        g.beginPath(); g.arc(0, 0, r * 3.2, 0, 7); g.fill();
      }
      var bulb = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
      bulb.addColorStop(0, 'rgba(230,245,255,.55)');
      bulb.addColorStop(1, 'rgba(150,180,200,.22)');
      g.fillStyle = bulb;
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.strokeStyle = 'rgba(200,220,235,.75)'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
      // нить
      g.strokeStyle = glow > 0.02
        ? 'rgb(255,' + Math.round(200 + 55 * Math.min(glow, 1)) + ',' + Math.round(120 + 120 * Math.min(glow, 1)) + ')'
        : '#7b848d';
      g.lineWidth = glow > 0.3 ? 1.8 : 1.2;
      g.shadowColor = 'rgba(255,200,120,.9)';
      g.shadowBlur = glow > 0.02 ? 8 * Math.min(glow, 1) : 0;
      g.beginPath();
      g.moveTo(-r * 0.62, 0);
      for (var i = 0; i <= 8; i++) {
        g.lineTo(-r * 0.62 + i * r * 0.155, (i % 2 ? -1 : 1) * r * 0.42);
      }
      g.lineTo(r * 0.62, 0);
      g.stroke();
      g.shadowBlur = 0;
      label(g, c, [(c.name || '') + ' ' + c.props.Vn + 'В/' + c.props.Pn + 'Вт']);
    }
  });

  function lampR(c) {
    var Rhot = c.props.Vn * c.props.Vn / Math.max(c.props.Pn, 1e-3);
    var Rcold = Rhot / 9.5;                       // холодная нить ~10x меньше
    var dTn = 2200;
    var dT = (c.state && c.state.dT) || 0;
    return Math.max(Rcold * (1 + 8.5 * (dT / dTn)), 0.05);
  }

  define({
    key: 'fuse', name: 'Предохранитель', cat: 'passive',
    tip: 'Перегорает при превышении тока',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }],
    props: [
      { key: 'In', label: 'Номин. ток', unit: 'А', def: 1, min: 0.001 },
      { key: 'R', label: 'Сопротивление', unit: 'Ω', def: 0.05, min: 0.001 }
    ],
    init: function (c) { c.state = { i2t: 0, blown: false }; },
    stamp: function (c, ctx) {
      ctx.mna.conductance(c.n[0], c.n[1], c.state.blown ? 1e-11 : 1 / Math.max(c.props.R, 1e-3));
    },
    post: function (c, ctx) {
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = c.state.blown ? 0 : c.v / Math.max(c.props.R, 1e-3);
      var over = Math.abs(c.i) / Math.max(c.props.In, 1e-3);
      if (over > 1) c.state.i2t += (over * over - 1) * ctx.dt;
      else c.state.i2t = Math.max(0, c.state.i2t - ctx.dt * 0.5);
      if (c.state.i2t > 0.35) c.state.blown = true;
      c.warn = c.state.blown ? 'Предохранитель перегорел' : null;
    },
    draw: function (g, c) {
      leadsH(g, GRID * 1.2);
      var w = GRID * 2.4, h = GRID * 0.8;
      g.fillStyle = 'rgba(190,215,235,.18)';
      roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
      g.strokeStyle = 'rgba(200,220,235,.6)'; g.lineWidth = 1.1; g.stroke();
      g.fillStyle = '#b9c4cd';
      g.fillRect(-w / 2, -h / 2, 4, h);
      g.fillRect(w / 2 - 4, -h / 2, 4, h);
      g.strokeStyle = c.state && c.state.blown ? '#5a6068' : '#d8dee5';
      g.lineWidth = 1.4;
      g.beginPath();
      if (c.state && c.state.blown) {
        g.moveTo(-w / 2 + 4, 0); g.lineTo(-3, 0);
        g.moveTo(3, 0); g.lineTo(w / 2 - 4, 0);
      } else { g.moveTo(-w / 2 + 4, 0); g.lineTo(w / 2 - 4, 0); }
      g.stroke();
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(c.props.In, 'А')]);
    }
  });
})(window);

/* ElectroCore — источники питания, земля, коммутация. */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util, SOL = EC.solver;
  var GRID = EC.GRID, define = EC.define, defs = EC.defs;
  var gfx = EC.gfx, roundRect = gfx.roundRect, lead = gfx.lead, leadsH = gfx.leadsH, label = gfx.label, lcd = gfx.lcd;

  /* ================================================================== */
  /*  ИСТОЧНИКИ                                                         */
  /* ================================================================== */

  define({
    key: 'ground', name: 'Земля', cat: 'source', catName: 'Источники',
    tip: 'Опорный узел, потенциал 0 В. Нужен в каждой схеме.',
    pins: [{ x: 0, y: -1 }],
    isGround: true,
    props: [],
    stamp: function () { },
    post: function (c) { c.v = 0; c.i = 0; },
    draw: function (g, c) {
      lead(g, 0, -GRID, 0, 0);
      g.strokeStyle = '#8fa3b4';
      g.lineCap = 'round';
      var widths = [GRID * 0.85, GRID * 0.52, GRID * 0.22];
      for (var i = 0; i < 3; i++) {
        g.lineWidth = 2.6 - i * 0.5;
        g.beginPath();
        g.moveTo(-widths[i], i * 4.5);
        g.lineTo(widths[i], i * 4.5);
        g.stroke();
      }
    }
  });

  define({
    key: 'battery', name: 'Батарея', cat: 'source',
    tip: 'Источник постоянного напряжения с внутренним сопротивлением',
    pins: [{ x: -2, y: 0, name: '+' }, { x: 2, y: 0, name: '−' }],
    props: [
      { key: 'V', label: 'ЭДС', unit: 'В', def: 9 },
      { key: 'Rint', label: 'Внутр. сопр.', unit: 'Ω', def: 0.05, min: 0 }
    ],
    branches: 1, internals: 1,
    stamp: function (c, ctx) {
      ctx.mna.voltageSource(c.ni[0], c.n[1], c.br, c.props.V);
      ctx.mna.conductance(c.ni[0], c.n[0], 1 / Math.max(c.props.Rint, 1e-4));
    },
    post: function (c, ctx) {
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = ctx.x[c.br];
    },
    draw: function (g, c) {
      leadsH(g, GRID * 0.62);
      // две последовательные ячейки: длинная пластина «+», короткая «−»
      var xs = [-GRID * 0.62, -GRID * 0.22, GRID * 0.18, GRID * 0.58];
      for (var i = 0; i < 4; i++) {
        var long = (i % 2 === 0);
        var h = long ? GRID * 1.8 : GRID * 0.86;
        var grad = g.createLinearGradient(xs[i] - 2, 0, xs[i] + 2, 0);
        grad.addColorStop(0, long ? '#aebac6' : '#8794a1');
        grad.addColorStop(0.5, long ? '#f2f7fb' : '#c3ced8');
        grad.addColorStop(1, long ? '#94a2ae' : '#76828e');
        g.fillStyle = grad;
        g.fillRect(xs[i] - 1.5, -h / 2, 3, h);
      }
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.font = '700 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ff9b7a'; g.fillText('+', -GRID * 1.12, -GRID * 0.82);
      g.fillStyle = '#8fb6ff'; g.fillText('−', GRID * 1.12, -GRID * 0.82);
      g.restore();
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(c.props.V, 'В')], GRID * 1.6);
    }
  });

  var WAVES = [
    { v: 'dc', t: 'Постоянное' }, { v: 'sine', t: 'Синус' }, { v: 'square', t: 'Меандр' },
    { v: 'triangle', t: 'Треугольник' }, { v: 'saw', t: 'Пила' }, { v: 'pulse', t: 'Импульсы' }
  ];

  /** Мгновенное значение сигнала генератора. */
  function waveform(p, t) {
    var f = Math.max(p.freq, 1e-6);
    var ph = (t * f + (p.phase || 0) / 360) % 1;
    if (ph < 0) ph += 1;
    var a = p.amp, off = p.offset || 0;
    switch (p.wave) {
      case 'dc': return off + a;
      case 'square': return off + (ph < 0.5 ? a : -a);
      case 'triangle': return off + a * (ph < 0.5 ? (4 * ph - 1) : (3 - 4 * ph));
      case 'saw': return off + a * (2 * ph - 1);
      case 'pulse': return off + (ph < U.clamp(p.duty || 0.5, 0.001, 0.999) ? a : 0);
      default: return off + a * Math.sin(2 * Math.PI * ph);
    }
  }

  define({
    key: 'vsource', name: 'Генератор', cat: 'source',
    tip: 'Источник напряжения: синус, меандр, пила, импульсы',
    pins: [{ x: -2, y: 0, name: '+' }, { x: 2, y: 0, name: '−' }],
    props: [
      { key: 'wave', label: 'Форма', type: 'select', options: WAVES, def: 'sine' },
      { key: 'amp', label: 'Амплитуда', unit: 'В', def: 5 },
      { key: 'freq', label: 'Частота', unit: 'Гц', def: 50, min: 1e-6 },
      { key: 'offset', label: 'Смещение', unit: 'В', def: 0 },
      { key: 'phase', label: 'Фаза', unit: '°', def: 0 },
      { key: 'duty', label: 'Скважность', unit: '', def: 0.5, min: 0.01, max: 0.99, type: 'range', step: 0.01 },
      { key: 'Rint', label: 'Выходное сопр.', unit: 'Ω', def: 0.05, min: 0 }
    ],
    branches: 1, internals: 1,
    stamp: function (c, ctx) {
      ctx.mna.voltageSource(c.ni[0], c.n[1], c.br, waveform(c.props, ctx.time));
      ctx.mna.conductance(c.ni[0], c.n[0], 1 / Math.max(c.props.Rint, 1e-4));
    },
    post: function (c, ctx) {
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = ctx.x[c.br];
    },
    draw: function (g, c) {
      leadsH(g, GRID);
      var r = GRID;
      var grad = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r);
      grad.addColorStop(0, 'rgba(90,130,160,.5)');
      grad.addColorStop(1, 'rgba(40,60,80,.55)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.strokeStyle = '#8fa3b4'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
      // миниатюра формы сигнала
      g.strokeStyle = '#6fe0c2'; g.lineWidth = 1.6; g.lineJoin = 'round';
      g.beginPath();
      var w = c.props.wave, i, x, y;
      for (i = 0; i <= 24; i++) {
        x = -r * 0.62 + (i / 24) * r * 1.24;
        var ph = i / 24;
        if (w === 'square' || w === 'pulse') y = (ph < 0.5 ? -1 : 1) * r * 0.42;
        else if (w === 'triangle') y = -(ph < 0.5 ? (4 * ph - 1) : (3 - 4 * ph)) * r * 0.42;
        else if (w === 'saw') y = -(2 * ph - 1) * r * 0.42;
        else if (w === 'dc') y = -r * 0.18;
        else y = -Math.sin(ph * 2 * Math.PI) * r * 0.42;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      var txt = c.props.wave === 'dc'
        ? U.fmtUnit(c.props.amp, 'В')
        : U.fmtUnit(c.props.amp, 'В') + ' ' + U.fmtUnit(c.props.freq, 'Гц');
      label(g, c, [(c.name || '') + ' ' + txt], GRID * 1.7);
    }
  });

  define({
    key: 'isource', name: 'Источник тока', cat: 'source',
    tip: 'Задаёт ток независимо от нагрузки',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }],
    props: [{ key: 'I', label: 'Ток', unit: 'А', def: 0.01 }],
    stamp: function (c, ctx) {
      ctx.mna.current(c.n[0], c.n[1], c.props.I);
      ctx.mna.conductance(c.n[0], c.n[1], 1e-9);
    },
    post: function (c, ctx) {
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = c.props.I;
    },
    draw: function (g, c) {
      leadsH(g, GRID);
      var r = GRID;
      g.fillStyle = 'rgba(40,60,80,.55)';
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.strokeStyle = '#8fa3b4'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
      g.strokeStyle = '#6fe0c2'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-r * 0.5, 0); g.lineTo(r * 0.35, 0); g.stroke();
      g.fillStyle = '#6fe0c2';
      g.beginPath(); g.moveTo(r * 0.62, 0); g.lineTo(r * 0.2, -r * 0.32); g.lineTo(r * 0.2, r * 0.32); g.closePath(); g.fill();
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(c.props.I, 'А')], GRID * 1.7);
    }
  });

  /* ================================================================== */
  /*  КОММУТАЦИЯ                                                        */
  /* ================================================================== */

  define({
    key: 'switch', name: 'Выключатель', cat: 'switch', catName: 'Коммутация',
    tip: 'Нажмите на элемент, чтобы переключить',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }],
    props: [{ key: 'closed', label: 'Замкнут', type: 'bool', def: false }],
    toggle: function (c) { c.props.closed = !c.props.closed; },
    stamp: function (c, ctx) {
      ctx.mna.conductance(c.n[0], c.n[1], c.props.closed ? 1 / 0.002 : 1e-11);
    },
    post: function (c, ctx) {
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = c.props.closed ? c.v / 0.002 : 0;
    },
    draw: function (g, c) {
      lead(g, -2 * GRID, 0, -GRID * 0.9, 0);
      lead(g, GRID * 0.9, 0, 2 * GRID, 0);
      g.fillStyle = '#c7d2dc';
      g.beginPath(); g.arc(-GRID * 0.9, 0, 2.8, 0, 7); g.fill();
      g.beginPath(); g.arc(GRID * 0.9, 0, 2.8, 0, 7); g.fill();
      var grad = g.createLinearGradient(0, -3, 0, 3);
      grad.addColorStop(0, '#e9f1f8'); grad.addColorStop(1, '#93a3b1');
      g.strokeStyle = grad;
      g.lineWidth = 3.4; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-GRID * 0.9, 0);
      if (c.props.closed) g.lineTo(GRID * 0.9, 0);
      else g.lineTo(GRID * 0.72, -GRID * 0.92);
      g.stroke();
      if (c.props.closed) {
        g.strokeStyle = 'rgba(110,230,190,.5)'; g.lineWidth = 6;
        g.beginPath(); g.moveTo(-GRID * 0.9, 0); g.lineTo(GRID * 0.9, 0); g.stroke();
      }
      label(g, c, [(c.name || '') + (c.props.closed ? ' вкл' : ' выкл')]);
    }
  });

  define({
    key: 'button', name: 'Кнопка', cat: 'switch',
    tip: 'Замкнута, пока удерживается нажатой',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }],
    props: [{ key: 'nc', label: 'Нормально замкнута', type: 'bool', def: false }],
    momentary: true,
    isClosed: function (c) { return !!c.props.nc !== !!c.pressed; },
    stamp: function (c, ctx) {
      ctx.mna.conductance(c.n[0], c.n[1], defs.button.isClosed(c) ? 1 / 0.002 : 1e-11);
    },
    post: function (c, ctx) {
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = defs.button.isClosed(c) ? c.v / 0.002 : 0;
    },
    draw: function (g, c) {
      lead(g, -2 * GRID, 0, -GRID * 0.9, 0);
      lead(g, GRID * 0.9, 0, 2 * GRID, 0);
      var down = !!c.pressed;
      g.fillStyle = '#c7d2dc';
      g.beginPath(); g.arc(-GRID * 0.9, 0, 2.8, 0, 7); g.fill();
      g.beginPath(); g.arc(GRID * 0.9, 0, 2.8, 0, 7); g.fill();
      var y = down ? -1 : -GRID * 0.55;
      g.strokeStyle = '#aebac6'; g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-GRID * 0.9, y); g.lineTo(GRID * 0.9, y); g.stroke();
      g.beginPath(); g.moveTo(0, y); g.lineTo(0, y - GRID * 0.5); g.stroke();
      var cap = g.createLinearGradient(0, y - GRID * 1.1, 0, y - GRID * 0.5);
      cap.addColorStop(0, down ? '#b8483a' : '#e05c48');
      cap.addColorStop(1, down ? '#7d2b21' : '#9c3527');
      g.fillStyle = cap;
      roundRect(g, -GRID * 0.62, y - GRID * 1.05, GRID * 1.24, GRID * 0.56, 3);
      g.fill();
      label(g, c, [c.name || 'Кнопка']);
    }
  });

  define({
    key: 'spdt', name: 'Переключатель', cat: 'switch',
    tip: 'Переключает общий вывод между двумя контактами',
    pins: [{ x: -2, y: 0, name: 'C' }, { x: 2, y: -1, name: '1' }, { x: 2, y: 1, name: '2' }],
    props: [{ key: 'b', label: 'Позиция 2', type: 'bool', def: false }],
    toggle: function (c) { c.props.b = !c.props.b; },
    stamp: function (c, ctx) {
      ctx.mna.conductance(c.n[0], c.n[1], c.props.b ? 1e-11 : 1 / 0.002);
      ctx.mna.conductance(c.n[0], c.n[2], c.props.b ? 1 / 0.002 : 1e-11);
    },
    post: function (c, ctx) {
      var t = c.props.b ? 2 : 1;
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[t]);
      c.i = c.v / 0.002;
    },
    draw: function (g, c) {
      lead(g, -2 * GRID, 0, -GRID * 0.9, 0);
      lead(g, GRID * 0.9, -GRID, 2 * GRID, -GRID);
      lead(g, GRID * 0.9, GRID, 2 * GRID, GRID);
      g.fillStyle = '#c7d2dc';
      g.beginPath(); g.arc(-GRID * 0.9, 0, 2.8, 0, 7); g.fill();
      g.beginPath(); g.arc(GRID * 0.9, -GRID, 2.8, 0, 7); g.fill();
      g.beginPath(); g.arc(GRID * 0.9, GRID, 2.8, 0, 7); g.fill();
      g.strokeStyle = '#e2eaf2'; g.lineWidth = 3.2; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-GRID * 0.9, 0);
      g.lineTo(GRID * 0.9, c.props.b ? GRID : -GRID);
      g.stroke();
      label(g, c, [(c.name || '') + ' → ' + (c.props.b ? '2' : '1')], GRID * 2.1);
    }
  });

  define({
    key: 'relay', name: 'Реле', cat: 'switch',
    tip: 'Катушка управляет контактом: срабатывает при токе выше порога',
    pins: [
      { x: -3, y: -1, name: 'К+' }, { x: -3, y: 1, name: 'К−' },
      { x: 3, y: -1, name: 'C' }, { x: 3, y: 1, name: 'NO' }
    ],
    props: [
      { key: 'Rcoil', label: 'Сопр. катушки', unit: 'Ω', def: 120, min: 1 },
      { key: 'Ion', label: 'Ток срабатывания', unit: 'А', def: 0.03, min: 1e-6 }
    ],
    init: function (c) { c.state = { on: false }; },
    stamp: function (c, ctx) {
      ctx.mna.conductance(c.n[0], c.n[1], 1 / Math.max(c.props.Rcoil, 1));
      ctx.mna.conductance(c.n[2], c.n[3], c.state.on ? 1 / 0.01 : 1e-11);
    },
    post: function (c, ctx) {
      var icoil = (ctx.nv(c.n[0]) - ctx.nv(c.n[1])) / Math.max(c.props.Rcoil, 1);
      c.i = icoil;
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      // гистерезис: отпускание при 60 % тока срабатывания
      var on = Math.abs(icoil) > c.props.Ion * (c.state.on ? 0.6 : 1);
      c.state.on = on;
    },
    draw: function (g, c) {
      lead(g, -3 * GRID, -GRID, -GRID * 1.2, -GRID);
      lead(g, -3 * GRID, GRID, -GRID * 1.2, GRID);
      lead(g, 3 * GRID, -GRID, GRID * 1.2, -GRID);
      lead(g, 3 * GRID, GRID, GRID * 1.2, GRID);
      g.fillStyle = 'rgba(40,52,66,.85)';
      roundRect(g, -GRID * 1.3, -GRID * 1.5, GRID * 2.6, GRID * 3, 4); g.fill();
      g.strokeStyle = '#7b8b9a'; g.lineWidth = 1.2; g.stroke();
      // катушка
      g.strokeStyle = c.state && c.state.on ? '#f0b24a' : '#8b6a3a';
      g.lineWidth = 2.2;
      g.beginPath();
      for (var i = 0; i < 4; i++) g.arc(-GRID * 0.7, -GRID * 0.9 + i * GRID * 0.5, GRID * 0.24, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      // контакт
      g.strokeStyle = '#d7e0e8'; g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(GRID * 0.5, -GRID);
      g.lineTo(GRID * 1.15, c.state && c.state.on ? GRID * 0.9 : -GRID * 0.1);
      g.stroke();
      g.fillStyle = c.state && c.state.on ? '#6fe0c2' : '#5a6673';
      g.beginPath(); g.arc(GRID * 1.15, GRID, 2.6, 0, 7); g.fill();
      label(g, c, [c.name || 'Реле'], GRID * 2.3);
    }
  });
})(window);

/* ElectroCore — полупроводниковые приборы.
 * Диоды — модель Шокли, биполярные транзисторы — Эберса–Молла,
 * полевые — квадратичная модель, операционный усилитель — кусочно-линейная.
 */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util, SOL = EC.solver;
  var GRID = EC.GRID, define = EC.define, defs = EC.defs;
  var gfx = EC.gfx, roundRect = gfx.roundRect, lead = gfx.lead, leadsH = gfx.leadsH, label = gfx.label;

  /* --------------------- общий штамп p-n перехода -------------------- */

  /**
   * Штампует диодный переход между узлами a и b.
   * Возвращает ток через переход (из a в b).
   */
  var NZ = 1.2;        // коэффициент неидеальности участка пробоя
  var IZK = 5e-3;      // ток в точке излома характеристики стабилитрона

  /** Ток перехода и его производная при напряжении vd. */
  function junctionEval(ctx, vd, o) {
    var vt = ctx.vt * o.nf;
    var e = SOL.safeExp(U.clamp(vd / vt, -60, 90));
    var id = o.is * (e - 1);
    var gd = o.is * e / vt;
    if (o.vz > 0) {                            // обратный пробой (стабилитрон)
      var vtz = ctx.vt * NZ;
      var ez = SOL.safeExp(U.clamp(-(vd + o.vz) / vtz, -60, 90));
      id -= IZK * (ez - 1);
      gd += IZK * ez / vtz;
    }
    gd += ctx.gmin;
    id += ctx.gmin * vd;
    if (!isFinite(id) || !isFinite(gd)) { id = 0; gd = ctx.gmin; }
    return { i: id, g: gd };
  }

  /** Штампует диодный переход между узлами a и b. */
  function stampJunction(ctx, c, a, b, o, key) {
    var vt = ctx.vt * o.nf;
    var vcrit = SOL.critVoltage(o.is, vt);
    var prev = c[key] === undefined ? 0 : c[key];
    var vd = SOL.pnjlim(ctx.nv(a) - ctx.nv(b), prev, vt, vcrit);
    if (o.vz > 0) {                            // симметричное ограничение шага в пробое
      var lo = -o.vz - 1.5;
      if (vd < lo && prev > lo) vd = lo;
      else if (vd < lo && vd < prev - 0.5) vd = prev - 0.5;
    }
    c[key] = vd;
    var r = junctionEval(ctx, vd, o);
    ctx.mna.conductance(a, b, r.g);
    ctx.mna.current(a, b, r.i - r.g * vd);
    return { i: r.i, g: r.g, v: vd };
  }

  function junctionCurrent(c, ctx, o) {
    var vd = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
    return { v: vd, i: junctionEval(ctx, vd, o).i };
  }

  function diodeOpts(c, vz) {
    return { is: Math.max(c.props.Is, 1e-20), nf: U.clamp(c.props.nf, 1, 4), vz: vz || 0 };
  }

  /* --------------------------- диоды --------------------------------- */

  function drawDiodeBody(g, c, bodyColor, barColor) {
    leadsH(g, GRID * 0.62);
    var s = GRID * 0.62;
    g.fillStyle = bodyColor || 'rgba(60,72,88,.92)';
    g.beginPath();
    g.moveTo(-s, -s * 0.95); g.lineTo(s * 0.35, 0); g.lineTo(-s, s * 0.95);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(220,232,244,.85)'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = barColor || '#dfe8f2';
    g.fillRect(s * 0.3, -s * 0.95, 2.8, s * 1.9);
  }

  define({
    key: 'diode', name: 'Диод', cat: 'semi', catName: 'Полупроводники',
    tip: 'Пропускает ток только в одну сторону (модель Шокли)',
    pins: [{ x: -2, y: 0, name: 'A' }, { x: 2, y: 0, name: 'K' }],
    props: [
      { key: 'Is', label: 'Ток насыщения', unit: 'А', def: 2.52e-9, min: 1e-20 },
      { key: 'nf', label: 'Коэф. неидеальности', unit: '', def: 1.752, min: 1, max: 4 }
    ],
    nonlinear: true,
    stamp: function (c, ctx) { stampJunction(ctx, c, c.n[0], c.n[1], diodeOpts(c), '_vd'); },
    post: function (c, ctx) {
      var r = junctionCurrent(c, ctx, diodeOpts(c));
      c.v = r.v; c.i = r.i;
    },
    draw: function (g, c) {
      drawDiodeBody(g, c);
      label(g, c, [c.name || 'Диод']);
    }
  });

  define({
    key: 'zener', name: 'Стабилитрон', cat: 'semi',
    tip: 'Стабилизирует напряжение при обратном включении',
    pins: [{ x: -2, y: 0, name: 'A' }, { x: 2, y: 0, name: 'K' }],
    props: [
      { key: 'Vz', label: 'Напряжение стабил.', unit: 'В', def: 5.1, min: 0.5 },
      { key: 'Is', label: 'Ток насыщения', unit: 'А', def: 2.52e-9, min: 1e-20 },
      { key: 'nf', label: 'Коэф. неидеальности', unit: '', def: 1.752, min: 1, max: 4 }
    ],
    nonlinear: true,
    stamp: function (c, ctx) { stampJunction(ctx, c, c.n[0], c.n[1], diodeOpts(c, c.props.Vz), '_vd'); },
    post: function (c, ctx) {
      var r = junctionCurrent(c, ctx, diodeOpts(c, c.props.Vz));
      c.v = r.v; c.i = r.i;
    },
    draw: function (g, c) {
      drawDiodeBody(g, c, 'rgba(70,80,96,.92)');
      var s = GRID * 0.62;
      g.strokeStyle = '#dfe8f2'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(s * 0.3 + 2.8, -s * 0.95); g.lineTo(s * 0.3 + 2.8 + 4, -s * 0.95);
      g.moveTo(s * 0.3, s * 0.95); g.lineTo(s * 0.3 - 4, s * 0.95);
      g.stroke();
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(c.props.Vz, 'В')]);
    }
  });

  var LED_COLORS = [
    { v: 'red', t: 'Красный', rgb: [255, 70, 55], vf: 1.9 },
    { v: 'green', t: 'Зелёный', rgb: [70, 240, 120], vf: 2.1 },
    { v: 'blue', t: 'Синий', rgb: [80, 150, 255], vf: 3.0 },
    { v: 'yellow', t: 'Жёлтый', rgb: [255, 205, 60], vf: 2.0 },
    { v: 'white', t: 'Белый', rgb: [235, 245, 255], vf: 3.1 }
  ];
  function ledColor(c) {
    for (var i = 0; i < LED_COLORS.length; i++) if (LED_COLORS[i].v === c.props.color) return LED_COLORS[i];
    return LED_COLORS[0];
  }
  /** Ток насыщения, подобранный так, чтобы при If было падение Vf. */
  function ledIs(c, ctx) {
    var vt = ctx.vt * c.props.nf;
    return Math.max(c.props.If, 1e-6) / (SOL.safeExp(U.clamp(c.props.Vf / vt, -60, 90)) - 1);
  }

  define({
    key: 'led', name: 'Светодиод', cat: 'semi',
    tip: 'Яркость пропорциональна току. Не забудьте токоограничивающий резистор!',
    pins: [{ x: -2, y: 0, name: 'A' }, { x: 2, y: 0, name: 'K' }],
    props: [
      { key: 'color', label: 'Цвет', type: 'select', options: LED_COLORS, def: 'red' },
      { key: 'Vf', label: 'Прямое падение', unit: 'В', def: 1.9, min: 0.3 },
      { key: 'If', label: 'Номин. ток', unit: 'А', def: 0.02, min: 1e-5 },
      { key: 'nf', label: 'Коэф. неидеальности', unit: '', def: 2.2, min: 1, max: 4 }
    ],
    nonlinear: true,
    stamp: function (c, ctx) { stampJunction(ctx, c, c.n[0], c.n[1], { is: ledIs(c, ctx), nf: c.props.nf, vz: 0 }, '_vd'); },
    post: function (c, ctx) {
      var r = junctionCurrent(c, ctx, { is: ledIs(c, ctx), nf: c.props.nf, vz: 0 });
      c.v = r.v; c.i = r.i;
      c.glow = U.clamp(c.i / Math.max(c.props.If, 1e-6), 0, 1.8);
      c.warn = c.i > c.props.If * 2.2 ? 'Ток выше допустимого — светодиод сгорит' : null;
    },
    draw: function (g, c) {
      var col = ledColor(c), glow = c.glow || 0;
      var rgb = col.rgb.join(',');
      if (glow > 0.02) {
        var hal = g.createRadialGradient(0, 0, 2, 0, 0, GRID * 2.6);
        hal.addColorStop(0, 'rgba(' + rgb + ',' + (0.55 * Math.min(glow, 1)) + ')');
        hal.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = hal;
        g.beginPath(); g.arc(0, 0, GRID * 2.6, 0, 7); g.fill();
      }
      var body = glow > 0.02
        ? 'rgba(' + rgb + ',' + (0.35 + 0.6 * Math.min(glow, 1)) + ')'
        : 'rgba(' + col.rgb.map(function (v) { return Math.round(v * 0.32); }).join(',') + ',.95)';
      drawDiodeBody(g, c, body);
      // стрелки излучения
      g.strokeStyle = glow > 0.02 ? 'rgba(' + rgb + ',.95)' : 'rgba(180,195,210,.6)';
      g.lineWidth = 1.3; g.lineCap = 'round';
      for (var k = 0; k < 2; k++) {
        var ox = -2 + k * 7;
        g.beginPath();
        g.moveTo(ox, -GRID * 0.8); g.lineTo(ox + 5, -GRID * 1.5);
        g.stroke();
        g.beginPath();
        g.moveTo(ox + 5, -GRID * 1.5); g.lineTo(ox + 1.4, -GRID * 1.33);
        g.moveTo(ox + 5, -GRID * 1.5); g.lineTo(ox + 3.6, -GRID * 1.08);
        g.stroke();
      }
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(Math.max(c.i || 0, 0), 'А')]);
    }
  });

  /* ------------------ биполярные транзисторы (Эберс–Молл) ------------ */

  function bjt(npn) {
    var pol = npn ? 1 : -1;
    return {
      key: npn ? 'npn' : 'pnp',
      name: npn ? 'Транзистор NPN' : 'Транзистор PNP',
      cat: 'semi',
      tip: 'Модель Эберса–Молла: малый ток базы управляет большим током коллектора',
      pins: [{ x: -2, y: 0, name: 'Б' }, { x: 2, y: -2, name: 'К' }, { x: 2, y: 2, name: 'Э' }],
      props: [
        { key: 'Bf', label: 'Коэф. усиления β', unit: '', def: 150, min: 1 },
        { key: 'Is', label: 'Ток насыщения', unit: 'А', def: 1e-14, min: 1e-20 },
        { key: 'Br', label: 'Обратный β', unit: '', def: 2, min: 0.01 }
      ],
      nonlinear: true,
      npn: npn,
      stamp: function (c, ctx) {
        var vt = ctx.vt;
        var is = Math.max(c.props.Is, 1e-20);
        var bf = Math.max(c.props.Bf, 1e-3), br = Math.max(c.props.Br, 1e-3);
        var vcrit = SOL.critVoltage(is, vt);

        var vbe = pol * (ctx.nv(c.n[0]) - ctx.nv(c.n[2]));
        var vbc = pol * (ctx.nv(c.n[0]) - ctx.nv(c.n[1]));
        vbe = SOL.pnjlim(vbe, c._vbe === undefined ? 0 : c._vbe, vt, vcrit);
        vbc = SOL.pnjlim(vbc, c._vbc === undefined ? 0 : c._vbc, vt, vcrit);
        c._vbe = vbe; c._vbc = vbc;

        var ebe = SOL.safeExp(U.clamp(vbe / vt, -60, 90));
        var ebc = SOL.safeExp(U.clamp(vbc / vt, -60, 90));

        var ic = is * (ebe - ebc) - (is / br) * (ebc - 1);
        var ib = (is / bf) * (ebe - 1) + (is / br) * (ebc - 1);
        var ie = -(ic + ib);

        var dicde = is * ebe / vt;                       // dIc/dVbe
        var dicdc = -(is + is / br) * ebc / vt;          // dIc/dVbc
        var dibde = (is / bf) * ebe / vt;
        var dibdc = (is / br) * ebc / vt;
        var diede = -(dicde + dibde);
        var diedc = -(dicdc + dibdc);

        var J = [
          [dibde + dibdc, -dibdc, -dibde],
          [dicde + dicdc, -dicdc, -dicde],
          [diede + diedc, -diedc, -diede]
        ];
        var I = [pol * ib, pol * ic, pol * ie];
        // Приведённый вектор напряжений: даёт J·V = вклад ограниченных vbe/vbc
        var V = [0, -pol * vbc, -pol * vbe];
        ctx.mna.nonlinear(c.n, I, J, V);
        // утечки gmin через переходы — обязательны для сходимости Ньютона
        ctx.mna.conductance(c.n[0], c.n[2], ctx.gmin);
        ctx.mna.conductance(c.n[0], c.n[1], ctx.gmin);
      },
      post: function (c, ctx) {
        var vt = ctx.vt;
        var is = Math.max(c.props.Is, 1e-20);
        var bf = Math.max(c.props.Bf, 1e-3), br = Math.max(c.props.Br, 1e-3);
        var vbe = pol * (ctx.nv(c.n[0]) - ctx.nv(c.n[2]));
        var vbc = pol * (ctx.nv(c.n[0]) - ctx.nv(c.n[1]));
        var ebe = SOL.safeExp(U.clamp(vbe / vt, -60, 90));
        var ebc = SOL.safeExp(U.clamp(vbc / vt, -60, 90));
        c.ic = pol * (is * (ebe - ebc) - (is / br) * (ebc - 1));
        c.ib = pol * ((is / bf) * (ebe - 1) + (is / br) * (ebc - 1));
        c.ie = -(c.ic + c.ib);
        c.vbe = vbe; c.vbc = vbc; c.vce = pol * (ctx.nv(c.n[1]) - ctx.nv(c.n[2]));
        c.i = c.ic;
        c.v = c.vce;
        c.mode = (vbe > 0.4 && vbc < 0.3) ? 'активный' : (vbe > 0.4 && vbc > 0.3 ? 'насыщение' : 'отсечка');
        c.pinI = [c.ib, c.ic, c.ie];
      },
      draw: function (g, c) {
        lead(g, -2 * GRID, 0, -GRID * 0.5, 0);
        lead(g, 2 * GRID, -2 * GRID, GRID * 0.62, -GRID * 1.05);
        lead(g, 2 * GRID, 2 * GRID, GRID * 0.62, GRID * 1.05);
        var r = GRID * 1.15;
        var on = c.mode === 'активный' || c.mode === 'насыщение';
        var grad = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        grad.addColorStop(0, on ? 'rgba(95,125,155,.6)' : 'rgba(58,70,86,.6)');
        grad.addColorStop(1, 'rgba(30,40,52,.7)');
        g.fillStyle = grad;
        g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
        g.strokeStyle = on ? 'rgba(120,220,190,.85)' : 'rgba(150,168,185,.8)';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
        // база
        g.strokeStyle = '#e3ebf3'; g.lineWidth = 2.6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-GRID * 0.5, -GRID * 0.75); g.lineTo(-GRID * 0.5, GRID * 0.75); g.stroke();
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(-GRID * 0.5, -GRID * 0.38); g.lineTo(GRID * 0.62, -GRID * 1.05);
        g.moveTo(-GRID * 0.5, GRID * 0.38); g.lineTo(GRID * 0.62, GRID * 1.05);
        g.stroke();
        // стрелка эмиттера
        g.fillStyle = '#e3ebf3';
        g.save();
        var ax = npn ? GRID * 0.62 : -GRID * 0.5 + (GRID * 1.12) * 0.28;
        var ay = npn ? GRID * 1.05 : GRID * 0.38 + (GRID * 0.67) * 0.28;
        g.translate(ax, ay);
        g.rotate(Math.atan2(GRID * 0.67, GRID * 1.12) + (npn ? Math.PI : 0));
        g.beginPath(); g.moveTo(0, 0); g.lineTo(6.5, -2.6); g.lineTo(6.5, 2.6); g.closePath(); g.fill();
        g.restore();
        label(g, c, [c.name ? c.name : (npn ? 'NPN' : 'PNP')], GRID * 2.5);
      }
    };
  }
  define(bjt(true));
  define(bjt(false));

  /* ------------------------- полевые транзисторы --------------------- */

  function mosfet(nch) {
    var pol = nch ? 1 : -1;
    return {
      key: nch ? 'nmos' : 'pmos',
      name: nch ? 'MOSFET N-канал' : 'MOSFET P-канал',
      cat: 'semi',
      tip: 'Управляется напряжением на затворе (квадратичная модель)',
      pins: [{ x: -2, y: 0, name: 'З' }, { x: 2, y: -2, name: 'С' }, { x: 2, y: 2, name: 'И' }],
      props: [
        { key: 'Vth', label: 'Пороговое U', unit: 'В', def: 2 },
        { key: 'K', label: 'Крутизна', unit: 'А/В²', def: 0.5, min: 1e-6 },
        { key: 'lambda', label: 'Модуляция канала', unit: '1/В', def: 0.02, min: 0 }
      ],
      nonlinear: true,
      stamp: function (c, ctx) {
        var vG = ctx.nv(c.n[0]), vD = ctx.nv(c.n[1]), vS = ctx.nv(c.n[2]);
        // при обратной полярности сток и исток меняются ролями
        var swap = pol * (vD - vS) < 0;
        var di = swap ? 2 : 1, si = swap ? 1 : 2;
        var vs = ctx.nv(c.n[si]), vd = ctx.nv(c.n[di]);
        var vgs = pol * (vG - vs), vds = pol * (vd - vs);
        var K = Math.max(c.props.K, 1e-9), lam = Math.max(c.props.lambda, 0);
        var vgst = vgs - Math.abs(c.props.Vth);
        var id = 0, gm = 0, gds = 0;
        if (vgst <= 0) {                       // отсечка
          id = 0; gm = 0; gds = 0;
        } else if (vds < vgst) {               // линейный (триодный) режим
          id = K * (vgst - vds / 2) * vds;
          gm = K * vds;
          gds = K * (vgst - vds);
        } else {                               // насыщение
          var base = 0.5 * K * vgst * vgst;
          id = base * (1 + lam * vds);
          gm = K * vgst * (1 + lam * vds);
          gds = base * lam;
        }
        gds += ctx.gmin;
        var I = [0, 0, 0], J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        I[di] = pol * id; I[si] = -pol * id;
        J[di][0] = gm; J[di][di] = gds; J[di][si] = -(gm + gds);
        J[si][0] = -gm; J[si][di] = -gds; J[si][si] = gm + gds;
        // вектор V отсчитывается от истока: J·V даёт вклад vgs и vds
        var V = [0, 0, 0];
        V[0] = pol * vgs; V[di] = pol * vds; V[si] = 0;
        ctx.mna.nonlinear(c.n, I, J, V);
        ctx.mna.conductance(c.n[di], c.n[si], ctx.gmin);
        c._id = pol * id; c._di = di; c._si = si;
        c.vgs = vgs; c.vds = vds;
      },
      post: function (c, ctx) {
        c.i = c._id || 0;
        c.v = ctx.nv(c.n[1]) - ctx.nv(c.n[2]);
        c.mode = (c.vgs || 0) <= Math.abs(c.props.Vth) ? 'закрыт'
          : ((c.vds || 0) < (c.vgs - Math.abs(c.props.Vth)) ? 'линейный' : 'насыщение');
        c.pinI = [0, c.i, -c.i];
      },
      draw: function (g, c) {
        lead(g, -2 * GRID, 0, -GRID * 0.95, 0);
        lead(g, 2 * GRID, -2 * GRID, GRID * 0.75, -GRID * 1.15);
        lead(g, 2 * GRID, 2 * GRID, GRID * 0.75, GRID * 1.15);
        var open = c.mode && c.mode !== 'закрыт';
        g.strokeStyle = '#e3ebf3'; g.lineWidth = 2.4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-GRID * 0.95, -GRID); g.lineTo(-GRID * 0.95, GRID); g.stroke();
        g.strokeStyle = open ? '#7fe3c4' : '#b9c6d2';
        g.lineWidth = 2.2;
        for (var i = -1; i <= 1; i++) {
          g.beginPath();
          g.moveTo(-GRID * 0.45, i * GRID * 0.72 - GRID * 0.3);
          g.lineTo(-GRID * 0.45, i * GRID * 0.72 + GRID * 0.3);
          g.stroke();
        }
        g.strokeStyle = '#d5dfe9'; g.lineWidth = 2;
        g.beginPath();
        g.moveTo(-GRID * 0.45, -GRID * 1.02); g.lineTo(GRID * 0.75, -GRID * 1.15);
        g.moveTo(-GRID * 0.45, GRID * 1.02); g.lineTo(GRID * 0.75, GRID * 1.15);
        g.moveTo(-GRID * 0.45, 0); g.lineTo(GRID * 0.75, 0);
        g.lineTo(GRID * 0.75, GRID * 1.15);
        g.stroke();
        g.fillStyle = '#d5dfe9';
        g.beginPath();
        if (nch) { g.moveTo(-GRID * 0.05, 0); g.lineTo(-GRID * 0.05 - 6, -3); g.lineTo(-GRID * 0.05 - 6, 3); }
        else { g.moveTo(-GRID * 0.45, 0); g.lineTo(-GRID * 0.45 + 6, -3); g.lineTo(-GRID * 0.45 + 6, 3); }
        g.closePath(); g.fill();
        label(g, c, [c.name || (nch ? 'N-MOS' : 'P-MOS')], GRID * 2.5);
      }
    };
  }
  define(mosfet(true));
  define(mosfet(false));

  /* ------------------------ операционный усилитель ------------------- */

  define({
    key: 'opamp', name: 'Операционный усилитель', cat: 'semi',
    tip: 'Идеальный ОУ с ограничением по напряжению питания',
    pins: [{ x: -3, y: -1, name: '+' }, { x: -3, y: 1, name: '−' }, { x: 3, y: 0, name: 'вых' }],
    props: [
      { key: 'gain', label: 'Коэф. усиления', unit: '', def: 100000, min: 10 },
      { key: 'Vhi', label: 'Питание +', unit: 'В', def: 12 },
      { key: 'Vlo', label: 'Питание −', unit: 'В', def: -12 },
      { key: 'Rout', label: 'Выходное сопр.', unit: 'Ω', def: 20, min: 0.01 }
    ],
    branches: 1, internals: 1, nonlinear: true,
    stamp: function (c, ctx) {
      var gain = Math.max(c.props.gain, 10);
      var hi = c.props.Vhi, lo = c.props.Vlo;
      var vp = ctx.nv(c.n[0]), vn = ctx.nv(c.n[1]);
      var vd = vp - vn;
      var dx, x;
      if (vd >= hi / gain) { dx = 1e-4; x = hi - dx * hi / gain; }
      else if (vd <= lo / gain) { dx = 1e-4; x = lo - dx * lo / gain; }
      else { dx = gain; x = 0; }
      if (c._vdLast !== undefined && Math.abs(vd - c._vdLast) > 0.05) ctx.forceIterate();
      c._vdLast = vd;
      var out = c.ni[0], br = c.br;
      // строка ветви:  Vout − dx·(V+ − V−) = x
      ctx.mna.addA(br, out, 1);
      ctx.mna.addA(br, c.n[0], -dx);
      ctx.mna.addA(br, c.n[1], dx);
      ctx.mna.addB(br, x);
      ctx.mna.addA(out, br, 1);
      ctx.mna.conductance(out, c.n[2], 1 / Math.max(c.props.Rout, 0.01));
      // входы имеют конечное (очень большое) сопротивление — для устойчивости счёта
      ctx.mna.conductance(c.n[0], c.n[1], 1e-11);
    },
    post: function (c, ctx) {
      c.vin = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.vout = ctx.nv(c.n[2]);
      c.v = c.vout;
      c.i = -ctx.x[c.br];
      c.pinI = [0, 0, c.i];
      c.sat = c.vout > c.props.Vhi - 0.05 || c.vout < c.props.Vlo + 0.05;
    },
    draw: function (g, c) {
      lead(g, -3 * GRID, -GRID, -GRID * 1.1, -GRID);
      lead(g, -3 * GRID, GRID, -GRID * 1.1, GRID);
      lead(g, 3 * GRID, 0, GRID * 1.45, 0);
      var grad = g.createLinearGradient(0, -GRID * 1.6, 0, GRID * 1.6);
      grad.addColorStop(0, 'rgba(70,88,110,.9)');
      grad.addColorStop(1, 'rgba(38,48,62,.92)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(-GRID * 1.1, -GRID * 1.7);
      g.lineTo(GRID * 1.45, 0);
      g.lineTo(-GRID * 1.1, GRID * 1.7);
      g.closePath();
      g.fill();
      g.strokeStyle = c.sat ? 'rgba(255,170,90,.9)' : 'rgba(180,200,220,.85)';
      g.lineWidth = 1.5; g.stroke();
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.fillStyle = '#e6eef6';
      g.font = '700 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('+', -GRID * 0.62, -GRID);
      g.fillText('−', -GRID * 0.62, GRID);
      g.restore();
      label(g, c, [c.name || 'ОУ'], GRID * 2.3);
    }
  });
})(window);

/* ElectroCore — измерительные приборы и служебные элементы. */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util;
  var GRID = EC.GRID, define = EC.define;
  var gfx = EC.gfx, roundRect = gfx.roundRect, lead = gfx.lead, leadsH = gfx.leadsH, label = gfx.label, lcd = gfx.lcd;

  /** Корпус прибора со стрелочной шкалой и цифровым экраном. */
  function meterBody(g, c, letter, accent, value, unit) {
    leadsH(g, GRID * 1.35);
    var w = GRID * 2.7, h = GRID * 2.2;
    var grad = g.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, 'rgba(48,60,76,.96)');
    grad.addColorStop(1, 'rgba(26,34,46,.96)');
    g.fillStyle = grad;
    roundRect(g, -w / 2, -h / 2, w, h, 4);
    g.fill();
    g.strokeStyle = 'rgba(150,172,196,.55)';
    g.lineWidth = 1.2;
    g.stroke();
    g.save();
    g.rotate(-(c.rot || 0) * Math.PI / 2);
    g.font = '700 9px sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = accent;
    g.fillText(letter, -w / 2 + 4, -h / 2 + 7);
    g.translate(0, 3);
    lcd(g, w - 8, GRID * 0.95, value, unit, accent);
    g.restore();
  }

  define({
    key: 'voltmeter', name: 'Вольтметр', cat: 'meter', catName: 'Измерения',
    tip: 'Подключается параллельно участку. Внутреннее сопротивление 10 МΩ.',
    pins: [{ x: -2, y: 0, name: '+' }, { x: 2, y: 0, name: '−' }],
    props: [{ key: 'Rin', label: 'Входное сопр.', unit: 'Ω', def: 1e7, min: 1 }],
    measure: 'v',
    stamp: function (c, ctx) { ctx.mna.conductance(c.n[0], c.n[1], 1 / Math.max(c.props.Rin, 1)); },
    post: function (c, ctx) {
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = c.v / Math.max(c.props.Rin, 1);
      c.reading = c.v;
    },
    draw: function (g, c) {
      meterBody(g, c, 'V', '#7dffd0', U.fmtSI(c.reading || 0, 4), 'В');
      label(g, c, [c.name || '']);
    }
  });

  define({
    key: 'ammeter', name: 'Амперметр', cat: 'meter',
    tip: 'Включается последовательно в цепь. Шунт 1 мΩ.',
    pins: [{ x: -2, y: 0, name: '+' }, { x: 2, y: 0, name: '−' }],
    props: [{ key: 'Rsh', label: 'Сопр. шунта', unit: 'Ω', def: 0.001, min: 1e-6 }],
    measure: 'i',
    stamp: function (c, ctx) { ctx.mna.conductance(c.n[0], c.n[1], 1 / Math.max(c.props.Rsh, 1e-6)); },
    post: function (c, ctx) {
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = c.v / Math.max(c.props.Rsh, 1e-6);
      c.reading = c.i;
    },
    draw: function (g, c) {
      meterBody(g, c, 'A', '#ffd479', U.fmtSI(c.reading || 0, 4), 'А');
      label(g, c, [c.name || '']);
    }
  });

  define({
    key: 'wattmeter', name: 'Ваттметр', cat: 'meter',
    tip: 'Токовые клеммы — последовательно, клеммы напряжения — параллельно нагрузке. P = U·I',
    pins: [
      { x: -3, y: -1, name: 'I+' }, { x: 3, y: -1, name: 'I−' },
      { x: -3, y: 2, name: 'U+' }, { x: 3, y: 2, name: 'U−' }
    ],
    props: [
      { key: 'Rsh', label: 'Сопр. шунта', unit: 'Ω', def: 0.001, min: 1e-6 },
      { key: 'Rin', label: 'Входное сопр.', unit: 'Ω', def: 1e7, min: 1 }
    ],
    measure: 'p',
    stamp: function (c, ctx) {
      ctx.mna.conductance(c.n[0], c.n[1], 1 / Math.max(c.props.Rsh, 1e-6));
      ctx.mna.conductance(c.n[2], c.n[3], 1 / Math.max(c.props.Rin, 1));
    },
    post: function (c, ctx) {
      c.i = (ctx.nv(c.n[0]) - ctx.nv(c.n[1])) / Math.max(c.props.Rsh, 1e-6);
      c.vsense = ctx.nv(c.n[2]) - ctx.nv(c.n[3]);
      c.v = c.vsense;
      c.reading = c.vsense * c.i;
      // среднее за 50 мс — так прибор ведёт себя на переменном токе
      var a = Math.min(ctx.dt / 0.05, 1);
      c.avg = (c.avg === undefined ? c.reading : c.avg + (c.reading - c.avg) * a);
    },
    draw: function (g, c) {
      lead(g, -3 * GRID, -GRID, -GRID * 1.6, -GRID);
      lead(g, 3 * GRID, -GRID, GRID * 1.6, -GRID);
      lead(g, -3 * GRID, 2 * GRID, -GRID * 1.6, 2 * GRID);
      lead(g, 3 * GRID, 2 * GRID, GRID * 1.6, 2 * GRID);
      g.strokeStyle = 'rgba(150,172,196,.5)'; g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-GRID * 1.6, 2 * GRID); g.lineTo(-GRID * 1.6, GRID * 1.2);
      g.moveTo(GRID * 1.6, 2 * GRID); g.lineTo(GRID * 1.6, GRID * 1.2);
      g.stroke();
      var w = GRID * 3.4, h = GRID * 2.6;
      var grad = g.createLinearGradient(0, -h / 2, 0, h / 2);
      grad.addColorStop(0, 'rgba(48,60,76,.96)');
      grad.addColorStop(1, 'rgba(26,34,46,.96)');
      g.fillStyle = grad;
      roundRect(g, -w / 2, -h / 2, w, h, 5); g.fill();
      g.strokeStyle = 'rgba(150,172,196,.55)'; g.lineWidth = 1.2; g.stroke();
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.font = '700 9px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = '#9fd0ff';
      g.fillText('W', -w / 2 + 5, -h / 2 + 8);
      g.translate(0, 3);
      lcd(g, w - 10, GRID * 1.1, U.fmtSI(c.avg || 0, 4), 'Вт', '#9fd0ff');
      g.restore();
      label(g, c, [c.name || ''], GRID * 3);
    }
  });

  define({
    key: 'probe', name: 'Щуп осциллографа', cat: 'meter',
    tip: 'Измеряет потенциал узла относительно земли',
    pins: [{ x: 0, y: 2 }],
    props: [{ key: 'Rin', label: 'Входное сопр.', unit: 'Ω', def: 1e7, min: 1 }],
    measure: 'v',
    scopeDefault: true,
    stamp: function (c, ctx) { ctx.mna.conductance(c.n[0], -1, 1 / Math.max(c.props.Rin, 1)); },
    post: function (c, ctx) { c.v = ctx.nv(c.n[0]); c.i = 0; c.reading = c.v; },
    draw: function (g, c) {
      lead(g, 0, 2 * GRID, 0, GRID * 0.5);
      var col = c.color || '#6fe0c2';
      g.fillStyle = 'rgba(30,40,52,.9)';
      roundRect(g, -GRID * 1.5, -GRID * 1.1, GRID * 3, GRID * 1.6, 4); g.fill();
      g.strokeStyle = col; g.lineWidth = 1.3; g.stroke();
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.fillStyle = col;
      g.font = '700 10px ui-monospace, Menlo, monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = col; g.shadowBlur = 5;
      g.fillText(U.fmtSI(c.v || 0, 3) + 'В', 0, -GRID * 0.3);
      g.restore();
    }
  });

  define({
    key: 'junction', name: 'Узел', cat: 'meter',
    tip: 'Точка соединения нескольких проводов',
    pins: [{ x: 0, y: 0 }],
    props: [],
    tiny: true,
    stamp: function () { },
    post: function (c, ctx) { c.v = ctx.nv(c.n[0]); c.i = 0; },
    draw: function (g, c) {
      g.fillStyle = '#cfe0ee';
      g.beginPath(); g.arc(0, 0, 3.4, 0, 7); g.fill();
    }
  });
})(window);
