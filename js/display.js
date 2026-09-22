/* ElectroCore — индикаторы и микросхемы, которые ими управляют.
 *
 * Семисегментный индикатор нарисован сегментами-многоугольниками, каждый
 * сегмент — настоящий светодиод со своей вольт-амперной характеристикой.
 * Яркость считается не мгновенным током, а сглаженным: так динамическая
 * индикация (когда разряды зажигаются по очереди) выглядит на экране
 * ровно так же, как её видит глаз.
 */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util;
  var GRID = EC.GRID, define = EC.define;
  var gfx = EC.gfx, roundRect = gfx.roundRect, lead = gfx.lead, label = gfx.label;
  var J = EC.junction;

  var PULL = 1e6;                              // сопротивление «отпущенного» вывода
  var GLOW_TAU = 0.025;                        // постоянная сглаживания яркости, с
  /* Сегмент кажется полностью зажжённым уже при трети номинального тока:
     при динамической индикации он горит короткими вспышками, и глаз
     усредняет их в ровное свечение. */
  var GLOW_FULL = 0.3;

  /* ------------------------------------------------------------------ */
  /*  Начертание цифр                                                    */
  /* ------------------------------------------------------------------ */

  /* Биты сегментов: a=1, b=2, c=4, d=8, e=16, f=32, g=64, точка=128.
     Та же таблица, что зашита в дешифратор MAX7219 (код B). */
  var GLYPH = [
    0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F,
    0x40,   // «-»
    0x79,   // E
    0x76,   // H
    0x38,   // L
    0x73,   // P
    0x00    // пусто
  ];
  EC.segGlyph = GLYPH;

  var SEG_ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
  EC.SEG_ORDER = SEG_ORDER;

  /**
   * Многоугольник одного сегмента в системе, где цифра занимает
   * прямоугольник шириной w и высотой h с началом в левом верхнем углу.
   */
  function segPath(g, name, w, h, t) {
    var gap = t * 0.18;
    var x0 = 0, x1 = w, ym = h / 2;
    function horiz(y) {
      g.moveTo(x0 + t / 2 + gap, y);
      g.lineTo(x0 + t + gap, y - t / 2);
      g.lineTo(x1 - t - gap, y - t / 2);
      g.lineTo(x1 - t / 2 - gap, y);
      g.lineTo(x1 - t - gap, y + t / 2);
      g.lineTo(x0 + t + gap, y + t / 2);
    }
    function vert(x, ya, yb) {
      g.moveTo(x, ya + t / 2 + gap);
      g.lineTo(x + t / 2, ya + t + gap);
      g.lineTo(x + t / 2, yb - t - gap);
      g.lineTo(x, yb - t / 2 - gap);
      g.lineTo(x - t / 2, yb - t - gap);
      g.lineTo(x - t / 2, ya + t + gap);
    }
    g.beginPath();
    if (name === 'a') horiz(0);
    else if (name === 'g') horiz(ym);
    else if (name === 'd') horiz(h);
    else if (name === 'f') vert(x0, 0, ym);
    else if (name === 'b') vert(x1, 0, ym);
    else if (name === 'e') vert(x0, ym, h);
    else if (name === 'c') vert(x1, ym, h);
    else if (name === 'dp') { g.arc(w + t * 1.1, h - t * 0.4, t * 0.45, 0, 7); }
    g.closePath();
  }

  /**
   * Рисует одну цифру: восемь сегментов с собственной яркостью.
   * lit[k] — от 0 (погашен) до ~1 (полный ток).
   */
  function drawDigit(g, x, y, w, h, lit, rgb, slant) {
    var t = h * 0.13;
    g.save();
    g.translate(x, y);
    g.transform(1, 0, -(slant === undefined ? 0.08 : slant), 1, 0, 0);
    for (var k = 0; k < SEG_ORDER.length; k++) {
      var v = U.clamp(lit[k] || 0, 0, 1.3);
      segPath(g, SEG_ORDER[k], w, h, t);
      if (v > 0.02) {
        g.fillStyle = 'rgba(' + rgb + ',' + (0.35 + 0.6 * Math.min(v, 1)) + ')';
        g.fill();
        g.shadowColor = 'rgba(' + rgb + ',' + (0.55 * Math.min(v, 1)) + ')';
        g.shadowBlur = h * 0.18;
        g.fill();
        g.shadowBlur = 0;
      } else {
        g.fillStyle = 'rgba(28,32,38,.85)';    // погашенный сегмент едва виден
        g.fill();
      }
    }
    g.restore();
  }
  EC.drawDigit = drawDigit;

  /* Настоящий индикатор 0,56": цифра 7,5 × 14,2 мм, шаг разрядов 12,7 мм.
     В клетках (1 клетка = 1,27 мм) это 5,9 × 11,2 с шагом 10. */
  var DIG_W = 5.6, DIG_H = 9.6, DIG_STEP = 9.4;

  /** Цвет свечения по названию. */
  var GLOW_COLORS = {
    red: '255,72,58', green: '86,255,140', blue: '96,170,255',
    yellow: '255,208,64', white: '235,245,255'
  };
  var COLOR_OPTIONS = [
    { v: 'red', t: 'красный' }, { v: 'green', t: 'зелёный' },
    { v: 'blue', t: 'синий' }, { v: 'yellow', t: 'жёлтый' },
    { v: 'white', t: 'белый' }
  ];
  function glowRGB(c) { return GLOW_COLORS[c.props.color] || GLOW_COLORS.red; }

  /** Корпус индикатора: чёрная рамка с матовым окном. */
  function displayBody(g, c, w, h) {
    var def = c.def();
    def.pins.forEach(function (p) {
      lead(g, p.x * GRID, p.y * GRID, p.x * GRID, (p.y > 0 ? h / 2 / GRID : -h / 2 / GRID) * GRID);
    });
    g.fillStyle = 'rgba(16,18,22,.97)';
    roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
    g.strokeStyle = 'rgba(120,135,152,.5)';
    g.lineWidth = 1.2;
    roundRect(g, -w / 2, -h / 2, w, h, 3); g.stroke();
    // матовое окно
    g.fillStyle = 'rgba(8,9,12,.9)';
    roundRect(g, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.045)';
    roundRect(g, -w / 2 + 3, -h / 2 + 3, w - 6, (h - 6) * 0.22, 2); g.fill();
  }

  /* ------------------------------------------------------------------ */
  /*  Общая часть модели индикатора                                      */
  /* ------------------------------------------------------------------ */

  /** Параметры перехода одного сегмента. */
  function segOpts(c) {
    // ток 20 мА при заданном прямом падении
    var nf = 2.2;
    var vt = 0.02585 * nf;
    return { is: Math.max(c.props.If, 1e-4) / Math.exp(c.props.Vf / vt), nf: nf, vz: 0 };
  }

  /**
   * Штампует один сегмент между выводом сегмента и общим выводом разряда.
   * У индикатора с общим катодом ток течёт от сегмента к общему.
   */
  function stampSeg(c, ctx, segNode, comNode, key) {
    var anode = c.props.common === 'anode' ? comNode : segNode;
    var cathode = c.props.common === 'anode' ? segNode : comNode;
    J.stamp(ctx, c, anode, cathode, segOpts(c), key);
  }

  /** Ток одного сегмента, всегда неотрицательный. */
  function segCurrent(c, ctx, segNode, comNode) {
    var anode = c.props.common === 'anode' ? comNode : segNode;
    var cathode = c.props.common === 'anode' ? segNode : comNode;
    var vd = ctx.nv(anode) - ctx.nv(cathode);
    return Math.max(J.eval(ctx, vd, segOpts(c)).i, 0);
  }

  /** Сглаживание яркости: глаз усредняет мигание динамической индикации. */
  function smooth(prev, target, dt) {
    var a = 1 - Math.exp(-dt / GLOW_TAU);
    return prev + (target - prev) * a;
  }

  var COMMON_OPTIONS = [
    { v: 'cathode', t: 'общий катод' },
    { v: 'anode', t: 'общий анод' }
  ];

  /* ------------------------------------------------------------------ */
  /*  Одиночный семисегментный индикатор                                 */
  /* ------------------------------------------------------------------ */

  /* Выводы как у обычного индикатора 0,56": пять снизу, пять сверху. */
  var S1_BOTTOM = ['1 E', '2 D', '3 ОБЩ', '4 C', '5 DP'];
  var S1_TOP = ['10 G', '9 F', '8 ОБЩ', '7 A', '6 B'];
  var S1_SEG = { a: 8, b: 9, c: 3, d: 1, e: 0, f: 6, g: 5, dp: 4 };
  var S1_COM = [2, 7];

  function seg7Pins() {
    var pins = [], i;
    for (i = 0; i < 5; i++) pins.push({ x: -4 + i * 2, y: 7, name: S1_BOTTOM[i] });
    for (i = 0; i < 5; i++) pins.push({ x: -4 + i * 2, y: -7, name: S1_TOP[i] });
    return pins;
  }

  define({
    key: 'seg7', name: 'Индикатор 7 сегментов', cat: 'display', catName: 'Индикация',
    tip: 'Одна цифра из восьми светодиодов. Общий вывод сажают на землю (общий катод) или на питание (общий анод), каждый сегмент — через свой резистор.',
    pins: seg7Pins(),
    box: { w: 10, h: 12 },
    props: [
      { key: 'common', label: 'Схема', type: 'select', options: COMMON_OPTIONS, def: 'cathode' },
      { key: 'color', label: 'Цвет', type: 'select', options: COLOR_OPTIONS, def: 'red' },
      { key: 'Vf', label: 'Прямое падение', unit: 'В', def: 1.9, min: 0.3 },
      { key: 'If', label: 'Номин. ток сегмента', unit: 'А', def: 0.02, min: 1e-5 }
    ],
    nonlinear: true,
    init: function (c) { c.state = { lit: [0, 0, 0, 0, 0, 0, 0, 0], iavg: 0 }; },
    stamp: function (c, ctx) {
      var n = c.n;
      ctx.mna.conductance(n[S1_COM[0]], n[S1_COM[1]], 1 / 0.002);   // общие выводы соединены внутри
      for (var k = 0; k < 8; k++) {
        stampSeg(c, ctx, n[S1_SEG[SEG_ORDER[k]]], n[S1_COM[0]], '_v' + k);
      }
    },
    post: function (c, ctx) {
      var n = c.n, st = c.state, total = 0;
      for (var k = 0; k < 8; k++) {
        var i = segCurrent(c, ctx, n[S1_SEG[SEG_ORDER[k]]], n[S1_COM[0]]);
        total += i;
        st.lit[k] = smooth(st.lit[k], i / (Math.max(c.props.If, 1e-6) * GLOW_FULL), ctx.dt);
      }
      st.iavg = smooth(st.iavg, total, ctx.dt);
      c.i = st.iavg;                           // при динамической индикации важен средний ток
      c.v = ctx.nv(n[S1_SEG.a]) - ctx.nv(n[S1_COM[0]]);
      c.level = digitText(st.lit);
      c.warn = total > c.props.If * 10 ? 'Ток сегментов выше допустимого' : null;
    },
    draw: function (g, c) {
      var w = 10 * GRID, h = 12 * GRID;
      displayBody(g, c, w, h);
      var dw = DIG_W * GRID, dh = DIG_H * GRID;
      drawDigit(g, -dw * 0.68, -dh / 2, dw, dh, (c.state && c.state.lit) || [], glowRGB(c));
      label(g, c, [c.name || ''], h / 2 + GRID * 0.9);
    }
  });

  /** Какую цифру показывают зажжённые сегменты — для подписи и проверок. */
  function digitText(lit) {
    var mask = 0;
    for (var k = 0; k < 8; k++) if (lit[k] > 0.25) mask |= (1 << k);
    var idx = GLYPH.indexOf(mask & 0x7F);
    var body = idx < 0 ? '?' : (idx < 10 ? String(idx) : ['-', 'E', 'H', 'L', 'P', ' '][idx - 10]);
    return body + ((mask & 0x80) ? '.' : '');
  }
  EC.digitText = digitText;

  /* ------------------------------------------------------------------ */
  /*  Четырёхразрядный индикатор с общими выводами разрядов              */
  /* ------------------------------------------------------------------ */

  /* Выводы как у модуля 3641AS: шесть снизу, шесть сверху. */
  var S4_BOTTOM = ['1 E', '2 D', '3 DP', '4 C', '5 G', '6 Р4'];
  var S4_TOP = ['12 Р1', '11 A', '10 F', '9 Р2', '8 Р3', '7 B'];
  var S4_SEG = { a: 7, b: 11, c: 3, d: 1, e: 0, f: 8, g: 4, dp: 2 };
  var S4_DIG = [6, 9, 10, 5];                  // разряды слева направо

  function seg7x4Pins() {
    var pins = [], i;
    for (i = 0; i < 6; i++) pins.push({ x: -5 + i * 2, y: 7, name: S4_BOTTOM[i] });
    for (i = 0; i < 6; i++) pins.push({ x: -5 + i * 2, y: -7, name: S4_TOP[i] });
    return pins;
  }

  define({
    key: 'seg7x4', name: 'Индикатор 4 разряда', cat: 'display',
    tip: 'Четыре цифры в одном корпусе. Сегменты у всех разрядов общие, разряды зажигаются по очереди своими выводами Р1…Р4 — это называется динамической индикацией. Проще всего управлять им через MAX7219.',
    pins: seg7x4Pins(),
    box: { w: 38, h: 12 },
    props: [
      { key: 'common', label: 'Схема', type: 'select', options: COMMON_OPTIONS, def: 'cathode' },
      { key: 'color', label: 'Цвет', type: 'select', options: COLOR_OPTIONS, def: 'red' },
      { key: 'Vf', label: 'Прямое падение', unit: 'В', def: 1.9, min: 0.3 },
      { key: 'If', label: 'Номин. ток сегмента', unit: 'А', def: 0.02, min: 1e-5 }
    ],
    nonlinear: true,
    init: function (c) {
      c.state = { lit: [], iavg: 0 };
      for (var d = 0; d < 4; d++) c.state.lit.push([0, 0, 0, 0, 0, 0, 0, 0]);
    },
    stamp: function (c, ctx) {
      var n = c.n;
      for (var d = 0; d < 4; d++) {
        for (var k = 0; k < 8; k++) {
          stampSeg(c, ctx, n[S4_SEG[SEG_ORDER[k]]], n[S4_DIG[d]], '_v' + d + '_' + k);
        }
      }
    },
    post: function (c, ctx) {
      var n = c.n, st = c.state, total = 0;
      for (var d = 0; d < 4; d++) {
        for (var k = 0; k < 8; k++) {
          var i = segCurrent(c, ctx, n[S4_SEG[SEG_ORDER[k]]], n[S4_DIG[d]]);
          total += i;
          st.lit[d][k] = smooth(st.lit[d][k],
            i / (Math.max(c.props.If, 1e-6) * GLOW_FULL), ctx.dt);
        }
      }
      st.iavg = smooth(st.iavg, total, ctx.dt);
      c.i = st.iavg;                           // разряды горят по очереди — усредняем
      c.v = 0;
      c.level = st.lit.map(digitText).join('');
      c.warn = null;
    },
    draw: function (g, c) {
      var w = 38 * GRID, h = 12 * GRID;
      displayBody(g, c, w, h);
      var dw = DIG_W * GRID, dh = DIG_H * GRID, step = DIG_STEP * GRID;
      var x0 = -(3 * DIG_STEP + DIG_W + 1.6) / 2 * GRID;
      for (var d = 0; d < 4; d++) {
        var x = x0 + d * step;
        drawDigit(g, x, -dh / 2, dw, dh, (c.state && c.state.lit[d]) || [], glowRGB(c));
      }
      label(g, c, [c.name || ''], h / 2 + GRID * 0.9);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Вспомогательное: логика на выводах                                 */
  /* ------------------------------------------------------------------ */

  function readBit(ctx, pin, vg, vcc) { return (ctx.nv(pin) - vg) > vcc * 0.5; }

  function driveBit(ctx, pin, high, VCC, GND, r) {
    ctx.mna.conductance(pin, high ? VCC : GND, 1 / r);
    ctx.mna.conductance(pin, high ? GND : VCC, 1e-11);
  }

  /* ------------------------------------------------------------------ */
  /*  Сдвиговый регистр 74HC595                                          */
  /* ------------------------------------------------------------------ */

  /* Нумерация настоящая: слева сверху вниз 1…8, справа снизу вверх 9…16. */
  var SR = {
    Q: 0,            // Q1…Q7 — ножки 1…7 (в даташите QB…QH)
    GND: 7, Q7S: 8, SRCLR: 9, SRCLK: 10, RCLK: 11, OE: 12, SER: 13, Q0: 14, VCC: 15
  };
  var SR_LEFT = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'GND'];
  var SR_RIGHT = ['Q7*', '/СБР', 'СДВ', 'ЗАЩ', '/РАЗР', 'ДАН', 'Q0', 'Vcc'];

  var SR_PINS = [];
  SR_LEFT.forEach(function (t, i) { SR_PINS.push({ i: i, t: t, n: i + 1 }); });
  SR_RIGHT.forEach(function (t, i) { SR_PINS.push({ i: 8 + i, t: t, n: 9 + i }); });

  function srPins() {
    var pins = [], i;
    for (i = 0; i < 8; i++) pins.push({ x: -3, y: -7 + i * 2, name: (i + 1) + ' ' + SR_LEFT[i] });
    for (i = 0; i < 8; i++) pins.push({ x: 3, y: 7 - i * 2, name: (9 + i) + ' ' + SR_RIGHT[i] });
    return pins;
  }

  define({
    key: 'sr595', name: 'Сдвиговый регистр 74HC595', cat: 'logic',
    tip: 'Три провода вместо восьми: биты вдвигаются по одному выводом ДАН тактами СДВ, а по фронту ЗАЩ разом выходят на Q0…Q7. Вывод Q7* отдаёт вытесненный бит — к нему цепляют следующий такой же регистр.',
    pins: srPins(),
    props: [
      { key: 'Rout', label: 'Сопр. выходов', unit: 'Ω', def: 40, min: 1 }
    ],
    init: function (c) { c.state = { sr: 0, out: 0, clk: false, latch: false }; },
    stamp: function (c, ctx) {
      var m = ctx.mna, n = c.n, st = c.state, i;
      var VCC = n[SR.VCC], GND = n[SR.GND];
      m.conductance(VCC, GND, 1 / 50000);      // собственное потребление
      // входы подтянуты слабо: /СБР и /РАЗР к питанию, остальные к земле
      m.conductance(n[SR.SRCLR], VCC, 1 / PULL);
      m.conductance(n[SR.OE], GND, 1 / PULL);
      m.conductance(n[SR.SER], GND, 1 / PULL);
      m.conductance(n[SR.SRCLK], GND, 1 / PULL);
      m.conductance(n[SR.RCLK], GND, 1 / PULL);
      var r = Math.max(c.props.Rout, 1);
      if (!c.powered) {
        for (i = 0; i < 8; i++) m.conductance(n[i === 0 ? SR.Q0 : SR.Q + i - 1], GND, 1 / PULL);
        m.conductance(n[SR.Q7S], GND, 1 / PULL);
        return;
      }
      for (i = 0; i < 8; i++) {
        var pin = i === 0 ? n[SR.Q0] : n[SR.Q + i - 1];
        if (c.enabled) driveBit(ctx, pin, (st.out >> i) & 1, VCC, GND, r);
        else m.conductance(pin, GND, 1 / PULL);   // /РАЗР снят — выходы отключены
      }
      driveBit(ctx, n[SR.Q7S], (st.sr >> 7) & 1, VCC, GND, r);
    },
    post: function (c, ctx) {
      var n = c.n, st = c.state;
      var vg = ctx.nv(n[SR.GND]);
      var vcc = ctx.nv(n[SR.VCC]) - vg;
      c.vcc = vcc;
      c.powered = vcc > 2;
      if (!c.powered) { st.sr = 0; st.out = 0; c.enabled = false; c.v = 0; c.i = 0; return; }
      c.enabled = !readBit(ctx, n[SR.OE], vg, vcc);
      if (!readBit(ctx, n[SR.SRCLR], vg, vcc)) st.sr = 0;

      var clk = readBit(ctx, n[SR.SRCLK], vg, vcc);
      if (clk && !st.clk) {                    // фронт такта — вдвигаем бит
        st.sr = ((st.sr << 1) | (readBit(ctx, n[SR.SER], vg, vcc) ? 1 : 0)) & 0xFF;
      }
      st.clk = clk;

      var lat = readBit(ctx, n[SR.RCLK], vg, vcc);
      if (lat && !st.latch) st.out = st.sr;    // фронт защёлки — выводим наружу
      st.latch = lat;

      c.v = vcc;
      c.i = vcc / 50000;
      c.byte = st.out;
      c.level = EC.cpu.hex(st.out);
      c.pinI = null;
    },
    draw: function (g, c) {
      EC.drawBigChip(g, c, 3, '595', SR_PINS, function () { return srFace(c); });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Драйвер индикаторов MAX7219                                        */
  /* ------------------------------------------------------------------ */

  /* Настоящая цоколёвка DIP-24. */
  var MX = {
    DIN: 0, LOAD: 11, CLK: 12, ISET: 15, DOUT: 22, VCC: 23,
    GND: [3, 8],
    DIG: [1, 10, 5, 6, 2, 9, 4, 7],            // Р0…Р7 → индексы выводов
    SEG: { a: 13, b: 21, c: 19, d: 16, e: 18, f: 14, g: 20, dp: 17 }
  };
  var MX_LEFT = ['ДАН', 'Р0', 'Р4', 'GND', 'Р6', 'Р2', 'Р3', 'Р7', 'GND', 'Р5', 'Р1', 'ЗАГР'];
  var MX_RIGHT = ['ТАКТ', 'СЕГ A', 'СЕГ F', 'ISET', 'СЕГ D', 'СЕГ DP',
    'СЕГ E', 'СЕГ C', 'СЕГ G', 'СЕГ B', 'ВЫХ', 'V+'];

  var MX_PINS = [];
  MX_LEFT.forEach(function (t, i) { MX_PINS.push({ i: i, t: t, n: i + 1 }); });
  MX_RIGHT.forEach(function (t, i) { MX_PINS.push({ i: 12 + i, t: t, n: 13 + i }); });

  function maxPins() {
    var pins = [], i;
    for (i = 0; i < 12; i++) pins.push({ x: -6, y: -11 + i * 2, name: (i + 1) + ' ' + MX_LEFT[i] });
    for (i = 0; i < 12; i++) pins.push({ x: 6, y: 11 - i * 2, name: (13 + i) + ' ' + MX_RIGHT[i] });
    return pins;
  }

  var VISET = 1.2;                             // напряжение на выводе ISET
  var GISET = 1 / 50;                          // внутреннее сопротивление этого узла
  /* Ограничитель выходного ключа: не даёт выводу сегмента уйти выше питания,
     когда к нему ничего не подключено. */
  var CLAMP = { is: 1e-9, nf: 1.5, vz: 0 };
  var SCAN_HZ = 200;                           // частота смены кадра индикации

  /** Регистры микросхемы в исходном состоянии: после включения всё погашено. */
  function maxReset(st) {
    st.digits = [0, 0, 0, 0, 0, 0, 0, 0];
    st.decode = 0;
    st.intensity = 7;
    st.scan = 7;
    st.on = false;                             // после подачи питания — режим покоя
    st.test = false;
    st.shift = 0;                              // принимаемые 16 бит
    st.bits = 0;
    st.last = 0;
    st.clk = false;
    st.load = false;
    st.cur = 0;                                // какой разряд горит сейчас
    st.tacc = 0;
  }

  /* Карта битов регистра при выключенном дешифраторе: D7=точка, D6=A … D0=G. */
  var MX_BITMAP = ['g', 'f', 'e', 'd', 'c', 'b', 'a', 'dp'];
  var MX_REMAP = MX_BITMAP.map(function (t) { return SEG_ORDER.indexOf(t); });

  /** Сегменты, которые надо зажечь для разряда d, в нашем порядке a…dp. */
  function maxSegments(st, d) {
    if (st.test) return 0xFF;
    var v = st.digits[d] & 0xFF;
    if ((st.decode >> d) & 1) {                // дешифратор кода B
      return (GLYPH[v & 0x0F] || 0) | (v & 0x80);
    }
    var out = 0;                               // прямая карта: свой порядок битов
    for (var b = 0; b < 8; b++) if (v & (1 << b)) out |= 1 << MX_REMAP[b];
    return out;
  }
  EC.maxSegments = maxSegments;

  define({
    key: 'max7219', name: 'Драйвер MAX7219', cat: 'logic',
    nonlinear: true,
    tip: 'Управляет восемью разрядами по трём проводам: ДАН, ТАКТ и ЗАГР. Сам перебирает разряды, сам держит цифры и сам ограничивает ток — его задаёт резистор от V+ к выводу ISET. Без этого резистора индикатор не загорится.',
    pins: maxPins(),
    props: [
      { key: 'Rout', label: 'Сопр. выхода ВЫХ', unit: 'Ω', def: 50, min: 1 }
    ],
    init: function (c) { c.state = {}; maxReset(c.state); },
    stamp: function (c, ctx) {
      var m = ctx.mna, n = c.n, st = c.state, i;
      var VCC = n[MX.VCC], GND = n[MX.GND[0]];
      m.conductance(GND, n[MX.GND[1]], 1 / 0.002);   // оба общих вывода соединены внутри
      m.conductance(VCC, GND, 1 / 20000);
      m.conductance(n[MX.DIN], GND, 1 / PULL);
      m.conductance(n[MX.CLK], GND, 1 / PULL);
      m.conductance(n[MX.LOAD], GND, 1 / PULL);
      // вывод ISET сидит на 1,2 В: внешний резистор к V+ задаёт опорный ток
      m.conductance(n[MX.ISET], GND, GISET);
      m.current(GND, n[MX.ISET], VISET * GISET);

      if (!c.powered) {
        for (i = 0; i < 8; i++) m.conductance(n[MX.DIG[i]], GND, 1 / PULL);
        for (var k in MX.SEG) m.conductance(n[MX.SEG[k]], GND, 1 / PULL);
        m.conductance(n[MX.DOUT], GND, 1 / PULL);
        return;
      }
      driveBit(ctx, n[MX.DOUT], (st.last >> 15) & 1, VCC, GND, Math.max(c.props.Rout, 1));

      var segs = st.on ? maxSegments(st, st.cur) : 0;
      for (i = 0; i < 8; i++) {
        // разряд притянут к земле, только когда наступила его очередь
        if (st.on && i === st.cur) m.conductance(n[MX.DIG[i]], GND, 1 / 10);
        else m.conductance(n[MX.DIG[i]], GND, 1 / PULL);
      }
      // яркость задана скважностью; для глаза важен средний ток, поэтому
      // ток источника сразу берём усреднённым по этой скважности
      var iseg = (c.iseg || 0) * (st.intensity + 1) / 16;
      for (var s = 0; s < EC.SEG_ORDER.length; s++) {
        var pin = n[MX.SEG[EC.SEG_ORDER[s]]];
        if (segs & (1 << s)) {
          m.current(VCC, pin, iseg);           // выход ведёт себя как источник тока
          // выше питания выход подняться не может: ограничитель на ключе
          J.stamp(ctx, c, pin, VCC, CLAMP, '_c' + s);
        } else {
          m.conductance(pin, GND, 1 / PULL);
        }
      }
    },
    post: function (c, ctx) {
      var n = c.n, st = c.state;
      var vg = ctx.nv(n[MX.GND[0]]);
      var vcc = ctx.nv(n[MX.VCC]) - vg;
      c.vcc = vcc;
      c.powered = vcc > 2;
      if (!c.powered) { maxReset(st); c.iseg = 0; c.v = 0; c.i = 0; return; }

      // опорный ток задаёт внешний резистор, ток сегмента в сто раз больше
      var viset = ctx.nv(n[MX.ISET]) - vg;
      c.iref = Math.max((viset - VISET) * GISET, 0);
      c.iseg = Math.min(c.iref * 100, 0.06);

      var clk = readBit(ctx, n[MX.CLK], vg, vcc);
      if (clk && !st.clk) {                    // фронт такта — принимаем бит, старшим вперёд
        st.shift = ((st.shift << 1) | (readBit(ctx, n[MX.DIN], vg, vcc) ? 1 : 0)) & 0xFFFF;
        st.bits++;
      }
      st.clk = clk;

      var load = readBit(ctx, n[MX.LOAD], vg, vcc);
      if (load && !st.load) {                  // фронт ЗАГР — слово принято
        st.last = st.shift;
        applyWord(st, st.shift);
        st.bits = 0;
      }
      st.load = load;

      // перебор разрядов идёт с постоянной частотой смены кадра: так
      // расчёту не приходится пересобирать решение на каждом шаге
      if (st.on) {
        st.tacc += ctx.dt;
        var dwell = 1 / (SCAN_HZ * (st.scan + 1));
        if (st.tacc >= dwell) {
          st.tacc = st.tacc >= dwell * 2 ? 0 : st.tacc - dwell;
          st.cur = (st.cur + 1) % (st.scan + 1);
        }
      } else {
        st.tacc = 0;
      }

      c.v = vcc;
      c.i = vcc / 20000 + (st.on ? c.iseg * 8 * (st.intensity + 1) / 16 : 0);
      c.level = st.on ? 'разряд ' + st.cur : 'покой';
      c.warn = c.iref <= 1e-6
        ? 'Нет резистора между V+ и ISET — микросхема не даёт тока в сегменты'
        : null;
      c.pinI = null;
    },
    draw: function (g, c) {
      EC.drawBigChip(g, c, 6, 'MAX7219', MX_PINS, function () { return maxFace(c); });
    }
  });

  /** Строки на лицевой части сдвигового регистра. */
  function srFace(c) {
    var st = c.state;
    return [
      { t: '74HC595', y: -GRID * 1.4, size: 7.5, color: 'rgba(232,240,248,.85)' },
      { t: c.powered ? EC.cpu.hex(st.out) : '—', y: GRID * 0.2, size: 8,
        color: c.enabled ? 'rgba(125,255,208,.85)' : 'rgba(150,170,190,.55)' },
      { t: c.powered && !c.enabled ? 'выкл' : '', y: GRID * 1.4, size: 6,
        color: 'rgba(255,170,120,.8)' }
    ];
  }
  EC.srFace = srFace;

  /** Разбирает принятое слово: старший байт — номер регистра, младший — данные. */
  function applyWord(st, word) {
    var reg = (word >> 8) & 0x0F, data = word & 0xFF;
    if (reg >= 0x1 && reg <= 0x8) st.digits[reg - 1] = data;
    else if (reg === 0x9) st.decode = data;
    else if (reg === 0xA) st.intensity = data & 0x0F;
    else if (reg === 0xB) st.scan = data & 0x07;
    else if (reg === 0xC) st.on = (data & 1) !== 0;
    else if (reg === 0xF) st.test = (data & 1) !== 0;
  }
  EC.maxApplyWord = applyWord;

  /** Строки на лицевой части драйвера. */
  function maxFace(c) {
    var st = c.state;
    return [
      { t: 'MAX7219', y: -GRID * 2, size: 9, color: 'rgba(232,240,248,.85)' },
      { t: c.powered ? (st.on ? 'РАБОТА' : 'ПОКОЙ') : '—', y: -GRID * 0.4, size: 7,
        color: st.on ? 'rgba(125,255,208,.8)' : 'rgba(255,170,120,.85)' },
      { t: c.powered ? 'Iсег ' + U.fmtSI(c.iseg || 0, 2) + 'А' : '', y: GRID * 0.8,
        size: 6.5, color: 'rgba(180,200,220,.7)' },
      { t: c.powered ? 'ярк ' + (((st.intensity + 1) * 100 / 16) | 0) + '%' : '',
        y: GRID * 2, size: 6.5, color: 'rgba(160,185,210,.6)' }
    ];
  }
  EC.maxFace = maxFace;

  EC.MX_PINS = MX_PINS;
  EC.SR_PINS = SR_PINS;
  EC.MX = MX;
  EC.SR = SR;
  EC.S4_SEG = S4_SEG;
  EC.S4_DIG = S4_DIG;
  EC.S1_SEG = S1_SEG;
  EC.S1_COM = S1_COM;
  EC.MX_BITMAP = MX_BITMAP;

  EC.sortCategories();
})(window);
