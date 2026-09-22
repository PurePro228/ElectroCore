/* Проверка физической достоверности движка ElectroCore.
 * Запуск:  node test/engine.test.js
 */
'use strict';
const path = require('path');
global.window = {};
['util', 'solver', 'components', 'circuit'].forEach(function (m) {
  require(path.join(__dirname, '..', 'js', m + '.js'));
});
const EC = global.window.EC;

let passed = 0, failed = 0;
function check(name, actual, expected, tol) {
  const ok = Math.abs(actual - expected) <= (tol === undefined ? Math.abs(expected) * 0.02 + 1e-9 : tol);
  if (ok) { passed++; console.log('  ✓ ' + name + '  = ' + actual.toPrecision(5)); }
  else { failed++; console.log('  ✗ ' + name + '  получено ' + actual.toPrecision(6) + ', ожидалось ' + Number(expected).toPrecision(6)); }
}
function test(name, fn) { console.log('\n' + name); fn(); }

/** Прогоняет схему до момента t с шагом dt. */
function run(ct, t, dt) {
  dt = dt || 1e-5;
  const n = Math.ceil(t / dt);
  for (let i = 0; i < n; i++) if (!ct.step(dt)) throw new Error(ct.error || 'сбой расчёта');
  return ct;
}

/* ------------------------------------------------------------------ */

test('Закон Ома: 9 В на резисторе 1 кОм', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 9; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 1000;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('ток через резистор', Math.abs(r.i), 9e-3);
  check('напряжение на резисторе', Math.abs(r.v), 9);
  check('мощность', Math.abs(r.p), 0.081);
  check('ток батареи', Math.abs(bat.i), 9e-3);
});

test('Последовательное и параллельное соединение', function () {
  // 12 В, R1=1k последовательно с параллельными R2=2k и R3=2k (=1k) -> I = 6 мА
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 1e-6;
  const r1 = ct.add('resistor', 6, 0); r1.props.R = 1000;
  const r2 = ct.add('resistor', 12, 0); r2.props.R = 2000;
  const r3 = ct.add('resistor', 12, 4); r3.props.R = 2000;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r1.id, 0);
  ct.connect(r1.id, 1, r2.id, 0);
  ct.connect(r1.id, 1, r3.id, 0);
  ct.connect(r2.id, 1, gnd.id, 0);
  ct.connect(r3.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('общий ток', Math.abs(r1.i), 6e-3);
  check('падение на R1', Math.abs(r1.v), 6);
  check('ток через R2', Math.abs(r2.i), 3e-3);
  check('первый закон Кирхгофа', Math.abs(r1.i) - Math.abs(r2.i) - Math.abs(r3.i), 0, 1e-9);
});

test('Зарядка конденсатора (RC-цепь)', function () {
  // R=10k, C=10мкФ -> tau = 0.1 c
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 10; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 10000;
  const cap = ct.add('capacitor', 12, 0); cap.props.C = 10e-6;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, cap.id, 0);
  ct.connect(cap.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 0.1, 1e-5);
  check('U(τ) = 63,2 % от 10 В', cap.v, 6.321, 0.03);
  run(ct, 0.4, 1e-5);
  check('U(5τ) ≈ 99,3 %', cap.v, 9.933, 0.03);
  check('энергия ½CU²', cap.energy, 0.5 * 10e-6 * cap.v * cap.v, 1e-9);
});

test('Колебательный контур LC', function () {
  // L=1мГн, C=1мкФ -> f = 1/(2π√LC) ≈ 5033 Гц
  const ct = new EC.Circuit();
  const L = ct.add('inductor', 0, 0); L.props.L = 1e-3; L.props.Rs = 1e-6;
  const cap = ct.add('capacitor', 6, 0); cap.props.C = 1e-6; cap.props.v0 = 5;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(L.id, 0, cap.id, 0);
  ct.connect(L.id, 1, gnd.id, 0);
  ct.connect(cap.id, 1, gnd.id, 0);
  ct.reset();                          // применяем начальное напряжение на C
  // ищем период по переходам через ноль
  const dt = 1e-7;
  let prev = cap.v, first = null, last = null, crossings = 0;
  for (let i = 0; i < 400000; i++) {
    ct.step(dt);
    if (prev > 0 && cap.v <= 0) {
      if (first === null) first = ct.time; else { last = ct.time; crossings++; }
    }
    prev = cap.v;
  }
  const period = (last - first) / crossings;
  check('резонансная частота', 1 / period, 1 / (2 * Math.PI * Math.sqrt(1e-3 * 1e-6)), 60);
  check('амплитуда сохраняется', Math.abs(cap.v) <= 5.05 ? 1 : 0, 1, 0);
});

test('Диод: прямое падение и выпрямление', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 5; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 1000;
  const d = ct.add('diode', 12, 0);
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, d.id, 0);
  ct.connect(d.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  const vd = d.v;
  check('прямое падение 0,6…0,9 В', vd > 0.6 && vd < 0.95 ? 1 : 0, 1, 0);
  check('ток = (5 − Uд)/R', d.i, (5 - vd) / 1000, 2e-5);
  // обратное включение
  bat.props.V = -5;
  ct.reset(); run(ct, 1e-3);
  check('обратный ток пренебрежимо мал', Math.abs(d.i) < 1e-8 ? 1 : 0, 1, 0);
});

test('Светодиод с токоограничивающим резистором', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 5; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 150;
  const led = ct.add('led', 12, 0);
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, led.id, 0);
  ct.connect(led.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('падение на светодиоде ≈ 1,9 В', led.v, 1.9, 0.25);
  check('ток ≈ (5 − 1,9)/150', led.i, (5 - led.v) / 150, 1e-4);
  check('свечение есть', led.glow > 0.5 ? 1 : 0, 1, 0);
});

test('Стабилитрон 5,1 В', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 470;
  const z = ct.add('zener', 12, 0); z.props.Vz = 5.1;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, z.id, 1);       // катод к плюсу
  ct.connect(z.id, 0, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('напряжение стабилизации', -z.v, 5.1, 0.35);
});

test('Транзистор NPN: усиление по току', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 10; bat.props.Rint = 1e-6;
  const rb = ct.add('resistor', 6, 4); rb.props.R = 470000;   // Ib ≈ 20 мкА
  const rc = ct.add('resistor', 6, 0); rc.props.R = 1000;
  const q = ct.add('npn', 12, 0); q.props.Bf = 100;
  const gnd = ct.add('ground', 0, 8);
  ct.connect(bat.id, 0, rb.id, 0);
  ct.connect(bat.id, 0, rc.id, 0);
  ct.connect(rb.id, 1, q.id, 0);
  ct.connect(rc.id, 1, q.id, 1);
  ct.connect(q.id, 2, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('ток базы ≈ (10 − 0,7)/470k', q.ib, 19.8e-6, 2e-6);
  check('β = Iк/Iб ≈ 100', q.ic / q.ib, 100, 12);
  check('Iэ = −(Iк + Iб)', q.ie + q.ic + q.ib, 0, 1e-12);
  check('режим активный', q.mode === 'активный' ? 1 : 0, 1, 0);
});

test('Транзистор в насыщении (ключ)', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 5; bat.props.Rint = 1e-6;
  const rb = ct.add('resistor', 6, 4); rb.props.R = 4700;
  const rc = ct.add('resistor', 6, 0); rc.props.R = 220;
  const q = ct.add('npn', 12, 0); q.props.Bf = 150;
  const gnd = ct.add('ground', 0, 8);
  ct.connect(bat.id, 0, rb.id, 0);
  ct.connect(bat.id, 0, rc.id, 0);
  ct.connect(rb.id, 1, q.id, 0);
  ct.connect(rc.id, 1, q.id, 1);
  ct.connect(q.id, 2, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('Uкэ нас. < 0,3 В', q.vce < 0.3 && q.vce > 0 ? 1 : 0, 1, 0);
  check('режим насыщения', q.mode === 'насыщение' ? 1 : 0, 1, 0);
});

test('Неинвертирующий усилитель на ОУ', function () {
  // Кu = 1 + Rf/Rg = 1 + 10k/10k = 2
  const ct = new EC.Circuit();
  const src = ct.add('vsource', 0, 0);
  src.props.wave = 'dc'; src.props.amp = 1; src.props.Rint = 1e-6;
  const op = ct.add('opamp', 10, 0);
  const rf = ct.add('resistor', 10, 8); rf.props.R = 10000;
  const rg = ct.add('resistor', 2, 8); rg.props.R = 10000;
  const gnd = ct.add('ground', 0, 12);
  ct.connect(src.id, 0, op.id, 0);
  ct.connect(src.id, 1, gnd.id, 0);
  ct.connect(op.id, 2, rf.id, 1);
  ct.connect(rf.id, 0, op.id, 1);
  ct.connect(op.id, 1, rg.id, 1);
  ct.connect(rg.id, 0, gnd.id, 0);
  run(ct, 1e-3);
  check('Uвых = 2·Uвх', op.vout, 2.0, 0.02);
  src.props.amp = 3;
  run(ct, 1e-3);
  check('Uвых = 6 В', op.vout, 6.0, 0.05);
  src.props.amp = 10;      // потребовалось бы 20 В — сработает ограничение
  run(ct, 1e-3);
  check('ограничение питанием +12 В', op.vout, 12, 0.3);
});

test('Переменный ток: действующее значение и мощность', function () {
  // 10 В амплитуды, 50 Гц на 100 Ом -> Iд = 7,071/100 = 70,7 мА, P = 0,5 Вт
  const ct = new EC.Circuit();
  const src = ct.add('vsource', 0, 0);
  src.props.wave = 'sine'; src.props.amp = 10; src.props.freq = 50; src.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 100;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(src.id, 0, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(src.id, 1, gnd.id, 0);
  const dt = 1e-6;
  let sum = 0, sumP = 0, n = 0;
  for (let i = 0; i < 40000; i++) { ct.step(dt); sum += r.v * r.v; sumP += r.p; n++; }
  check('действующее напряжение', Math.sqrt(sum / n), 10 / Math.SQRT2, 0.05);
  check('средняя мощность U²д/R', sumP / n, 0.5, 0.005);
});

test('Ёмкостное сопротивление', function () {
  // Xc = 1/(2πfC); C=1мкФ, f=1000 Гц -> 159,2 Ом
  const ct = new EC.Circuit();
  const src = ct.add('vsource', 0, 0);
  src.props.wave = 'sine'; src.props.amp = 5; src.props.freq = 1000; src.props.Rint = 1e-6;
  const cap = ct.add('capacitor', 6, 0); cap.props.C = 1e-6;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(src.id, 0, cap.id, 0);
  ct.connect(cap.id, 1, gnd.id, 0);
  ct.connect(src.id, 1, gnd.id, 0);
  const dt = 1e-7;
  for (let i = 0; i < 100000; i++) ct.step(dt);    // переходный процесс
  let peak = 0;
  for (let i = 0; i < 50000; i++) { ct.step(dt); peak = Math.max(peak, Math.abs(cap.i)); }
  check('Xc = Uм/Iм', 5 / peak, 1 / (2 * Math.PI * 1000 * 1e-6), 3);
});

test('Приборы: вольтметр, амперметр, ваттметр', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 1e-6;
  const w = ct.add('wattmeter', 6, 0);
  const a = ct.add('ammeter', 12, 0);
  const r = ct.add('resistor', 18, 0); r.props.R = 100;
  const v = ct.add('voltmeter', 18, 6);
  const gnd = ct.add('ground', 0, 8);
  ct.connect(bat.id, 0, w.id, 0);
  ct.connect(w.id, 1, a.id, 0);
  ct.connect(a.id, 1, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(v.id, 0, r.id, 0);
  ct.connect(v.id, 1, gnd.id, 0);
  ct.connect(w.id, 2, r.id, 0);
  ct.connect(w.id, 3, gnd.id, 0);
  run(ct, 0.3, 1e-4);
  check('вольтметр показывает 12 В', v.reading, 12, 0.02);
  check('амперметр показывает 120 мА', a.reading, 0.12, 0.001);
  check('ваттметр показывает 1,44 Вт', w.avg, 1.44, 0.02);
});

test('Потенциометр как делитель', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 10; bat.props.Rint = 1e-6;
  const p = ct.add('pot', 6, 0); p.props.R = 10000; p.props.pos = 0.25;
  const gnd = ct.add('ground', 0, 6);
  const v = ct.add('voltmeter', 12, 6);
  ct.connect(bat.id, 0, p.id, 0);
  ct.connect(p.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(v.id, 0, p.id, 2);
  ct.connect(v.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('движок на 25 % → 7,5 В', v.reading, 7.5, 0.05);
  p.props.pos = 0.8;
  run(ct, 1e-3);
  check('движок на 80 % → 2 В', v.reading, 2.0, 0.05);
});

test('Выключатель и лампа', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 0.01;
  const sw = ct.add('switch', 6, 0);
  const lamp = ct.add('lamp', 12, 0); lamp.props.Vn = 12; lamp.props.Pn = 3;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, sw.id, 0);
  ct.connect(sw.id, 1, lamp.id, 0);
  ct.connect(lamp.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 0.05, 1e-4);
  check('разомкнут — тока нет', Math.abs(lamp.i) < 1e-6 ? 1 : 0, 1, 0);
  sw.props.closed = true;
  run(ct, 2, 1e-4);
  check('мощность лампы ≈ 3 Вт', Math.abs(lamp.p), 3, 0.35);
  check('лампа светится', lamp.glow > 0.8 ? 1 : 0, 1, 0);
});

test('Ток в проводах (первый закон Кирхгофа)', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 6; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 8, 0); r.props.R = 200;
  const gnd = ct.add('ground', 0, 6);
  const w1 = ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  ct.refreshDisplay();
  check('ток в проводе = ток нагрузки', Math.abs(w1.current), 0.03, 1e-5);
});

test('Предохранитель перегорает при перегрузке', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 1e-6;
  const fu = ct.add('fuse', 6, 0); fu.props.In = 0.5;
  const r = ct.add('resistor', 12, 0); r.props.R = 100;   // 120 мА — норма
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, fu.id, 0);
  ct.connect(fu.id, 1, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1, 1e-4);
  check('в норме не перегорает', fu.state.blown ? 0 : 1, 1, 0);
  check('ток проходит', Math.abs(fu.i), 0.12, 0.002);
  r.props.R = 5;                                           // 2,4 А — перегрузка
  run(ct, 1, 1e-4);
  check('перегорел при перегрузке', fu.state.blown ? 1 : 0, 1, 0);
  check('цепь разорвана', Math.abs(fu.i) < 1e-6 ? 1 : 0, 1, 0);
});

test('Реле: срабатывание и коммутация нагрузки', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 1e-6;
  const sw = ct.add('switch', 6, -6);
  const k = ct.add('relay', 14, 0); k.props.Rcoil = 200; k.props.Ion = 0.03;
  const lamp = ct.add('lamp', 24, 0); lamp.props.Vn = 12; lamp.props.Pn = 5;
  const gnd = ct.add('ground', 0, 10);
  ct.connect(bat.id, 0, sw.id, 0);
  ct.connect(sw.id, 1, k.id, 0);
  ct.connect(k.id, 1, gnd.id, 0);
  ct.connect(bat.id, 0, k.id, 2);
  ct.connect(k.id, 3, lamp.id, 0);
  ct.connect(lamp.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 0.2, 1e-4);
  check('катушка обесточена — лампа не горит', Math.abs(lamp.i) < 1e-6 ? 1 : 0, 1, 0);
  sw.props.closed = true;
  run(ct, 1.5, 1e-4);
  check('ток катушки 12 В / 200 Ω', Math.abs(k.i), 0.06, 0.002);
  check('реле сработало', k.state.on ? 1 : 0, 1, 0);
  check('лампа под нагрузкой ≈ 5 Вт', Math.abs(lamp.p), 5, 0.6);
});

test('Переключатель на два направления', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 9; bat.props.Rint = 1e-6;
  const sa = ct.add('spdt', 8, 0);
  const r1 = ct.add('resistor', 16, -6); r1.props.R = 100;
  const r2 = ct.add('resistor', 16, 6); r2.props.R = 900;
  const gnd = ct.add('ground', 0, 10);
  ct.connect(bat.id, 0, sa.id, 0);
  ct.connect(sa.id, 1, r1.id, 0);
  ct.connect(sa.id, 2, r2.id, 0);
  ct.connect(r1.id, 1, gnd.id, 0);
  ct.connect(r2.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('позиция 1: ток через R1', Math.abs(r1.i), 0.09, 0.001);
  check('позиция 1: R2 обесточен', Math.abs(r2.i) < 1e-7 ? 1 : 0, 1, 0);
  sa.props.b = true;
  run(ct, 1e-3);
  check('позиция 2: ток через R2', Math.abs(r2.i), 0.01, 0.0002);
  check('позиция 2: R1 обесточен', Math.abs(r1.i) < 1e-7 ? 1 : 0, 1, 0);
});

test('Полевой транзистор как ключ', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 1e-6;
  const gate = ct.add('vsource', 0, 10);
  gate.props.wave = 'dc'; gate.props.amp = 0; gate.props.Rint = 1e-6;
  const r = ct.add('resistor', 8, -6); r.props.R = 100;
  const q = ct.add('nmos', 16, 0); q.props.Vth = 2; q.props.K = 2;
  const gnd = ct.add('ground', 0, 16);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, q.id, 1);
  ct.connect(q.id, 2, gnd.id, 0);
  ct.connect(gate.id, 0, q.id, 0);
  ct.connect(gate.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('затвор 0 В — транзистор закрыт', Math.abs(q.i) < 1e-8 ? 1 : 0, 1, 0);
  gate.props.amp = 10;
  run(ct, 1e-3);
  check('затвор 10 В — открыт', q.i, 0.12, 0.005);
  check('Uси мало', q.v < 0.4 ? 1 : 0, 1, 0);
});

test('Транзистор PNP', function () {
  // общий эмиттер на плюсе: база через резистор на землю
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 9; bat.props.Rint = 1e-6;
  const rb = ct.add('resistor', 8, 6); rb.props.R = 470000;
  const rc = ct.add('resistor', 8, -6); rc.props.R = 1000;
  const q = ct.add('pnp', 16, 0); q.props.Bf = 100;
  const gnd = ct.add('ground', 0, 12);
  ct.connect(bat.id, 0, q.id, 2);        // эмиттер к плюсу
  ct.connect(q.id, 0, rb.id, 0);         // база через резистор на землю
  ct.connect(rb.id, 1, gnd.id, 0);
  ct.connect(q.id, 1, rc.id, 0);         // коллектор через нагрузку на землю
  ct.connect(rc.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('ток базы отрицателен (втекает из эмиттера)', q.ib < 0 ? 1 : 0, 1, 0);
  check('β = Iк/Iб ≈ 100', q.ic / q.ib, 100, 12);
  check('Iэ = −(Iк + Iб)', q.ie + q.ic + q.ib, 0, 1e-12);
});

test('Источник тока задаёт ток независимо от нагрузки', function () {
  const ct = new EC.Circuit();
  const src = ct.add('isource', 0, 0); src.props.I = 0.005;
  const r = ct.add('resistor', 10, 0); r.props.R = 470;
  const gnd = ct.add('ground', 0, 8);
  ct.connect(src.id, 1, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(src.id, 0, gnd.id, 0);
  run(ct, 1e-3);
  check('ток 5 мА', Math.abs(r.i), 0.005, 1e-6);
  check('U = I·R', Math.abs(r.v), 0.005 * 470, 0.01);
  r.props.R = 1200;
  run(ct, 1e-3);
  check('нагрузка выросла — ток тот же', Math.abs(r.i), 0.005, 1e-6);
  check('напряжение выросло', Math.abs(r.v), 6.0, 0.02);
});

test('Кнопка замыкает цепь только при нажатии', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 5; bat.props.Rint = 1e-6;
  const btn = ct.add('button', 8, 0);
  const r = ct.add('resistor', 16, 0); r.props.R = 470;
  const gnd = ct.add('ground', 0, 8);
  ct.connect(bat.id, 0, btn.id, 0);
  ct.connect(btn.id, 1, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('отпущена — тока нет', Math.abs(r.i) < 1e-8 ? 1 : 0, 1, 0);
  btn.pressed = true;
  run(ct, 1e-3);
  check('нажата — ток 5 В / 470 Ω', Math.abs(r.i), 5 / 470, 1e-5);
  btn.pressed = false;
  run(ct, 1e-3);
  check('снова отпущена — тока нет', Math.abs(r.i) < 1e-8 ? 1 : 0, 1, 0);
  btn.props.nc = true;
  run(ct, 1e-3);
  check('нормально замкнутая — ток идёт без нажатия', Math.abs(r.i), 5 / 470, 1e-5);
});

test('Сохранение и загрузка схемы', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 7.5;
  const r = ct.add('resistor', 8, 0); r.props.R = 330;
  const gnd = ct.add('ground', 0, 8);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  const i1 = r.i;
  const copy = EC.Circuit.fromJSON(JSON.parse(JSON.stringify(ct.toJSON())));
  run(copy, 1e-3);
  const r2 = copy.components[1];
  check('состав сохранён', copy.components.length, 3, 0);
  check('связи сохранены', copy.wires.length, 3, 0);
  check('расчёт совпадает', r2.i, i1, 1e-9);
});

test('Диод Шоттки: малое прямое падение', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 5; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 8, 0); r.props.R = 1000;
  const d = ct.add('schottky', 16, 0);
  const gnd = ct.add('ground', 0, 8);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, d.id, 0);
  ct.connect(d.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('падение 0,2…0,45 В', d.v > 0.2 && d.v < 0.45 ? 1 : 0, 1, 0);
  check('меньше, чем у кремниевого', d.v < 0.6 ? 1 : 0, 1, 0);
});

test('Диодный мост выпрямляет обе полуволны', function () {
  const ct = new EC.Circuit();
  const src = ct.add('vsource', 0, 0);
  src.props.wave = 'sine'; src.props.amp = 12; src.props.freq = 50; src.props.Rint = 0.1;
  const br = ct.add('bridge', 10, 0);
  const load = ct.add('resistor', 20, 0); load.props.R = 1000;
  const gnd = ct.add('ground', 0, 10);
  ct.connect(src.id, 0, br.id, 0);
  ct.connect(src.id, 1, br.id, 1);
  ct.connect(br.id, 2, load.id, 0);
  ct.connect(load.id, 1, br.id, 3);
  ct.connect(br.id, 3, gnd.id, 0);
  const dt = 2e-6;
  for (let i = 0; i < 20000; i++) ct.step(dt);       // переходный процесс
  let minV = 1e9, maxV = -1e9, negative = 0, n = 0;
  for (let i = 0; i < 20000; i++) {
    ct.step(dt);
    const v = load.v;
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    if (v < -0.05) negative++;
    n++;
  }
  check('на нагрузке нет отрицательного напряжения', negative, 0, 0);
  check('вершина ≈ 12 − 2·Uд', maxV, 10.6, 0.7);
  check('форма пульсирующая (провалы до нуля)', minV < 0.5 ? 1 : 0, 1, 0);
});

test('Трансформатор понижает напряжение', function () {
  const ct = new EC.Circuit();
  const src = ct.add('vsource', 0, 0);
  src.props.wave = 'sine'; src.props.amp = 12; src.props.freq = 50; src.props.Rint = 0.01;
  const tr = ct.add('transformer', 12, 0);
  tr.props.L1 = 20; tr.props.ratio = 2; tr.props.k = 0.999;
  tr.props.R1 = 0.5; tr.props.R2 = 0.2;
  const load = ct.add('resistor', 24, 0); load.props.R = 100;
  const gnd = ct.add('ground', 0, 10);
  ct.connect(src.id, 0, tr.id, 0);
  ct.connect(src.id, 1, tr.id, 1);
  ct.connect(tr.id, 1, gnd.id, 0);
  ct.connect(tr.id, 2, load.id, 0);
  ct.connect(load.id, 1, tr.id, 3);
  const dt = 2e-6;
  for (let i = 0; i < 60000; i++) ct.step(dt);
  let peak = 0, peakP = 0;
  for (let i = 0; i < 20000; i++) {
    ct.step(dt);
    peak = Math.max(peak, Math.abs(load.v));
    peakP = Math.max(peakP, Math.abs(tr.v));
  }
  check('на первичной ≈ 12 В', peakP, 12, 0.6);
  check('на вторичной ≈ 12/2', peak, 6, 0.7);
});

test('Стабилизатор напряжения', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 0.01;
  const reg = ct.add('regulator', 10, 0); reg.props.Vout = 5; reg.props.drop = 2;
  const load = ct.add('resistor', 20, 0); load.props.R = 100;
  const gnd = ct.add('ground', 0, 10);
  ct.connect(bat.id, 0, reg.id, 0);
  ct.connect(reg.id, 1, gnd.id, 0);
  ct.connect(reg.id, 2, load.id, 0);
  ct.connect(load.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 2e-3);
  check('на выходе 5 В', load.v, 5, 0.05);
  check('ток нагрузки 50 мА', Math.abs(load.i), 0.05, 0.001);
  check('вход отдаёт тот же ток', Math.abs(bat.i), 0.05, 0.002);
  check('рассеиваемая мощность (12−5)·I', reg.p, 0.35, 0.02);
  bat.props.V = 20;
  run(ct, 2e-3);
  check('при 20 В на входе выход прежний', load.v, 5, 0.05);
  bat.props.V = 6;                                   // запаса не хватает
  run(ct, 2e-3);
  check('при 6 В выход просаживается', load.v < 4.3 ? 1 : 0, 1, 0);
  check('выдано предупреждение', reg.warn ? 1 : 0, 1, 0);
});

test('Термистор и фоторезистор', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 5; bat.props.Rint = 1e-6;
  const th = ct.add('thermistor', 10, 0);
  const gnd = ct.add('ground', 0, 10);
  ct.connect(bat.id, 0, th.id, 0);
  ct.connect(th.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  th.props.t = 25;
  run(ct, 1e-3);
  check('при 25 °C сопротивление равно номиналу', th.R, 10000, 1);
  th.props.t = 85;
  run(ct, 1e-3);
  check('при 85 °C сопротивление падает', th.R < 1500 ? 1 : 0, 1, 0);
  th.props.t = -10;
  run(ct, 1e-3);
  check('на морозе растёт', th.R > 50000 ? 1 : 0, 1, 0);

  const ct2 = new EC.Circuit();
  const b2 = ct2.add('battery', 0, 0); b2.props.V = 5; b2.props.Rint = 1e-6;
  const ldr = ct2.add('photoresistor', 10, 0);
  const g2 = ct2.add('ground', 0, 10);
  ct2.connect(b2.id, 0, ldr.id, 0);
  ct2.connect(ldr.id, 1, g2.id, 0);
  ct2.connect(b2.id, 1, g2.id, 0);
  ldr.props.light = 0.25;                            // темно
  run(ct2, 1e-3);
  const dark = ldr.R;
  ldr.props.light = 1;                               // ярко
  run(ct2, 1e-3);
  check('на свету сопротивление меньше', ldr.R < dark / 5 ? 1 : 0, 1, 0);
});

test('Двигатель постоянного тока', function () {
  // 12 В, R = 8 Ω, Ke = 0,02, трение 2e-5 -> w = 12/(R·b/Kt + Ke) = 428,6 рад/с
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 1e-6;
  const m = ct.add('motor', 10, 0);
  m.props.R = 8; m.props.Ke = 0.02; m.props.J = 2e-5; m.props.b = 2e-5; m.props.load = 0;
  const gnd = ct.add('ground', 0, 10);
  ct.connect(bat.id, 0, m.id, 0);
  ct.connect(m.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 0.0005, 1e-6);
  check('в первый момент ток пусковой ≈ U/R', Math.abs(m.i), 12 / 8, 0.2);
  run(ct, 3, 1e-5);
  const w = m.state.w;
  check('установившаяся скорость', w, 12 / (8 * 2e-5 / 0.02 + 0.02), 12);
  check('установившийся ток', m.i, 2e-5 * w / 0.02, 0.01);
  check('противо-ЭДС = Ke·w', 12 - m.i * 8, 0.02 * w, 0.05);
  // с моментом нагрузки M: w = (U − M·R/Kt) / (R·b/Kt + Ke)
  const M = 0.005;
  m.props.load = M;
  run(ct, 3, 1e-5);
  const wLoaded = (12 - M * 8 / 0.02) / (8 * 2e-5 / 0.02 + 0.02);
  check('скорость под нагрузкой', m.state.w, wLoaded, 10);
  check('скорость упала', m.state.w < w ? 1 : 0, 1, 0);
  check('ток вырос', Math.abs(m.i) > 2e-5 * w / 0.02 ? 1 : 0, 1, 0);
});

test('Логические элементы', function () {
  function gateTest(type, a, b, expect) {
    const ct = new EC.Circuit();
    const g = ct.add(type, 10, 0);
    const gnd = ct.add('ground', 0, 14);
    const inputs = EC.defs[type].inputs;
    const srcs = [];
    for (let k = 0; k < inputs; k++) {
      const s = ct.add('vsource', 0, k * 6);
      s.props.wave = 'dc'; s.props.Rint = 1;
      s.props.amp = (k === 0 ? a : b) ? 5 : 0;
      ct.connect(s.id, 0, g.id, k);
      ct.connect(s.id, 1, gnd.id, 0);
      srcs.push(s);
    }
    const load = ct.add('resistor', 20, 0); load.props.R = 10000;
    ct.connect(g.id, inputs, load.id, 0);
    ct.connect(load.id, 1, gnd.id, 0);
    run(ct, 2e-3);
    const high = load.v > 2.5;
    check(type + ' ' + (a ? 1 : 0) + (inputs > 1 ? ',' + (b ? 1 : 0) : '') + ' → ' + (expect ? 1 : 0),
      high === expect ? 1 : 0, 1, 0);
  }
  gateTest('not_gate', false, false, true);
  gateTest('not_gate', true, false, false);
  gateTest('and_gate', false, false, false);
  gateTest('and_gate', true, false, false);
  gateTest('and_gate', false, true, false);
  gateTest('and_gate', true, true, true);
  gateTest('or_gate', false, false, false);
  gateTest('or_gate', true, false, true);
  gateTest('or_gate', true, true, true);
});

test('Таймер 555: восемь выводов и автоколебания', function () {
  // выводы: 0=GND 1=ЗАП 2=ВЫХ 3=СБР 4=УПР 5=ПОР 6=РАЗР 7=Vcc
  const R1 = 10000, R2 = 10000, C = 10e-6;
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 9; bat.props.Rint = 0.01;
  const t = ct.add('ne555', 16, 0);
  const r1 = ct.add('resistor', 8, -12); r1.props.R = R1;
  const r2 = ct.add('resistor', 24, -12); r2.props.R = R2;
  const cap = ct.add('capacitor', 32, 6); cap.props.C = C;
  const gnd = ct.add('ground', 0, 16);
  check('выводов ровно восемь', EC.defs.ne555.pins.length, 8, 0);
  ct.connect(bat.id, 0, t.id, 7);            // питание
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(t.id, 0, gnd.id, 0);            // общий
  ct.connect(bat.id, 0, r1.id, 0);           // R1: питание → разряд
  ct.connect(r1.id, 1, t.id, 6);
  ct.connect(t.id, 6, r2.id, 0);             // R2: разряд → порог
  ct.connect(r2.id, 1, t.id, 5);
  ct.connect(t.id, 5, t.id, 1);              // порог соединён с запуском
  ct.connect(t.id, 5, cap.id, 0);            // конденсатор на землю
  ct.connect(cap.id, 1, gnd.id, 0);
  const dt = 5e-5;

  function measure(steps) {
    let prev = t.state.q, edges = [];
    for (let i = 0; i < steps; i++) {
      ct.step(dt);
      if (t.state.q && !prev) edges.push(ct.time);
      prev = t.state.q;
    }
    return edges.length > 2 ? (edges.length - 1) / (edges[edges.length - 1] - edges[0]) : 0;
  }

  for (let i = 0; i < 20000; i++) ct.step(dt);
  check('вывод 4 не подключён — работа не блокируется', t.reset ? 0 : 1, 1, 0);
  const f = measure(400000);
  check('частота 1,44/((R1+2R2)C)', f, 1.44 / ((R1 + 2 * R2) * C), 0.5);
  check('размах на конденсаторе — треть питания', cap.v > 1 && cap.v < 8 ? 1 : 0, 1, 0);

  // вывод 4: сброс гасит выход
  const rst = ct.add('vsource', 8, 16);
  rst.props.wave = 'dc'; rst.props.amp = 0; rst.props.Rint = 1;
  ct.connect(rst.id, 0, t.id, 3);
  ct.connect(rst.id, 1, gnd.id, 0);
  for (let i = 0; i < 40000; i++) ct.step(dt);
  check('при нуле на выводе 4 выход погашен', t.level === '0' ? 1 : 0, 1, 0);
  check('признак сброса выставлен', t.reset ? 1 : 0, 1, 0);
  check('генерация остановлена', measure(60000), 0, 0);

  rst.props.amp = 9;                          // сброс снят
  for (let i = 0; i < 40000; i++) ct.step(dt);
  check('после снятия сброса генерация вернулась', measure(200000) > 1 ? 1 : 0, 1, 0);

  // вывод 5: снижение порога ускоряет генерацию
  const f0 = measure(200000);
  const ctrl = ct.add('vsource', 32, 16);
  ctrl.props.wave = 'dc'; ctrl.props.amp = 3; ctrl.props.Rint = 10;
  ct.connect(ctrl.id, 0, t.id, 4);
  ct.connect(ctrl.id, 1, gnd.id, 0);
  for (let i = 0; i < 60000; i++) ct.step(dt);
  const f1 = measure(200000);
  check('порог с вывода 5 задан внешне', Math.abs(t.vcc) > 1 ? 1 : 0, 1, 0);
  check('при пороге 3 В вместо 6 В частота выросла', f1 > f0 * 1.3 ? 1 : 0, 1, 0);
});

console.log('\n' + '─'.repeat(50));
console.log(failed === 0 ? `Все проверки пройдены: ${passed}` : `Пройдено ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
