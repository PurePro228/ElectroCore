/* ElectroCore — плата EC-32.
 *
 * Отладочная плата на процессоре EC-8: сам процессор, микросхема памяти и
 * расширитель портов уже стоят на плате и разведены между собой. Наружу
 * выходит гребёнка из шестнадцати линий P0…P15, питание, общий провод и
 * вход сброса — как у готовых модулей вроде ESP32-DevKit.
 *
 * Внутри линии разбиты на два порта по восемь: P0…P7 — первый порт
 * (команды OUT, IN, DIR), P8…P15 — второй (OUTB, INB, DIRB).
 */
(function (global) {
  'use strict';
  var EC = global.EC;
  var GRID = EC.GRID, define = EC.define;
  var gfx = EC.gfx, roundRect = gfx.roundRect, lead = gfx.lead, label = gfx.label;

  /* ------------------------------------------------------------------ */
  /*  Гребёнка выводов                                                   */
  /* ------------------------------------------------------------------ */

  /* Слева сверху вниз: питание, общий, сброс и линии P0…P6.
     Справа снизу вверх: P7…P15 и второй общий вывод. */
  var B_LEFT = ['Vcc', 'GND', 'СБР', 'P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  var B_RIGHT = ['P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'GND'];

  var B = { VCC: 0, GND: 1, RST: 2, P0: 3, P7: 10, GND2: 19 };
  var B_GPIO = 16;                             // всего линий ввода-вывода

  /** Индекс вывода для линии P<k>. */
  function gpioPin(k) { return k < 7 ? B.P0 + k : B.P7 + (k - 7); }

  var B_PINS = [];
  B_LEFT.forEach(function (t, i) { B_PINS.push({ i: i, t: t }); });
  B_RIGHT.forEach(function (t, i) { B_PINS.push({ i: 10 + i, t: t }); });
  EC.B_PINS = B_PINS;

  var B_W = 12.4, B_H = 23;                    // габарит платы в клетках

  function boardPins() {
    var pins = [], i;
    for (i = 0; i < 10; i++) pins.push({ x: -7, y: -9 + i * 2, name: B_LEFT[i] });
    for (i = 0; i < 10; i++) pins.push({ x: 7, y: 9 - i * 2, name: B_RIGHT[i] });
    return pins;
  }

  /* ------------------------------------------------------------------ */
  /*  Программа по умолчанию                                            */
  /* ------------------------------------------------------------------ */

  var BOARD_CODE = [
    '; Плата EC-32: шестнадцать линий вместо четырёх.',
    '; P0…P7 — первый порт (OUT, IN, DIR),',
    '; P8…P15 — второй порт (OUTB, INB, DIRB).',
    '; Огонёк бежит по первому порту и возвращается по второму.',
    '',
    '        LDI 0b11111111',
    '        DIR             ; P0…P7 — выходы',
    '        DIRB            ; P8…P15 — тоже выходы',
    '',
    '        LDI 1',
    '        ST 0xF0         ; текущий огонёк',
    '',
    'цикл:   LD 0xF0',
    '        OUT             ; на P0…P7',
    '        NOT',
    '        OUTB            ; на P8…P15 — наоборот',
    '        CALL пауза',
    '        LD 0xF0',
    '        SHL             ; сдвинуть влево',
    '        JNZ дальше',
    '        LDI 1           ; дошли до края — начать заново',
    'дальше: ST 0xF0',
    '        JMP цикл',
    '',
    'пауза:  LDI 60',
    '        ST 0xF1',
    'вн:     LD 0xF1',
    '        DEC',
    '        ST 0xF1',
    '        JNZ вн',
    '        RET'
  ].join('\n');

  /** Пересобирает программу платы, если текст изменился. */
  function syncBoard(c) {
    if (c._codeText === c.props.code && c.state.asm) return;
    c._codeText = c.props.code;
    var res = EC.cpu.assemble(c.props.code);
    c.state.asm = res;
    if (res.ok) EC.cpu.load(c.state.m, res.code);
    c.asmError = res.ok ? null : res.errors[0];
    c.asmWarn = (res.ok && res.warnings.length) ? res.warnings[0] : null;
  }

  /* ------------------------------------------------------------------ */
  /*  Сама плата                                                        */
  /* ------------------------------------------------------------------ */

  define({
    key: 'board32', name: 'Плата EC-32', cat: 'logic',
    tip: 'Готовый модуль на процессоре EC-8: на плате уже стоят сам процессор, память на 256 байт и расширитель портов. Наружу выведены шестнадцать линий: P0…P7 — первый порт (OUT, IN, DIR), P8…P15 — второй (OUTB, INB, DIRB). Оба вывода GND — один и тот же общий провод.',
    pins: boardPins(),
    box: { w: B_W, h: B_H },
    props: [
      { key: 'code', label: 'Программа', type: 'code', def: BOARD_CODE },
      { key: 'freq', label: 'Тактовая частота', unit: 'Гц', def: 4000, min: 1, max: 200000 },
      { key: 'Rout', label: 'Сопр. выходов', unit: 'Ω', def: 40, min: 1 },
      { key: 'Rin', label: 'Подтяжка входов', unit: 'Ω', def: 1e6, min: 1000 }
    ],
    init: function (c) {
      var m = EC.cpu.create();
      m.mask = 0xFF;                           // у платы восемь линий в каждом порту
      c.state = { m: m, asm: null, acc: 0 };
      c._codeText = null;
      syncBoard(c);
    },
    stamp: function (c, ctx) {
      var mna = ctx.mna, n = c.n, mach = c.state.m, k;
      var VCC = n[B.VCC], GND = n[B.GND];
      var Rin = Math.max(c.props.Rin, 1000), Rout = Math.max(c.props.Rout, 1);
      mna.conductance(GND, n[B.GND2], 1 / 0.005);   // оба общих вывода — одна медь
      mna.conductance(VCC, GND, 1 / 2500);          // ядро, память и светодиод питания
      mna.conductance(n[B.RST], VCC, 1 / 100000);   // сброс подтянут к питанию
      for (k = 0; k < B_GPIO; k++) {
        var p = n[gpioPin(k)];
        var reg = k < 8 ? mach.ddr : mach.ddrB;
        var val = k < 8 ? mach.port : mach.portB;
        var bit = k & 7;
        if (c.powered && ((reg >> bit) & 1)) {
          var high = (val >> bit) & 1;
          mna.conductance(p, high ? VCC : GND, 1 / Rout);
          mna.conductance(p, high ? GND : VCC, 1e-11);
        } else {
          mna.conductance(p, GND, 1 / Rin);         // вход: слабая подтяжка к нулю
        }
      }
    },
    post: function (c, ctx) {
      syncBoard(c);
      var st = c.state, mach = st.m, n = c.n, k;
      var vg = ctx.nv(n[B.GND]);
      var vcc = ctx.nv(n[B.VCC]) - vg;
      c.vcc = vcc;
      c.powered = vcc > 2;
      c.pinI = null;                           // ток по выводам считают провода

      if (!c.powered) {
        EC.cpu.reset(mach);
        mach.mask = 0xFF;
        c.inReset = false;
        c.v = 0; c.i = 0; c.warn = null;
        return;
      }

      c.inReset = (ctx.nv(n[B.RST]) - vg) < vcc * 0.3;
      if (c.inReset) { EC.cpu.reset(mach); mach.mask = 0xFF; }

      // уровни на линиях, настроенных на вход
      var a = 0, b = 0;
      for (k = 0; k < B_GPIO; k++) {
        if ((ctx.nv(n[gpioPin(k)]) - vg) > vcc * 0.5) {
          if (k < 8) a |= (1 << k); else b |= (1 << (k - 8));
        }
      }
      mach.pins = a;
      mach.pinsB = b;

      if (!c.inReset && st.asm && st.asm.ok) {
        st.acc += Math.max(c.props.freq, 1) * ctx.dt;
        var steps = Math.floor(st.acc);
        if (steps > 4000) steps = 4000;        // не вешаем кадр
        st.acc -= steps;
        for (k = 0; k < steps; k++) EC.cpu.step(mach);
      }

      c.v = vcc;
      c.i = vcc / 2500;
      c.level = c.inReset ? 'сброс' : (mach.halted ? 'стоп' : 'работа');
      c.warn = (st.asm && !st.asm.ok)
        ? 'Ошибка в программе, строка ' + st.asm.errors[0].line + ': ' + st.asm.errors[0].msg
        : (c.asmWarn ? 'Строка ' + c.asmWarn.line + ': ' + c.asmWarn.msg : null);
    },
    draw: function (g, c) { drawBoard(g, c); }
  });

  /* ------------------------------------------------------------------ */
  /*  Вид платы                                                          */
  /* ------------------------------------------------------------------ */

  /** Маленький корпус микросхемы на плате. */
  function smd(g, x, y, w, h, title, live) {
    g.save();
    g.translate(x * GRID, y * GRID);
    var bw = w * GRID, bh = h * GRID;
    g.fillStyle = gfx.grad(g, 'smdBody', 0, -bh / 2, 0, bh / 2, [
      [0, '#3a4149'], [0.25, '#23282e'], [0.8, '#171b20'], [1, '#0e1114']
    ]);
    roundRect(g, -bw / 2, -bh / 2, bw, bh, 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.06)';
    roundRect(g, -bw / 2 + 1.5, -bh / 2 + 1.5, bw - 3, bh * 0.1, 1); g.fill();
    if (live) {
      g.strokeStyle = 'rgba(125,255,208,.4)'; g.lineWidth = 1;
      roundRect(g, -bw / 2, -bh / 2, bw, bh, 2); g.stroke();
    }
    g.fillStyle = 'rgba(190,200,212,.5)';
    g.beginPath(); g.arc(-bw / 2 + 3.5, -bh / 2 + 3.5, 1.4, 0, 7); g.fill();
    g.restore();
    return { t: title, x: x, y: y };
  }

  /** Светодиод на плате: два состояния и мягкое свечение. */
  function boardLed(g, x, y, on, rgb) {
    var cx = x * GRID, cy = y * GRID, r = GRID * 0.5;
    if (on) {
      var hal = g.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 3.4);
      hal.addColorStop(0, 'rgba(' + rgb + ',.45)');
      hal.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = hal;
      g.beginPath(); g.arc(cx, cy, r * 3.4, 0, 7); g.fill();
    }
    g.fillStyle = on ? 'rgb(' + rgb + ')' : 'rgba(' + rgb + ',.28)';
    roundRect(g, cx - r, cy - r * 0.72, r * 2, r * 1.44, 1.2); g.fill();
    g.strokeStyle = 'rgba(12,16,20,.5)'; g.lineWidth = 0.7;
    roundRect(g, cx - r, cy - r * 0.72, r * 2, r * 1.44, 1.2); g.stroke();
    if (on) {
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.beginPath(); g.arc(cx - r * 0.25, cy - r * 0.2, r * 0.3, 0, 7); g.fill();
    }
  }

  /** Вся плата целиком. */
  function drawBoard(g, c) {
    var mach = c.state && c.state.m;
    var w = B_W * GRID, h = B_H * GRID;
    var live = c.powered && mach && !mach.halted && !c.inReset;

    c.def().pins.forEach(function (p) {
      lead(g, p.x * GRID, p.y * GRID, (p.x > 0 ? 1 : -1) * w / 2, p.y * GRID);
    });

    // тень и текстолит
    g.fillStyle = 'rgba(10,26,20,.16)';
    roundRect(g, -w / 2 + 3, -h / 2 + 4, w, h, 5); g.fill();
    g.fillStyle = gfx.grad(g, 'b32Board', 0, -h / 2, 0, h / 2, [
      [0, '#2c3a4a'], [0.45, '#22303e'], [1, '#182430']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h, 5); g.fill();
    g.strokeStyle = 'rgba(10,18,26,.65)'; g.lineWidth = 1.2;
    roundRect(g, -w / 2, -h / 2, w, h, 5); g.stroke();
    // белая рамка шелкографии
    g.strokeStyle = 'rgba(226,238,250,.18)'; g.lineWidth = 0.8;
    roundRect(g, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 3); g.stroke();

    // крепёжные отверстия по углам
    g.fillStyle = 'rgba(8,14,20,.8)';
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      g.beginPath();
      g.arc(q[0] * (w / 2 - 6), q[1] * (h / 2 - 6), 2.2, 0, 7);
      g.fill();
    });

    // гребёнки: чёрный пластик и золочёные площадки
    [-1, 1].forEach(function (s) {
      var hx = s * (w / 2 - GRID * 0.95);
      g.fillStyle = 'rgba(20,24,30,.95)';
      roundRect(g, hx - GRID * 0.7, -10 * GRID, GRID * 1.4, 20 * GRID, 2); g.fill();
      for (var i = 0; i < 10; i++) {
        var y = (-9 + i * 2) * GRID;
        g.fillStyle = gfx.grad(g, 'b32Pad', hx - 3, y - 3, hx + 3, y + 3, [
          [0, '#f2d98a'], [0.5, '#d8b45d'], [1, '#a98833']
        ]);
        roundRect(g, hx - 3, y - 3, 6, 6, 1); g.fill();
      }
    });

    // разъём питания сверху, как микро-USB
    g.fillStyle = gfx.grad(g, 'b32Usb', 0, -h / 2, 0, -h / 2 + GRID * 2.4, [
      [0, '#d5dbe1'], [0.5, '#a7aeb6'], [1, '#79808a']
    ]);
    roundRect(g, -GRID * 2.2, -h / 2 + 1.5, GRID * 4.4, GRID * 2.2, 2); g.fill();
    g.fillStyle = 'rgba(24,28,34,.8)';
    roundRect(g, -GRID * 1.5, -h / 2 + 4, GRID * 3, GRID * 1.1, 1); g.fill();

    // микросхемы: процессор, память и расширитель портов
    var chips = [];
    chips.push(smd(g, 0, -3.6, 5.6, 5.6, 'EC-8B', live));
    chips.push(smd(g, -2.2, 2.6, 3.6, 2.8, 'ОЗУ', c.powered));
    chips.push(smd(g, 2.2, 2.6, 3.6, 2.8, 'EC-IO', c.powered));

    // кварцевый резонатор
    g.fillStyle = gfx.grad(g, 'b32Xtal', 0, 5 * GRID, 0, 7 * GRID, [
      [0, '#cdd4da'], [0.5, '#9aa2ab'], [1, '#6e767f']
    ]);
    roundRect(g, -GRID * 1.6, 5.1 * GRID, GRID * 3.2, GRID * 1.6, 2); g.fill();
    g.strokeStyle = 'rgba(40,48,56,.6)'; g.lineWidth = 0.8;
    roundRect(g, -GRID * 1.6, 5.1 * GRID, GRID * 3.2, GRID * 1.6, 2); g.stroke();

    // светодиоды: питание и работа
    var act = live && ((mach.cycles >> 9) & 1);
    boardLed(g, -3.6, 5.9, c.powered, '255,92,92');
    boardLed(g, 3.6, 5.9, !!act, '125,255,208');

    // надписи
    g.save();
    g.rotate(-(c.rot || 0) * Math.PI / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    chips.forEach(function (ch) {
      g.font = '700 ' + (ch.t === 'EC-8B' ? 8.5 : 5.5) + 'px ui-monospace, Menlo, monospace';
      g.fillStyle = 'rgba(226,236,246,.8)';
      g.fillText(EC.t(ch.t), ch.x * GRID, (ch.y - (ch.t === 'EC-8B' ? 1.4 : 0)) * GRID);
    });
    if (mach) {
      g.font = '600 6.5px ui-monospace, Menlo, monospace';
      g.fillStyle = c.inReset ? 'rgba(255,170,120,.9)'
        : (mach.halted ? 'rgba(255,200,120,.85)' : 'rgba(125,255,208,.85)');
      g.fillText(c.inReset ? EC.t('СБРОС')
        : (mach.halted ? EC.t('СТОП') : 'PC ' + EC.cpu.hex(mach.pc)), 0, -3.4 * GRID);
      g.font = '600 5.5px ui-monospace, Menlo, monospace';
      g.fillStyle = 'rgba(190,206,222,.65)';
      g.fillText('A ' + EC.cpu.hex(mach.port) + '  B ' + EC.cpu.hex(mach.portB), 0, -2 * GRID);
    }
    g.font = '700 5px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(226,238,250,.5)';
    g.fillText(EC.t('ПИТ'), -3.6 * GRID, 7.4 * GRID);
    g.fillText(EC.t('РАБ'), 3.6 * GRID, 7.4 * GRID);
    g.font = '700 8px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(232,242,252,.72)';
    g.fillText('EC-32', 0, 9.4 * GRID);
    g.restore();

    gfx.chipPins(g, c, B_PINS, w - GRID * 2.9, 5.2);
    label(g, c, [c.name || 'EC-32'], h / 2 + GRID * 0.9);
  }

  EC.B_GPIO_PIN = gpioPin;
  EC.BOARD_CODE = BOARD_CODE;
})(window);
