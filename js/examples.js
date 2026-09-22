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
      for (var k in props) c.props[k] = props[k];
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
    }
  ];

  EC.examples = EXAMPLES;
})(window);
