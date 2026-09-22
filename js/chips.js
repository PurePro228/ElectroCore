/* ElectroCore — микросхемы автоматики и то, что к ним цепляют.
 *
 * Здесь всё, что стоит между логикой и нагрузкой: триггер, десятичный
 * счётчик, оптрон, сборка Дарлингтона, кварцевый генератор и светодиодная
 * матрица. Цоколёвки взяты у настоящих корпусов.
 */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util;
  var GRID = EC.GRID, define = EC.define;
  var gfx = EC.gfx, roundRect = gfx.roundRect, lead = gfx.lead, label = gfx.label;
  var J = EC.junction;

  var PULL = 1e6;

  function readBit(ctx, pin, vg, vcc) { return (ctx.nv(pin) - vg) > vcc * 0.5; }

  function driveBit(ctx, pin, high, VCC, GND, r) {
    ctx.mna.conductance(pin, high ? VCC : GND, 1 / r);
    ctx.mna.conductance(pin, high ? GND : VCC, 1e-11);
  }

  /* ================================================================== */
  /*  D-триггер                                                         */
  /* ================================================================== */

  var DFF_PINS = [
    { i: 0, t: 'D' }, { i: 1, t: 'C' }, { i: 2, t: '/СБР' },
    { i: 3, t: 'Q' }, { i: 4, t: '/Q' }
  ];

  define({
    key: 'dff', name: 'D-триггер', cat: 'logic',
    tip: 'Один бит памяти. По фронту на входе C выход Q принимает то, что было на входе D, и держит это до следующего фронта. Низкий уровень на /СБР обнуляет.',
    pins: [
      { x: -3, y: -2, name: 'D' }, { x: -3, y: 0, name: 'C' }, { x: -3, y: 2, name: '/СБР' },
      { x: 3, y: -1, name: 'Q' }, { x: 3, y: 1, name: '/Q' }
    ],
    props: [
      { key: 'Vcc', label: 'Напряжение питания', unit: 'В', def: 5, min: 0.5 },
      { key: 'Rout', label: 'Выходное сопр.', unit: 'Ω', def: 30, min: 0.1 }
    ],
    branches: 2, internals: 2,
    init: function (c) { c.state = { q: false, clk: false }; },
    stamp: function (c, ctx) {
      var m = ctx.mna, n = c.n, st = c.state;
      var vcc = Math.max(c.props.Vcc, 0.5);
      var r = Math.max(c.props.Rout, 0.1);
      for (var i = 0; i < 3; i++) m.conductance(n[i], -1, 1e-6);   // входы почти не грузят
      m.voltageSource(c.ni[0], -1, c.br, st.q ? vcc : 0);
      m.conductance(c.ni[0], n[3], 1 / r);
      m.voltageSource(c.ni[1], -1, c.br + 1, st.q ? 0 : vcc);
      m.conductance(c.ni[1], n[4], 1 / r);
    },
    post: function (c, ctx) {
      var n = c.n, st = c.state;
      var vcc = Math.max(c.props.Vcc, 0.5);
      var hi = vcc * 0.6, lo = vcc * 0.4;
      var cv = ctx.nv(n[1]);
      var clk = cv > hi ? true : (cv < lo ? false : st.clk);
      if (ctx.nv(n[2]) < lo && ctx.nv(n[2]) !== 0) st.q = false;    // сброс активен нулём
      else if (clk && !st.clk) st.q = ctx.nv(n[0]) > vcc * 0.5;     // фронт такта
      st.clk = clk;
      c.v = ctx.nv(n[3]);
      c.i = -ctx.x[c.br];
      c.pinI = null;
      c.level = st.q ? '1' : '0';
    },
    draw: function (g, c) {
      var w = GRID * 3.2, h = GRID * 5;
      c.def().pins.forEach(function (p) {
        lead(g, p.x * GRID, p.y * GRID, (p.x > 0 ? 1 : -1) * w / 2, p.y * GRID);
      });
      var on = c.state && c.state.q;
      g.fillStyle = on ? 'rgba(52,86,74,.95)' : 'rgba(44,54,68,.95)';
      roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
      g.strokeStyle = on ? 'rgba(125,255,208,.8)' : 'rgba(170,190,210,.7)';
      g.lineWidth = 1.3;
      roundRect(g, -w / 2, -h / 2, w, h, 3); g.stroke();
      gfx.chipPins(g, c, DFF_PINS, w, 5.4);
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.fillStyle = '#e6eef6';
      g.font = '700 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('T', 0, -GRID * 0.5);
      g.font = '700 12px ui-monospace, Menlo, monospace';
      g.fillStyle = on ? '#7dffd0' : 'rgba(180,196,212,.7)';
      g.fillText(on ? '1' : '0', 0, GRID * 1);
      g.restore();
      label(g, c, [c.name || ''], h / 2 + GRID * 0.9);
    }
  });

  /* ================================================================== */
  /*  Десятичный счётчик CD4017                                         */
  /* ================================================================== */

  /* Цоколёвка настоящая: слева сверху вниз 1…8, справа снизу вверх 9…16. */
  var CD_LEFT = ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'GND'];
  var CD_RIGHT = ['Q8', 'Q4', 'Q9', '÷10', '/РАЗР', 'ТАКТ', 'СБР', 'Vcc'];
  var CD_Q = [2, 1, 3, 6, 9, 0, 4, 5, 8, 10];    // Q0…Q9 → индексы выводов
  var CD = { GND: 7, CO: 11, EN: 12, CLK: 13, RST: 14, VCC: 15 };

  var CD_PINS = [];
  CD_LEFT.forEach(function (t, i) { CD_PINS.push({ i: i, t: t, n: i + 1 }); });
  CD_RIGHT.forEach(function (t, i) { CD_PINS.push({ i: 8 + i, t: t, n: 9 + i }); });

  function cdPins() {
    var pins = [], i;
    for (i = 0; i < 8; i++) pins.push({ x: -3, y: -7 + i * 2, name: (i + 1) + ' ' + CD_LEFT[i] });
    for (i = 0; i < 8; i++) pins.push({ x: 3, y: 7 - i * 2, name: (9 + i) + ' ' + CD_RIGHT[i] });
    return pins;
  }

  define({
    key: 'cd4017', name: 'Счётчик CD4017', cat: 'logic',
    tip: 'Десять выходов, и высокий уровень по очереди переходит с одного на другой по каждому фронту такта. Классика бегущих огней: тактируют его от таймера 555. Вывод ÷10 делит частоту на десять, СБР возвращает счёт в начало.',
    pins: cdPins(),
    props: [
      { key: 'Rout', label: 'Сопр. выходов', unit: 'Ω', def: 40, min: 1 }
    ],
    init: function (c) { c.state = { n: 0, clk: false }; },
    stamp: function (c, ctx) {
      var m = ctx.mna, n = c.n, st = c.state, i;
      var VCC = n[CD.VCC], GND = n[CD.GND];
      m.conductance(VCC, GND, 1 / 200000);
      m.conductance(n[CD.CLK], GND, 1 / PULL);
      m.conductance(n[CD.RST], GND, 1 / PULL);
      m.conductance(n[CD.EN], GND, 1 / PULL);
      var r = Math.max(c.props.Rout, 1);
      if (!c.powered) {
        for (i = 0; i < 10; i++) m.conductance(n[CD_Q[i]], GND, 1 / PULL);
        m.conductance(n[CD.CO], GND, 1 / PULL);
        return;
      }
      for (i = 0; i < 10; i++) driveBit(ctx, n[CD_Q[i]], i === st.n, VCC, GND, r);
      driveBit(ctx, n[CD.CO], st.n < 5, VCC, GND, r);   // перенос: единица на счётах 0…4
    },
    post: function (c, ctx) {
      var n = c.n, st = c.state;
      var vg = ctx.nv(n[CD.GND]);
      var vcc = ctx.nv(n[CD.VCC]) - vg;
      c.vcc = vcc;
      c.powered = vcc > 2;
      if (!c.powered) { st.n = 0; st.clk = false; c.v = 0; c.i = 0; c.pinI = null; return; }
      if (readBit(ctx, n[CD.RST], vg, vcc)) st.n = 0;
      else {
        var clk = readBit(ctx, n[CD.CLK], vg, vcc);
        // вход разрешения активен низким уровнем
        if (clk && !st.clk && !readBit(ctx, n[CD.EN], vg, vcc)) st.n = (st.n + 1) % 10;
        st.clk = clk;
      }
      c.v = vcc;
      c.i = vcc / 200000;
      c.level = 'Q' + st.n;
      c.pinI = null;
    },
    draw: function (g, c) {
      EC.drawBigChip(g, c, 3, '4017', CD_PINS, function () { return cdFace(c); });
    }
  });

  /** Строки на лицевой части счётчика. */
  function cdFace(c) {
    return [
      { t: 'CD4017', y: -GRID * 1.4, size: 7.5, color: 'rgba(232,240,248,.85)' },
      { t: c.powered ? 'Q' + c.state.n : '—', y: GRID * 0.4, size: 9,
        color: c.powered ? 'rgba(125,255,208,.85)' : 'rgba(150,170,190,.55)' }
    ];
  }
  EC.cdFace = cdFace;
  EC.CD_PINS = CD_PINS;

  /* ================================================================== */
  /*  Оптрон PC817                                                      */
  /* ================================================================== */

  var OPTO = { A: 0, K: 1, E: 2, C: 3 };
  var OPTO_PINS = [{ i: 0, t: 'A' }, { i: 1, t: 'K' }, { i: 2, t: 'Э' }, { i: 3, t: 'К' }];
  var VSAT = 0.3;                                // колено насыщения фототранзистора

  define({
    key: 'optocoupler', name: 'Оптрон', cat: 'semi',
    tip: 'Светодиод и фототранзистор в одном корпусе, между ними только свет. Ток через светодиод открывает транзистор, а электрически цепи не связаны — так развязывают слаботочную часть от силовой.',
    pins: [
      { x: -3, y: -2, name: '1 A' }, { x: -3, y: 2, name: '2 K' },
      { x: 3, y: 2, name: '3 Э' }, { x: 3, y: -2, name: '4 К' }
    ],
    props: [
      { key: 'Vf', label: 'Прямое падение', unit: 'В', def: 1.2, min: 0.3 },
      { key: 'If', label: 'Номин. ток', unit: 'А', def: 0.02, min: 1e-5 },
      { key: 'ctr', label: 'Передача тока', unit: '', def: 1, min: 0.05, max: 10 }
    ],
    nonlinear: true,
    init: function (c) { c.state = { ic: 0 }; },
    stamp: function (c, ctx) {
      var n = c.n;
      var nf = 2.2, vt = 0.02585 * nf;
      var opts = { is: Math.max(c.props.If, 1e-4) / Math.exp(c.props.Vf / vt), nf: nf, vz: 0 };
      J.stamp(ctx, c, n[OPTO.A], n[OPTO.K], opts, '_vd');
      var iled = Math.max(J.eval(ctx, ctx.nv(n[OPTO.A]) - ctx.nv(n[OPTO.K]), opts).i, 0);
      // ток коллектора пропорционален току светодиода и падает у нуля Uкэ
      var full = iled * U.clamp(c.props.ctr, 0.05, 10);
      var vce = ctx.nv(n[OPTO.C]) - ctx.nv(n[OPTO.E]);
      var k = vce > 0 ? vce / (vce + VSAT) : 0;
      var ic = full * k;
      var gc = vce > 0 ? full * VSAT / ((vce + VSAT) * (vce + VSAT)) : full / VSAT;
      gc += 1e-9;
      ctx.mna.conductance(n[OPTO.C], n[OPTO.E], gc);
      ctx.mna.current(n[OPTO.C], n[OPTO.E], ic - gc * vce);
      c.state.ic = ic;
      c._iled = iled;
    },
    post: function (c, ctx) {
      var n = c.n;
      c.v = ctx.nv(n[OPTO.C]) - ctx.nv(n[OPTO.E]);
      c.i = c.state.ic;
      c.glow = U.clamp((c._iled || 0) / Math.max(c.props.If, 1e-6), 0, 1.4);
      c.warn = (c._iled || 0) > c.props.If * 2.5 ? 'Ток выше допустимого — светодиод сгорит' : null;
      c.pinI = null;
    },
    draw: function (g, c) {
      var w = GRID * 4.2, h = GRID * 5;
      c.def().pins.forEach(function (p) {
        lead(g, p.x * GRID, p.y * GRID, (p.x > 0 ? 1 : -1) * w / 2, p.y * GRID);
      });
      g.fillStyle = 'rgba(28,32,40,.96)';
      roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
      g.strokeStyle = 'rgba(170,190,210,.6)'; g.lineWidth = 1.2;
      roundRect(g, -w / 2, -h / 2, w, h, 3); g.stroke();
      g.fillStyle = 'rgba(8,10,13,.9)';
      g.beginPath(); g.arc(-w / 2, -h * 0.28, 3, -Math.PI / 2, Math.PI / 2); g.fill();
      // светящийся зазор между излучателем и приёмником
      var glow = c.glow || 0;
      if (glow > 0.02) {
        var grd = g.createRadialGradient(0, 0, 1, 0, 0, w * 0.4);
        grd.addColorStop(0, 'rgba(255,190,120,' + (0.5 * Math.min(glow, 1)) + ')');
        grd.addColorStop(1, 'rgba(255,190,120,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(0, 0, w * 0.4, 0, 7); g.fill();
      }
      g.strokeStyle = glow > 0.02 ? 'rgba(255,205,140,.95)' : 'rgba(150,170,190,.5)';
      g.lineWidth = 1.4; g.lineCap = 'round';
      for (var k = -1; k <= 1; k += 2) {
        g.beginPath();
        g.moveTo(-5, k * 3.5); g.lineTo(5, k * 3.5);
        g.stroke();
        g.beginPath();
        g.moveTo(5, k * 3.5); g.lineTo(2, k * 3.5 - 2);
        g.moveTo(5, k * 3.5); g.lineTo(2, k * 3.5 + 2);
        g.stroke();
      }
      gfx.chipPins(g, c, OPTO_PINS, w, 5.4);
      label(g, c, [c.name || ''], h / 2 + GRID * 0.9);
    }
  });

  /* ================================================================== */
  /*  Сборка Дарлингтона ULN2003                                        */
  /* ================================================================== */

  /* Цоколёвка настоящая: входы 1…7, общий провод 8, вывод 9 — общий для
     защитных диодов, выходы 10…16 идут в обратном порядке. */
  var ULN_LEFT = ['ВХ1', 'ВХ2', 'ВХ3', 'ВХ4', 'ВХ5', 'ВХ6', 'ВХ7', 'GND'];
  var ULN_RIGHT = ['ОБЩ', 'ВЫХ7', 'ВЫХ6', 'ВЫХ5', 'ВЫХ4', 'ВЫХ3', 'ВЫХ2', 'ВЫХ1'];
  var ULN = { GND: 7, COM: 8 };
  var ULN_OUT = [15, 14, 13, 12, 11, 10, 9];     // ВЫХ1…ВЫХ7 → индексы выводов

  var ULN_PINS = [];
  ULN_LEFT.forEach(function (t, i) { ULN_PINS.push({ i: i, t: t, n: i + 1 }); });
  ULN_RIGHT.forEach(function (t, i) { ULN_PINS.push({ i: 8 + i, t: t, n: 9 + i }); });

  function ulnPins() {
    var pins = [], i;
    for (i = 0; i < 8; i++) pins.push({ x: -3, y: -7 + i * 2, name: (i + 1) + ' ' + ULN_LEFT[i] });
    for (i = 0; i < 8; i++) pins.push({ x: 3, y: 7 - i * 2, name: (9 + i) + ' ' + ULN_RIGHT[i] });
    return pins;
  }

  define({
    key: 'uln2003', name: 'Ключи ULN2003', cat: 'logic',
    tip: 'Семь составных транзисторов в одном корпусе: логическая единица на входе притягивает выход к общему проводу и держит до полуампера. Так от процессора питают реле, обмотки шагового двигателя и лампы. Вывод 9 соединяют с плюсом нагрузки — внутри к нему идут защитные диоды.',
    pins: ulnPins(),
    props: [
      { key: 'Ron', label: 'Сопр. открытого ключа', unit: 'Ω', def: 3, min: 0.05 },
      { key: 'Vth', label: 'Порог входа', unit: 'В', def: 1.4, min: 0.2 }
    ],
    nonlinear: true,
    init: function (c) { c.state = { on: [] }; },
    stamp: function (c, ctx) {
      var m = ctx.mna, n = c.n, st = c.state;
      var GND = n[ULN.GND];
      var r = Math.max(c.props.Ron, 0.05);
      for (var i = 0; i < 7; i++) {
        m.conductance(n[i], GND, 1 / 2700);     // входной резистор базы
        var on = (ctx.nv(n[i]) - ctx.nv(GND)) > c.props.Vth;
        if (st.on[i] !== on) ctx.forceIterate();
        st.on[i] = on;
        if (on) m.conductance(n[ULN_OUT[i]], GND, 1 / r);
        else m.conductance(n[ULN_OUT[i]], GND, 1 / PULL);
        // защитный диод от выхода к общему выводу нагрузки
        J.stamp(ctx, c, n[ULN_OUT[i]], n[ULN.COM], { is: 2e-9, nf: 1.8, vz: 0 }, '_d' + i);
      }
      m.conductance(n[ULN.COM], GND, 1 / PULL);
    },
    post: function (c, ctx) {
      var n = c.n, st = c.state, total = 0, lit = 0;
      for (var i = 0; i < 7; i++) {
        if (st.on[i]) {
          lit++;
          total += (ctx.nv(n[ULN_OUT[i]]) - ctx.nv(n[ULN.GND])) / Math.max(c.props.Ron, 0.05);
        }
      }
      c.i = total;
      c.v = ctx.nv(n[ULN.COM]) - ctx.nv(n[ULN.GND]);
      c.level = lit + '/7';
      c.pinI = null;
    },
    draw: function (g, c) {
      EC.drawBigChip(g, c, 3, 'ULN', ULN_PINS, function () { return ulnFace(c); });
    }
  });

  /** Строки на лицевой части сборки ключей. */
  function ulnFace(c) {
    var mask = '';
    for (var i = 0; i < 7; i++) mask += c.state.on[i] ? '●' : '·';
    return [
      { t: 'ULN2003', y: -GRID * 1.4, size: 7, color: 'rgba(232,240,248,.85)' },
      { t: mask, y: GRID * 0.4, size: 8, color: 'rgba(125,255,208,.8)' }
    ];
  }
  EC.ulnFace = ulnFace;
  EC.ULN_PINS = ULN_PINS;

  /* ================================================================== */
  /*  Кварцевый генератор                                               */
  /* ================================================================== */

  var OSC = { EN: 0, GND: 1, OUT: 2, VCC: 3 };
  var OSC_PINS = [{ i: 0, t: 'РАЗР' }, { i: 1, t: 'GND' }, { i: 2, t: 'ВЫХ' }, { i: 3, t: 'Vcc' }];

  define({
    key: 'oscillator', name: 'Кварцевый генератор', cat: 'source',
    tip: 'Готовый источник тактов: подал питание — и на выходе ровный меандр заданной частоты. Им тактируют процессор и счётчики, когда нужна точность. Низкий уровень на выводе РАЗР останавливает генерацию.',
    pins: [
      { x: -3, y: -2, name: '1 РАЗР' }, { x: -3, y: 2, name: '7 GND' },
      { x: 3, y: 2, name: '8 ВЫХ' }, { x: 3, y: -2, name: '14 Vcc' }
    ],
    props: [
      { key: 'freq', label: 'Частота', unit: 'Гц', def: 1000, min: 0.1, max: 200000 },
      { key: 'Rout', label: 'Выходное сопр.', unit: 'Ω', def: 40, min: 1 }
    ],
    init: function (c) { c.state = { phase: 0, out: false }; },
    stamp: function (c, ctx) {
      var m = ctx.mna, n = c.n, st = c.state;
      var VCC = n[OSC.VCC], GND = n[OSC.GND];
      m.conductance(VCC, GND, 1 / 5000);
      m.conductance(n[OSC.EN], VCC, 1 / PULL);   // не подключён — генератор работает
      if (!c.powered) { m.conductance(n[OSC.OUT], GND, 1 / PULL); return; }
      driveBit(ctx, n[OSC.OUT], st.out, VCC, GND, Math.max(c.props.Rout, 1));
    },
    post: function (c, ctx) {
      var n = c.n, st = c.state;
      var vg = ctx.nv(n[OSC.GND]);
      var vcc = ctx.nv(n[OSC.VCC]) - vg;
      c.vcc = vcc;
      c.powered = vcc > 2;
      if (!c.powered) { st.out = false; st.phase = 0; c.v = 0; c.i = 0; return; }
      if (!readBit(ctx, n[OSC.EN], vg, vcc)) { st.out = false; c.level = 'стоп'; }
      else {
        st.phase += Math.max(c.props.freq, 0.1) * ctx.dt;
        st.phase -= Math.floor(st.phase);
        st.out = st.phase < 0.5;
        c.level = st.out ? '1' : '0';
      }
      c.v = vcc;
      c.i = vcc / 5000;
      c.pinI = null;
    },
    draw: function (g, c) {
      var w = GRID * 4.4, h = GRID * 5;
      c.def().pins.forEach(function (p) {
        lead(g, p.x * GRID, p.y * GRID, (p.x > 0 ? 1 : -1) * w / 2, p.y * GRID);
      });
      // корпус металлический, с фаской
      g.fillStyle = gfx.grad(g, 'oscBody', 0, -h / 2, 0, h / 2, [
        [0, '#c9d2da'], [0.3, '#9ba6b0'], [0.75, '#6f7a85'], [1, '#515a63']
      ]);
      roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
      g.strokeStyle = 'rgba(40,48,56,.75)'; g.lineWidth = 1.2;
      roundRect(g, -w / 2, -h / 2, w, h, 3); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.3)';
      roundRect(g, -w / 2 + 2, -h / 2 + 2, w - 4, h * 0.14, 2); g.fill();
      gfx.chipPins(g, c, OSC_PINS, w, 5.4);
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(30,38,46,.9)';
      g.font = '700 7.5px ui-monospace, Menlo, monospace';
      g.fillText(U.fmtUnit(c.props.freq, EC.t('Гц'), 3), 0, -GRID * 0.5);
      g.fillStyle = (c.state && c.state.out) ? '#1b7a56' : 'rgba(40,50,60,.55)';
      g.font = '700 9px ui-monospace, Menlo, monospace';
      g.fillText('⎍', 0, GRID * 1);
      g.restore();
      label(g, c, [c.name || ''], h / 2 + GRID * 0.9);
    }
  });
})(window);
