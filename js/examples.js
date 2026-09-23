/* ElectroCore — готовые схемы для быстрого старта. */
(function (global) {
  'use strict';
  var EC = global.EC;

  /**
   * Мини-конструктор схем.
   *   parts: [тип, x, y, поворот, параметры, подпись, ключ]
   *   links: [ключA, выводA, ключB, выводB]
   */
  function build(spec) {
    var ct = new EC.Circuit();
    var map = {};
    spec.parts.forEach(function (p) {
      var c = ct.add(p[0], p[1], p[2]);
      c.rot = p[3] || 0;
      var props = p[4] || {};
      // многострочные значения — это программы, их переводим вместе с языком
      for (var k in props) {
        var v = props[k];
        c.props[k] = (typeof v === 'string' && v.indexOf('\n') >= 0 && EC.t) ? EC.t(v) : v;
      }
      if (p[5]) c.name = p[5];
      map[p[6]] = c;
    });
    spec.links.forEach(function (l) {
      var a = map[l[0]], b = map[l[2]];
      if (a && b) ct.connect(a.id, l[1], b.id, l[3]);
    });
    ct.reroute();
    ct.reset();
    return ct;
  }

  var EXAMPLES = [
    {
      id: 'led',
      name: 'Светодиод и резистор',
      hint: 'Базовая цепь: резистор ограничивает ток через светодиод. Меняйте сопротивление и смотрите на яркость.',
      make: function () {
        return build({
          parts: [
            ['battery', -8, 0, 0, { V: 5 }, 'GB1', 'bat'],
            ['switch', -1, -6, 0, { closed: true }, 'SA1', 'sw'],
            ['resistor', 7, -6, 0, { R: 220 }, 'R1', 'r'],
            ['led', 14, 0, 1, { color: 'red' }, 'HL1', 'led'],
            ['ground', -8, 8, 0, {}, '', 'gnd']
          ],
          links: [
            ['bat', 0, 'sw', 0], ['sw', 1, 'r', 0], ['r', 1, 'led', 0],
            ['led', 1, 'gnd', 0], ['bat', 1, 'gnd', 0]
          ]
        });
      }
    },
    {
      id: 'divider',
      name: 'Делитель напряжения',
      hint: 'Потенциометр делит 12 В. Вольтметр показывает напряжение на движке.',
      make: function () {
        return build({
          parts: [
            ['battery', -10, 0, 0, { V: 12 }, 'GB1', 'bat'],
            ['pot', 2, -6, 0, { R: 10000, pos: 0.5 }, 'RV1', 'pot'],
            ['voltmeter', 12, 2, 1, {}, 'PV1', 'v'],
            ['ground', -10, 8, 0, {}, '', 'gnd']
          ],
          links: [
            ['bat', 0, 'pot', 0], ['pot', 1, 'gnd', 0], ['bat', 1, 'gnd', 0],
            ['pot', 2, 'v', 0], ['v', 1, 'gnd', 0]
          ]
        });
      }
    },
    {
      id: 'rc',
      name: 'Зарядка конденсатора',
      hint: 'Классическая RC-цепь. Постоянная времени τ = R·C = 0,47 с. Смотрите экспоненту на осциллографе.',
      make: function () {
        return build({
          parts: [
            ['vsource', -10, 0, 0, { wave: 'square', amp: 5, offset: 5, freq: 0.4, Rint: 1 }, 'G1', 'src'],
            ['resistor', 0, -6, 0, { R: 4700 }, 'R1', 'r'],
            ['capacitor_pol', 8, 0, 1, { C: 100e-6 }, 'C1', 'c'],
            ['probe', 8, -10, 0, {}, 'X1', 'p'],
            ['ground', -10, 8, 0, {}, '', 'gnd']
          ],
          links: [
            ['src', 0, 'r', 0], ['r', 1, 'c', 0], ['c', 1, 'gnd', 0],
            ['src', 1, 'gnd', 0], ['p', 0, 'c', 0]
          ]
        });
      }
    },
    {
      id: 'rectifier',
      name: 'Выпрямитель с фильтром',
      hint: 'Однополупериодный выпрямитель 50 Гц: диод отсекает отрицательную полуволну, конденсатор сглаживает пульсации.',
      make: function () {
        return build({
          parts: [
            ['vsource', -12, 0, 0, { wave: 'sine', amp: 12, freq: 50 }, 'G1', 'src'],
            ['diode', -2, -6, 0, {}, 'VD1', 'd'],
            ['capacitor_pol', 6, 0, 1, { C: 47e-6 }, 'C1', 'c'],
            ['resistor', 14, 0, 1, { R: 1000 }, 'R1', 'r'],
            ['probe', 6, -10, 0, {}, 'X1', 'p'],
            ['ground', -12, 8, 0, {}, '', 'gnd']
          ],
          links: [
            ['src', 0, 'd', 0], ['d', 1, 'c', 0], ['c', 0, 'r', 0],
            ['c', 1, 'gnd', 0], ['r', 1, 'gnd', 0], ['src', 1, 'gnd', 0],
            ['p', 0, 'c', 0]
          ]
        });
      }
    },
    {
      id: 'transistor',
      name: 'Транзисторный ключ',
      hint: 'Ток базы 1 мА открывает транзистор, и лампа зажигается. Нажмите кнопку.',
      make: function () {
        return build({
          parts: [
            ['battery', -12, 0, 0, { V: 12 }, 'GB1', 'bat'],
            ['button', -4, -8, 0, {}, 'SB1', 'btn'],
            ['resistor', 4, -8, 0, { R: 4700 }, 'R1', 'rb'],
            ['lamp', 6, -2, 1, { Vn: 12, Pn: 2 }, 'HL1', 'lamp'],
            ['npn', 12, 4, 0, { Bf: 150 }, 'VT1', 'q'],
            ['ground', -12, 12, 0, {}, '', 'gnd']
          ],
          links: [
            ['bat', 0, 'btn', 0], ['btn', 1, 'rb', 0], ['rb', 1, 'q', 0],
            ['bat', 0, 'lamp', 0], ['lamp', 1, 'q', 1],
            ['q', 2, 'gnd', 0], ['bat', 1, 'gnd', 0]
          ]
        });
      }
    },
    {
      id: 'lc',
      name: 'Колебательный контур',
      hint: 'Заряженный конденсатор и катушка обмениваются энергией: f = 1/(2π√LC) ≈ 5 кГц. Затухание задаёт сопротивление обмотки.',
      make: function () {
        return build({
          parts: [
            ['inductor', -6, 0, 1, { L: 1e-3, Rs: 0.5 }, 'L1', 'l'],
            ['capacitor', 6, 0, 1, { C: 1e-6, v0: 5 }, 'C1', 'c'],
            ['probe', 0, -8, 0, {}, 'X1', 'p'],
            ['ground', 0, 8, 0, {}, '', 'gnd']
          ],
          links: [
            ['l', 0, 'c', 0], ['l', 1, 'gnd', 0], ['c', 1, 'gnd', 0], ['p', 0, 'c', 0]
          ]
        });
      }
    },
    {
      id: 'opamp',
      name: 'Усилитель на ОУ',
      hint: 'Неинвертирующий усилитель: Кu = 1 + Rос/R1 = 11. Входной синус 0,5 В превращается в 5,5 В.',
      make: function () {
        return build({
          parts: [
            ['vsource', -16, -4, 0, { wave: 'sine', amp: 0.5, freq: 200 }, 'G1', 'src'],
            ['opamp', -2, 0, 0, {}, 'DA1', 'op'],
            ['resistor', 2, 10, 0, { R: 10000 }, 'Rос', 'rf'],
            ['resistor', -10, 10, 0, { R: 1000 }, 'R1', 'rg'],
            ['probe', 8, -6, 0, {}, 'X1', 'p'],
            ['ground', -16, 8, 0, {}, '', 'gnd']
          ],
          links: [
            ['src', 0, 'op', 0], ['src', 1, 'gnd', 0],
            ['op', 2, 'rf', 1], ['rf', 0, 'op', 1], ['op', 1, 'rg', 1],
            ['rg', 0, 'gnd', 0], ['p', 0, 'op', 2]
          ]
        });
      }
    },
    {
      id: 'multivibrator',
      name: 'Мультивибратор',
      hint: 'Два транзистора поочерёдно открываются — светодиоды мигают. Период задают RC-цепочки: T ≈ 0,7·C·(Rб1 + Rб2).',
      make: function () {
        return build({
          parts: [
            ['battery', -26, 2, 1, { V: 9 }, 'GB1', 'bat'],
            ['ground', -26, 12, 0, {}, '', 'gnd'],
            ['resistor', -14, -6, 1, { R: 47000 }, 'Rб1', 'rb1'],
            ['resistor', -4, -6, 1, { R: 470 }, 'Rк1', 'rc1'],
            ['led', -4, 0, 1, { color: 'red' }, 'HL1', 'led1'],
            ['npn', -6, 6, 0, { Bf: 150 }, 'VT1', 'q1'],
            ['resistor', 26, -6, 1, { R: 56000 }, 'Rб2', 'rb2'],
            ['resistor', 16, -6, 1, { R: 470 }, 'Rк2', 'rc2'],
            ['led', 16, 0, 1, { color: 'green' }, 'HL2', 'led2'],
            ['npn', 14, 6, 0, { Bf: 150 }, 'VT2', 'q2'],
            ['capacitor', 4, 2, 0, { C: 10e-6 }, 'C1', 'c1'],
            ['capacitor', 4, 10, 0, { C: 10e-6 }, 'C2', 'c2']
          ],
          links: [
            ['bat', 0, 'rb1', 0], ['rb1', 0, 'rc1', 0], ['rc1', 0, 'rc2', 0], ['rc2', 0, 'rb2', 0],
            ['rc1', 1, 'led1', 0], ['led1', 1, 'q1', 1],
            ['rc2', 1, 'led2', 0], ['led2', 1, 'q2', 1],
            ['rb1', 1, 'q1', 0], ['rb2', 1, 'q2', 0],
            ['q1', 1, 'c1', 0], ['c1', 1, 'q2', 0],
            ['q2', 1, 'c2', 1], ['c2', 0, 'q1', 0],
            ['q2', 2, 'q1', 2], ['q1', 2, 'gnd', 0], ['bat', 1, 'gnd', 0]
          ]
        });
      }
    },
    {
      id: 'timer555',
      name: 'Мигалка на таймере 555',
      hint: 'Конденсатор заряжается через оба резистора и разряжается через второй. Частота ≈ 1,44/((R1+2·R2)·C). Вывод 4 подтянут к питанию, на выводе 5 — помехоподавляющий конденсатор.',
      make: function () {
        return build({
          parts: [
            ['battery', -22, -2, 1, { V: 9 }, 'GB1', 'bat'],
            ['ground', -22, 14, 0, {}, '', 'gnd'],
            ['ne555', 0, 0, 0, {}, 'DD1', 't'],
            ['resistor', 16, -10, 1, { R: 22000 }, 'R1', 'r1'],
            ['resistor', 16, -4, 1, { R: 22000 }, 'R2', 'r2'],
            ['capacitor_pol', 16, 4, 1, { C: 10e-6 }, 'C1', 'c1'],
            ['capacitor', 10, 10, 1, { C: 10e-9 }, 'C2', 'c2'],
            ['resistor', -6, 18, 0, { R: 470 }, 'R3', 'r3'],
            ['led', 6, 18, 0, { color: 'yellow' }, 'HL1', 'led']
          ],
          links: [
            ['bat', 0, 't', 7], ['bat', 1, 'gnd', 0], ['t', 0, 'gnd', 0],
            ['bat', 0, 't', 3],
            ['bat', 0, 'r1', 0],
            ['r1', 1, 't', 6], ['r1', 1, 'r2', 0],
            ['r2', 1, 't', 5], ['t', 5, 't', 1],
            ['t', 5, 'c1', 0], ['c1', 1, 'gnd', 0],
            ['t', 4, 'c2', 0], ['c2', 1, 'gnd', 0],
            ['t', 2, 'r3', 0], ['r3', 1, 'led', 0], ['led', 1, 'gnd', 0]
          ]
        });
      }
    },
    {
      id: 'psu',
      name: 'Блок питания 5 В',
      hint: 'Трансформатор понижает напряжение, мост выпрямляет обе полуволны, конденсатор сглаживает, стабилизатор держит ровно 5 В.',
      make: function () {
        return build({
          parts: [
            ['vsource', -30, 0, 1, { wave: 'sine', amp: 26, freq: 50, Rint: 0.3 }, 'G1', 'src'],
            ['transformer', -18, 0, 0, { L1: 50, ratio: 2, k: 0.999, R1: 0.5, R2: 0.2 }, 'TV1', 'tr'],
            ['bridge', -4, 0, 0, {}, 'VD1', 'br'],
            ['capacitor_pol', 6, 0, 1, { C: 1000e-6 }, 'C1', 'c'],
            ['regulator', 16, -6, 0, { Vout: 5 }, 'DA1', 'reg'],
            ['resistor', 28, 0, 1, { R: 100 }, 'R1', 'load'],
            ['probe', 28, -10, 0, {}, 'X1', 'p'],
            ['ground', -4, 12, 0, {}, '', 'gnd']
          ],
          links: [
            ['src', 0, 'tr', 0], ['src', 1, 'tr', 1],
            ['tr', 2, 'br', 0], ['tr', 3, 'br', 1],
            ['br', 2, 'c', 0], ['br', 3, 'c', 1],
            ['br', 3, 'gnd', 0],
            ['c', 0, 'reg', 0], ['reg', 1, 'gnd', 0],
            ['reg', 2, 'load', 0], ['load', 1, 'gnd', 0],
            ['p', 0, 'load', 0]
          ]
        });
      }
    },
    {
      id: 'nightlight',
      name: 'Ночник на фоторезисторе',
      hint: 'Делитель из резистора и фоторезистора управляет транзистором: станет темно — светодиод зажжётся. Двигайте ползунок освещённости.',
      make: function () {
        return build({
          parts: [
            ['battery', -18, 0, 1, { V: 9 }, 'GB1', 'bat'],
            ['ground', -18, 12, 0, {}, '', 'gnd'],
            ['resistor', 0, -10, 1, { R: 22000 }, 'R1', 'r1'],
            ['photoresistor', 0, -2, 1, { light: 0.2 }, 'RL1', 'ldr'],
            ['npn', 8, 6, 0, { Bf: 150 }, 'VT1', 'q'],
            ['resistor', 12, -10, 1, { R: 680 }, 'R2', 'rc'],
            ['led', 12, -2, 1, { color: 'white' }, 'HL1', 'led']
          ],
          links: [
            ['bat', 0, 'r1', 0], ['bat', 0, 'rc', 0], ['bat', 1, 'gnd', 0],
            ['r1', 1, 'ldr', 0], ['r1', 1, 'q', 0],
            ['ldr', 1, 'gnd', 0],
            ['rc', 1, 'led', 0], ['led', 1, 'q', 1],
            ['q', 2, 'gnd', 0]
          ]
        });
      }
    },
    {
      id: 'motor',
      name: 'Двигатель и выключатель',
      hint: 'Вал раскручивается не сразу: мешает инерция. Пусковой ток больше рабочего, а противо-ЭДС растёт вместе с оборотами.',
      make: function () {
        return build({
          parts: [
            ['battery', -16, 0, 1, { V: 12 }, 'GB1', 'bat'],
            ['switch', -4, -8, 0, { closed: true }, 'SA1', 'sw'],
            ['ammeter', 8, -8, 0, {}, 'PA1', 'a'],
            ['motor', 18, 0, 1, {}, 'M1', 'm'],
            ['ground', -16, 10, 0, {}, '', 'gnd']
          ],
          links: [
            ['bat', 0, 'sw', 0], ['sw', 1, 'a', 0], ['a', 1, 'm', 0],
            ['m', 1, 'gnd', 0], ['bat', 1, 'gnd', 0]
          ]
        });
      }
    },
    {
      id: 'cpu',
      name: 'Бегущие огни на процессоре',
      hint: 'Процессор EC-8 сдвигает единицу по четырём линиям порта. Программу можно править прямо в свойствах: выделите процессор и откройте поле «Программа».',
      make: function () {
        var code = [
          '; Бегущий огонёк по четырём светодиодам.',
          '',
          '        LDI 0b1111',
          '        DIR             ; все линии на выход',
          '        LDI 0b0001',
          '        ST 0xF0         ; текущая маска',
          '',
          'цикл:   LD 0xF0',
          '        OUT',
          '        CALL пауза',
          '        LD 0xF0',
          '        SHL             ; сдвинуть огонёк',
          '        ANDI 0b1111',
          '        JNZ дальше',
          '        LDI 0b0001      ; дошли до края — начать сначала',
          'дальше: ST 0xF0',
          '        JMP цикл',
          '',
          'пауза:  LDI 6',
          '        ST 0xF1',
          'внеш:   LDI 20',
          '        ST 0xF2',
          'внутр:  LD 0xF2',
          '        DEC',
          '        ST 0xF2',
          '        JNZ внутр',
          '        LD 0xF1',
          '        DEC',
          '        ST 0xF1',
          '        JNZ внеш',
          '        RET'
        ].join('\n');
        return build({
          parts: [
            ['battery', -22, -2, 1, { V: 5 }, 'GB1', 'bat'],
            ['ground', -22, 24, 0, {}, '', 'gnd'],
            ['cpu8', 0, 0, 0, { code: code, freq: 2000 }, 'DD1', 'cpu'],
            ['button', -10, 12, 0, {}, 'SB1', 'rst'],
            ['resistor', 12, 3, 0, { R: 330 }, 'R1', 'r0'],
            ['led', 24, 3, 0, { color: 'red' }, 'HL1', 'd0'],
            ['resistor', 12, 9, 0, { R: 330 }, 'R2', 'r1'],
            ['led', 24, 9, 0, { color: 'yellow' }, 'HL2', 'd1'],
            ['resistor', 12, 15, 0, { R: 330 }, 'R3', 'r2'],
            ['led', 24, 15, 0, { color: 'green' }, 'HL3', 'd2'],
            ['resistor', 12, 21, 0, { R: 330 }, 'R4', 'r3'],
            ['led', 24, 21, 0, { color: 'blue' }, 'HL4', 'd3']
          ],
          links: [
            ['bat', 0, 'cpu', 0], ['cpu', 3, 'gnd', 0], ['bat', 1, 'gnd', 0],
            ['cpu', 2, 'rst', 0], ['rst', 1, 'gnd', 0],
            ['cpu', 4, 'r0', 0], ['r0', 1, 'd0', 0], ['d0', 1, 'gnd', 0],
            ['cpu', 5, 'r1', 0], ['r1', 1, 'd1', 0], ['d1', 1, 'gnd', 0],
            ['cpu', 6, 'r2', 0], ['r2', 1, 'd2', 0], ['d2', 1, 'gnd', 0],
            ['cpu', 7, 'r3', 0], ['r3', 1, 'd3', 0], ['d3', 1, 'gnd', 0]
          ]
        });
      }
    },
    {
      id: 'buscpu',
      name: 'Процессор с внешней памятью',
      hint: 'Настоящая микропроцессорная система: процессор EC-8B сам ничего не помнит и на каждом такте читает байт из микросхемы памяти по шинам адреса и данных. Программа лежит в памяти — выделите её и откройте поле «Содержимое».',
      make: function () {
        var code = [
          '; Бегущий огонёк на четырёх светодиодах.',
          '; И программа, и переменные лежат в этой микросхеме:',
          '; процессор читает их по шине адреса и данных.',
          '',
          '        LDI 0b1111',
          '        DIR             ; линии порта на выход',
          '        LDI 0b0001',
          '        ST 0x80         ; текущая маска — в память',
          '',
          'цикл:   LD 0x80',
          '        OUT',
          '        CALL пауза',
          '        LD 0x80',
          '        SHL             ; сдвинуть огонёк',
          '        ANDI 0b1111',
          '        JNZ дальше',
          '        LDI 0b0001      ; дошли до края — начать сначала',
          'дальше: ST 0x80',
          '        JMP цикл',
          '',
          'пауза:  LDI 40',
          '        ST 0x81',
          'ждём:   LD 0x81',
          '        DEC',
          '        ST 0x81',
          '        JNZ ждём',
          '        RET'
        ].join('\n');
        var parts = [
          ['battery', -30, -16, 1, { V: 5 }, 'GB1', 'bat'],
          ['ground', -30, 4, 0, {}, '', 'gnd'],
          ['ground', -24, -50, 0, {}, '', 'gnd3'],
          ['ground', 18, -26, 0, {}, '', 'gnd4'],
          ['ground', 42, 30, 0, {}, '', 'gnd2'],
          ['cpu_bus', 0, 0, 0, { freq: 2000 }, 'DD1', 'cpu'],
          ['memory', -2, -34, 0, { content: code }, 'DD2', 'mem'],
          ['button', -26, -7, 0, {}, 'SB1', 'rst'],
          ['resistor', 18, 25, 0, { R: 330 }, 'R1', 'r0'],
          ['led', 30, 25, 0, { color: 'red' }, 'HL1', 'd0'],
          ['resistor', 18, 19, 0, { R: 330 }, 'R2', 'r1'],
          ['led', 30, 19, 0, { color: 'yellow' }, 'HL2', 'd1'],
          ['resistor', 18, 13, 0, { R: 330 }, 'R3', 'r2'],
          ['led', 30, 13, 0, { color: 'green' }, 'HL3', 'd2'],
          ['resistor', 18, 7, 0, { R: 330 }, 'R4', 'r3'],
          ['led', 30, 7, 0, { color: 'blue' }, 'HL4', 'd3']
        ];
        var links = [
          // питание и сброс
          ['bat', 0, 'cpu', 0], ['cpu', 0, 'mem', 0],
          ['bat', 1, 'gnd', 0], ['cpu', 1, 'gnd', 0], ['mem', 1, 'gnd3', 0],
          ['cpu', 3, 'rst', 1], ['rst', 0, 'gnd', 0],
          // выбор микросхемы и незадействованные адресные входы
          ['mem', 2, 'gnd3', 0], ['mem', 3, 'mem', 0],
          ['mem', 12, 'gnd4', 0], ['mem', 13, 'gnd4', 0],
          // чтение и запись
          ['cpu', 18, 'mem', 14], ['cpu', 19, 'mem', 15]
        ];
        for (var i = 0; i < 8; i++) {
          links.push(['cpu', 6 + i, 'mem', 4 + i]);       // шина адреса
          links.push(['cpu', 20 + i, 'mem', 16 + i]);     // шина данных
        }
        ['r0', 'r1', 'r2', 'r3'].forEach(function (r, k) {
          links.push(['cpu', 14 + k, r, 0]);
          links.push([r, 1, 'd' + k, 0]);
          links.push(['d' + k, 1, 'gnd2', 0]);
        });
        return build({ parts: parts, links: links });
      }
    },
    {
      id: 'calc',
      name: 'Калькулятор на двух процессорах',
      hint: 'SB1 и SB2 набирают два числа от 0 до 9, SB3 — «равно». DD1 складывает их и передаёт сумму по одному проводу серией импульсов, DD2 принимает её и мигает светодиодом столько раз, сколько получилось. Схему прислал пользователь — собрана языковой моделью по описанию формата.',
      make: function () {
        var codeA = [
          'LDI 8',
          'DIR',
          'LDI 0',
          'ST 240',
          'ST 241',
          'main:',
          'IN',
          'ANDI 1',
          'JNZ incA',
          'IN',
          'ANDI 2',
          'JNZ incB',
          'IN',
          'ANDI 4',
          'JNZ doSum',
          'JMP main',
          'incA:',
          'waitRelA:',
          'IN',
          'ANDI 1',
          'JNZ waitRelA',
          'LD 240',
          'INC',
          'CMPI 10',
          'JNZ saveA',
          'LDI 0',
          'saveA:',
          'ST 240',
          'JMP main',
          'incB:',
          'waitRelB:',
          'IN',
          'ANDI 2',
          'JNZ waitRelB',
          'LD 241',
          'INC',
          'CMPI 10',
          'JNZ saveB',
          'LDI 0',
          'saveB:',
          'ST 241',
          'JMP main',
          'doSum:',
          'waitRelEq:',
          'IN',
          'ANDI 4',
          'JNZ waitRelEq',
          'LD 240',
          'TAB',
          'LD 241',
          'ADD',
          'ST 243',
          'sendloop:',
          'LD 243',
          'CMPI 0',
          'JZ gapLong',
          'LDI 8',
          'OUT',
          'LDI 100',
          'ST 244',
          'CALL delay',
          'LDI 0',
          'OUT',
          'LDI 100',
          'ST 244',
          'CALL delay',
          'LD 243',
          'DEC',
          'ST 243',
          'JMP sendloop',
          'gapLong:',
          'LDI 250',
          'ST 244',
          'CALL delay',
          'LDI 250',
          'ST 244',
          'CALL delay',
          'LDI 0',
          'ST 240',
          'ST 241',
          'JMP main',
          'delay:',
          'LD 244',
          'delayloop:',
          'DEC',
          'JNZ delayloop',
          'RET'
        ].join('\n');
        var codeB = [
          'LDI 2',
          'DIR',
          'LDI 0',
          'ST 240',
          'ST 241',
          'ST 242',
          'listen:',
          'IN',
          'ANDI 1',
          'ST 245',
          'CMPI 0',
          'JZ isLow',
          'LD 240',
          'CMPI 0',
          'JNZ skipInc',
          'LD 241',
          'INC',
          'ST 241',
          'skipInc:',
          'LDI 0',
          'ST 242',
          'JMP updatePrev',
          'isLow:',
          'LD 242',
          'INC',
          'ST 242',
          'updatePrev:',
          'LD 245',
          'ST 240',
          'LD 242',
          'CMPI 200',
          'JNZ listen',
          'LD 241',
          'CMPI 0',
          'JZ resetIdle',
          'JMP doneRecv',
          'resetIdle:',
          'LDI 0',
          'ST 242',
          'JMP listen',
          'doneRecv:',
          'LD 241',
          'ST 243',
          'blink:',
          'LD 243',
          'CMPI 0',
          'JZ blinkDone',
          'LDI 2',
          'OUT',
          'LDI 150',
          'ST 244',
          'CALL delay',
          'LDI 0',
          'OUT',
          'LDI 150',
          'ST 244',
          'CALL delay',
          'LD 243',
          'DEC',
          'ST 243',
          'JMP blink',
          'blinkDone:',
          'LDI 0',
          'ST 241',
          'ST 242',
          'ST 240',
          'JMP listen',
          'delay:',
          'LD 244',
          'delayloop:',
          'DEC',
          'JNZ delayloop',
          'RET'
        ].join('\n');
        return build({
          parts: [
            ['battery', -26, 0, 1, { V: 5 }, 'GB1', 'bat'],
            ['ground', -26, 20, 0, {}, '', 'gnd'],
            ['cpu8', 0, 0, 0, { code: codeA }, 'DD1', 'dd1'],
            ['cpu8', 26, 0, 0, { code: codeB }, 'DD2', 'dd2'],
            ['led', 2, 16, 2, { color: 'yellow' }, 'HL1', 'hl1'],
            ['resistor', 16, 16, 0, { R: 220 }, 'R4', 'r4'],
            ['button', -10, 26, 1, {}, 'SB1', 'sb1'],
            ['button', 2, 26, 1, {}, 'SB2', 'sb2'],
            ['button', 14, 26, 1, {}, 'SB3', 'sb3'],
            ['resistor', -10, 34, 1, { R: 10000 }, 'R1', 'r1'],
            ['resistor', 2, 34, 1, { R: 10000 }, 'R2', 'r2'],
            ['resistor', 14, 34, 1, { R: 10000 }, 'R3', 'r3']
          ],
          links: [
            ['bat', 0, 'dd1', 0], ['bat', 0, 'dd2', 0], ['bat', 1, 'gnd', 0],
            ['dd1', 3, 'gnd', 0], ['dd2', 3, 'gnd', 0],
            // кнопка тянет вход к питанию, резистор — к общему проводу
            ['sb1', 0, 'bat', 0], ['sb1', 1, 'dd1', 4],
            ['r1', 0, 'sb1', 1], ['r1', 1, 'gnd', 0],
            ['sb2', 0, 'bat', 0], ['sb2', 1, 'dd1', 5],
            ['r2', 0, 'sb2', 1], ['r2', 1, 'gnd', 0],
            ['sb3', 0, 'bat', 0], ['sb3', 1, 'dd1', 6],
            ['r3', 0, 'sb3', 1], ['r3', 1, 'gnd', 0],
            // единственный провод между процессорами
            ['dd1', 7, 'dd2', 4],
            // светодиод над кнопкой SB2
            ['dd2', 5, 'r4', 1], ['r4', 0, 'hl1', 0], ['hl1', 1, 'gnd', 0]
          ]
        });
      }
    },
    {
      id: 'shift595',
      name: 'Восемь огней по трём проводам',
      hint: 'У процессора всего четыре линии, а светодиодов восемь. Сдвиговый регистр 74HC595 решает это: процессор вдвигает в него байт по одному биту (ДАН и СДВ), а по сигналу ЗАЩ весь байт разом выходит на Q0…Q7.',
      make: function () {
        var code = [
          '        LDI 0b0111',
          '        DIR                 ; P0 — ДАН, P1 — СДВ, P2 — ЗАЩ',
          '        LDI 1',
          '        ST 0xF0             ; бегущий огонёк',
          '',
          'цикл:   LD 0xF0',
          '        ST 0xF1',
          '        CALL посыл',
          '        CALL пауза',
          '        LD 0xF0',
          '        SHL                 ; сдвинули на разряд',
          '        JNZ дальше',
          '        LDI 1               ; дошли до края — начать сначала',
          'дальше: ST 0xF0',
          '        JMP цикл',
          '',
          '; выдаёт байт из 0xF1 старшим битом вперёд и защёлкивает его',
          'посыл:  LDI 8',
          '        ST 0xF2',
          'бит:    LD 0xF1',
          '        SHL                 ; старший бит ушёл в перенос',
          '        ST 0xF1',
          '        JC един',
          '        LDI 0',
          '        JMP выдать',
          'един:   LDI 1',
          'выдать: OUT                 ; выставили бит',
          '        ORI 0b0010',
          '        OUT                 ; фронт такта — регистр его принял',
          '        ANDI 0b1101',
          '        OUT',
          '        LD 0xF2',
          '        DEC',
          '        ST 0xF2',
          '        JNZ бит',
          '        LDI 0b0100',
          '        OUT                 ; фронт защёлки — байт вышел на Q0…Q7',
          '        LDI 0',
          '        OUT',
          '        RET',
          '',
          'пауза:  LDI 25',
          '        ST 0xF3',
          'внеш:   LDI 25',
          '        ST 0xF4',
          'внутр:  LD 0xF4',
          '        DEC',
          '        ST 0xF4',
          '        JNZ внутр',
          '        LD 0xF3',
          '        DEC',
          '        ST 0xF3',
          '        JNZ внеш',
          '        RET'
        ].join('\n');
        var parts = [
          ['battery', -36, 0, 1, { V: 5 }, 'GB1', 'bat'],
          ['ground', -36, 20, 0, {}, '', 'gnd'],
          ['ground', 44, 22, 0, {}, '', 'gnd2'],
          ['cpu8', -18, 0, 0, { code: code, freq: 4000 }, 'DD1', 'cpu'],
          ['sr595', 4, 0, 2, {}, 'DD2', 'sr']
        ];
        var links = [
          ['bat', 0, 'cpu', 0], ['cpu', 3, 'gnd', 0], ['bat', 1, 'gnd', 0],
          ['bat', 0, 'sr', 15], ['sr', 7, 'gnd2', 0],
          ['sr', 9, 'sr', 15],               // /СБР к питанию — сброса не нужно
          ['sr', 12, 'gnd2', 0],             // /РАЗР к земле — выходы включены
          ['cpu', 4, 'sr', 13],              // P0 → ДАН
          ['cpu', 5, 'sr', 10],              // P1 → СДВ
          ['cpu', 6, 'sr', 11]               // P2 → ЗАЩ
        ];
        var out = [14, 0, 1, 2, 3, 4, 5, 6];  // Q0…Q7 — индексы выводов
        var rows = [14, 10, 6, 2, -2, -6, -10, -14];
        var hues = ['red', 'yellow', 'green', 'blue', 'red', 'yellow', 'green', 'blue'];
        for (var i = 0; i < 8; i++) {
          parts.push(['resistor', 20, rows[i], 0, { R: 330 }, 'R' + (i + 1), 'r' + i]);
          parts.push(['led', 32, rows[i], 0, { color: hues[i] }, 'HL' + (i + 1), 'd' + i]);
          links.push(['sr', out[i], 'r' + i, 0]);
          links.push(['r' + i, 1, 'd' + i, 0]);
          links.push(['d' + i, 1, 'gnd2', 0]);
        }
        return build({ parts: parts, links: links });
      }
    },
    {
      id: 'max7219',
      name: 'Счётчик на цифровом индикаторе',
      hint: 'Драйвер MAX7219 сам перебирает разряды и держит цифры, поэтому процессору хватает трёх линий: ДАН, ТАКТ и ЗАГР. Ток сегментов задаёт резистор R1 между V+ и ISET — без него индикатор не загорится. Счёт идёт от 0000 и дальше.',
      make: function () {
        var code = [
          '; Счётчик 0000…9999 на индикаторе через MAX7219.',
          '; P0 — ДАН, P1 — ТАКТ, P2 — ЗАГР.',
          '',
          '        LDI 0b0111',
          '        DIR',
          '        LDI 0x0C',
          '        ST 0xF2',
          '        LDI 0x01',
          '        ST 0xF3',
          '        CALL слово          ; выйти из режима покоя',
          '        LDI 0x09',
          '        ST 0xF2',
          '        LDI 0xFF',
          '        ST 0xF3',
          '        CALL слово          ; дешифратор на всех разрядах',
          '        LDI 0x0B',
          '        ST 0xF2',
          '        LDI 0x03',
          '        ST 0xF3',
          '        CALL слово          ; показывать четыре разряда',
          '        LDI 0x0A',
          '        ST 0xF2',
          '        LDI 0x0F',
          '        ST 0xF3',
          '        CALL слово          ; полная яркость',
          '        LDI 0',
          '        ST 0xF6',
          '        ST 0xF7',
          '        ST 0xF8',
          '        ST 0xF9',
          '',
          'цикл:   CALL показать',
          '        CALL пауза',
          '        CALL прибавить',
          '        JMP цикл',
          '',
          'показать:',
          '        LDI 1',
          '        ST 0xF2',
          '        LD 0xF6',
          '        ST 0xF3',
          '        CALL слово',
          '        LDI 2',
          '        ST 0xF2',
          '        LD 0xF7',
          '        ST 0xF3',
          '        CALL слово',
          '        LDI 3',
          '        ST 0xF2',
          '        LD 0xF8',
          '        ST 0xF3',
          '        CALL слово',
          '        LDI 4',
          '        ST 0xF2',
          '        LD 0xF9',
          '        ST 0xF3',
          '        CALL слово',
          '        RET',
          '',
          'прибавить:',
          '        LD 0xF9',
          '        INC',
          '        CMPI 10',
          '        JNZ гот3',
          '        LDI 0',
          '        ST 0xF9',
          '        LD 0xF8',
          '        INC',
          '        CMPI 10',
          '        JNZ гот2',
          '        LDI 0',
          '        ST 0xF8',
          '        LD 0xF7',
          '        INC',
          '        CMPI 10',
          '        JNZ гот1',
          '        LDI 0',
          '        ST 0xF7',
          '        LD 0xF6',
          '        INC',
          '        CMPI 10',
          '        JNZ гот0',
          '        LDI 0',
          'гот0:   ST 0xF6',
          '        RET',
          'гот1:   ST 0xF7',
          '        RET',
          'гот2:   ST 0xF8',
          '        RET',
          'гот3:   ST 0xF9',
          '        RET',
          '',
          '; посылка 16 бит: старший байт 0xF2, младший 0xF3',
          'слово:  LDI 0',
          '        OUT                 ; ЗАГР вниз',
          '        LD 0xF2',
          '        ST 0xF0',
          '        CALL посыл',
          '        LD 0xF3',
          '        ST 0xF0',
          '        CALL посыл',
          '        LDI 0b0100',
          '        OUT                 ; фронт ЗАГР — слово принято',
          '        LDI 0',
          '        OUT',
          '        RET',
          '',
          '; побайтная выдача, старшим битом вперёд',
          'посыл:  LDI 8',
          '        ST 0xF1',
          'бит:    LD 0xF0',
          '        SHL',
          '        ST 0xF0',
          '        JC един',
          '        LDI 0',
          '        JMP выдать',
          'един:   LDI 1',
          'выдать: OUT',
          '        ORI 0b0010',
          '        OUT                 ; фронт такта',
          '        ANDI 0b1101',
          '        OUT',
          '        LD 0xF1',
          '        DEC',
          '        ST 0xF1',
          '        JNZ бит',
          '        RET',
          '',
          'пауза:  LDI 25',
          '        ST 0xF4',
          'внеш:   LDI 25',
          '        ST 0xF5',
          'внутр:  LD 0xF5',
          '        DEC',
          '        ST 0xF5',
          '        JNZ внутр',
          '        LD 0xF4',
          '        DEC',
          '        ST 0xF4',
          '        JNZ внеш',
          '        RET'
        ].join('\n');
        var parts = [
          ['battery', -44, 0, 1, { V: 5 }, 'GB1', 'bat'],
          ['ground', -44, 22, 0, {}, '', 'gnd'],
          ['cpu8', -28, 0, 0, { code: code, freq: 3000 }, 'DD1', 'cpu'],
          ['max7219', 0, 0, 0, {}, 'DD2', 'drv'],
          ['seg7x4', 40, 0, 0, { color: 'red' }, 'HG1', 'disp'],
          ['resistor', 10, -3, 1, { R: 10000 }, 'R1', 'rset']
        ];
        var links = [
          ['bat', 0, 'cpu', 0], ['cpu', 3, 'gnd', 0], ['bat', 1, 'gnd', 0],
          ['bat', 0, 'drv', 23], ['drv', 3, 'gnd', 0],
          ['drv', 23, 'rset', 0], ['rset', 1, 'drv', 15],   // задатчик тока
          ['cpu', 4, 'drv', 0],                              // P0 → ДАН
          ['cpu', 5, 'drv', 12],                             // P1 → ТАКТ
          ['cpu', 6, 'drv', 11]                              // P2 → ЗАГР
        ];
        var seg = EC.MX.SEG, s4 = EC.S4_SEG;
        EC.SEG_ORDER.forEach(function (k) { links.push(['drv', seg[k], 'disp', s4[k]]); });
        for (var d = 0; d < 4; d++) links.push(['drv', EC.MX.DIG[d], 'disp', EC.S4_DIG[d]]);
        return build({ parts: parts, links: links });
      }
    },
    {
      id: 'chaser4017',
      name: 'Бегущие огни без процессора',
      hint: 'Таймер 555 отсчитывает такты, счётчик CD4017 переводит высокий уровень с одного выхода на следующий — и огонёк бежит по десяти светодиодам. Ни одной строчки программы: так это делали задолго до микроконтроллеров. Скорость меняется резисторами R1 и R2.',
      make: function () {
        var parts = [
          ['battery', -34, -2, 1, { V: 9 }, 'GB1', 'bat'],
          ['ground', -34, 16, 0, {}, '', 'gnd'],
          ['ne555', -16, 0, 0, {}, 'DD1', 't'],
          ['resistor', -2, -12, 1, { R: 47000 }, 'R1', 'ra'],
          ['resistor', -2, -4, 1, { R: 47000 }, 'R2', 'rb'],
          ['capacitor_pol', -2, 6, 1, { C: 2.2e-6 }, 'C1', 'c1'],
          ['capacitor', -8, 14, 1, { C: 10e-9 }, 'C2', 'c2'],
          ['cd4017', 16, 0, 0, {}, 'DD2', 'cd'],
          ['ground', 56, 30, 0, {}, '', 'gnd2']
        ];
        var links = [
          // питание и обвязка таймера
          ['bat', 0, 't', 7], ['bat', 1, 'gnd', 0], ['t', 0, 'gnd', 0],
          ['bat', 0, 't', 3], ['bat', 0, 'ra', 0],
          ['ra', 1, 't', 6], ['ra', 1, 'rb', 0],
          ['rb', 1, 't', 5], ['t', 5, 't', 1],
          ['t', 5, 'c1', 0], ['c1', 1, 'gnd', 0],
          ['t', 4, 'c2', 0], ['c2', 1, 'gnd', 0],
          // счётчик: питание, общий провод и такт от таймера
          ['bat', 0, 'cd', 15], ['cd', 7, 'gnd2', 0],
          ['t', 2, 'cd', 13]
        ];
        var q = [2, 1, 3, 6, 9, 0, 4, 5, 8, 10];   // Q0…Q9 — индексы выводов
        var hues = ['red', 'yellow', 'green', 'blue', 'white'];
        for (var i = 0; i < 10; i++) {
          var y = -20 + i * 5;
          parts.push(['resistor', 32, y, 0, { R: 1000 }, 'R' + (i + 3), 'r' + i]);
          parts.push(['led', 44, y, 0, { color: hues[i % 5] }, 'HL' + (i + 1), 'd' + i]);
          links.push(['cd', q[i], 'r' + i, 0]);
          links.push(['r' + i, 1, 'd' + i, 0]);
          links.push(['d' + i, 1, 'gnd2', 0]);
        }
        return build({ parts: parts, links: links });
      }
    },
    {
      id: 'matrix',
      name: 'Точка бежит по матрице 8×8',
      hint: 'Шестьдесят четыре светодиода и всего три провода от процессора: драйвер MAX7219 перебирает ряды сам. Столбцы подключены так, что старший бит байта — это левая точка ряда, поэтому байтами можно рисовать картинки. Программа лежит в свойствах процессора.',
      make: function () {
        var code = [
          '; Точка бежит по матрице 8×8 через драйвер MAX7219.',
          '; P0 — ДАН, P1 — ТАКТ, P2 — ЗАГР.',
          '',
          '        LDI 0b0111',
          '        DIR',
          '        LDI 0x0C',
          '        ST 0xF2',
          '        LDI 0x01',
          '        ST 0xF3',
          '        CALL слово          ; выйти из режима покоя',
          '        LDI 0x0B',
          '        ST 0xF2',
          '        LDI 0x07',
          '        ST 0xF3',
          '        CALL слово          ; все восемь рядов',
          '        LDI 0x09',
          '        ST 0xF2',
          '        LDI 0',
          '        ST 0xF3',
          '        CALL слово          ; без дешифратора: биты прямо на столбцы',
          '        LDI 0x0A',
          '        ST 0xF2',
          '        LDI 0x0F',
          '        ST 0xF3',
          '        CALL слово          ; полная яркость',
          '        LDI 1',
          '        ST 0xF6             ; номер ряда, 1…8',
          '        LDI 0x80',
          '        ST 0xF7             ; маска точки в ряду',
          '',
          'цикл:   LD 0xF6',
          '        ST 0xF2',
          '        LDI 0',
          '        ST 0xF3',
          '        CALL слово          ; гасим ряд, где точка была',
          '        LD 0xF7',
          '        SHR',
          '        JNZ тотже',
          '        LDI 0x80',
          '        ST 0xF7             ; ряд кончился — точка слева и строкой ниже',
          '        LD 0xF6',
          '        INC',
          '        CMPI 9',
          '        JNZ рядок',
          '        LDI 1',
          'рядок:  ST 0xF6',
          '        JMP рисуем',
          'тотже:  ST 0xF7',
          'рисуем: LD 0xF6',
          '        ST 0xF2',
          '        LD 0xF7',
          '        ST 0xF3',
          '        CALL слово',
          '        CALL пауза',
          '        JMP цикл',
          '',
          '; посылка 16 бит: старший байт 0xF2, младший 0xF3',
          'слово:  LDI 0',
          '        OUT                 ; ЗАГР вниз',
          '        LD 0xF2',
          '        ST 0xF0',
          '        CALL посыл',
          '        LD 0xF3',
          '        ST 0xF0',
          '        CALL посыл',
          '        LDI 0b0100',
          '        OUT                 ; фронт ЗАГР — слово принято',
          '        LDI 0',
          '        OUT',
          '        RET',
          '',
          '; побайтная выдача, старшим битом вперёд',
          'посыл:  LDI 8',
          '        ST 0xF1',
          'бит:    LD 0xF0',
          '        SHL',
          '        ST 0xF0',
          '        JC един',
          '        LDI 0',
          '        JMP выдать',
          'един:   LDI 1',
          'выдать: OUT',
          '        ORI 0b0010',
          '        OUT                 ; фронт такта',
          '        ANDI 0b1101',
          '        OUT',
          '        LD 0xF1',
          '        DEC',
          '        ST 0xF1',
          '        JNZ бит',
          '        RET',
          '',
          'пауза:  LDI 12',
          '        ST 0xF4',
          'внеш:   LDI 12',
          '        ST 0xF5',
          'внутр:  LD 0xF5',
          '        DEC',
          '        ST 0xF5',
          '        JNZ внутр',
          '        LD 0xF4',
          '        DEC',
          '        ST 0xF4',
          '        JNZ внеш',
          '        RET'
        ].join('\n');
        var parts = [
          ['battery', -48, 0, 1, { V: 5 }, 'GB1', 'bat'],
          ['ground', -48, 22, 0, {}, '', 'gnd'],
          ['cpu8', -32, 0, 0, { code: code, freq: 3000 }, 'DD1', 'cpu'],
          ['max7219', -6, 0, 0, {}, 'DD2', 'drv'],
          ['matrix8', 40, 0, 0, { color: 'red' }, 'HG1', 'm'],
          ['resistor', 4, -3, 1, { R: 22000 }, 'R1', 'rset']
        ];
        var links = [
          ['bat', 0, 'cpu', 0], ['cpu', 3, 'gnd', 0], ['bat', 1, 'gnd', 0],
          ['bat', 0, 'drv', 23], ['drv', 3, 'gnd', 0],
          ['drv', 23, 'rset', 0], ['rset', 1, 'drv', 15],
          ['cpu', 4, 'drv', 0],                              // P0 → ДАН
          ['cpu', 5, 'drv', 12],                             // P1 → ТАКТ
          ['cpu', 6, 'drv', 11]                              // P2 → ЗАГР
        ];
        // столбцы подключены так, чтобы старший бит байта светил слева
        var colSeg = ['dp', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];
        for (var k = 0; k < 8; k++) links.push(['drv', EC.MX.SEG[colSeg[k]], 'm', EC.M8_COL[k]]);
        for (var d = 0; d < 8; d++) links.push(['drv', EC.MX.DIG[d], 'm', EC.M8_ROW[d]]);
        return build({ parts: parts, links: links });
      }
    },
    {
      id: 'keypad',
      name: 'Клавиатура 4×4 и плата EC-32',
      hint: 'У платы EC-32 шестнадцать линий, и здесь заняты все: P0…P6 светят сегментами индикатора, P8…P11 по очереди подают единицу на ряды клавиатуры, P12…P15 слушают столбцы. Нажмите любую кнопку — на индикаторе появится её знак: S1 — это 0, S16 — это F. Начертания знаков лежат в таблице, а программа сама правит адрес у команды LD, чтобы взять из неё нужный байт.',
      make: function () {
        var code = [
          '; Клавиатура 4×4 на плате EC-32.',
          '; P0…P6 — сегменты, P8…P11 — ряды, P12…P15 — столбцы.',
          '',
          '        LDI 0b01111111',
          '        DIR             ; P0…P6 — выходы на сегменты',
          '        LDI 0b00001111',
          '        DIRB            ; P8…P11 — выходы, P12…P15 — входы',
          '',
          'цикл:   LDI 1',
          '        ST 0xF0         ; маска ряда: единица бежит по P8…P11',
          '        LDI 0',
          '        ST 0xF1         ; номер кнопки',
          '',
          'опрос:  LD 0xF0',
          '        OUTB            ; подать единицу на один ряд',
          '        INB             ; и посмотреть на столбцы',
          '        ANDI 0b11110000',
          '        JNZ нашли       ; какой-то столбец отозвался',
          '        LD 0xF1',
          '        ADDI 4          ; следующий ряд — это ещё четыре кнопки',
          '        ST 0xF1',
          '        LD 0xF0',
          '        SHL',
          '        ANDI 0b00001111',
          '        ST 0xF0',
          '        JNZ опрос       ; ряды ещё не кончились',
          '        LDI 0',
          '        OUT             ; ничего не нажато — индикатор погашен',
          '        JMP цикл',
          '',
          '; в старшей тетраде — отозвавшиеся столбцы, ищем младший',
          'нашли:  SHR',
          '        SHR',
          '        SHR',
          '        SHR',
          '        ST 0xF2',
          'поиск:  LD 0xF2',
          '        SHR',
          '        ST 0xF2',
          '        JC готово',
          '        LD 0xF1',
          '        INC',
          '        ST 0xF1',
          '        JMP поиск',
          '',
          '; номер знаем — берём начертание из таблицы',
          'готово: LD 0xF1',
          '        ADDI цифры',
          '        ST взять+1      ; правим адрес у следующей команды',
          'взять:  LD цифры',
          '        OUT',
          '        JMP цикл',
          '',
          '; начертания: 0…9, затем A b C d E F',
          'цифры:  DB 0x3F 0x06 0x5B 0x4F',
          '        DB 0x66 0x6D 0x7D 0x07',
          '        DB 0x7F 0x6F 0x77 0x7C',
          '        DB 0x39 0x5E 0x79 0x71'
        ].join('\n');
        var parts = [
          ['battery', -54, 0, 1, { V: 5 }, 'GB1', 'bat'],
          ['ground', -54, 24, 0, {}, '', 'gnd'],
          ['seg7', -32, 0, 0, { color: 'red' }, 'HG1', 'disp'],
          ['board32', 8, 0, 0, { code: code, freq: 6000 }, 'DD1', 'brd'],
          ['keypad16', 44, 0, 0, {}, 'SB1', 'kp']
        ];
        var links = [
          ['bat', 0, 'brd', 0], ['brd', 1, 'gnd', 0], ['bat', 1, 'gnd', 0],
          ['disp', 2, 'gnd', 0]                    // общий катод индикатора
        ];
        // семь сегментов через резисторы на P0…P6
        var segs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        segs.forEach(function (nm, k) {
          var key = 'r' + k;
          parts.push(['resistor', -14, -12 + k * 4, 0, { R: 220 }, 'R' + (k + 1), key]);
          links.push([key, 0, 'disp', EC.S1_SEG[nm]]);
          links.push(['brd', 3 + k, key, 1]);      // P0…P6 — выводы 3…9 платы
        });
        // клавиатура: ряды на P8…P11, столбцы на P12…P15
        for (var r = 0; r < 4; r++) links.push(['brd', 11 + r, 'kp', EC.KP_ROW[r]]);
        for (var q = 0; q < 4; q++) links.push(['brd', 15 + q, 'kp', EC.KP_COL[q]]);
        return build({ parts: parts, links: links });
      }
    }
  ];

  EC.examples = EXAMPLES;
})(window);
