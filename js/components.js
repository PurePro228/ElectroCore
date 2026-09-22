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

  /**
   * Подписи выводов на корпусе микросхемы: сокращение рисуется внутри
   * корпуса напротив своей ножки. Текст всегда остаётся горизонтальным.
   */
  function chipPins(g, c, list, w, size) {
    var def = c.def();
    g.font = '600 ' + (size || 5.6) + 'px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (var k = 0; k < list.length; k++) {
      var pin = def.pins[list[k].i];
      if (!pin) continue;
      var inner = w / 2 - (g.measureText(list[k].t).width / 2) - 3;
      var px = list[k].x !== undefined ? list[k].x : (pin.x > 0 ? inner : -inner);
      var py = list[k].y !== undefined ? list[k].y : pin.y * GRID;
      g.save();
      g.translate(px, py);
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.fillStyle = 'rgba(205,220,235,.72)';
      g.fillText(list[k].t, 0, 0);
      g.restore();
    }
  }

  EC.gfx = {
    roundRect: roundRect, lead: lead, leadsH: leadsH, label: label, lcd: lcd,
    chipPins: chipPins,
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
    var raw = ctx.nv(a) - ctx.nv(b);
    var vd = SOL.pnjlim(raw, prev, vt, vcrit);
    // пока ограничитель шага правит напряжение, решение ещё не найдено:
    // узловые потенциалы при этом могут не меняться, поэтому просим ещё итерацию
    if (Math.abs(vd - raw) > 1e-9) ctx.forceIterate();
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

  /* Доступ к модели перехода для составных приборов (мост, сборки). */
  EC.junction = {
    stamp: stampJunction,
    current: junctionCurrent,
    eval: junctionEval,
    opts: diodeOpts
  };

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
        var rawBe = vbe, rawBc = vbc;
        vbe = SOL.pnjlim(vbe, c._vbe === undefined ? 0 : c._vbe, vt, vcrit);
        vbc = SOL.pnjlim(vbc, c._vbc === undefined ? 0 : c._vbc, vt, vcrit);
        if (Math.abs(vbe - rawBe) > 1e-9 || Math.abs(vbc - rawBc) > 1e-9) ctx.forceIterate();
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
      g.font = '600 5.5px ui-monospace, Menlo, monospace';
      g.fillStyle = 'rgba(205,220,235,.7)';
      g.fillText('ВЫХ', GRID * 0.25, 0);
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
    power: function (c) { return c.reading || 0; },
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

/* ElectroCore — расширение библиотеки: датчики, силовые и логические элементы. */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util, SOL = EC.solver;
  var GRID = EC.GRID, define = EC.define, defs = EC.defs;
  var gfx = EC.gfx, roundRect = gfx.roundRect, lead = gfx.lead, leadsH = gfx.leadsH, label = gfx.label, lcd = gfx.lcd;

  /* ================================================================== */
  /*  Датчики: сопротивление зависит от внешнего воздействия             */
  /* ================================================================== */

  /** Сопротивление термистора по уравнению Стейнхарта–Харта (В-параметр). */
  function ntcR(c) {
    var T = (c.props.t || 25) + 273.15;
    var T0 = 298.15;
    return Math.max(c.props.R25 * Math.exp(c.props.B * (1 / T - 1 / T0)), 0.01);
  }

  define({
    key: 'thermistor', name: 'Термистор', cat: 'passive',
    tip: 'Сопротивление падает при нагреве: R = R₂₅·exp(B·(1/T − 1/298))',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }],
    props: [
      { key: 'R25', label: 'Сопр. при 25 °C', unit: 'Ω', def: 10000, min: 1 },
      { key: 'B', label: 'Коэффициент B', unit: 'К', def: 3950, min: 100 },
      {
        key: 't', label: 'Температура', unit: '°C', def: 25, min: -20, max: 150,
        type: 'range', step: 1, display: function (v) { return Math.round(v) + ' °C'; }
      }
    ],
    stamp: function (c, ctx) { ctx.mna.conductance(c.n[0], c.n[1], 1 / ntcR(c)); },
    post: function (c, ctx) {
      var R = ntcR(c);
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = c.v / R;
      c.R = R;
    },
    draw: function (g, c) {
      leadsH(g, GRID * 1.3);
      var w = GRID * 2.6, h = GRID * 0.95;
      g.fillStyle = 'rgba(60,78,96,.95)';
      roundRect(g, -w / 2, -h / 2, w, h, h * 0.4); g.fill();
      g.strokeStyle = '#d7e2ec'; g.lineWidth = 1.4; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-w * 0.42, h * 0.55); g.lineTo(w * 0.2, h * 0.55); g.lineTo(w * 0.42, -h * 0.55);
      g.stroke();
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.fillStyle = '#ffb36b'; g.font = '700 8px sans-serif'; g.textAlign = 'center';
      g.fillText('t°', 0, 3);
      g.restore();
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(ntcR(c), 'Ω'), Math.round(c.props.t) + ' °C']);
    }
  });

  /** Сопротивление фоторезистора: R = R₁₀·(10/E)^γ. */
  function ldrLux(c) { return 0.1 * Math.pow(10, 4 * U.clamp(c.props.light, 0, 1)); }
  function ldrR(c) {
    return Math.max(c.props.R10 * Math.pow(10 / ldrLux(c), c.props.gamma), 1);
  }

  define({
    key: 'photoresistor', name: 'Фоторезистор', cat: 'passive',
    tip: 'Чем ярче свет, тем меньше сопротивление',
    pins: [{ x: -2, y: 0 }, { x: 2, y: 0 }],
    props: [
      { key: 'R10', label: 'Сопр. при 10 лк', unit: 'Ω', def: 20000, min: 1 },
      { key: 'gamma', label: 'Показатель γ', unit: '', def: 0.7, min: 0.1, max: 1.5 },
      {
        key: 'light', label: 'Освещённость', unit: '', def: 0.5, min: 0, max: 1,
        type: 'range', step: 0.01,
        display: function (v) { return U.fmtSI(0.1 * Math.pow(10, 4 * v), 3) + ' лк'; }
      }
    ],
    stamp: function (c, ctx) { ctx.mna.conductance(c.n[0], c.n[1], 1 / ldrR(c)); },
    post: function (c, ctx) {
      var R = ldrR(c);
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = c.v / R;
      c.R = R;
    },
    draw: function (g, c) {
      leadsH(g, GRID * 1.1);
      var r = GRID * 1.0;
      g.fillStyle = 'rgba(210,190,120,.9)';
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.strokeStyle = 'rgba(60,70,50,.7)'; g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = '#3d4a2f'; g.lineWidth = 1.6; g.lineCap = 'round';
      g.beginPath();
      for (var i = -1; i <= 1; i++) {
        g.moveTo(-r * 0.6, i * r * 0.36);
        g.lineTo(r * 0.6, i * r * 0.36);
      }
      g.stroke();
      // лучики
      var br = U.clamp(c.props.light, 0, 1);
      g.strokeStyle = 'rgba(255,215,120,' + (0.3 + 0.6 * br) + ')';
      g.lineWidth = 1.4;
      for (i = 0; i < 3; i++) {
        var a = -Math.PI * 0.8 + i * 0.3;
        g.beginPath();
        g.moveTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25);
        g.lineTo(Math.cos(a) * r * 1.9, Math.sin(a) * r * 1.9);
        g.stroke();
      }
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(ldrR(c), 'Ω'), U.fmtSI(ldrLux(c), 3) + ' лк'], GRID * 1.7);
    }
  });

  /* ================================================================== */
  /*  Трансформатор                                                      */
  /* ================================================================== */

  define({
    key: 'transformer', name: 'Трансформатор', cat: 'passive',
    tip: 'Две связанные катушки: напряжение делится в отношении витков',
    pins: [
      { x: -3, y: -2, name: 'I+' }, { x: -3, y: 2, name: 'I−' },
      { x: 3, y: -2, name: 'II+' }, { x: 3, y: 2, name: 'II−' }
    ],
    props: [
      { key: 'L1', label: 'Индуктивность I', unit: 'Гн', def: 1, min: 1e-9 },
      { key: 'ratio', label: 'Отношение витков', unit: '', def: 2, min: 0.01 },
      { key: 'k', label: 'Связь', unit: '', def: 0.98, min: 0.01, max: 0.999, type: 'range', step: 0.005 },
      { key: 'R1', label: 'Сопр. обмотки I', unit: 'Ω', def: 1, min: 0.001 },
      { key: 'R2', label: 'Сопр. обмотки II', unit: 'Ω', def: 0.5, min: 0.001 }
    ],
    branches: 2, internals: 2,
    init: function (c) { c.state = { i1: 0, i2: 0, v1: 0, v2: 0 }; },
    stamp: function (c, ctx) {
      var L1 = Math.max(c.props.L1, 1e-9);
      var L2 = Math.max(L1 / Math.pow(Math.max(c.props.ratio, 0.01), 2), 1e-12);
      var M = U.clamp(c.props.k, 0, 0.999) * Math.sqrt(L1 * L2);
      var kk = (ctx.method === 'be' ? 1 : 2) / ctx.dt;
      var a11 = kk * L1, a12 = kk * M, a22 = kk * L2;
      var st = c.state;
      var r1 = -(a11 * st.i1 + a12 * st.i2) - (ctx.method === 'be' ? 0 : st.v1);
      var r2 = -(a12 * st.i1 + a22 * st.i2) - (ctx.method === 'be' ? 0 : st.v2);
      var m = ctx.mna;
      var br1 = c.br, br2 = c.br + 1;
      var p0 = c.n[0], p1 = c.ni[0], s0 = c.n[2], s1 = c.ni[1];

      // уравнения ветвей: U = L·di/dt с взаимной индуктивностью
      m.addA(br1, p0, 1); m.addA(br1, p1, -1);
      m.addA(br1, br1, -a11); m.addA(br1, br2, -a12);
      m.addB(br1, r1);
      m.addA(br2, s0, 1); m.addA(br2, s1, -1);
      m.addA(br2, br1, -a12); m.addA(br2, br2, -a22);
      m.addB(br2, r2);
      // токи ветвей в уравнениях узлов
      m.addA(p0, br1, 1); m.addA(p1, br1, -1);
      m.addA(s0, br2, 1); m.addA(s1, br2, -1);
      // активное сопротивление обмоток
      m.conductance(c.ni[0], c.n[1], 1 / Math.max(c.props.R1, 1e-3));
      m.conductance(c.ni[1], c.n[3], 1 / Math.max(c.props.R2, 1e-3));
      c._a = [a11, a12, a22];
    },
    post: function (c, ctx) {
      var st = c.state;
      st.i1 = ctx.x[c.br];
      st.i2 = ctx.x[c.br + 1];
      st.v1 = ctx.nv(c.n[0]) - ctx.nv(c.ni[0]);
      st.v2 = ctx.nv(c.n[2]) - ctx.nv(c.ni[1]);
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.v2 = ctx.nv(c.n[2]) - ctx.nv(c.n[3]);
      c.i = st.i1;
      c.pinI = [st.i1, -st.i1, st.i2, -st.i2];
    },
    draw: function (g, c) {
      lead(g, -3 * GRID, -2 * GRID, -GRID * 0.9, -2 * GRID);
      lead(g, -3 * GRID, 2 * GRID, -GRID * 0.9, 2 * GRID);
      lead(g, 3 * GRID, -2 * GRID, GRID * 0.9, -2 * GRID);
      lead(g, 3 * GRID, 2 * GRID, GRID * 0.9, 2 * GRID);
      g.strokeStyle = '#d89b4a'; g.lineWidth = 2.4; g.lineCap = 'round';
      for (var s = -1; s <= 1; s += 2) {
        g.beginPath();
        for (var i = 0; i < 4; i++) {
          g.arc(s * GRID * 0.9, -GRID * 1.5 + i * GRID, GRID * 0.5, -Math.PI / 2, Math.PI / 2, s < 0);
        }
        g.stroke();
      }
      g.strokeStyle = '#9fb0bd'; g.lineWidth = 1.6;
      for (i = -1; i <= 1; i += 2) {
        g.beginPath();
        g.moveTo(i * GRID * 0.2, -GRID * 2); g.lineTo(i * GRID * 0.2, GRID * 2);
        g.stroke();
      }
      label(g, c, [(c.name || '') + '  ' + U.fmtSI(c.props.ratio, 3) + ':1'], GRID * 2.6);
    }
  });

  /* ================================================================== */
  /*  Полупроводники: Шоттки, мост, стабилизатор                        */
  /* ================================================================== */

  define({
    key: 'schottky', name: 'Диод Шоттки', cat: 'semi',
    tip: 'Малое прямое падение (около 0,3 В) и высокое быстродействие',
    pins: [{ x: -2, y: 0, name: 'A' }, { x: 2, y: 0, name: 'K' }],
    props: [
      { key: 'Is', label: 'Ток насыщения', unit: 'А', def: 1e-6, min: 1e-20 },
      { key: 'nf', label: 'Коэф. неидеальности', unit: '', def: 1.05, min: 1, max: 3 }
    ],
    nonlinear: true,
    stamp: function (c, ctx) { EC.junction.stamp(ctx, c, c.n[0], c.n[1], EC.junction.opts(c), '_vd'); },
    post: function (c, ctx) {
      var r = EC.junction.current(c, ctx, EC.junction.opts(c));
      c.v = r.v; c.i = r.i;
    },
    draw: function (g, c) {
      leadsH(g, GRID * 0.62);
      var s = GRID * 0.62;
      g.fillStyle = 'rgba(62,74,90,.92)';
      g.beginPath();
      g.moveTo(-s, -s * 0.95); g.lineTo(s * 0.35, 0); g.lineTo(-s, s * 0.95);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(220,232,244,.85)'; g.lineWidth = 1.2; g.stroke();
      // катодная черта с загнутыми концами
      g.strokeStyle = '#dfe8f2'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(s * 0.35 + 4, -s * 0.95); g.lineTo(s * 0.35, -s * 0.95);
      g.lineTo(s * 0.35, s * 0.95); g.lineTo(s * 0.35 - 4, s * 0.95);
      g.stroke();
      label(g, c, [c.name || 'Шоттки']);
    }
  });

  define({
    key: 'bridge', name: 'Диодный мост', cat: 'semi',
    tip: 'Четыре диода: превращает переменное напряжение в пульсирующее постоянное',
    pins: [
      { x: -3, y: 0, name: '~1' }, { x: 3, y: 0, name: '~2' },
      { x: 0, y: -3, name: '+' }, { x: 0, y: 3, name: '−' }
    ],
    props: [
      { key: 'Is', label: 'Ток насыщения', unit: 'А', def: 2.52e-9, min: 1e-20 },
      { key: 'nf', label: 'Коэф. неидеальности', unit: '', def: 1.752, min: 1, max: 4 }
    ],
    nonlinear: true,
    stamp: function (c, ctx) {
      var o = EC.junction.opts(c);
      EC.junction.stamp(ctx, c, c.n[0], c.n[2], o, '_v1');   // ~1 → +
      EC.junction.stamp(ctx, c, c.n[1], c.n[2], o, '_v2');   // ~2 → +
      EC.junction.stamp(ctx, c, c.n[3], c.n[0], o, '_v3');   // − → ~1
      EC.junction.stamp(ctx, c, c.n[3], c.n[1], o, '_v4');   // − → ~2
    },
    post: function (c, ctx) {
      var o = EC.junction.opts(c), J = EC.junction;
      var d1 = J.eval(ctx, ctx.nv(c.n[0]) - ctx.nv(c.n[2]), o).i;   // ~1 → +
      var d2 = J.eval(ctx, ctx.nv(c.n[1]) - ctx.nv(c.n[2]), o).i;   // ~2 → +
      var d3 = J.eval(ctx, ctx.nv(c.n[3]) - ctx.nv(c.n[0]), o).i;   // − → ~1
      var d4 = J.eval(ctx, ctx.nv(c.n[3]) - ctx.nv(c.n[1]), o).i;   // − → ~2
      c.v = ctx.nv(c.n[2]) - ctx.nv(c.n[3]);
      c.i = d1 + d2;
      c.pinI = [d1 - d3, d2 - d4, -(d1 + d2), d3 + d4];
      c.pinIcustom = true;
    },
    draw: function (g, c) {
      lead(g, -3 * GRID, 0, -GRID * 1.3, 0);
      lead(g, 3 * GRID, 0, GRID * 1.3, 0);
      lead(g, 0, -3 * GRID, 0, -GRID * 1.3);
      lead(g, 0, 3 * GRID, 0, GRID * 1.3);
      g.fillStyle = 'rgba(40,50,64,.92)';
      roundRect(g, -GRID * 1.3, -GRID * 1.3, GRID * 2.6, GRID * 2.6, 4); g.fill();
      g.strokeStyle = 'rgba(170,190,210,.7)'; g.lineWidth = 1.1; g.stroke();
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.fillStyle = '#e6eef6'; g.font = '700 9px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('+', 0, -GRID * 0.75);
      g.fillText('−', 0, GRID * 0.75);
      g.fillText('~', -GRID * 0.8, 0);
      g.fillText('~', GRID * 0.8, 0);
      g.restore();
      label(g, c, [c.name || 'Мост'], GRID * 2.6);
    }
  });

  /* Подписи выводов стабилизатора: общий вывод снизу, поэтому задан явно. */
  var REG_PINS = [
    { i: 0, t: 'ВХ' }, { i: 2, t: 'ВЫХ' },
    { i: 1, t: 'ОБЩ', x: 0, y: GRID * 0.52 }
  ];
  EC.REG_PINS = REG_PINS;

  define({
    key: 'regulator', name: 'Стабилизатор', cat: 'semi',
    tip: 'Держит на выходе заданное напряжение, пока на входе хватает запаса',
    pins: [{ x: -2, y: 0, name: 'вх' }, { x: 0, y: 2, name: 'общ' }, { x: 2, y: 0, name: 'вых' }],
    props: [
      { key: 'Vout', label: 'Выходное U', unit: 'В', def: 5 },
      { key: 'drop', label: 'Запас по входу', unit: 'В', def: 2, min: 0 },
      { key: 'Rout', label: 'Выходное сопр.', unit: 'Ω', def: 0.05, min: 0.001 }
    ],
    branches: 1, internals: 1, nonlinear: true,
    power: function (c) { return (c.vin - c.v) * Math.abs(c.i || 0); },
    stamp: function (c, ctx) {
      var vin = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      var target = Math.min(c.props.Vout, vin - c.props.drop);
      if (!(target > 0)) target = 0;
      if (c._tgt !== undefined && Math.abs(target - c._tgt) > 0.02) ctx.forceIterate();
      c._tgt = target;
      var m = ctx.mna, br = c.br, out = c.ni[0];
      // уравнение ветви: U(вых) − U(общ) = target
      m.addA(br, out, 1); m.addA(br, c.n[1], -1);
      m.addB(br, target);
      // ток ветви берётся со входа, а не с общего вывода
      m.addA(out, br, 1); m.addA(c.n[0], br, -1);
      m.conductance(out, c.n[2], 1 / Math.max(c.props.Rout, 1e-3));
    },
    post: function (c, ctx) {
      c.vin = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.v = ctx.nv(c.n[2]) - ctx.nv(c.n[1]);
      c.i = -ctx.x[c.br];
      c.pinI = [c.i, 0, -c.i];
      c.warn = (c.vin < c.props.Vout + c.props.drop - 0.05 && Math.abs(c.i) > 1e-6)
        ? 'Мало напряжения на входе — стабилизация нарушена' : null;
    },
    draw: function (g, c) {
      lead(g, -2 * GRID, 0, -GRID * 1.1, 0);
      lead(g, 2 * GRID, 0, GRID * 1.1, 0);
      lead(g, 0, 2 * GRID, 0, GRID * 0.9);
      g.fillStyle = 'rgba(38,46,58,.95)';
      roundRect(g, -GRID * 1.3, -GRID * 0.9, GRID * 2.6, GRID * 1.8, 3); g.fill();
      g.fillStyle = 'rgba(190,200,212,.9)';
      roundRect(g, -GRID * 1.3, -GRID * 0.9, GRID * 2.6, GRID * 0.5, 3); g.fill();
      gfx.chipPins(g, c, REG_PINS, GRID * 2.6, 5.4);
      label(g, c, [(c.name || '') + ' ' + U.fmtUnit(c.props.Vout, 'В')], GRID * 1.9);
    }
  });
})(window);

/* ElectroCore — исполнительные устройства и логика. */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util;
  var GRID = EC.GRID, define = EC.define;
  var gfx = EC.gfx, roundRect = gfx.roundRect, lead = gfx.lead, leadsH = gfx.leadsH, label = gfx.label;

  /* ================================================================== */
  /*  Исполнительные устройства                                          */
  /* ================================================================== */

  define({
    key: 'motor', name: 'Двигатель', cat: 'actuator', catName: 'Исполнительные',
    tip: 'Ток создаёт момент, вращение наводит противо-ЭДС: U = I·R + Ke·ω',
    pins: [{ x: -2, y: 0, name: '+' }, { x: 2, y: 0, name: '−' }],
    props: [
      { key: 'R', label: 'Сопр. обмотки', unit: 'Ω', def: 8, min: 0.01 },
      { key: 'Ke', label: 'Постоянная', unit: 'В·с/рад', def: 0.02, min: 1e-6 },
      { key: 'J', label: 'Момент инерции', unit: 'кг·м²', def: 2e-5, min: 1e-9 },
      { key: 'b', label: 'Трение', unit: 'Н·м·с', def: 2e-5, min: 0 },
      { key: 'load', label: 'Момент нагрузки', unit: 'Н·м', def: 0, min: 0 }
    ],
    branches: 1, internals: 1,
    init: function (c) { c.state = { w: 0, angle: 0 }; },
    stamp: function (c, ctx) {
      ctx.mna.conductance(c.n[0], c.ni[0], 1 / Math.max(c.props.R, 0.01));
      ctx.mna.voltageSource(c.ni[0], c.n[1], c.br, c.props.Ke * c.state.w);
    },
    post: function (c, ctx) {
      c.i = ctx.x[c.br];
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      var Kt = c.props.Ke;                       // в СИ момент и ЭДС связаны одной постоянной
      var torque = Kt * c.i;
      var st = c.state;
      var dw = (torque - c.props.b * st.w - Math.sign(st.w) * c.props.load) / Math.max(c.props.J, 1e-9);
      st.w += dw * ctx.dt;
      if (Math.abs(st.w) < 1e-6 && Math.abs(torque) < c.props.load) st.w = 0;
      st.angle = (st.angle + st.w * ctx.dt) % (Math.PI * 2);
      c.rpm = st.w * 60 / (2 * Math.PI);
      c.torque = torque;
    },
    draw: function (g, c) {
      leadsH(g, GRID * 1.1);
      var r = GRID * 1.1;
      g.fillStyle = 'rgba(52,64,80,.95)';
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.strokeStyle = 'rgba(180,198,215,.8)'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
      g.save();
      g.rotate((c.state ? c.state.angle : 0));
      g.strokeStyle = '#e4ecf4'; g.lineWidth = 2; g.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        var a = i * Math.PI * 2 / 3;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65);
        g.stroke();
      }
      g.restore();
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.fillStyle = '#8fd4ff'; g.font = '700 8px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('M', 0, -r * 0.55);
      g.restore();
      label(g, c, [(c.name || '') + '  ' + Math.round(c.rpm || 0) + ' об/мин'], GRID * 1.75);
    }
  });

  define({
    key: 'buzzer', name: 'Зуммер', cat: 'actuator',
    tip: 'Пищит, когда через него идёт ток',
    pins: [{ x: -2, y: 0, name: '+' }, { x: 2, y: 0, name: '−' }],
    props: [
      { key: 'R', label: 'Сопротивление', unit: 'Ω', def: 120, min: 1 },
      { key: 'freq', label: 'Частота звука', unit: 'Гц', def: 2400, min: 50, max: 8000 },
      { key: 'In', label: 'Номин. ток', unit: 'А', def: 0.02, min: 1e-4 }
    ],
    stamp: function (c, ctx) { ctx.mna.conductance(c.n[0], c.n[1], 1 / Math.max(c.props.R, 1)); },
    post: function (c, ctx) {
      c.v = ctx.nv(c.n[0]) - ctx.nv(c.n[1]);
      c.i = c.v / Math.max(c.props.R, 1);
      c.loud = U.clamp(Math.abs(c.i) / Math.max(c.props.In, 1e-4), 0, 1.5);
    },
    draw: function (g, c) {
      leadsH(g, GRID * 1.0);
      var r = GRID * 1.0;
      g.fillStyle = 'rgba(28,32,40,.96)';
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.strokeStyle = 'rgba(150,165,180,.7)'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
      g.fillStyle = 'rgba(120,132,148,.9)';
      g.beginPath(); g.arc(0, 0, r * 0.22, 0, 7); g.fill();
      var loud = c.loud || 0;
      if (loud > 0.05) {
        g.strokeStyle = 'rgba(255,215,120,' + U.clamp(loud, 0.2, 0.9) + ')';
        g.lineWidth = 1.5;
        for (var i = 1; i <= 3; i++) {
          g.beginPath();
          g.arc(0, 0, r + i * 5, -Math.PI * 0.28, Math.PI * 0.28);
          g.stroke();
        }
      }
      label(g, c, [(c.name || '') + (loud > 0.05 ? '  звучит' : '')], GRID * 1.6);
    }
  });

  /* ================================================================== */
  /*  Логические элементы                                                */
  /* ================================================================== */

  /**
   * Логический элемент: входы с высоким сопротивлением и порогом,
   * выход — источник напряжения питания или нуля через выходное сопротивление.
   */
  function gate(key, name, inputs, fn, symbol) {
    return {
      key: key, name: name, cat: 'logic', catName: 'Логика',
      tip: 'Порог переключения — половина напряжения питания',
      pins: inputs === 1
        ? [{ x: -2, y: 0, name: 'вх' }, { x: 2, y: 0, name: 'вых' }]
        : [{ x: -2, y: -1, name: 'вх1' }, { x: -2, y: 1, name: 'вх2' }, { x: 2, y: 0, name: 'вых' }],
      props: [
        { key: 'Vcc', label: 'Напряжение питания', unit: 'В', def: 5, min: 0.5 },
        { key: 'Rout', label: 'Выходное сопр.', unit: 'Ω', def: 30, min: 0.1 }
      ],
      branches: 1, internals: 1, nonlinear: true, inputs: inputs, symbol: symbol,
      init: function (c) { c.state = { in: [false, false], out: false }; },
      stamp: function (c, ctx) {
        var vcc = Math.max(c.props.Vcc, 0.5);
        var hi = vcc * 0.6, lo = vcc * 0.4;
        var vals = [];
        for (var i = 0; i < inputs; i++) {
          ctx.mna.conductance(c.n[i], -1, 1e-6);   // подтяжка входа к нулю
          var v = ctx.nv(c.n[i]);
          var prev = c.state.in[i];
          vals[i] = v > hi ? true : (v < lo ? false : prev);
        }
        var out = fn(vals);
        if (c._iterOut !== undefined && c._iterOut !== out) ctx.forceIterate();
        c._iterOut = out;
        c._vals = vals;
        var outPin = c.n[inputs], mid = c.ni[0];
        ctx.mna.voltageSource(mid, -1, c.br, out ? vcc : 0);
        ctx.mna.conductance(mid, outPin, 1 / Math.max(c.props.Rout, 0.1));
      },
      post: function (c, ctx) {
        c.state.in = c._vals || [false, false];
        c.state.out = c._iterOut;
        c._iterOut = undefined;
        c.v = ctx.nv(c.n[inputs]);
        c.i = -ctx.x[c.br];
        c.pinI = inputs === 1 ? [0, c.i] : [0, 0, c.i];
        c.level = c.state.out ? '1' : '0';
      },
      draw: function (g, c) {
        var w = GRID * 2.1, h = GRID * 1.9;
        if (inputs === 1) {
          lead(g, -2 * GRID, 0, -w / 2, 0);
        } else {
          lead(g, -2 * GRID, -GRID, -w / 2, -GRID);
          lead(g, -2 * GRID, GRID, -w / 2, GRID);
        }
        lead(g, 2 * GRID, 0, w / 2, 0);
        g.fillStyle = c.state && c.state.out ? 'rgba(52,86,74,.95)' : 'rgba(44,54,68,.95)';
        roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
        g.strokeStyle = c.state && c.state.out ? 'rgba(125,255,208,.8)' : 'rgba(170,190,210,.7)';
        g.lineWidth = 1.3;
        roundRect(g, -w / 2, -h / 2, w, h, 3); g.stroke();
        gfx.chipPins(g, c, gatePins(inputs), w, 5.4);
        g.save();
        g.rotate(-(c.rot || 0) * Math.PI / 2);
        g.fillStyle = '#e6eef6';
        g.font = '700 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(symbol, 0, 0);
        g.restore();
        label(g, c, [(c.name || '') + '  ' + (c.level || '')], GRID * 1.7);
      }
    };
  }

  /** Подписи выводов логического элемента: входы A, B и выход Y. */
  function gatePins(inputs) {
    return inputs === 1
      ? [{ i: 0, t: 'A' }, { i: 1, t: 'Y' }]
      : [{ i: 0, t: 'A' }, { i: 1, t: 'B' }, { i: 2, t: 'Y' }];
  }

  define(gate('not_gate', 'Элемент НЕ', 1, function (v) { return !v[0]; }, '1'));
  define(gate('and_gate', 'Элемент И', 2, function (v) { return v[0] && v[1]; }, '&'));
  define(gate('or_gate', 'Элемент ИЛИ', 2, function (v) { return v[0] || v[1]; }, '≥1'));

  /* ================================================================== */
  /*  Таймер NE555                                                       */
  /* ================================================================== */

  define({
    key: 'ne555', name: 'Таймер 555', cat: 'logic',
    tip: 'Микросхема DIP-8 с настоящей нумерацией выводов. Делитель из трёх резисторов задаёт пороги ⅓ и ⅔ питания; вывод 5 позволяет сдвинуть порог, вывод 4 — погасить выход.',
    pins: [
      { x: -3, y: -3, name: '1 GND' },
      { x: -3, y: -1, name: '2 ЗАП' },
      { x: -3, y: 1, name: '3 ВЫХ' },
      { x: -3, y: 3, name: '4 СБР' },
      { x: 3, y: 3, name: '5 УПР' },
      { x: 3, y: 1, name: '6 ПОР' },
      { x: 3, y: -1, name: '7 РАЗР' },
      { x: 3, y: -3, name: '8 Vcc' }
    ],
    props: [
      { key: 'Rout', label: 'Выходное сопр.', unit: 'Ω', def: 10, min: 0.1 },
      { key: 'Rdis', label: 'Сопр. разряда', unit: 'Ω', def: 20, min: 0.1 },
      { key: 'Rdiv', label: 'Резисторы делителя', unit: 'Ω', def: 5000, min: 100 },
      { key: 'Rrst', label: 'Подтяжка сброса', unit: 'Ω', def: 100000, min: 100 }
    ],
    internals: 1,                              // нижняя точка делителя (⅓ питания)
    init: function (c) { c.state = { q: false }; },
    stamp: function (c, ctx) {
      var m = ctx.mna;
      var GND = c.n[0], OUT = c.n[2], RST = c.n[3];
      var CTRL = c.n[4], DIS = c.n[6], VCC = c.n[7];
      var low = c.ni[0];
      var Rd = Math.max(c.props.Rdiv, 100);
      // делитель Vcc — вывод 5 (⅔) — внутренняя точка (⅓) — GND
      m.conductance(VCC, CTRL, 1 / Rd);
      m.conductance(CTRL, low, 1 / Rd);
      m.conductance(low, GND, 1 / Rd);
      // сброс подтянут к питанию: незадействованный вывод 4 не мешает работе
      m.conductance(RST, VCC, 1 / Math.max(c.props.Rrst, 100));
      var q = c.state.q;
      m.conductance(OUT, q ? VCC : GND, 1 / Math.max(c.props.Rout, 0.1));
      m.conductance(OUT, q ? GND : VCC, 1e-11);
      m.conductance(DIS, GND, q ? 1e-11 : 1 / Math.max(c.props.Rdis, 0.1));
    },
    post: function (c, ctx) {
      var vg = ctx.nv(c.n[0]);                 // вывод 1 — общий
      var vcc = ctx.nv(c.n[7]) - vg;           // вывод 8 — питание
      var vUp = ctx.nv(c.n[4]) - vg;           // верхний порог — вывод 5
      var vLow = ctx.nv(c.ni[0]) - vg;         // нижний порог — половина верхнего
      var q = c.state.q;
      if (vcc > 0.5) {
        if (ctx.nv(c.n[5]) - vg > vUp) q = false;   // порог сбрасывает
        if (ctx.nv(c.n[1]) - vg < vLow) q = true;   // запуск имеет приоритет
        if (ctx.nv(c.n[3]) - vg < 0.7) q = false;   // сброс главнее всего
      } else q = false;
      c.state.q = q;

      var Rd = Math.max(c.props.Rdiv, 100);
      var iVccCtrl = (ctx.nv(c.n[7]) - ctx.nv(c.n[4])) / Rd;
      var iCtrlLow = (ctx.nv(c.n[4]) - ctx.nv(c.ni[0])) / Rd;
      var iRst = (ctx.nv(c.n[3]) - ctx.nv(c.n[7])) / Math.max(c.props.Rrst, 100);
      var vOut = ctx.nv(c.n[2]) - vg;
      var iOut = (vOut - (q ? vcc : 0)) / Math.max(c.props.Rout, 0.1);
      var iDis = q ? 0 : (ctx.nv(c.n[6]) - vg) / Math.max(c.props.Rdis, 0.1);

      c.pinI = [0, 0, iOut, iRst, iCtrlLow - iVccCtrl, 0, iDis,
        iVccCtrl - iRst - (q ? iOut : 0)];
      var sum = 0;
      for (var k = 1; k < 8; k++) sum += c.pinI[k];
      c.pinI[0] = -sum;                        // общий вывод замыкает баланс токов
      c.v = vOut;
      c.i = -iOut;
      c.vcc = vcc;
      c.level = q ? '1' : '0';
      c.reset = (ctx.nv(c.n[3]) - vg) < 0.7;
    },
    draw: function (g, c) {
      var w = GRID * 3.2, h = GRID * 7;
      for (var i = 0; i < 4; i++) {
        var y = (-3 + i * 2) * GRID;
        lead(g, -3 * GRID, y, -w / 2, y);
        lead(g, 3 * GRID, y, w / 2, y);
      }
      g.fillStyle = 'rgba(34,40,50,.96)';
      roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
      g.strokeStyle = c.state && c.state.q ? 'rgba(125,255,208,.75)' : 'rgba(170,190,210,.6)';
      g.lineWidth = 1.3;
      roundRect(g, -w / 2, -h / 2, w, h, 3); g.stroke();
      EC.gfx.chipPins(g, c, NE555_PINS, w);
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#e6eef6';
      g.font = '700 10px ui-monospace, Menlo, monospace';
      g.fillText('555', 0, 0);
      if (c.reset && c.vcc > 0.5) {
        g.font = '700 6.5px sans-serif';
        g.fillStyle = 'rgba(255,170,120,.9)';
        g.fillText('СБРОС', 0, GRID * 1.6);
      }
      g.restore();
      label(g, c, [(c.name || '') + '  ' + (c.level || '')], GRID * 4.2);
    }
  });

  /* Подписи выводов таймера: индекс вывода, сокращение и номер ножки. */
  var NE555_PINS = [
    { i: 0, t: 'GND', n: 1 }, { i: 1, t: 'ЗАП', n: 2 },
    { i: 2, t: 'ВЫХ', n: 3 }, { i: 3, t: 'СБР', n: 4 },
    { i: 4, t: 'УПР', n: 5 }, { i: 5, t: 'ПОР', n: 6 },
    { i: 6, t: 'РАЗР', n: 7 }, { i: 7, t: 'Vcc', n: 8 }
  ];
  EC.NE555_PINS = NE555_PINS;

  /* Порядок разделов в палитре. */
  /* Порядок разделов задаётся один раз, когда все элементы объявлены. */
  EC.sortCategories = function () {
    var ORDER = ['passive', 'source', 'switch', 'semi', 'logic', 'display', 'actuator', 'meter'];
    EC.categories.sort(function (a, b) {
      return ORDER.indexOf(a.key) - ORDER.indexOf(b.key);
    });
  };
})(window);

/* ElectroCore — восьмибитный процессор EC-8 в корпусе DIP-8. */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util;
  var GRID = EC.GRID, define = EC.define;
  var gfx = EC.gfx, roundRect = gfx.roundRect, lead = gfx.lead, label = gfx.label;

  /* Выводы корпуса: индекс, сокращение, номер ножки. */
  var CPU_PINS = [
    { i: 0, t: 'Vcc', n: 1 }, { i: 1, t: 'CLK', n: 2 },
    { i: 2, t: 'СБР', n: 3 }, { i: 3, t: 'GND', n: 4 },
    { i: 4, t: 'P0', n: 5 }, { i: 5, t: 'P1', n: 6 },
    { i: 6, t: 'P2', n: 7 }, { i: 7, t: 'P3', n: 8 }
  ];
  EC.CPU_PINS = CPU_PINS;

  var PIN_VCC = 0, PIN_CLK = 1, PIN_RST = 2, PIN_GND = 3;
  var PORT_PIN = [4, 5, 6, 7];                 // линия порта → индекс вывода

  var DEFAULT_CODE = [
    '; Мигает светодиодом на выводе P0.',
    '; Задержка сделана двумя вложенными циклами.',
    '',
    '        LDI 0b1111      ; все четыре линии',
    '        DIR             ; настроить как выходы',
    '',
    'цикл:   LDI 0b0001      ; P0 = 1',
    '        OUT',
    '        CALL пауза',
    '        LDI 0b0000      ; P0 = 0',
    '        OUT',
    '        CALL пауза',
    '        JMP цикл',
    '',
    'пауза:  LDI 10          ; внешний счётчик',
    '        ST 0xF0',
    'внеш:   LDI 25          ; внутренний счётчик',
    '        ST 0xF1',
    'внутр:  LD 0xF1',
    '        DEC',
    '        ST 0xF1',
    '        JNZ внутр',
    '        LD 0xF0',
    '        DEC',
    '        ST 0xF0',
    '        JNZ внеш',
    '        RET'
  ].join('\n');

  var CLOCK_SRC = [
    { v: 'internal', t: 'встроенный' },
    { v: 'external', t: 'с вывода CLK' }
  ];

  /** Пересобирает программу, если текст изменился. */
  function syncCode(c) {
    if (c._codeText === c.props.code && c.state.asm) return;
    c._codeText = c.props.code;
    var res = EC.cpu.assemble(c.props.code);
    c.state.asm = res;
    if (res.ok) EC.cpu.load(c.state.m, res.code);
    c.asmError = res.ok ? null : res.errors[0];
  }

  define({
    key: 'cpu8', name: 'Микроконтроллер EC-8', cat: 'logic',
    tip: 'Однокристальная машина: процессор, память на 256 байт и четыре линии ввода-вывода в одном корпусе — как у ATtiny. Внешняя память не нужна.',
    pins: [
      { x: -3, y: -3, name: '1 Vcc' },
      { x: -3, y: -1, name: '2 CLK' },
      { x: -3, y: 1, name: '3 СБР' },
      { x: -3, y: 3, name: '4 GND' },
      { x: 3, y: 3, name: '5 P0' },
      { x: 3, y: 1, name: '6 P1' },
      { x: 3, y: -1, name: '7 P2' },
      { x: 3, y: -3, name: '8 P3' }
    ],
    props: [
      { key: 'code', label: 'Программа', type: 'code', def: DEFAULT_CODE },
      { key: 'clkSrc', label: 'Тактирование', type: 'select', options: CLOCK_SRC, def: 'internal' },
      { key: 'freq', label: 'Тактовая частота', unit: 'Гц', def: 2000, min: 1, max: 200000 },
      { key: 'Rout', label: 'Сопр. выхода', unit: 'Ω', def: 40, min: 1 },
      { key: 'Rin', label: 'Подтяжка входа', unit: 'Ω', def: 1e6, min: 1000 }
    ],
    init: function (c) {
      c.state = { m: EC.cpu.create(), asm: null, clkHigh: false, acc: 0 };
      c._codeText = null;
      syncCode(c);
    },
    stamp: function (c, ctx) {
      var m = ctx.mna, st = c.state;
      var VCC = c.n[PIN_VCC], CLK = c.n[PIN_CLK], RST = c.n[PIN_RST], GND = c.n[PIN_GND];
      var Rin = Math.max(c.props.Rin, 1000);
      m.conductance(VCC, GND, 1 / 5000);       // потребление ядра
      m.conductance(RST, VCC, 1 / 100000);     // вход сброса подтянут к питанию
      m.conductance(CLK, GND, 1 / Rin);
      var powered = c.powered;
      for (var k = 0; k < 4; k++) {
        var p = c.n[PORT_PIN[k]];
        var out = powered && ((st.m.ddr >> k) & 1);
        if (out) {
          var high = (st.m.port >> k) & 1;
          m.conductance(p, high ? VCC : GND, 1 / Math.max(c.props.Rout, 1));
          m.conductance(p, high ? GND : VCC, 1e-11);
        } else {
          m.conductance(p, GND, 1 / Rin);      // вход: слабая подтяжка к нулю
        }
      }
    },
    post: function (c, ctx) {
      syncCode(c);
      var st = c.state, mach = st.m;
      var vg = ctx.nv(c.n[PIN_GND]);
      var vcc = ctx.nv(c.n[PIN_VCC]) - vg;
      c.vcc = vcc;
      c.powered = vcc > 2;

      if (!c.powered) {
        EC.cpu.reset(mach);
        c.inReset = false;
        c.pinI = [0, 0, 0, 0, 0, 0, 0, 0];
        c.v = 0; c.i = 0;
        c.warn = null;
        return;
      }

      // вход сброса активен низким уровнем
      c.inReset = (ctx.nv(c.n[PIN_RST]) - vg) < vcc * 0.3;
      if (c.inReset) EC.cpu.reset(mach);

      // состояние линий, настроенных на вход
      var pins = 0, k;
      for (k = 0; k < 4; k++) {
        if ((ctx.nv(c.n[PORT_PIN[k]]) - vg) > vcc * 0.5) pins |= (1 << k);
      }
      mach.pins = pins;

      if (!c.inReset && st.asm && st.asm.ok) {
        if (c.props.clkSrc === 'external') {
          var high = (ctx.nv(c.n[PIN_CLK]) - vg) > vcc * 0.5;
          if (high && !st.clkHigh) EC.cpu.step(mach);   // по фронту
          st.clkHigh = high;
        } else {
          st.acc += Math.max(c.props.freq, 1) * ctx.dt;
          var n = Math.floor(st.acc);
          if (n > 4000) n = 4000;                       // не вешаем кадр
          st.acc -= n;
          for (k = 0; k < n; k++) EC.cpu.step(mach);
        }
      }

      // токи выводов
      var Rout = Math.max(c.props.Rout, 1), Rin = Math.max(c.props.Rin, 1000);
      var iCore = vcc / 5000;
      var iRst = (ctx.nv(c.n[PIN_RST]) - ctx.nv(c.n[PIN_VCC])) / 100000;
      var iClk = (ctx.nv(c.n[PIN_CLK]) - vg) / Rin;
      var pinI = [0, iClk, iRst, 0, 0, 0, 0, 0];
      var fromVcc = 0;
      for (k = 0; k < 4; k++) {
        var idx = PORT_PIN[k];
        var vp = ctx.nv(c.n[idx]) - vg;
        if ((mach.ddr >> k) & 1) {
          var hi = (mach.port >> k) & 1;
          var ip = (vp - (hi ? vcc : 0)) / Rout;
          pinI[idx] = ip;
          if (hi) fromVcc += ip;
        } else {
          pinI[idx] = vp / Rin;
        }
      }
      pinI[PIN_VCC] = iCore - iRst + fromVcc;
      var sum = 0;
      for (k = 0; k < 8; k++) if (k !== PIN_GND) sum += pinI[k];
      pinI[PIN_GND] = -sum;
      c.pinI = pinI;
      c.v = vcc;
      c.i = iCore;
      c.warn = (st.asm && !st.asm.ok)
        ? 'Ошибка в программе, строка ' + st.asm.errors[0].line + ': ' + st.asm.errors[0].msg
        : (mach.halted ? null : null);
    },
    draw: function (g, c) {
      var w = GRID * 3.4, h = GRID * 7;
      for (var i = 0; i < 4; i++) {
        var y = (-3 + i * 2) * GRID;
        lead(g, -3 * GRID, y, -w / 2, y);
        lead(g, 3 * GRID, y, w / 2, y);
      }
      g.fillStyle = 'rgba(34,40,50,.96)';
      roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
      g.strokeStyle = c.powered ? 'rgba(125,255,208,.7)' : 'rgba(170,190,210,.6)';
      g.lineWidth = 1.3;
      roundRect(g, -w / 2, -h / 2, w, h, 3); g.stroke();
      gfx.chipPins(g, c, CPU_PINS, w);
      EC.cpuFace(g, c, w, h);
      label(g, c, [c.name || 'EC-8'], GRID * 4.2);
    }
  });

  /**
   * Лицевая часть корпуса: маркировка, счётчик команд и четыре точки,
   * показывающие уровни на линиях порта.
   */
  EC.cpuFace = function (g, c, w, h) {
    var st = c.state, mach = st && st.m;
    g.save();
    g.rotate(-(c.rot || 0) * Math.PI / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 9px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(232,240,248,.85)';
    g.fillText('EC-8', 0, -GRID * 1.05);
    if (mach) {
      g.font = '600 6.5px ui-monospace, Menlo, monospace';
      g.fillStyle = c.inReset ? 'rgba(255,170,120,.9)'
        : (mach.halted ? 'rgba(255,200,120,.85)' : 'rgba(125,255,208,.8)');
      g.fillText(c.inReset ? 'СБРОС' : (mach.halted ? 'СТОП' : 'PC ' + EC.cpu.hex(mach.pc)), 0, 0);
      for (var k = 0; k < 4; k++) {
        var on = c.powered && ((mach.ddr >> k) & 1) && ((mach.port >> k) & 1);
        g.beginPath();
        g.arc(-GRID * 0.75 + k * GRID * 0.5, GRID * 1.15, 2.6, 0, 7);
        g.fillStyle = on ? '#7dffd0' : 'rgba(120,140,160,.45)';
        g.fill();
      }
    }
    g.restore();
  };
})(window);

/* ElectroCore — процессор с внешней шиной и микросхема памяти. */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util;
  var GRID = EC.GRID, define = EC.define;
  var gfx = EC.gfx, roundRect = gfx.roundRect, lead = gfx.lead, label = gfx.label;

  /* ------------------------------------------------------------------ */
  /*  Общие приёмы работы с шиной                                        */
  /* ------------------------------------------------------------------ */

  var DRIVE = 50;                              // сопротивление выходного каскада
  var PULL = 1e6;                              // подтяжка неподключённого входа

  /** Выставляет на вывод логический уровень через выходное сопротивление. */
  function driveBit(ctx, pin, high, VCC, GND, r) {
    ctx.mna.conductance(pin, high ? VCC : GND, 1 / r);
    ctx.mna.conductance(pin, high ? GND : VCC, 1e-11);
  }

  /** Читает логический уровень вывода относительно общего провода. */
  function readBit(ctx, pin, vg, vcc) {
    return (ctx.nv(pin) - vg) > vcc * 0.5;
  }

  /** Собирает число из группы выводов, младший бит первым. */
  function readBus(ctx, nodes, first, count, vg, vcc) {
    var v = 0;
    for (var i = 0; i < count; i++) if (readBit(ctx, nodes[first + i], vg, vcc)) v |= (1 << i);
    return v;
  }

  /* ------------------------------------------------------------------ */
  /*  Процессор EC-8B в корпусе DIP-28                                   */
  /* ------------------------------------------------------------------ */

  /* Нумерация ножек настоящая: слева сверху вниз 1…14, справа снизу
     вверх 15…28. Индекс вывода в списке равен номеру ножки минус один. */
  var CPUB = {
    VCC: 0, GND: 1, CLK: 2, RST: 3, HLT: 4, SYNC: 5,
    A: 6,            // A0…A7 — ножки 7…14
    P: 14,           // P0…P3 — ножки 15…18
    RD: 18, WR: 19,  // ножки 19 и 20
    D: 20            // D0…D7 — ножки 21…28
  };

  /* Слева питание, тактирование и вся шина адреса; справа порт, сигналы
     обмена и шина данных — так же, как у настоящих микросхем памяти. */
  var CPUB_LEFT = ['Vcc', 'GND', 'CLK', 'СБР', '/СТОП', '/КОД',
    'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];
  var CPUB_RIGHT = ['P0', 'P1', 'P2', 'P3', '/ЧТ', '/ЗП',
    'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];

  /** Подписи на корпусе: индекс вывода, сокращение, номер ножки. */
  var CPUB_PINS = [];
  CPUB_LEFT.forEach(function (t, i) { CPUB_PINS.push({ i: i, t: t, n: i + 1 }); });
  CPUB_RIGHT.forEach(function (t, i) { CPUB_PINS.push({ i: 14 + i, t: t, n: 15 + i }); });
  EC.CPUB_PINS = CPUB_PINS;

  /** Геометрия корпуса DIP-28 шириной 0.6 дюйма. */
  function cpuBusPins() {
    var pins = [], i;
    for (i = 0; i < 14; i++) {
      pins.push({ x: -6, y: -13 + i * 2, name: (i + 1) + ' ' + CPUB_LEFT[i] });
    }
    for (i = 0; i < 14; i++) {
      pins.push({ x: 6, y: 13 - i * 2, name: (15 + i) + ' ' + CPUB_RIGHT[i] });
    }
    return pins;
  }

  define({
    key: 'cpu_bus', name: 'Процессор EC-8B', cat: 'logic',
    tip: 'Настоящий процессор: своей памяти у него нет. Код и данные он читает по внешней шине адреса и данных, поэтому рядом обязательно нужна микросхема памяти.',
    pins: cpuBusPins(),
    props: [
      { key: 'freq', label: 'Тактовая частота', unit: 'Гц', def: 500, min: 1, max: 20000 },
      { key: 'clkSrc', label: 'Тактирование', type: 'select', def: 'internal',
        options: [{ v: 'internal', t: 'встроенный' }, { v: 'external', t: 'с вывода CLK' }] },
      { key: 'Rout', label: 'Сопр. выходов', unit: 'Ω', def: 50, min: 1 }
    ],
    init: function (c) { c.state = { m: EC.cpu.createBus(), clkHigh: false, acc: 0 }; },
    stamp: function (c, ctx) {
      var m = ctx.mna, st = c.state, mach = st.m, n = c.n, i;
      var VCC = n[CPUB.VCC], GND = n[CPUB.GND];
      var r = Math.max(c.props.Rout, 1);
      m.conductance(VCC, GND, 1 / 5000);       // потребление ядра
      m.conductance(n[CPUB.RST], VCC, 1 / 100000);
      m.conductance(n[CPUB.CLK], GND, 1 / PULL);
      if (!c.powered) {
        for (i = 0; i < 8; i++) m.conductance(n[CPUB.D + i], GND, 1 / PULL);
        return;
      }
      // адрес и управление процессор держит в течение всего такта
      for (i = 0; i < 8; i++) {
        driveBit(ctx, n[CPUB.A + i], (mach.addr >> i) & 1, VCC, GND, r);
      }
      driveBit(ctx, n[CPUB.RD], mach.rd, VCC, GND, r);
      driveBit(ctx, n[CPUB.WR], mach.wr, VCC, GND, r);
      driveBit(ctx, n[CPUB.SYNC], !mach.fetch, VCC, GND, r);
      driveBit(ctx, n[CPUB.HLT], !mach.halted, VCC, GND, r);
      // шина данных: процессор держит её только на записи
      for (i = 0; i < 8; i++) {
        var d = n[CPUB.D + i];
        if (mach.driveData) driveBit(ctx, d, (mach.dataOut >> i) & 1, VCC, GND, r);
        else m.conductance(d, GND, 1 / PULL);
      }
      for (i = 0; i < 4; i++) {
        var p = n[CPUB.P + i];
        if ((mach.ddr >> i) & 1) driveBit(ctx, p, (mach.port >> i) & 1, VCC, GND, r);
        else m.conductance(p, GND, 1 / PULL);
      }
    },
    post: function (c, ctx) {
      var st = c.state, mach = st.m, n = c.n;
      var vg = ctx.nv(n[CPUB.GND]);
      var vcc = ctx.nv(n[CPUB.VCC]) - vg;
      c.vcc = vcc;
      c.powered = vcc > 2;
      if (!c.powered) {
        EC.cpu.resetBus(mach);
        c.inReset = false;
        c.pinI = null;
        c.v = 0; c.i = 0;
        return;
      }
      c.inReset = (ctx.nv(n[CPUB.RST]) - vg) < vcc * 0.3;
      if (c.inReset) EC.cpu.resetBus(mach);

      mach.pins = readBus(ctx, n, CPUB.P, 4, vg, vcc);
      var data = mach.driveData ? mach.dataOut : readBus(ctx, n, CPUB.D, 8, vg, vcc);

      if (!c.inReset) {
        if (c.props.clkSrc === 'external') {
          var high = readBit(ctx, n[CPUB.CLK], vg, vcc);
          if (high && !st.clkHigh) EC.cpu.busTick(mach, data);
          st.clkHigh = high;
        } else {
          st.acc += Math.max(c.props.freq, 1) * ctx.dt;
          var steps = Math.floor(st.acc);
          if (steps > 200) steps = 200;
          st.acc -= steps;
          // за один шаг расчёта возможен лишь один обмен: данные на шине
          // успевают установиться только к следующему шагу
          if (steps > 0) EC.cpu.busTick(mach, data);
        }
      }
      c.v = vcc;
      c.i = vcc / 5000;
      c.level = mach.halted ? 'стоп' : (mach.rd ? 'зап' : 'чт');
      c.pinI = null;                           // ток шины считается по проводам
    },
    draw: function (g, c) {
      drawBigChip(g, c, 6, 'EC-8B', CPUB_PINS, function () {
        return cpuBusFace(c);
      });
    }
  });

  /** Строки на лицевой части процессора. */
  function cpuBusFace(c) {
    var st = c.state, m = st && st.m;
    if (!m) return [];
    return [
      { t: 'EC-8B', y: -GRID * 2.6, size: 10, color: 'rgba(232,240,248,.85)' },
      { t: c.inReset ? 'СБРОС' : (m.halted ? 'СТОП' : 'A ' + EC.cpu.hex(m.addr)),
        y: -GRID * 0.8, size: 7,
        color: c.inReset ? 'rgba(255,170,120,.9)' : 'rgba(125,255,208,.8)' },
      { t: 'PC ' + EC.cpu.hex(m.pc), y: GRID * 0.6, size: 7, color: 'rgba(180,200,220,.7)' },
      { t: m.halted ? '' : (m.rd ? 'ЗАПИСЬ' : 'ЧТЕНИЕ'), y: GRID * 2, size: 6.5,
        color: 'rgba(160,185,210,.65)' }
    ];
  }
  EC.cpuBusFace = cpuBusFace;

  /* ------------------------------------------------------------------ */
  /*  Микросхема памяти 2К × 8 в корпусе DIP-24                          */
  /* ------------------------------------------------------------------ */

  /* Расположение выводов повторяет статическое ОЗУ вроде 6116: одиннадцать
     адресных входов, восемь линий данных и три сигнала управления. */
  var MEM = { VCC: 0, GND: 1, CS: 2, CE2: 3, A: 4, OE: 14, WE: 15, D: 16 };
  var MEM_BITS = 10;
  var MEM_BYTES = 1 << MEM_BITS;               // 1024 байта

  var MEM_LEFT = ['Vcc', 'GND', '/ВЫБ', 'ВЫБ2',
    'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];
  var MEM_RIGHT = ['A8', 'A9', '/ЧТ', '/ЗП',
    'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];

  var MEM_PINS = [];
  MEM_LEFT.forEach(function (t, i) { MEM_PINS.push({ i: i, t: t, n: i + 1 }); });
  MEM_RIGHT.forEach(function (t, i) { MEM_PINS.push({ i: 12 + i, t: t, n: 13 + i }); });
  EC.MEM_PINS = MEM_PINS;

  function memPins() {
    var pins = [], i;
    for (i = 0; i < 12; i++) {
      pins.push({ x: -6, y: -11 + i * 2, name: (i + 1) + ' ' + MEM_LEFT[i] });
    }
    for (i = 0; i < 12; i++) {
      pins.push({ x: 6, y: 11 - i * 2, name: (13 + i) + ' ' + MEM_RIGHT[i] });
    }
    return pins;
  }

  var MEM_DEFAULT = [
    '; Содержимое памяти для процессора EC-8B.',
    '; Мигает светодиодом на линии P0.',
    '',
    '        LDI 0b1111      ; все четыре линии порта',
    '        DIR             ; настроить как выходы',
    '',
    'цикл:   LDI 1           ; P0 = 1',
    '        OUT',
    '        CALL пауза',
    '        LDI 0           ; P0 = 0',
    '        OUT',
    '        CALL пауза',
    '        JMP цикл',
    '',
    'пауза:  LDI 40          ; счётчик лежит в ячейке 0x80',
    '        ST 0x80',
    'вн:     LD 0x80',
    '        DEC',
    '        ST 0x80',
    '        JNZ вн',
    '        RET'
  ].join('\n');

  /** Пересобирает содержимое памяти, если текст изменился. */
  function syncMemory(c) {
    if (c._text === c.props.content && c.state.asm) return;
    c._text = c.props.content;
    var res = EC.cpu.assemble(c.props.content);
    c.state.asm = res;
    c.state.bytes = new Uint8Array(MEM_BYTES);
    if (res.ok) c.state.bytes.set(res.code, 0);
    c.asmError = res.ok ? null : res.errors[0];
  }

  define({
    key: 'memory', name: 'Память 1К×8', cat: 'logic',
    tip: 'Статическое ОЗУ на 1024 байта: слева шина адреса и выбор микросхемы, справа сигналы обмена и шина данных. Работает, когда /ВЫБ прижат к общему проводу, а ВЫБ2 — к питанию. Процессор EC-8B адресует только первые 256 байт, поэтому входы A8 и A9 сажают на общий провод.',
    pins: memPins(),
    props: [
      { key: 'content', label: 'Содержимое', type: 'code', def: MEM_DEFAULT },
      { key: 'readOnly', label: 'Только чтение (ПЗУ)', type: 'bool', def: false },
      { key: 'Rout', label: 'Сопр. выходов', unit: 'Ω', def: 50, min: 1 }
    ],
    init: function (c) {
      c.state = { asm: null, bytes: null, out: 0, driving: false };
      c._text = null;
      syncMemory(c);
    },
    stamp: function (c, ctx) {
      var m = ctx.mna, n = c.n, st = c.state, i;
      var VCC = n[MEM.VCC], GND = n[MEM.GND];
      m.conductance(VCC, GND, 1 / 20000);      // потребление микросхемы
      // управляющие входы подтянуты к питанию: неподключённый вывод пассивен
      m.conductance(n[MEM.CS], VCC, 1 / PULL);
      m.conductance(n[MEM.OE], VCC, 1 / PULL);
      m.conductance(n[MEM.WE], VCC, 1 / PULL);
      m.conductance(n[MEM.CE2], VCC, 1 / PULL);
      for (i = 0; i < MEM_BITS; i++) m.conductance(n[MEM.A + i], GND, 1 / PULL);
      var r = Math.max(c.props.Rout, 1);
      for (i = 0; i < 8; i++) {
        var d = n[MEM.D + i];
        if (c.powered && st.driving) driveBit(ctx, d, (st.out >> i) & 1, VCC, GND, r);
        else m.conductance(d, GND, 1 / PULL);
      }
    },
    post: function (c, ctx) {
      syncMemory(c);
      var n = c.n, st = c.state, i;
      var vg = ctx.nv(n[MEM.GND]);
      var vcc = ctx.nv(n[MEM.VCC]) - vg;
      c.vcc = vcc;
      c.powered = vcc > 2;
      if (!c.powered) { st.driving = false; c.pinI = null; c.v = 0; c.i = 0; return; }

      var addr = 0;
      for (i = 0; i < MEM_BITS; i++) {
        if (readBit(ctx, n[MEM.A + i], vg, vcc)) addr |= (1 << i);
      }
      var cs = readBit(ctx, n[MEM.CS], vg, vcc) || !readBit(ctx, n[MEM.CE2], vg, vcc);
      var oe = readBit(ctx, n[MEM.OE], vg, vcc);
      var we = readBit(ctx, n[MEM.WE], vg, vcc);
      c.addr = addr;
      c.selected = !cs;

      if (!cs && !we && !c.props.readOnly) {    // запись идёт уровнем
        st.bytes[addr] = readBus(ctx, n, MEM.D, 8, vg, vcc);
        c.mode = 'запись';
      } else if (!cs && !oe) {
        c.mode = 'чтение';
      } else {
        c.mode = '—';
      }
      st.driving = !cs && !oe && we;
      st.out = st.bytes[addr];
      c.v = vcc;
      c.i = vcc / 20000;
      c.byte = st.out;
      c.warn = (st.asm && !st.asm.ok)
        ? 'Ошибка в содержимом, строка ' + st.asm.errors[0].line + ': ' + st.asm.errors[0].msg
        : null;
      c.pinI = null;
    },
    draw: function (g, c) {
      drawBigChip(g, c, 6, 'ОЗУ', MEM_PINS, function () { return memFace(c); });
    }
  });

  /** Строки на лицевой части микросхемы памяти. */
  function memFace(c) {
    return [
      { t: c.props.readOnly ? 'ПЗУ 1К×8' : 'ОЗУ 1К×8', y: -GRID * 1.8, size: 9,
        color: 'rgba(232,240,248,.85)' },
      { t: c.powered ? 'A ' + EC.cpu.hex(c.addr || 0) : '—', y: -GRID * 0.2, size: 7,
        color: c.selected ? 'rgba(125,255,208,.8)' : 'rgba(150,170,190,.6)' },
      { t: c.powered ? 'D ' + EC.cpu.hex(c.byte || 0) + '  ' + (c.mode || '') : '',
        y: GRID * 1.2, size: 7, color: 'rgba(180,200,220,.7)' }
    ];
  }
  EC.memFace = memFace;
  EC.MEM_BYTES = MEM_BYTES;

  /* ------------------------------------------------------------------ */
  /*  Отрисовка крупной микросхемы                                       */
  /* ------------------------------------------------------------------ */

  /** Корпус с двумя рядами выводов, подписями и строками на лицевой части. */
  function drawBigChip(g, c, half, title, labels, linesFn) {
    var def = c.def();
    var w = (half * 2 - 1.4) * GRID;
    var top = -1e9, bottom = 1e9;
    def.pins.forEach(function (p) {
      top = Math.max(top, p.y); bottom = Math.min(bottom, p.y);
    });
    var h = (top - bottom + 2) * GRID;
    var cy = (top + bottom) / 2 * GRID;
    def.pins.forEach(function (p) {
      lead(g, p.x * GRID, p.y * GRID, (p.x > 0 ? 1 : -1) * w / 2, p.y * GRID);
    });
    g.fillStyle = 'rgba(34,40,50,.96)';
    roundRect(g, -w / 2, cy - h / 2, w, h, 3); g.fill();
    g.strokeStyle = c.powered ? 'rgba(125,255,208,.7)' : 'rgba(170,190,210,.6)';
    g.lineWidth = 1.3;
    roundRect(g, -w / 2, cy - h / 2, w, h, 3); g.stroke();
    // ключ и точка первого вывода
    g.fillStyle = 'rgba(8,10,13,.9)';
    g.beginPath(); g.arc(0, cy - h / 2, w * 0.07, 0, Math.PI); g.fill();
    g.fillStyle = 'rgba(190,200,212,.55)';
    g.beginPath(); g.arc(-w * 0.38, cy - h / 2 + 7, 1.9, 0, 7); g.fill();
    gfx.chipPins(g, c, labels, w, 5.4);
    g.save();
    g.rotate(-(c.rot || 0) * Math.PI / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    linesFn().forEach(function (ln) {
      if (!ln.t) return;
      g.font = '700 ' + ln.size + 'px ui-monospace, Menlo, monospace';
      g.fillStyle = ln.color;
      g.fillText(ln.t, 0, cy + ln.y);
    });
    g.restore();
    label(g, c, [c.name || title], cy + h / 2 + GRID * 0.9);
  }
  EC.drawBigChip = drawBigChip;
})(window);
