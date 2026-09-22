/* Проверка физической достоверности движка ElectroCore.
 * Запуск:  node test/engine.test.js
 */
'use strict';
const path = require('path');
global.window = {};
['util', 'i18n', 'solver', 'cpu', 'components', 'display', 'chips', 'circuit', 'render', 'skins', 'scope', 'examples', 'aiprompt'].forEach(function (m) {
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

test('Ассемблер процессора EC-8', function () {
  const A = EC.cpu.assemble;
  let r = A('LDI 5\nOUT\nHLT');
  check('простая программа собирается', r.ok ? 1 : 0, 1, 0);
  check('размер в байтах', r.size, 4, 0);      // LDI 2 + OUT 1 + HLT 1
  check('код первой команды', r.code[0], 0x01, 0);
  check('операнд первой команды', r.code[1], 5, 0);

  r = A('старт:  LDI 0xFF\n        JMP старт');
  check('метка разрешается в адрес', r.code[3], 0, 0);
  check('метка запомнена', r.labels['старт'], 0, 0);

  r = A('LDI 0b1010');
  check('двоичный литерал', r.code[1], 10, 0);
  r = A('LDI $2A');
  check('шестнадцатеричный литерал через доллар', r.code[1], 42, 0);

  r = A('ПРЫГ 5');
  check('неизвестная команда — ошибка', r.ok ? 0 : 1, 1, 0);
  r = A('LDI');
  check('пропущенный операнд — ошибка', r.ok ? 0 : 1, 1, 0);
  r = A('JMP нетмет');
  check('ссылка на несуществующую метку — ошибка', r.ok ? 0 : 1, 1, 0);
  r = A('; только комментарий\n\n   ');
  check('пустая программа допустима', r.ok ? 1 : 0, 1, 0);
});

test('Арифметика и флаги процессора', function () {
  function run(src, steps) {
    const r = EC.cpu.assemble(src);
    if (!r.ok) throw new Error(r.errors[0].msg);
    const m = EC.cpu.create();
    EC.cpu.load(m, r.code);
    for (let i = 0; i < (steps || 40) && !m.halted; i++) EC.cpu.step(m);
    return m;
  }
  let m = run('LDI 200\nTAB\nLDI 100\nADD\nHLT');
  check('200 + 100 = 44 с переносом', m.a, 44, 0);
  check('флаг переноса поднят', m.c ? 1 : 0, 1, 0);

  m = run('LDI 10\nTAB\nLDI 10\nSUB\nHLT');
  check('10 − 10 = 0', m.a, 0, 0);
  check('флаг нуля поднят', m.z ? 1 : 0, 1, 0);
  check('заёма нет', m.c ? 0 : 1, 1, 0);

  m = run('LDI 5\nTAB\nLDI 3\nSUB\nHLT');
  check('3 − 5 даёт заём', m.c ? 1 : 0, 1, 0);
  check('результат по модулю 256', m.a, 254, 0);

  m = run('LDI 0b10000001\nSHL\nHLT');
  check('сдвиг влево', m.a, 2, 0);
  check('старший бит ушёл в перенос', m.c ? 1 : 0, 1, 0);

  m = run('LDI 0b11110000\nANDI 0b00110011\nHLT');
  check('побитное И', m.a, 0b00110000, 0);

  m = run('LDI 7\nCMPI 7\nHLT');
  check('сравнение равных даёт ноль', m.z ? 1 : 0, 1, 0);
  check('сравнение не меняет A', m.a, 7, 0);
});

test('Подпрограммы и память процессора', function () {
  const src = [
    '        LDI 3',
    '        ST 0x80',
    '        CALL удвоить',
    '        CALL удвоить',
    '        HLT',
    'удвоить: LD 0x80',
    '        TAB',
    '        ADD',
    '        ST 0x80',
    '        RET'
  ].join('\n');
  const r = EC.cpu.assemble(src);
  check('программа с подпрограммой собирается', r.ok ? 1 : 0, 1, 0);
  const m = EC.cpu.create();
  EC.cpu.load(m, r.code);
  for (let i = 0; i < 100 && !m.halted; i++) EC.cpu.step(m);
  check('процессор остановился', m.halted ? 1 : 0, 1, 0);
  check('3 удвоено дважды = 12', m.mem[0x80], 12, 0);
  check('стек вернулся на место', m.sp, 0xFF, 0);
});

test('Процессор в схеме: мигает светодиодом', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', -20, 0); bat.props.V = 5; bat.props.Rint = 0.1;
  const gnd = ct.add('ground', -20, 14);
  const cpu = ct.add('cpu8', 0, 0);
  const r = ct.add('resistor', 12, 6); r.props.R = 330;
  const led = ct.add('led', 26, 6);
  ct.connect(bat.id, 0, cpu.id, 0);          // Vcc
  ct.connect(cpu.id, 3, gnd.id, 0);          // GND
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(cpu.id, 4, r.id, 0);            // P0 → резистор → светодиод
  ct.connect(r.id, 1, led.id, 0);
  ct.connect(led.id, 1, gnd.id, 0);
  ct.reset();

  let flips = 0, prev = null, peak = 0, lit = 0, total = 0;
  for (let i = 0; i < 40000; i++) {
    ct.step(5e-4);
    const on = led.i > 0.003;
    if (prev !== null && on !== prev) flips++;
    prev = on;
    peak = Math.max(peak, led.i);
    if (on) lit++;
    total++;
  }
  check('питание дошло до процессора', cpu.vcc, 5, 0.05);
  check('светодиод переключался', flips > 10 ? 1 : 0, 1, 0);
  check('ток открытого выхода (5−Uд)/(Rвых+R)', peak, (5 - 1.9) / (40 + 330), 2e-3);
  check('скважность около половины', Math.abs(lit / total - 0.5) < 0.1 ? 1 : 0, 1, 0);
});

test('Процессор читает вход и управляет выходом', function () {
  const src = [
    '        LDI 0b0001',
    '        DIR             ; P0 выход, остальные входы',
    'цикл:   IN',
    '        ANDI 0b0010     ; смотрим P1',
    '        JZ выкл',
    '        LDI 0b0001',
    '        OUT',
    '        JMP цикл',
    'выкл:   LDI 0b0000',
    '        OUT',
    '        JMP цикл'
  ].join('\n');
  const ct = new EC.Circuit();
  const bat = ct.add('battery', -20, 0); bat.props.V = 5; bat.props.Rint = 0.1;
  const gnd = ct.add('ground', -20, 14);
  const cpu = ct.add('cpu8', 0, 0); cpu.props.code = src;
  const src1 = ct.add('vsource', -20, 22);
  src1.props.wave = 'dc'; src1.props.amp = 0; src1.props.Rint = 100;
  const v = ct.add('voltmeter', 16, 6);
  ct.connect(bat.id, 0, cpu.id, 0);
  ct.connect(cpu.id, 3, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(cpu.id, 5, src1.id, 0);         // P1 — вход
  ct.connect(src1.id, 1, gnd.id, 0);
  ct.connect(cpu.id, 4, v.id, 0);            // P0 — выход
  ct.connect(v.id, 1, gnd.id, 0);
  ct.reset();

  run(ct, 0.2, 5e-4);
  check('на входе ноль — выход низкий', v.reading < 0.5 ? 1 : 0, 1, 0);
  src1.props.amp = 5;
  run(ct, 0.2, 5e-4);
  check('на входе питание — выход высокий', v.reading > 4 ? 1 : 0, 1, 0);
  src1.props.amp = 0;
  run(ct, 0.2, 5e-4);
  check('вход снят — выход снова низкий', v.reading < 0.5 ? 1 : 0, 1, 0);
});

test('Вывод сброса и внешнее тактирование', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', -20, 0); bat.props.V = 5; bat.props.Rint = 0.1;
  const gnd = ct.add('ground', -20, 16);
  const cpu = ct.add('cpu8', 0, 0);
  cpu.props.code = 'счёт:   INC\n        JMP счёт';
  cpu.props.clkSrc = 'external';
  const clk = ct.add('vsource', -20, 24);
  clk.props.wave = 'square'; clk.props.amp = 2.5; clk.props.offset = 2.5;
  clk.props.freq = 200; clk.props.Rint = 50;
  const rst = ct.add('vsource', -20, 32);
  rst.props.wave = 'dc'; rst.props.amp = 5; rst.props.Rint = 100;
  ct.connect(bat.id, 0, cpu.id, 0);
  ct.connect(cpu.id, 3, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(cpu.id, 1, clk.id, 0);
  ct.connect(clk.id, 1, gnd.id, 0);
  ct.connect(cpu.id, 2, rst.id, 0);
  ct.connect(rst.id, 1, gnd.id, 0);
  ct.reset();

  run(ct, 1.0, 2e-4);
  const c1 = cpu.state.m.cycles;
  check('за секунду прошло ~200 тактов внешнего генератора', c1, 200, 12);
  check('в сбросе не находится', cpu.inReset ? 0 : 1, 1, 0);

  rst.props.amp = 0;                          // прижали вывод сброса к нулю
  run(ct, 0.3, 2e-4);
  check('сброс распознан', cpu.inReset ? 1 : 0, 1, 0);
  check('счётчик команд обнулён', cpu.state.m.pc, 0, 0);
  const c2 = cpu.state.m.cycles;
  run(ct, 0.3, 2e-4);
  check('в сбросе команды не выполняются', cpu.state.m.cycles, c2, 0);

  rst.props.amp = 5;
  run(ct, 0.5, 2e-4);
  check('после снятия сброса счёт возобновился', cpu.state.m.cycles > 50 ? 1 : 0, 1, 0);
});

test('Описание для ИИ полно и согласовано', function () {
  const text = EC.aiPrompt.build();
  check('описание непустое', text.length > 10000 ? 1 : 0, 1, 0);

  const missing = Object.keys(EC.defs).filter(k => text.indexOf('\n' + k + ' — ') < 0);
  check('все детали перечислены', missing.length, 0, 0);
  if (missing.length) console.log('      нет в описании:', missing.join(', '));

  const noIsa = EC.cpu.ISA.filter(d => text.indexOf('  ' + d.m) < 0);
  check('все команды процессора перечислены', noIsa.length, 0, 0);

  // габариты в тексте должны совпадать с настоящими
  const ct = new EC.Circuit();
  let wrong = 0;
  Object.keys(EC.defs).forEach(k => {
    const fp = EC.aiPrompt.footprint(k);
    if (text.indexOf('габарит: ' + fp.w + ' × ' + fp.h + ' клеток') < 0) wrong++;
  });
  check('габариты в описании настоящие', wrong, 0, 0);

  check('формат назван', text.indexOf('electrocore/1') >= 0 ? 1 : 0, 1, 0);
  check('правило поворота описано', text.indexOf('rot 1  →  (−dy,  dx)') >= 0 ? 1 : 0, 1, 0);
  check('есть рабочий пример', text.indexOf('"components"') >= 0 ? 1 : 0, 1, 0);

  // встроенный пример должен разбираться и работать:
  // берём весь раздел с примером, разбор сам найдёт в нём JSON
  const a = text.indexOf('5. ПОЛНЫЙ ПРИМЕР');
  const b = text.indexOf('6. СПРАВОЧНИК');
  check('раздел с примером на месте', a > 0 && b > a ? 1 : 0, 1, 0);
  const sample = EC.aiPrompt.parse(text.slice(a, b));
  check('пример из описания собирается', sample.ok ? 1 : 0, 1, 0);
  check('в примере нет предупреждений', sample.warnings.length, 0, 0);
});

test('Обмен схемами: выгрузка и загрузка', function () {
  let bad = 0;
  EC.examples.forEach(ex => {
    const orig = ex.make();
    const json = JSON.stringify(EC.aiPrompt.export(orig, ex.name));
    const back = EC.aiPrompt.parse(json);
    if (!back.ok ||
      back.circuit.components.length !== orig.components.length ||
      back.circuit.wires.length !== orig.wires.length) {
      bad++;
      console.log('      не сошлось:', ex.id, back.errors.join('; '));
    }
  });
  check('все ' + EC.examples.length + ' примеров переживают обход', bad, 0, 0);

  // расчёт после обхода совпадает
  const orig = EC.examples.find(e => e.id === 'led').make();
  run(orig, 1e-3);
  const back = EC.aiPrompt.parse(JSON.stringify(EC.aiPrompt.export(orig, 'led')));
  run(back.circuit, 1e-3);
  const a = orig.components.find(c => c.type === 'led');
  const b = back.circuit.components.find(c => c.type === 'led');
  check('ток светодиода тот же', b.i, a.i, 1e-9);
});

test('Разбор ответа модели: мусор вокруг и ошибки', function () {
  const good = {
    format: 'electrocore/1', title: 'Делитель',
    components: [
      { id: 'GB1', type: 'battery', x: -14, y: 0, rot: 1, props: { V: 9 } },
      { id: 'R1', type: 'resistor', x: 0, y: -8, props: { R: '1k' } },
      { id: 'R2', type: 'resistor', x: 0, y: 8, props: { R: 2000 } },
      { id: 'GND1', type: 'ground', x: -14, y: 12 }
    ],
    wires: [
      { from: 'GB1', fromPin: 0, to: 'R1', toPin: 0 },
      { from: 'R1', fromPin: 1, to: 'R2', toPin: 0 },
      { from: 'R2', fromPin: 1, to: 'GND1', toPin: 0 },
      { from: 'GB1', fromPin: 1, to: 'GND1', toPin: 0 }
    ]
  };
  const wrapped = 'Вот схема:\n\n```json\n' + JSON.stringify(good) + '\n```\n\nГотово!';
  const r = EC.aiPrompt.parse(wrapped);
  check('ответ в рамках разобран', r.ok ? 1 : 0, 1, 0);
  check('предупреждений нет', r.warnings.length, 0, 0);
  run(r.circuit, 1e-3);
  const R1 = r.circuit.components.find(c => c.name === 'R1');
  check('делитель считает верно', Math.abs(R1.i), 9 / 3000, 1e-5);
  check('строка «1k» превратилась в 1000', R1.props.R, 1000, 0);

  check('пустой текст — ошибка', EC.aiPrompt.parse('привет').ok ? 0 : 1, 1, 0);
  check('битый JSON — ошибка', EC.aiPrompt.parse('{ "components": [ ').ok ? 0 : 1, 1, 0);

  let r2 = EC.aiPrompt.parse(JSON.stringify({
    components: [{ id: 'X1', type: 'нетакого', x: 0, y: 0 }]
  }));
  check('неизвестный тип — ошибка', r2.ok ? 0 : 1, 1, 0);
  check('ошибка называет тип', r2.errors[0].indexOf('нетакого') >= 0 ? 1 : 0, 1, 0);

  r2 = EC.aiPrompt.parse(JSON.stringify({
    components: [
      { id: 'R1', type: 'resistor', x: 0, y: 0 },
      { id: 'R1', type: 'resistor', x: 20, y: 0 }
    ]
  }));
  check('повтор обозначения — ошибка', r2.ok ? 0 : 1, 1, 0);

  r2 = EC.aiPrompt.parse(JSON.stringify({
    components: [{ id: 'R1', type: 'resistor', x: 0, y: 0 }],
    wires: [{ from: 'R1', fromPin: 0, to: 'R9', toPin: 0 }]
  }));
  check('ссылка на несуществующую деталь — ошибка', r2.ok ? 0 : 1, 1, 0);

  r2 = EC.aiPrompt.parse(JSON.stringify({
    components: [
      { id: 'R1', type: 'resistor', x: 0, y: 0 },
      { id: 'R2', type: 'resistor', x: 20, y: 0 }
    ],
    wires: [{ from: 'R1', fromPin: 5, to: 'R2', toPin: 0 }]
  }));
  check('выход за число выводов — ошибка', r2.ok ? 0 : 1, 1, 0);
  check('ошибка подсказывает диапазон', r2.errors[0].indexOf('0…1') >= 0 ? 1 : 0, 1, 0);
});

test('Разбор предупреждает о типичных промахах', function () {
  // детали наложены друг на друга
  let r = EC.aiPrompt.parse(JSON.stringify({
    components: [
      { id: 'R1', type: 'resistor', x: 0, y: 0 },
      { id: 'R2', type: 'resistor', x: 1, y: 0 },
      { id: 'GND1', type: 'ground', x: 0, y: 20 }
    ],
    wires: [
      { from: 'R1', fromPin: 0, to: 'R2', toPin: 0 },
      { from: 'R2', fromPin: 1, to: 'GND1', toPin: 0 }
    ]
  }));
  check('наложение замечено', r.warnings.some(w => w.indexOf('перекрыва') >= 0) ? 1 : 0, 1, 0);

  // нет земли
  r = EC.aiPrompt.parse(JSON.stringify({
    components: [
      { id: 'GB1', type: 'battery', x: 0, y: 0 },
      { id: 'R1', type: 'resistor', x: 16, y: 0 }
    ],
    wires: [
      { from: 'GB1', fromPin: 0, to: 'R1', toPin: 0 },
      { from: 'GB1', fromPin: 1, to: 'R1', toPin: 1 }
    ]
  }));
  check('отсутствие земли замечено', r.warnings.some(w => w.indexOf('земли') >= 0) ? 1 : 0, 1, 0);

  // деталь висит в воздухе
  r = EC.aiPrompt.parse(JSON.stringify({
    components: [
      { id: 'GB1', type: 'battery', x: 0, y: 0 },
      { id: 'R1', type: 'resistor', x: 16, y: 0 },
      { id: 'C9', type: 'capacitor', x: 40, y: 20 },
      { id: 'GND1', type: 'ground', x: 0, y: 20 }
    ],
    wires: [
      { from: 'GB1', fromPin: 0, to: 'R1', toPin: 0 },
      { from: 'R1', fromPin: 1, to: 'GND1', toPin: 0 },
      { from: 'GB1', fromPin: 1, to: 'GND1', toPin: 0 }
    ]
  }));
  check('неподключённая деталь замечена', r.warnings.some(w => w.indexOf('C9') >= 0) ? 1 : 0, 1, 0);

  // недопустимое значение списка
  r = EC.aiPrompt.parse(JSON.stringify({
    components: [{ id: 'HL1', type: 'led', x: 0, y: 0, props: { color: 'розовый' } },
      { id: 'GND1', type: 'ground', x: 0, y: 20 }],
    wires: [{ from: 'HL1', fromPin: 1, to: 'GND1', toPin: 0 }]
  }));
  check('чужое значение параметра замечено', r.warnings.some(w => w.indexOf('розовый') >= 0) ? 1 : 0, 1, 0);
  check('схема всё равно собрана', r.ok ? 1 : 0, 1, 0);
});

test('Схема с процессором проходит через обмен', function () {
  const code = 'старт:  LDI 0b1111\n        DIR\n        LDI 1\n        OUT\n        JMP старт';
  const r = EC.aiPrompt.parse(JSON.stringify({
    format: 'electrocore/1',
    components: [
      { id: 'GB1', type: 'battery', x: -22, y: 0, rot: 1, props: { V: 5 } },
      { id: 'DD1', type: 'cpu8', x: 0, y: 0, props: { code: code, freq: 2000 } },
      { id: 'R1', type: 'resistor', x: 14, y: 3, props: { R: 330 } },
      { id: 'HL1', type: 'led', x: 26, y: 3 },
      { id: 'GND1', type: 'ground', x: -22, y: 16 }
    ],
    wires: [
      { from: 'GB1', fromPin: 0, to: 'DD1', toPin: 0 },
      { from: 'DD1', fromPin: 3, to: 'GND1', toPin: 0 },
      { from: 'GB1', fromPin: 1, to: 'GND1', toPin: 0 },
      { from: 'DD1', fromPin: 4, to: 'R1', toPin: 0 },
      { from: 'R1', fromPin: 1, to: 'HL1', toPin: 0 },
      { from: 'HL1', fromPin: 1, to: 'GND1', toPin: 0 }
    ]
  }));
  check('схема с процессором собрана', r.ok ? 1 : 0, 1, 0);
  check('предупреждений нет', r.warnings.length, 0, 0);
  const cpu = r.circuit.components.find(c => c.type === 'cpu8');
  check('программа принята без ошибок', cpu.state.asm.ok ? 1 : 0, 1, 0);
  run(r.circuit, 0.2, 5e-4);
  const led = r.circuit.components.find(c => c.type === 'led');
  check('процессор зажёг светодиод', led.i > 0.005 ? 1 : 0, 1, 0);
  check('счётчик команд идёт', cpu.state.m.cycles > 100 ? 1 : 0, 1, 0);
});

/* ------------------------------------------------------------------ */
/*  Процессор с внешней шиной и микросхема памяти                      */
/* ------------------------------------------------------------------ */

/** Напряжение на выводе относительно общего провода. */
function pinV(ct, c, i) {
  const n = c.n[i];
  return n === undefined || n < 0 ? 0 : ct.x[n];
}

/** Собирает систему «процессор + память» и возвращает её части. */
function busSystem(code, opts) {
  opts = opts || {};
  const ct = new EC.Circuit();
  const bat = ct.add('battery', -30, -12); bat.props.V = 5; bat.props.Rint = 0.1;
  const gnd = ct.add('ground', -30, 16);
  const cpu = ct.add('cpu_bus', 0, 0);
  cpu.props.freq = opts.freq || 2000;
  if (opts.clkSrc) cpu.props.clkSrc = opts.clkSrc;
  const mem = ct.add('memory', -2, -34);
  mem.props.content = code;
  if (opts.readOnly) mem.props.readOnly = true;
  ct.connect(bat.id, 0, cpu.id, 0);            // питание
  ct.connect(cpu.id, 0, mem.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(cpu.id, 1, gnd.id, 0);
  ct.connect(mem.id, 1, gnd.id, 0);
  ct.connect(mem.id, 2, gnd.id, 0);            // /ВЫБ на общий провод
  ct.connect(mem.id, 3, mem.id, 0);            // ВЫБ2 на питание
  ct.connect(mem.id, 12, gnd.id, 0);           // A8 и A9 не задействованы
  ct.connect(mem.id, 13, gnd.id, 0);
  ct.connect(cpu.id, 18, mem.id, 14);          // /ЧТ
  ct.connect(cpu.id, 19, mem.id, 15);          // /ЗП
  for (let i = 0; i < 8; i++) {
    ct.connect(cpu.id, 6 + i, mem.id, 4 + i);  // шина адреса
    ct.connect(cpu.id, 20 + i, mem.id, 16 + i);// шина данных
  }
  const r = ct.add('resistor', 18, 25); r.props.R = 330;
  const led = ct.add('led', 30, 25);
  const led2gnd = ct.add('ground', 42, 30);
  ct.connect(cpu.id, 14, r.id, 0);             // P0 → резистор → светодиод
  ct.connect(r.id, 1, led.id, 0);
  ct.connect(led.id, 1, led2gnd.id, 0);
  ct.reset();
  return { ct: ct, cpu: cpu, mem: mem, led: led, gnd: gnd, bat: bat };
}

test('Процессор EC-8B выполняет программу из микросхемы памяти', function () {
  const code = [
    '        LDI 0b1111',
    '        DIR',
    'цикл:   LDI 1',
    '        OUT',
    '        CALL пауза',
    '        LDI 0',
    '        OUT',
    '        CALL пауза',
    '        JMP цикл',
    'пауза:  LDI 30',
    '        ST 0x80',
    'ждём:   LD 0x80',
    '        DEC',
    '        ST 0x80',
    '        JNZ ждём',
    '        RET'
  ].join('\n');
  const s = busSystem(code, { freq: 2000 });
  check('содержимое памяти собрано', s.mem.state.asm.ok ? 1 : 0, 1, 0);
  run(s.ct, 0.01, 1 / 8000);
  check('память видит питание', s.mem.vcc, 5, 0.05);

  let flips = 0, prev = null, peak = 0, reads = 0, writes = 0;
  for (let i = 0; i < 40000; i++) {
    s.ct.step(1 / 8000);
    if (s.mem.mode === 'чтение') reads++;
    if (s.mem.mode === 'запись') writes++;
    const on = s.led.i > 0.003;
    if (prev !== null && on !== prev) flips++;
    prev = on;
    peak = Math.max(peak, s.led.i);
  }
  check('процессор отсчитал такты', s.cpu.state.m.cycles > 9000 ? 1 : 0, 1, 0);
  check('память отдавала байты', reads > 1000 ? 1 : 0, 1, 0);
  check('процессор писал в память', writes > 100 ? 1 : 0, 1, 0);
  check('счётчик задержки лежит в памяти', s.mem.state.bytes[0x80] <= 30 ? 1 : 0, 1, 0);
  check('светодиод переключался', flips > 4 ? 1 : 0, 1, 0);
  check('ток открытого выхода (5−Uд)/(Rвых+R)', peak, (5 - 1.9) / (50 + 330), 2e-3);
});

test('Адрес на шине совпадает с адресом, который выбрала память', function () {
  const s = busSystem('счёт:   NOP\n        JMP счёт', { freq: 2000 });
  let mismatch = 0, seen = {}, prev = -1;
  for (let i = 0; i < 4000; i++) {
    s.ct.step(1 / 8000);
    if (!s.cpu.powered) continue;
    // после смены адреса память видит новый уровень лишь на следующем шаге
    if (s.mem.addr !== s.cpu.state.m.addr && s.mem.addr !== prev) mismatch++;
    prev = s.cpu.state.m.addr;
    seen[prev] = true;
  }
  check('память всегда выбирает адрес процессора', mismatch, 0, 0);
  check('процессор ходил по разным адресам', Object.keys(seen).length >= 3 ? 1 : 0, 1, 0);
});

test('Невыбранная память не держит шину данных', function () {
  const code = '        LDI 0b1111\n        DIR\n        LDI 1\n        OUT\n        HLT';
  const s = busSystem(code, { freq: 2000 });
  let drove = 0;
  for (let i = 0; i < 400; i++) { s.ct.step(1 / 8000); if (s.mem.state.driving) drove++; }
  check('выбранная память отдавала байты', drove > 0 ? 1 : 0, 1, 0);
  check('программа выполнилась, светодиод горит', s.led.i > 0.005 ? 1 : 0, 1, 0);
  check('после остановки шину никто не держит', s.mem.state.driving ? 1 : 0, 0, 0);

  // снимаем выбор: вывод /ВЫБ уходит на питание
  const w = s.ct.wires.find(x => (x.a.c === s.mem.id && x.a.p === 2) || (x.b.c === s.mem.id && x.b.p === 2));
  s.ct.removeWire(w);
  s.ct.connect(s.mem.id, 2, s.mem.id, 0);
  s.cpu.def().init(s.cpu);                       // перезапуск процессора
  let drove2 = 0;
  for (let i = 0; i < 400; i++) { s.ct.step(1 / 8000); if (s.mem.state.driving) drove2++; }
  check('снятая с выбора память шину не держит', drove2, 0, 0);
  check('без памяти процессор читает нули', s.cpu.state.m.op, 0, 0);
  check('светодиод погас', s.led.i < 1e-4 ? 1 : 0, 1, 0);
});

test('Сброс и внешнее тактирование шинного процессора', function () {
  const s = busSystem('счёт:   INC\n        JMP счёт', { clkSrc: 'external' });
  const clk = s.ct.add('vsource', -30, 30);
  clk.props.wave = 'square'; clk.props.amp = 2.5; clk.props.offset = 2.5;
  clk.props.freq = 500; clk.props.Rint = 50;
  const rst = s.ct.add('vsource', -30, 40);
  rst.props.wave = 'dc'; rst.props.amp = 0; rst.props.Rint = 100;
  s.ct.connect(clk.id, 0, s.cpu.id, 2);
  s.ct.connect(clk.id, 1, s.gnd.id, 0);
  s.ct.connect(rst.id, 0, s.cpu.id, 3);
  s.ct.connect(rst.id, 1, s.gnd.id, 0);
  s.ct.reset();

  run(s.ct, 0.2, 2e-4);
  check('удержанный сброс останавливает процессор', s.cpu.state.m.cycles, 0, 0);
  check('сброс распознан', s.cpu.inReset ? 1 : 0, 1, 0);

  rst.props.amp = 5;
  const before = s.cpu.state.m.cycles;
  run(s.ct, 0.4, 2e-4);
  const done = s.cpu.state.m.cycles - before;
  check('за 0.4 с при 500 Гц прошло около 200 тактов', done, 200, 6);
});

test('Выводы состояния процессора: /КОД и /СТОП', function () {
  const s = busSystem('        NOP\n        NOP\n        HLT', { freq: 2000 });
  let fetchLow = 0, steps = 0;
  for (let i = 0; i < 600; i++) {
    s.ct.step(1 / 8000);
    if (s.cpu.state.m.halted) break;
    steps++;
    if (pinV(s.ct, s.cpu, 5) < 2.5) fetchLow++;
  }
  check('на выборке кода /КОД прижат к нулю', fetchLow > 0 ? 1 : 0, 1, 0);
  run(s.ct, 0.02, 1 / 8000);
  check('процессор остановился', s.cpu.state.m.halted ? 1 : 0, 1, 0);
  check('/СТОП ушёл в ноль', pinV(s.ct, s.cpu, 4) < 0.5 ? 1 : 0, 1, 0);
  check('/КОД снят', pinV(s.ct, s.cpu, 5) > 4 ? 1 : 0, 1, 0);
});

test('Такты обмена по шине', function () {
  const cy = EC.cpu.cyclesOf;
  const op = m => EC.cpu.ISA.find(d => d.m === m).op;
  check('NOP — один такт', cy(op('NOP')), 1, 0);
  check('LDI — два такта', cy(op('LDI')), 2, 0);
  check('LD — три такта', cy(op('LD')), 3, 0);
  check('ST — три такта', cy(op('ST')), 3, 0);

  // прогон машины с памятью на массиве: проверяем порядок обращений
  const r = EC.cpu.assemble('        LDI 7\n        ST 0x40\n        LD 0x40\n        HLT');
  check('программа собрана', r.ok ? 1 : 0, 1, 0);
  const ram = new Uint8Array(256);
  ram.set(r.code.subarray(0, 256));
  const m = EC.cpu.createBus();
  const trace = [];
  for (let i = 0; i < 12 && !m.halted; i++) {
    trace.push({ addr: m.addr, rd: m.rd, wr: m.wr });
    if (!m.wr) ram[m.addr] = m.dataOut;         // запись уровнем, как в микросхеме
    EC.cpu.busTick(m, ram[m.addr]);
  }
  check('в ячейку записана семёрка', ram[0x40], 7, 0);
  check('аккумулятор прочитал её обратно', m.a, 7, 0);
  const wr = trace.filter(t => !t.wr);
  check('запись была одна', wr.length, 1, 0);
  check('запись шла по адресу операнда', wr[0].addr, 0x40, 0);
  check('обмен занял девять тактов', m.cycles, 9, 0);
});


test('Калькулятор: два процессора считают и передают ответ по одному проводу', function () {
  const ct = EC.examples.find(e => e.id === 'calc').make();
  const by = id => ct.components.find(c => c.name === id);
  const led = by('HL1'), dd1 = by('DD1'), dd2 = by('DD2');
  const SB = { 1: by('SB1'), 2: by('SB2'), 3: by('SB3') };
  const dt = 4e-4;
  let blinks = 0, wasOn = false;
  const go = sec => {
    for (let i = 0; i < Math.round(sec / dt); i++) {
      ct.step(dt);
      const on = led.i > 3e-3;
      if (on && !wasOn) blinks++;
      wasOn = on;
    }
  };
  const press = n => { SB[n].pressed = true; go(0.08); SB[n].pressed = false; go(0.08); };

  check('обе программы собраны', (dd1.state.asm.ok && dd2.state.asm.ok) ? 1 : 0, 1, 0);
  go(0.3);
  press(1); press(1); press(1);              // A = 3
  press(2); press(2);                        // B = 2
  check('первое слагаемое набрано', dd1.state.m.mem[240], 3, 0);
  check('второе слагаемое набрано', dd1.state.m.mem[241], 2, 0);

  blinks = 0;
  press(3);                                  // равно
  go(9);
  check('светодиод мигнул пять раз', blinks, 5, 0);

  // второй счёт подряд: 1 + 1
  press(1); press(2);
  blinks = 0;
  press(3);
  go(7);
  check('вторая операция считается заново', blinks, 2, 0);
});

/* ------------------------------------------------------------------ */
/*  Индикаторы и микросхемы управления ими                             */
/* ------------------------------------------------------------------ */

test('Семисегментный индикатор показывает цифру', function () {
  const S = EC.S1_SEG;
  const ct = new EC.Circuit();
  const bat = ct.add('battery', -20, 0); bat.props.V = 5; bat.props.Rint = 0.1;
  const gnd = ct.add('ground', -20, 16);
  const hg = ct.add('seg7', 12, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(hg.id, EC.S1_COM[0], gnd.id, 0);
  ['a', 'b', 'c', 'd', 'e', 'f'].forEach(function (s, k) {
    const r = ct.add('resistor', -6, -8 + k * 3); r.props.R = 220;
    ct.connect(bat.id, 0, r.id, 0);
    ct.connect(r.id, 1, hg.id, S[s]);
  });
  ct.reset();
  run(ct, 0.3, 2e-4);
  check('горит ноль', hg.level === '0' ? 1 : 0, 1, 0);
  check('ток сегмента (5−1,9)/220', hg.i / 6, (5 - 1.9) / 220, 4e-4);
  check('перемычка g погашена', hg.state.lit[6] < 0.02 ? 1 : 0, 1, 0);

  // добавляем среднюю перемычку — получается восьмёрка
  const r = ct.add('resistor', -6, 12); r.props.R = 220;
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, hg.id, S.g);
  ct.reset();
  run(ct, 0.3, 2e-4);
  check('горит восьмёрка', hg.level === '8' ? 1 : 0, 1, 0);
});

/** Собирает стенд со сдвиговым регистром и источниками на его входах. */
function shiftRig() {
  const SR = EC.SR;
  const ct = new EC.Circuit();
  const bat = ct.add('battery', -30, 0); bat.props.V = 5; bat.props.Rint = 0.1;
  const gnd = ct.add('ground', -30, 20);
  const u = ct.add('sr595', 0, 0);
  ct.connect(bat.id, 0, u.id, SR.VCC);
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(u.id, SR.GND, gnd.id, 0);
  const src = {};
  ['SER', 'SRCLK', 'RCLK', 'OE', 'SRCLR'].forEach(function (k, i) {
    const s = ct.add('vsource', -18, -12 + i * 6);
    s.props.wave = 'dc'; s.props.amp = k === 'SRCLR' ? 5 : 0; s.props.Rint = 50;
    ct.connect(s.id, 0, u.id, SR[k]);
    ct.connect(s.id, 1, gnd.id, 0);
    src[k] = s;
  });
  const leds = [];
  for (let i = 0; i < 8; i++) {
    const r = ct.add('resistor', 14, -14 + i * 4); r.props.R = 330;
    const l = ct.add('led', 26, -14 + i * 4);
    ct.connect(u.id, i === 0 ? SR.Q0 : i - 1, r.id, 0);
    ct.connect(r.id, 1, l.id, 0);
    ct.connect(l.id, 1, gnd.id, 0);
    leds.push(l);
  }
  ct.reset();
  const go = n => { for (let i = 0; i < n; i++) ct.step(1e-4); };
  go(40);
  return { ct, u, src, leds, go };
}

test('Сдвиговый регистр 74HC595 принимает байт и защёлкивает его', function () {
  const rig = shiftRig();
  const byte = 0xB2;
  for (let b = 7; b >= 0; b--) {                 // старшим битом вперёд
    rig.src.SER.props.amp = (byte >> b) & 1 ? 5 : 0; rig.go(4);
    rig.src.SRCLK.props.amp = 5; rig.go(4);
    rig.src.SRCLK.props.amp = 0; rig.go(4);
  }
  check('байт вдвинут', rig.u.state.sr, 0xB2, 0);
  check('до защёлки выходы не менялись', rig.u.state.out, 0, 0);
  rig.src.RCLK.props.amp = 5; rig.go(4);
  rig.src.RCLK.props.amp = 0; rig.go(30);
  check('после защёлки байт на выходах', rig.u.state.out, 0xB2, 0);
  check('светодиоды повторяют биты',
    rig.leds.map(l => l.i > 3e-3 ? '1' : '0').join('') === '01001101' ? 1 : 0, 1, 0);
  check('ток выхода (5−1,9)/(Rвых+R)', rig.leds[1].i, (5 - 1.9) / (40 + 330), 3e-4);

  rig.src.OE.props.amp = 5; rig.go(40);          // снимаем разрешение
  check('при /РАЗР=1 выходы отключены', rig.leds.filter(l => l.i > 3e-3).length, 0, 0);
  check('содержимое защёлки не потерялось', rig.u.state.out, 0xB2, 0);
  rig.src.OE.props.amp = 0; rig.go(40);
  check('выходы вернулись', rig.leds.filter(l => l.i > 3e-3).length, 4, 0);

  rig.src.SRCLR.props.amp = 0; rig.go(20);       // сброс сдвигового регистра
  check('/СБР очистил сдвиговый регистр', rig.u.state.sr, 0, 0);
  check('но не защёлку', rig.u.state.out, 0xB2, 0);
});

/** Стенд: драйвер MAX7219 с резистором задатчика и четырьмя разрядами. */
function maxRig(rset) {
  const MX = EC.MX;
  const ct = new EC.Circuit();
  const bat = ct.add('battery', -40, 0); bat.props.V = 5; bat.props.Rint = 0.1;
  const gnd = ct.add('ground', -40, 24);
  const u = ct.add('max7219', 0, 0);
  const disp = ct.add('seg7x4', 44, 0);
  ct.connect(bat.id, 0, u.id, MX.VCC);
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(u.id, MX.GND[0], gnd.id, 0);
  if (rset) {
    const r = ct.add('resistor', 12, -3); r.props.R = rset;
    ct.connect(u.id, MX.VCC, r.id, 0);
    ct.connect(r.id, 1, u.id, MX.ISET);
  }
  EC.SEG_ORDER.forEach(s => ct.connect(u.id, MX.SEG[s], disp.id, EC.S4_SEG[s]));
  for (let d = 0; d < 4; d++) ct.connect(u.id, MX.DIG[d], disp.id, EC.S4_DIG[d]);
  const src = {};
  ['DIN', 'CLK', 'LOAD'].forEach(function (k, i) {
    const s = ct.add('vsource', -26, -8 + i * 8);
    s.props.wave = 'dc'; s.props.amp = 0; s.props.Rint = 50;
    ct.connect(s.id, 0, u.id, MX[k]);
    ct.connect(s.id, 1, gnd.id, 0);
    src[k] = s;
  });
  ct.reset();
  const go = n => { for (let i = 0; i < n; i++) ct.step(1e-4); };
  go(30);
  const send = word => {                          // шестнадцать бит, старшим вперёд
    for (let b = 15; b >= 0; b--) {
      src.DIN.props.amp = (word >> b) & 1 ? 5 : 0; go(2);
      src.CLK.props.amp = 5; go(2);
      src.CLK.props.amp = 0; go(2);
    }
    src.LOAD.props.amp = 5; go(3);
    src.LOAD.props.amp = 0; go(3);
  };
  return { ct, u, disp, send, go };
}

test('MAX7219 принимает команды по трём проводам и зажигает цифры', function () {
  const rig = maxRig(10000);
  check('опорный ток (5−1,2)/10к', rig.u.iref, (5 - 1.2) / 10000, 1e-5);
  check('ток сегмента в сто раз больше', rig.u.iseg, rig.u.iref * 100, 1e-4);
  check('после включения микросхема в покое', rig.u.state.on ? 1 : 0, 0, 0);
  rig.go(200);
  check('в покое индикатор погашен', rig.disp.level.trim() === '' ? 1 : 0, 1, 0);

  rig.send(0x0C01);                               // выход из покоя
  rig.send(0x0B03);                               // четыре разряда
  rig.send(0x09FF);                               // дешифратор на всех
  rig.send(0x0A0F);                               // полная яркость
  check('команды разобраны', rig.u.state.on && rig.u.state.scan === 3 &&
    rig.u.state.decode === 0xFF && rig.u.state.intensity === 15 ? 1 : 0, 1, 0);

  [1, 2, 3, 4].forEach((v, d) => rig.send(((d + 1) << 8) | v));
  rig.go(700);
  check('индикатор показывает 1234', rig.disp.level === '1234' ? 1 : 0, 1, 0);

  // яркость мерцает в такт перебору разрядов, поэтому усредняем по кадрам
  const glow = () => {
    let sum = 0;
    for (let i = 0; i < 200; i++) { rig.go(1); sum += rig.disp.state.lit[1][0]; }
    return sum / 200;
  };
  const bright = glow();
  rig.send(0x0A03);                               // приглушаем вчетверо
  rig.go(900);
  check('яркость упала пропорционально скважности', glow() / bright, 4 / 16, 0.03);

  rig.send(0x0A0F);
  rig.send(0x0900);                               // выключаем дешифратор
  rig.send(0x017E);                               // прямая карта: всё кроме G и точки
  rig.go(700);
  check('без дешифратора биты ложатся на сегменты',
    Number(rig.disp.state.lit[0].map(v => v > 0.25 ? 1 : 0).join('')), 11111100, 0);

  const lit = rig.disp.i;
  rig.send(0x0C00);                               // назад в покой
  rig.go(2500);                                   // свечение гаснет не мгновенно
  check('в покое индикатор снова погашен', rig.disp.level.trim() === '' ? 1 : 0, 1, 0);
  check('ток индикатора сошёл на нет', rig.disp.i / lit < 1e-3 ? 1 : 0, 1, 0);
});

test('Без резистора задатчика MAX7219 не даёт тока', function () {
  const rig = maxRig(0);
  rig.send(0x0C01); rig.send(0x0B03); rig.send(0x09FF); rig.send(0x0A0F);
  rig.send(0x0108);
  rig.go(500);
  check('опорного тока нет', rig.u.iref, 0, 1e-9);
  check('индикатор не горит', rig.disp.level.trim() === '' ? 1 : 0, 1, 0);
  check('микросхема предупреждает', rig.u.warn ? 1 : 0, 1, 0);
});

test('Пример «Восемь огней по трём проводам»', function () {
  const ct = EC.examples.find(e => e.id === 'shift595').make();
  const leds = ct.components.filter(c => c.type === 'led');
  const sr = ct.components.find(c => c.type === 'sr595');
  check('программа собрана',
    ct.components.find(c => c.type === 'cpu8').state.asm.ok ? 1 : 0, 1, 0);
  const seen = new Set();
  for (let i = 0; i < 60000; i++) {
    ct.step(1 / 8000);
    if (i % 40 === 0) seen.add(leds.map(l => l.i > 3e-3 ? '1' : '0').join(''));
  }
  check('огонёк побывал на всех восьми выходах',
    [1, 2, 4, 8, 16, 32, 64, 128].filter(function (m) {
      return seen.has(Array.from({ length: 8 }, (_, k) => (m >> k) & 1).join(''));
    }).length, 8, 0);
  check('в регистре ровно один бит',
    [0, 1, 2, 4, 8, 16, 32, 64, 128].indexOf(sr.state.out) >= 0 ? 1 : 0, 1, 0);
});

test('Пример «Счётчик на цифровом индикаторе»', function () {
  const ct = EC.examples.find(e => e.id === 'max7219').make();
  const disp = ct.components.find(c => c.type === 'seg7x4');
  const drv = ct.components.find(c => c.type === 'max7219');
  const dt = 1 / 12000;
  const seen = [];
  for (let i = 0; i < 90000; i++) {
    ct.step(dt);
    if (i % 3000 === 0) {
      const s = disp.level;
      if (!seen.length || seen[seen.length - 1] !== s) seen.push(s);
    }
  }
  check('драйвер выведен из покоя', drv.state.on ? 1 : 0, 1, 0);
  check('дешифратор включён', drv.state.decode, 0xFF, 0);
  check('показаны четыре разряда', drv.state.scan, 3, 0);
  check('счёт дошёл до 0000', seen.indexOf('0000') >= 0 ? 1 : 0, 1, 0);
  check('счёт продолжился', seen.indexOf('0002') > seen.indexOf('0000') ? 1 : 0, 1, 0);
});


/* ------------------------------------------------------------------ */
/*  Два языка интерфейса                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Новые микросхемы автоматики                                        */
/* ------------------------------------------------------------------ */

/** Подаёт на два входа логического элемента уровни и читает выход. */
function gateOut(type, a, b) {
  const ct = new EC.Circuit();
  const g = ct.add(type, 0, 0);
  const gnd = ct.add('ground', -20, 20);
  const sa = ct.add('vsource', -20, -4);
  sa.props.wave = 'dc'; sa.props.amp = a ? 5 : 0; sa.props.Rint = 50;
  const sb = ct.add('vsource', -20, 4);
  sb.props.wave = 'dc'; sb.props.amp = b ? 5 : 0; sb.props.Rint = 50;
  ct.connect(sa.id, 0, g.id, 0); ct.connect(sa.id, 1, gnd.id, 0);
  ct.connect(sb.id, 0, g.id, 1); ct.connect(sb.id, 1, gnd.id, 0);
  const v = ct.add('voltmeter', 14, 0);
  ct.connect(g.id, 2, v.id, 0); ct.connect(v.id, 1, gnd.id, 0);
  ct.reset();
  run(ct, 0.03, 1e-4);
  return v.reading > 2.5 ? 1 : 0;
}

test('Таблицы истинности новых логических элементов', function () {
  const rows = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const table = type => rows.map(r => gateOut(type, r[0], r[1])).join('');
  check('И-НЕ даёт 1110', Number(table('nand_gate')), 1110, 0);
  check('ИЛИ-НЕ даёт 1000', Number(table('nor_gate')), 1000, 0);
  check('исключающее ИЛИ даёт 0110', Number(table('xor_gate')), 110, 0);
});

test('Кварцевый генератор выдаёт заданную частоту', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', -20, 0); bat.props.V = 5; bat.props.Rint = 0.1;
  const gnd = ct.add('ground', -20, 14);
  const g = ct.add('oscillator', 0, 0); g.props.freq = 500;
  ct.connect(bat.id, 0, g.id, 3); ct.connect(g.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  const r = ct.add('resistor', 14, 0); r.props.R = 1000;
  ct.connect(g.id, 2, r.id, 0); ct.connect(r.id, 1, gnd.id, 0);
  ct.reset();
  let edges = 0, prev = false, t = 0;
  for (let i = 0; i < 40000; i++) {
    ct.step(1e-5); t += 1e-5;
    const on = ct.x[g.n[2]] > 2.5;
    if (on && !prev) edges++;
    prev = on;
  }
  check('частота совпадает с заданной', edges / t, 500, 3);
  check('амплитуда доходит до питания', ct.x[g.n[2]] > 4.5 || ct.x[g.n[2]] < 0.5 ? 1 : 0, 1, 0);
});

test('D-триггер делит частоту пополам', function () {
  const ct = new EC.Circuit();
  const gnd = ct.add('ground', -20, 20);
  const clk = ct.add('vsource', -20, 0);
  clk.props.wave = 'square'; clk.props.amp = 2.5; clk.props.offset = 2.5;
  clk.props.freq = 200; clk.props.Rint = 50;
  const d = ct.add('dff', 0, 0);
  ct.connect(clk.id, 0, d.id, 1); ct.connect(clk.id, 1, gnd.id, 0);
  ct.connect(d.id, 4, d.id, 0);                 // /Q на вход D
  ct.reset();
  let edges = 0, prev = false, t = 0;
  for (let i = 0; i < 100000; i++) {
    ct.step(1e-5); t += 1e-5;
    const q = d.state.q;
    if (q && !prev) edges++;
    prev = q;
  }
  check('на выходе половина тактовой частоты', edges / t, 100, 2);
  check('прямой и обратный выходы противоположны',
    (ct.x[d.n[3]] > 2.5) !== (ct.x[d.n[4]] > 2.5) ? 1 : 0, 1, 0);
});

test('Счётчик CD4017 переводит единицу с выхода на выход', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', -30, 0); bat.props.V = 5; bat.props.Rint = 0.1;
  const gnd = ct.add('ground', -30, 20);
  const osc = ct.add('oscillator', -14, 0); osc.props.freq = 200;
  const cd = ct.add('cd4017', 6, 0);
  ct.connect(bat.id, 0, osc.id, 3); ct.connect(osc.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(bat.id, 0, cd.id, 15); ct.connect(cd.id, 7, gnd.id, 0);
  ct.connect(osc.id, 2, cd.id, 13);
  const Q = [2, 1, 3, 6, 9, 0, 4, 5, 8, 10];
  const leds = [];
  for (let i = 0; i < 10; i++) {
    const r = ct.add('resistor', 20, -18 + i * 4); r.props.R = 330;
    const l = ct.add('led', 32, -18 + i * 4);
    ct.connect(cd.id, Q[i], r.id, 0);
    ct.connect(r.id, 1, l.id, 0);
    ct.connect(l.id, 1, gnd.id, 0);
    leds.push(l);
  }
  ct.reset();
  const seen = new Set();
  let carry = 0, prevCarry = false;
  for (let i = 0; i < 60000; i++) {
    ct.step(2e-5);
    if (i % 20 === 0) seen.add(leds.map(l => l.i > 3e-3 ? '1' : '0').join(''));
    const co = ct.x[cd.n[11]] > 2.5;
    if (co && !prevCarry) carry++;
    prevCarry = co;
  }
  const single = [...seen].filter(s => s.split('1').length === 2);
  check('побывали все десять выходов', single.length, 10, 0);
  check('горит всегда только один', seen.size <= 11 ? 1 : 0, 1, 0);
  check('ток светодиода (5−1,9)/(Rвых+R)', leds.find(l => l.i > 3e-3).i,
    (5 - 1.9) / (40 + 330), 5e-4);
  // вывод переноса делит частоту такта на десять
  check('перенос срабатывает вдесятеро реже такта', carry, 200 * 1.2 / 10, 3);
});

test('Сборка ULN2003 тянет нагрузку к общему проводу', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', -30, 0); bat.props.V = 12; bat.props.Rint = 0.1;
  const gnd = ct.add('ground', -30, 20);
  const u = ct.add('uln2003', 0, 0);
  const lamp = ct.add('lamp', 20, 0); lamp.props.Vn = 12; lamp.props.Pn = 3;
  const src = ct.add('vsource', -16, 10);
  src.props.wave = 'dc'; src.props.amp = 0; src.props.Rint = 50;
  ct.connect(bat.id, 1, gnd.id, 0); ct.connect(u.id, 7, gnd.id, 0);
  ct.connect(bat.id, 0, lamp.id, 0); ct.connect(lamp.id, 1, u.id, 15);
  ct.connect(bat.id, 0, u.id, 8);
  ct.connect(src.id, 0, u.id, 0); ct.connect(src.id, 1, gnd.id, 0);
  ct.reset();
  run(ct, 0.8, 2e-4);
  check('вход отпущен — ключ закрыт', lamp.i < 1e-4 ? 1 : 0, 1, 0);
  src.props.amp = 5;
  run(ct, 1.2, 2e-4);
  check('вход поднят — лампа горит на полный ток', lamp.i, 3 / 12, 0.02);
  check('падение на открытом ключе меньше вольта',
    (ct.x[u.n[15]] - 0) < 1 ? 1 : 0, 1, 0);
  check('занят один ключ из семи', u.level === '1/7' ? 1 : 0, 1, 0);
});

test('Оптрон передаёт ток светом', function () {
  const ct = new EC.Circuit();
  const gnd = ct.add('ground', -30, 24);
  const b1 = ct.add('battery', -30, 0); b1.props.V = 5; b1.props.Rint = 0.1;
  const b2 = ct.add('battery', 20, 0); b2.props.V = 12; b2.props.Rint = 0.1;
  const o = ct.add('optocoupler', -6, 0);
  const rin = ct.add('resistor', -18, -4); rin.props.R = 330;
  const rout = ct.add('resistor', 8, -4); rout.props.R = 10000;
  ct.connect(b1.id, 0, rin.id, 0); ct.connect(rin.id, 1, o.id, 0);
  ct.connect(o.id, 1, gnd.id, 0); ct.connect(b1.id, 1, gnd.id, 0);
  ct.connect(b2.id, 0, rout.id, 0); ct.connect(rout.id, 1, o.id, 3);
  ct.connect(o.id, 2, gnd.id, 0); ct.connect(b2.id, 1, gnd.id, 0);
  ct.reset();
  run(ct, 0.4, 2e-4);
  check('ток светодиода (5−1,2)/330', o._iled, (5 - 1.2) / 330, 3e-4);
  check('транзистор насыщен — Uкэ мало', o.v < 0.5 ? 1 : 0, 1, 0);
  check('ток коллектора задан нагрузкой', o.i, (12 - o.v) / 10000, 5e-5);

  // при малой передаче транзистор выходит из насыщения и ток задаёт он сам
  o.props.ctr = 0.05;
  run(ct, 0.4, 2e-4);
  check('ток стал равен доле тока светодиода', o.i, o._iled * 0.05, 6e-5);
  check('и напряжение на транзисторе выросло', o.v > 4 ? 1 : 0, 1, 0);

  // без тока в светодиоде транзистор закрыт
  b1.props.V = 0;
  run(ct, 0.4, 2e-4);
  check('свет погас — транзистор закрыт', o.i < 1e-6 ? 1 : 0, 1, 0);
});

test('Пример «Бегущие огни без процессора»', function () {
  const ct = EC.examples.find(e => e.id === 'chaser4017').make();
  const leds = ct.components.filter(c => c.type === 'led');
  const seen = new Set();
  for (let i = 0; i < 300000; i++) {
    ct.step(2e-5);
    if (i % 50 === 0) seen.add(leds.map(l => l.i > 3e-3 ? '1' : '0').join(''));
  }
  const single = [...seen].filter(s => s.split('1').length === 2);
  check('огонёк обошёл все десять светодиодов', single.length, 10, 0);
  check('лишних сочетаний не было', seen.size, 11, 0);
});

test('Пример «Точка бежит по матрице 8×8»', function () {
  const ct = EC.examples.find(e => e.id === 'matrix').make();
  const m = ct.components.find(c => c.type === 'matrix8');
  const drv = ct.components.find(c => c.type === 'max7219');
  const dt = 1 / 6000;
  const spots = [];
  for (let i = 0; i < 150000; i++) {
    ct.step(dt);
    if (i % 12000 === 0 && i > 12000) {
      for (let r = 0; r < 8; r++) {
        for (let k = 0; k < 8; k++) if (m.state.lit[r][k] > 0.25) spots.push(r * 8 + k);
      }
    }
  }
  check('драйвер выведен из покоя', drv.state.on ? 1 : 0, 1, 0);
  check('показаны все восемь рядов', drv.state.scan, 7, 0);
  check('дешифратор выключен — биты идут на столбцы', drv.state.decode, 0, 0);
  check('горит ровно одна точка', m.level === '1/64' ? 1 : 0, 1, 0);
  check('точка двигалась', spots.length > 3 && spots[0] !== spots[spots.length - 1] ? 1 : 0, 1, 0);
  check('точка шла по порядку', spots.every((v, i) => i === 0 || v > spots[i - 1]) ? 1 : 0, 1, 0);
});


test('Ассемблер предупреждает о переменной внутри программы', function () {
  const A = EC.cpu.assemble;
  let r = A('LDI 5\nST 0x02\nHLT');
  check('короткая программа собралась', r.ok ? 1 : 0, 1, 0);
  check('свободное место посчитано', r.free, 256 - r.size, 0);
  check('запись внутрь программы замечена', r.warnings.length, 1, 0);
  check('предупреждение указывает строку', r.warnings[0].line, 2, 0);

  let long = '';
  for (let i = 0; i < 90; i++) long += 'LDI ' + (i & 0xFF) + '\n';
  long += 'ST 0x80\nLD 0x80\nHLT';
  r = A(long);
  check('длинная программа занимает 185 байт', r.size, 185, 0);
  check('обе ссылки на 0x80 отмечены', r.warnings.length, 2, 0);

  // чтение таблицы по метке — это нормально, запись в неё — нет
  r = A('данные: DB 1 2 3\nстарт:  LD данные\n        HLT');
  check('чтение своей таблицы не пугает', r.warnings.length, 0, 0);
  r = A('данные: DB 1 2 3\nстарт:  ST данные\n        HLT');
  check('запись в таблицу отмечена', r.warnings.length, 1, 0);

  r = A('LDI 1\nST 0xFF\nHLT');
  check('запись в область стека отмечена', r.warnings.length, 1, 0);

  r = A('LDI 1\nST 0xF0\nLD 0xF0\nHLT');
  check('нормальная программа без замечаний', r.warnings.length, 0, 0);

  // ни один пример не должен ругаться
  let bad = 0;
  EC.examples.forEach(function (ex) {
    ex.make().components.forEach(function (c) {
      const a = c.state && c.state.asm;
      if (a && a.warnings && a.warnings.length) bad++;
    });
  });
  check('во всех примерах память разложена верно', bad, 0, 0);
});

test('Английский перевод покрывает всё, что видит человек', function () {
  const d = EC.i18n.en;
  const cyr = /[А-Яа-яЁё]/;
  const miss = [];
  const chk = s => {
    if (typeof s === 'string' && cyr.test(s) && d[s] === undefined && miss.indexOf(s) < 0) miss.push(s);
  };
  EC.categories.forEach(c => chk(c.name));
  Object.keys(EC.defs).forEach(function (k) {
    const def = EC.defs[k];
    chk(def.name); chk(def.tip);
    (def.pins || []).forEach(p => chk(p.name));
    (def.props || []).forEach(function (p) {
      chk(p.label); chk(p.unit);
      if (typeof p.def === 'string') chk(p.def);
      (p.options || []).forEach(o => chk(o.t));
    });
  });
  EC.WIRE_COLORS.forEach(c => chk(c.name));
  EC.cpu.ISA.forEach(x => chk(x.t));
  EC.examples.forEach(function (e) { chk(e.name); chk(e.hint); });
  if (miss.length) console.log('      нет перевода: ' + miss.slice(0, 5).join(' | '));
  check('все названия, подсказки и параметры переведены', miss.length, 0, 0);

  // в английском описании для ИИ не должно остаться русского текста
  EC.lang = 'en';
  const text = EC.aiPrompt.build();
  const ru = text.split('\n').filter(l => cyr.test(l));
  if (ru.length) console.log('      осталось: ' + ru.slice(0, 3).join(' | '));
  check('описание формата полностью на английском', ru.length, 0, 0);
  check('английское описание не короче русского', text.length > 20000 ? 1 : 0, 1, 0);

  // английские программы примеров собираются и дают тот же код
  let bad = 0, checked = 0;
  Object.keys(d).forEach(function (k) {
    if (k.indexOf('\n') < 0) return;
    const a = EC.cpu.assemble(k), b = EC.cpu.assemble(d[k]);
    checked++;
    if (!b.ok || a.size !== b.size) bad++;
  });
  check('переведённые программы собираются', bad, 0, 0);
  check('программ проверено', checked >= 6 ? 1 : 0, 1, 0);

  // единицы измерения и приставки следуют за языком
  check('приставка СИ по-английски', EC.util.fmtSI(4700, 3) === '4.7k' ? 1 : 0, 1, 0);
  check('единица по-английски', EC.util.fmtUnit(5, 'В') === '5V' ? 1 : 0, 1, 0);
  EC.lang = 'ru';
  check('приставка СИ по-русски', EC.util.fmtSI(4700, 3) === '4.7к' ? 1 : 0, 1, 0);
  check('единица по-русски', EC.util.fmtUnit(5, 'В') === '5В' ? 1 : 0, 1, 0);
});

test('Перевод покрывает и статическую разметку', function () {
  const fs = require('fs');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  const cyr = /[А-Яа-яЁё]/;
  const seen = [];
  const push = v => {
    const s = v.split(/\s+/).filter(Boolean).join(' ');
    if (s && cyr.test(s) && seen.indexOf(s) < 0) seen.push(s);
  };
  let m;
  const re = />([^<>]+)</g;
  while ((m = re.exec(html))) push(m[1]);
  const at = /(?:title|placeholder|aria-label)="([^"]*)"/g;
  while ((m = at.exec(html))) push(m[1]);
  const miss = seen.filter(x => EC.i18n.en[x] === undefined);
  if (miss.length) console.log('      нет перевода: ' + miss.slice(0, 5).join(' | '));
  check('весь текст разметки переведён', miss.length, 0, 0);
  check('строк разметки проверено', seen.length > 80 ? 1 : 0, 1, 0);
});

test('Схема на английском языке считается так же', function () {
  EC.lang = 'en';
  const ct = EC.examples.find(e => e.id === 'max7219').make();
  const disp = ct.components.find(c => c.type === 'seg7x4');
  const cpu = ct.components.find(c => c.type === 'cpu8');
  check('английская программа собрана', cpu.state.asm.ok ? 1 : 0, 1, 0);
  const seen = [];
  for (let i = 0; i < 60000; i++) {
    ct.step(1 / 12000);
    if (i % 3000 === 0 && /^\d{4}$/.test(disp.level) &&
      seen[seen.length - 1] !== disp.level) seen.push(disp.level);
  }
  check('счёт идёт и по-английски', seen.indexOf('0000') >= 0 && seen.length >= 2 ? 1 : 0, 1, 0);
  EC.lang = 'ru';
});

console.log('\n' + '─'.repeat(50));
console.log(failed === 0 ? `Все проверки пройдены: ${passed}` : `Пройдено ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
