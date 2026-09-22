/* ElectroCore — два языка интерфейса.
 *
 * Ключ словаря — сама русская строка: так в коде остаётся читаемый текст,
 * а перевод подставляется в момент отрисовки. Чего в словаре нет, то
 * показывается как есть, поэтому забытая строка ничего не ломает.
 */
(function (global) {
  'use strict';
  var EC = global.EC;

  var EN = {};
  EC.lang = 'ru';
  EC.i18n = { en: EN };

  /** Перевод строки на текущий язык. */
  function t(s) {
    if (EC.lang === 'ru' || typeof s !== 'string') return s;
    var d = EC.i18n[EC.lang];
    return (d && d[s] !== undefined) ? d[s] : s;
  }
  EC.t = t;

  /** Приставки СИ и единицы, которые пишутся по-разному. */
  EC.SI_PREFIX = {
    ru: ['Т', 'Г', 'М', 'к', '', 'м', 'мк', 'н', 'п', 'ф'],
    en: ['T', 'G', 'M', 'k', '', 'm', 'µ', 'n', 'p', 'f']
  };

  /** Список языков для настроек. */
  EC.LANGS = [
    { v: 'ru', t: 'Русский' },
    { v: 'en', t: 'English' }
  ];

  function add(map) { for (var k in map) if (map.hasOwnProperty(k)) EN[k] = map[k]; }
  EC.i18nAdd = add;

  /* ================================================================== */
  /*  Единицы измерения                                                 */
  /* ================================================================== */

  add({
    'В': 'V', 'А': 'A', 'Вт': 'W', 'Гц': 'Hz', 'Ф': 'F', 'Гн': 'H',
    'с': 's', 'В·с/рад': 'V·s/rad', 'кг·м²': 'kg·m²', 'Н·м·с': 'N·m·s',
    'Н·м': 'N·m', 'А/В²': 'A/V²', '1/В': '1/V', 'В/': 'V/', ' лк': ' lx',
    ' об/мин': ' rpm', '/дел': '/div', 'с/дел': 's/div', ' КБ · ': ' KB · ',
    ' байт': ' bytes', ' число': ' number', ' адрес': ' address'
  });

  /* ================================================================== */
  /*  Интерфейс                                                         */
  /* ================================================================== */

  add({
    /* панель инструментов и меню */
    'Пуск': 'Run',
    'Пауза': 'Pause',
    'Шаг': 'Step',
    'Сброс': 'Reset',
    'Рука': 'Hand',
    'Перемещение': 'Move',
    'Двигать': 'Move',
    'Провод': 'Wire',
    'Стереть': 'Erase',
    'Примеры': 'Examples',
    'Вид': 'Look',
    'Пуск / пауза (пробел)': 'Run / pause (space)',
    'Один шаг': 'Single step',
    'Сбросить состояние': 'Reset state',
    'Рука: ничего не меняет, только нажимает (H)': 'Hand: changes nothing, only presses (H)',
    'Перемещение деталей (V)': 'Move parts (V)',
    'Провода: тянуть и удалять (W)': 'Wires: draw and delete (W)',
    'Удаление деталей (E)': 'Delete parts (E)',
    'Отменить (Ctrl+Z)': 'Undo (Ctrl+Z)',
    'Повторить (Ctrl+Y)': 'Redo (Ctrl+Y)',
    'Повернуть (R)': 'Rotate (R)',
    'Удалить (Del)': 'Delete (Del)',
    'Готовые схемы': 'Ready-made circuits',
    'Переключить вид: детали или схема': 'Switch look: parts or schematic',
    'Вписать в экран': 'Fit to screen',
    'Файл и настройки': 'File and settings',
    'Инструмент': 'Tool',
    'Приблизить': 'Zoom in',
    'Отдалить': 'Zoom out',
    'Рабочий стол схемы': 'Circuit workbench',
    'Компоненты': 'Parts',
    'КОМПОНЕНТЫ': 'PARTS',
    'Свойства': 'Properties',
    'СВОЙСТВА': 'PROPERTIES',
    'Осциллограф': 'Scope',
    'ОСЦИЛЛОГРАФ': 'SCOPE',
    'Элементы': 'Parts',
    'График': 'Chart',
    'Время': 'Time',
    'Узлов': 'Nodes',
    'Итераций': 'Iterations',
    'Развёртка': 'Sweep',
    'Очистить': 'Clear',

    /* меню */
    'Новая схема': 'New circuit',
    'Сохранить в браузере': 'Save in browser',
    'Загрузить из браузера': 'Load from browser',
    'Экспорт в файл…': 'Export to file…',
    'Импорт из файла…': 'Import from file…',
    'Вид рабочего стола': 'Workbench look',
    'Детали': 'Parts',
    'Схема': 'Schematic',
    'Показывать U / I / P': 'Show U / I / P',
    'Анимация тока': 'Current animation',
    'Окрашивать провода по напряжению': 'Colour wires by voltage',
    'Сетка': 'Grid',
    'Звук зуммера': 'Buzzer sound',
    'Скорость': 'Speed',
    'Язык': 'Language',
    'Схема через ИИ…': 'Circuit by AI…',
    'Справка и горячие клавиши': 'Help and shortcuts',

    /* сообщения */
    'Вид: реалистичные детали': 'Look: realistic parts',
    'Вид: условная схема': 'Look: schematic symbols',
    'Коснитесь стола, чтобы поставить «': 'Tap the bench to place “',
    ' добавлен': ' added',
    'Состояние сброшено': 'State reset',
    'Схема сохранена в браузере': 'Circuit saved in the browser',
    'Схема загружена': 'Circuit loaded',
    'Сохранённых схем нет': 'No saved circuits',
    'Описание сохранено': 'Description saved',
    'Текущая схема': 'Current circuit',
    'Схема со стола записана в поле. Скопируйте её вместе с описанием и попросите ИИ внести правки.':
      'The circuit on the bench has been written into the field. Copy it together with the description and ask the AI to make changes.',
    'Схема загружена из файла': 'Circuit loaded from file',
    'Не удалось прочитать файл': 'Could not read the file',
    'Не удалось сохранить': 'Could not save',
    'Сохранено': 'Saved',
    'схема-electrocore.json': 'electrocore-circuit.json',
    'Выберите элемент, чтобы изменить параметры и увидеть измерения.':
      'Select a part to change its settings and see measurements.',
    'Выделено: ': 'Selected: ',
    'Повернуть': 'Rotate',
    'Дублировать': 'Duplicate',
    'Удалить': 'Delete',
    'Удалить?': 'Delete?',
    'Цвет изоляции': 'Insulation colour',
    'Потяните за середину провода, чтобы переложить его на другую линию коврика.':
      'Drag the middle of the wire to move it to another line of the mat.',
    'Переложить': 'Reroute',
    'Развернуть': 'Flip',
    'Обозначение': 'Designation',
    'Измерения': 'Measurements',
    'Перезапустить': 'Restart',
    'Процессор перезапущен': 'Processor restarted',
    'На график': 'To chart',
    'Добавлено на осциллограф': 'Added to the scope',
    'Ток на график': 'Current to chart',
    'Собрано: ': 'Assembled: ',
    'Строка ': 'Line ',
    'Выберите элемент и нажмите «На график»': 'Select a part and press “To chart”',
    'Схема не решается: проверьте наличие земли и разрывы цепи':
      'The circuit has no solution: check for a ground and for breaks',
    'Неизвестный тип: ': 'Unknown type: ',
    'Соберите свою первую схему': 'Build your first circuit',
    'Выберите элемент слева и коснитесь рабочего стола. Тяните от вывода элемента, чтобы протянуть провод.':
      'Pick a part on the left and tap the bench. Drag from a pin to run a wire.',
    'Или откройте готовый пример в меню сверху.': 'Or open a ready-made example from the menu above.',
    'Выберите схему — она соберётся на столе и сразу заработает.':
      'Pick a circuit — it will appear on the bench and start working at once.',

    /* показания */
    'Ток': 'Current',
    'Iб': 'Ib', 'Iк': 'Ic', 'Uкэ': 'Uce',
    'Uвх': 'Uin', 'Uвых': 'Uout', 'Iвых': 'Iout',
    'адрес': 'address', 'байт': 'byte',
    'Флаги ': 'Flags ', ' · такт ': ' · cycle ',
    'сброс': 'reset', 'остановлен': 'halted',
    'выборка кода': 'opcode fetch',
    'запись в память': 'write to memory',
    'чтение памяти': 'memory read',
    'Обмен: ': 'Bus: ', ' · ячеек ': ' · cells ',
    'микросхема выбрана': 'chip selected',
    'не выбрана': 'not selected',
    'Питания нет': 'No power',
    'Режим: ': 'Mode: ',
    'текущее': 'now', 'размах': 'peak-to-peak', 'среднее': 'mean',
    'действ.': 'rms', 'частота': 'frequency', 'нет данных': 'no data',

    /* множественные числа */
    'деталь': 'part', 'детали': 'parts', 'деталей': 'parts',
    'провод': 'wire', 'провода': 'wires', 'проводов': 'wires'
  });

  /* ================================================================== */
  /*  Разделы палитры и названия деталей                                */
  /* ================================================================== */

  add({
    'Пассивные': 'Passive',
    'Источники': 'Sources',
    'Коммутация': 'Switching',
    'Полупроводники': 'Semiconductors',
    'Логика': 'Logic',
    'Индикация': 'Display',
    'Исполнительные': 'Actuators',
    'Измерения': 'Meters',

    'Резистор': 'Resistor',
    'Конденсатор': 'Capacitor',
    'Электролит': 'Electrolytic',
    'Катушка': 'Inductor',
    'Потенциометр': 'Potentiometer',
    'Лампа': 'Lamp',
    'Предохранитель': 'Fuse',
    'Термистор': 'Thermistor',
    'Фоторезистор': 'Photoresistor',
    'Трансформатор': 'Transformer',
    'Земля': 'Ground',
    'Батарея': 'Battery',
    'Генератор': 'Signal generator',
    'Источник тока': 'Current source',
    'Выключатель': 'Switch',
    'Кнопка': 'Push-button',
    'Переключатель': 'Changeover switch',
    'Реле': 'Relay',
    'Диод': 'Diode',
    'Стабилитрон': 'Zener diode',
    'Светодиод': 'LED',
    'Транзистор NPN': 'NPN transistor',
    'Транзистор PNP': 'PNP transistor',
    'MOSFET N-канал': 'N-channel MOSFET',
    'MOSFET P-канал': 'P-channel MOSFET',
    'Операционный усилитель': 'Op-amp',
    'Диод Шоттки': 'Schottky diode',
    'Диодный мост': 'Bridge rectifier',
    'Стабилизатор': 'Voltage regulator',
    'Двигатель': 'DC motor',
    'Зуммер': 'Buzzer',
    'Элемент НЕ': 'NOT gate',
    'Элемент И': 'AND gate',
    'Элемент ИЛИ': 'OR gate',
    'Таймер 555': '555 timer',
    'Микроконтроллер EC-8': 'EC-8 microcontroller',
    'Процессор EC-8B': 'EC-8B processor',
    'Память 1К×8': 'Memory 1K×8',
    'Индикатор 7 сегментов': 'Seven-segment display',
    'Индикатор 4 разряда': 'Four-digit display',
    'Сдвиговый регистр 74HC595': '74HC595 shift register',
    'Драйвер MAX7219': 'MAX7219 driver',
    'Вольтметр': 'Voltmeter',
    'Амперметр': 'Ammeter',
    'Ваттметр': 'Wattmeter',
    'Щуп осциллографа': 'Scope probe',
    'Узел': 'Junction'
  });

  /* ------------------------- что деталь делает ---------------------- */

  add({
    'Сопротивление по закону Ома: U = I·R': 'Resistance by Ohm’s law: U = I·R',
    'Накапливает заряд: I = C·dU/dt': 'Stores charge: I = C·dU/dt',
    'Полярный конденсатор большой ёмкости': 'Polarised capacitor of large value',
    'Индуктивность: U = L·dI/dt': 'Inductance: U = L·dI/dt',
    'Переменный резистор с движком': 'Variable resistor with a wiper',
    'Лампа накаливания: нить нагревается, сопротивление растёт':
      'Incandescent lamp: the filament heats up and its resistance rises',
    'Перегорает при превышении тока': 'Blows when the current is exceeded',
    'Опорный узел, потенциал 0 В. Нужен в каждой схеме.':
      'Reference node at 0 V. Every circuit needs one.',
    'Источник постоянного напряжения с внутренним сопротивлением':
      'Constant-voltage source with internal resistance',
    'Источник напряжения: синус, меандр, пила, импульсы':
      'Voltage source: sine, square, sawtooth, pulses',
    'Задаёт ток независимо от нагрузки': 'Holds the current whatever the load',
    'Нажмите на элемент, чтобы переключить': 'Click the part to toggle it',
    'Замкнута, пока удерживается нажатой': 'Closed while held down',
    'Переключает общий вывод между двумя контактами':
      'Switches the common pin between two contacts',
    'Катушка управляет контактом: срабатывает при токе выше порога':
      'The coil drives a contact: it pulls in above the threshold current',
    'Пропускает ток только в одну сторону (модель Шокли)':
      'Passes current one way only (Shockley model)',
    'Стабилизирует напряжение при обратном включении':
      'Holds the voltage when connected in reverse',
    'Яркость пропорциональна току. Не забудьте токоограничивающий резистор!':
      'Brightness follows the current. Don’t forget the series resistor!',
    'Модель Эберса–Молла: малый ток базы управляет большим током коллектора':
      'Ebers–Moll model: a small base current controls a large collector current',
    'Управляется напряжением на затворе (квадратичная модель)':
      'Controlled by the gate voltage (square-law model)',
    'Идеальный ОУ с ограничением по напряжению питания':
      'Ideal op-amp clipped by its supply rails',
    'Подключается параллельно участку. Внутреннее сопротивление 10 МΩ.':
      'Connects across the part under test. Internal resistance 10 MΩ.',
    'Включается последовательно в цепь. Шунт 1 мΩ.':
      'Goes in series with the circuit. Shunt 1 mΩ.',
    'Токовые клеммы — последовательно, клеммы напряжения — параллельно нагрузке. P = U·I':
      'Current terminals in series, voltage terminals across the load. P = U·I',
    'Измеряет потенциал узла относительно земли':
      'Measures a node’s potential against ground',
    'Точка соединения нескольких проводов': 'A point where several wires meet',
    'Сопротивление падает при нагреве: R = R₂₅·exp(B·(1/T − 1/298))':
      'Resistance falls as it warms: R = R₂₅·exp(B·(1/T − 1/298))',
    'Чем ярче свет, тем меньше сопротивление': 'The brighter the light, the lower the resistance',
    'Две связанные катушки: напряжение делится в отношении витков':
      'Two coupled coils: the voltage divides in the turns ratio',
    'Малое прямое падение (около 0,3 В) и высокое быстродействие':
      'Low forward drop (about 0.3 V) and very fast',
    'Четыре диода: превращает переменное напряжение в пульсирующее постоянное':
      'Four diodes turning alternating voltage into pulsating direct voltage',
    'Держит на выходе заданное напряжение, пока на входе хватает запаса':
      'Holds the set output voltage as long as the input has enough headroom',
    'Ток создаёт момент, вращение наводит противо-ЭДС: U = I·R + Ke·ω':
      'Current makes torque, rotation makes back-EMF: U = I·R + Ke·ω',
    'Пищит, когда через него идёт ток': 'Sounds while current flows through it',
    'Порог переключения — половина напряжения питания':
      'The switching threshold is half the supply voltage',
    'Микросхема DIP-8 с настоящей нумерацией выводов. Делитель из трёх резисторов задаёт пороги ⅓ и ⅔ питания; вывод 5 позволяет сдвинуть порог, вывод 4 — погасить выход.':
      'A DIP-8 chip with the real pin numbering. A divider of three resistors sets the ⅓ and ⅔ thresholds; pin 5 shifts them, pin 4 blanks the output.',
    'Однокристальная машина: процессор, память на 256 байт и четыре линии ввода-вывода в одном корпусе — как у ATtiny. Внешняя память не нужна.':
      'A single-chip machine: processor, 256 bytes of memory and four I/O lines in one package, like an ATtiny. No external memory needed.',
    'Настоящий процессор: своей памяти у него нет. Код и данные он читает по внешней шине адреса и данных, поэтому рядом обязательно нужна микросхема памяти.':
      'A real processor: it has no memory of its own. It reads code and data over an external address and data bus, so a memory chip must sit beside it.',
    'Статическое ОЗУ на 1024 байта: слева шина адреса и выбор микросхемы, справа сигналы обмена и шина данных. Работает, когда /ВЫБ прижат к общему проводу, а ВЫБ2 — к питанию. Процессор EC-8B адресует только первые 256 байт, поэтому входы A8 и A9 сажают на общий провод.':
      'A 1024-byte static RAM: address bus and chip select on the left, bus signals and data on the right. It works when /CS is held low and CE2 high. The EC-8B addresses only the first 256 bytes, so A8 and A9 go to ground.',
    'Одна цифра из восьми светодиодов. Общий вывод сажают на землю (общий катод) или на питание (общий анод), каждый сегмент — через свой резистор.':
      'One digit made of eight LEDs. The common pin goes to ground (common cathode) or to the supply (common anode), and every segment needs its own resistor.',
    'Четыре цифры в одном корпусе. Сегменты у всех разрядов общие, разряды зажигаются по очереди своими выводами Р1…Р4 — это называется динамической индикацией. Проще всего управлять им через MAX7219.':
      'Four digits in one package. All digits share their segments and light up in turn through pins D1…D4 — that is multiplexed display. The easiest way to drive it is a MAX7219.',
    'Три провода вместо восьми: биты вдвигаются по одному выводом ДАН тактами СДВ, а по фронту ЗАЩ разом выходят на Q0…Q7. Вывод Q7* отдаёт вытесненный бит — к нему цепляют следующий такой же регистр.':
      'Three wires instead of eight: bits go in one at a time through DS clocked by SHCP, and an edge on STCP puts the whole byte on Q0…Q7. Q7* gives out the bit pushed through — chain the next register there.',
    'Управляет восемью разрядами по трём проводам: ДАН, ТАКТ и ЗАГР. Сам перебирает разряды, сам держит цифры и сам ограничивает ток — его задаёт резистор от V+ к выводу ISET. Без этого резистора индикатор не загорится.':
      'Drives eight digits over three wires: DIN, CLK and LOAD. It scans the digits, holds the numbers and limits the current itself — a resistor from V+ to ISET sets it. Without that resistor the display stays dark.'
  });

  /* ------------------------ параметры и выводы ---------------------- */

  add({
    'Сопротивление': 'Resistance',
    'Ёмкость': 'Capacitance',
    'Начальное U': 'Initial U',
    'Макс. U': 'Max U',
    'Индуктивность': 'Inductance',
    'Сопр. обмотки': 'Winding resistance',
    'Полное сопр.': 'Total resistance',
    'Положение': 'Position',
    'Номин. U': 'Rated U',
    'Номин. P': 'Rated P',
    'Номин. ток': 'Rated current',
    'ЭДС': 'EMF',
    'Внутр. сопр.': 'Internal resistance',
    'Форма': 'Waveform',
    'Постоянное': 'Constant',
    'Синус': 'Sine',
    'Меандр': 'Square',
    'Треугольник': 'Triangle',
    'Пила': 'Sawtooth',
    'Импульсы': 'Pulses',
    'Амплитуда': 'Amplitude',
    'Частота': 'Frequency',
    'Смещение': 'Offset',
    'Фаза': 'Phase',
    'Скважность': 'Duty cycle',
    'Выходное сопр.': 'Output resistance',
    'Замкнут': 'Closed',
    'Нормально замкнута': 'Normally closed',
    'Позиция 2': 'Position 2',
    'Сопр. катушки': 'Coil resistance',
    'Ток срабатывания': 'Pull-in current',
    'Ток насыщения': 'Saturation current',
    'Коэф. неидеальности': 'Ideality factor',
    'Напряжение стабил.': 'Zener voltage',
    'Цвет': 'Colour',
    'Красный': 'Red', 'Зелёный': 'Green', 'Синий': 'Blue',
    'Жёлтый': 'Yellow', 'Белый': 'White',
    'красный': 'red', 'зелёный': 'green', 'синий': 'blue',
    'жёлтый': 'yellow', 'белый': 'white', 'оранжевый': 'orange',
    'фиолетовый': 'violet', 'коричневый': 'brown', 'чёрный': 'black', 'серый': 'grey',
    'Прямое падение': 'Forward drop',
    'Коэф. усиления β': 'Current gain β',
    'Обратный β': 'Reverse β',
    'Пороговое U': 'Threshold U',
    'Крутизна': 'Transconductance',
    'Модуляция канала': 'Channel modulation',
    'Коэф. усиления': 'Gain',
    'Питание +': 'Supply +',
    'Питание −': 'Supply −',
    'Входное сопр.': 'Input resistance',
    'Сопр. шунта': 'Shunt resistance',
    'Сопр. при 25 °C': 'Resistance at 25 °C',
    'Коэффициент B': 'B constant',
    'Температура': 'Temperature',
    'Сопр. при 10 лк': 'Resistance at 10 lx',
    'Показатель γ': 'Gamma γ',
    'Освещённость': 'Illuminance',
    'Индуктивность I': 'Inductance I',
    'Отношение витков': 'Turns ratio',
    'Связь': 'Coupling',
    'Сопр. обмотки I': 'Winding I resistance',
    'Сопр. обмотки II': 'Winding II resistance',
    'Выходное U': 'Output U',
    'Запас по входу': 'Input headroom',
    'Постоянная': 'Constant',
    'Момент инерции': 'Moment of inertia',
    'Трение': 'Friction',
    'Момент нагрузки': 'Load torque',
    'Частота звука': 'Tone frequency',
    'Напряжение питания': 'Supply voltage',
    'Сопр. разряда': 'Discharge resistance',
    'Резисторы делителя': 'Divider resistors',
    'Подтяжка сброса': 'Reset pull-up',
    'Программа': 'Program',
    'Тактирование': 'Clock source',
    'встроенный': 'internal',
    'с вывода CLK': 'from the CLK pin',
    'Тактовая частота': 'Clock frequency',
    'Сопр. выхода': 'Output resistance',
    'Сопр. выходов': 'Output resistance',
    'Подтяжка входа': 'Input pull-up',
    'Содержимое': 'Contents',
    'Только чтение (ПЗУ)': 'Read only (ROM)',
    'общий катод': 'common cathode',
    'общий анод': 'common anode',
    'Номин. ток сегмента': 'Rated segment current',
    'Сопр. выхода ВЫХ': 'DOUT resistance',

    /* выводы на корпусах */
    'К+': 'C+', 'К−': 'C−',
    'Б': 'B', 'К': 'C', 'Э': 'E',
    'З': 'G', 'С': 'D', 'И': 'S',
    'вых': 'out', 'вх': 'in', 'общ': 'com', 'вх1': 'in1', 'вх2': 'in2',
    'ВЫХ': 'OUT', 'ВХ': 'IN', 'ОБЩ': 'COM', 'ОУ': 'OA',
    '2 ЗАП': '2 TRG', '3 ВЫХ': '3 OUT', '4 СБР': '4 RST', '5 УПР': '5 CTL',
    '6 ПОР': '6 THR', '7 РАЗР': '7 DIS',
    'ЗАП': 'TRG', 'СБР': 'RST', 'УПР': 'CTL', 'ПОР': 'THR', 'РАЗР': 'DIS',
    '3 СБР': '3 RST',
    '5 /СТОП': '5 /HLT', '6 /КОД': '6 /M1',
    '19 /ЧТ': '19 /RD', '20 /ЗП': '20 /WR',
    '/СТОП': '/HLT', '/КОД': '/M1', '/ЧТ': '/RD', '/ЗП': '/WR',
    '3 /ВЫБ': '3 /CS', '4 ВЫБ2': '4 CE2', '15 /ЧТ': '15 /OE', '16 /ЗП': '16 /WE',
    '/ВЫБ': '/CS', 'ВЫБ2': 'CE2',
    '3 ОБЩ': '3 COM', '8 ОБЩ': '8 COM',
    '6 Р4': '6 D4', '12 Р1': '12 D1', '9 Р2': '9 D2', '8 Р3': '8 D3',
    '10 /СБР': '10 /MR', '11 СДВ': '11 SHCP', '12 ЗАЩ': '12 STCP',
    '13 /РАЗР': '13 /OE', '14 ДАН': '14 DS',
    '/СБР': '/MR', 'СДВ': 'SHCP', 'ЗАЩ': 'STCP', '/РАЗР': '/OE', 'ДАН': 'DS',
    '1 ДАН': '1 DIN', '12 ЗАГР': '12 LOAD', '13 ТАКТ': '13 CLK', '23 ВЫХ': '23 DOUT',
    'ЗАГР': 'LOAD', 'ТАКТ': 'CLK',
    '2 Р0': '2 DIG0', '3 Р4': '3 DIG4', '5 Р6': '5 DIG6', '6 Р2': '6 DIG2',
    '7 Р3': '7 DIG3', '8 Р7': '8 DIG7', '10 Р5': '10 DIG5', '11 Р1': '11 DIG1',
    '14 СЕГ A': '14 SEG A', '15 СЕГ F': '15 SEG F', '17 СЕГ D': '17 SEG D',
    '18 СЕГ DP': '18 SEG DP', '19 СЕГ E': '19 SEG E', '20 СЕГ C': '20 SEG C',
    '21 СЕГ G': '21 SEG G', '22 СЕГ B': '22 SEG B',
    'Р0': 'DIG0', 'Р1': 'DIG1', 'Р2': 'DIG2', 'Р3': 'DIG3',
    'Р4': 'DIG4', 'Р5': 'DIG5', 'Р6': 'DIG6', 'Р7': 'DIG7',
    'СЕГ A': 'SEG A', 'СЕГ B': 'SEG B', 'СЕГ C': 'SEG C', 'СЕГ D': 'SEG D',
    'СЕГ E': 'SEG E', 'СЕГ F': 'SEG F', 'СЕГ G': 'SEG G', 'СЕГ DP': 'SEG DP'
  });

  /* --------------------- надписи и предупреждения -------------------- */

  add({
    'Превышено напряжение / обратная полярность': 'Voltage exceeded or reverse polarity',
    'Перегрузка — лампа перегорает': 'Overload — the lamp is burning out',
    'Предохранитель перегорел': 'The fuse has blown',
    'Ток выше допустимого — светодиод сгорит': 'Current above the limit — the LED will burn out',
    'Мало напряжения на входе — стабилизация нарушена':
      'Not enough input voltage — regulation is lost',
    'Ток сегментов выше допустимого': 'Segment current above the limit',
    'Нет резистора между V+ и ISET — микросхема не даёт тока в сегменты':
      'No resistor between V+ and ISET — the chip sends no current to the segments',
    'Ошибка в программе, строка ': 'Error in the program, line ',
    'Ошибка в содержимом, строка ': 'Error in the contents, line ',
    ' вкл': ' on', ' выкл': ' off', 'выкл': 'off',
    'активный': 'active', 'насыщение': 'saturation', 'отсечка': 'cut-off',
    'закрыт': 'off', 'линейный': 'linear',
    'Шоттки': 'Schottky', 'Мост': 'Bridge',
    '    звучит': '    sounding',
    'СБРОС': 'RESET', 'ВЫХ 1': 'OUT 1', 'ВЫХ 0': 'OUT 0', 'СТОП': 'HALT', 'стоп': 'halt',
    'зап': 'wr', 'чт': 'rd', 'ЗАПИСЬ': 'WRITE', 'ЧТЕНИЕ': 'READ',
    'запись': 'write', 'чтение': 'read',
    'ОЗУ': 'RAM', 'ПЗУ 1К×8': 'ROM 1K×8', 'ОЗУ 1К×8': 'RAM 1K×8',
    'разряд ': 'digit ', 'покой': 'idle', 'РАБОТА': 'ON', 'ПОКОЙ': 'IDLE',
    'Iсег ': 'Iseg ', 'ярк ': 'bri '
  });

  /* -------------------------- система команд ------------------------ */

  add({
    'ничего не делает': 'does nothing',
    'A = число': 'A = number',
    'A = память[адрес]': 'A = memory[address]',
    'память[адрес] = A': 'memory[address] = A',
    'B = A': 'B = A',
    'A = B': 'A = B',
    'A = A + B': 'A = A + B',
    'A = A − B': 'A = A − B',
    'A = A и B (побитно)': 'A = A and B (bitwise)',
    'A = A или B (побитно)': 'A = A or B (bitwise)',
    'A = A исключающее или B': 'A = A xor B',
    'A = A + 1': 'A = A + 1',
    'A = A − 1': 'A = A − 1',
    'сдвиг A влево, старший бит → C': 'shift A left, top bit → C',
    'сдвиг A вправо, младший бит → C': 'shift A right, bottom bit → C',
    'инверсия всех битов A': 'invert every bit of A',
    'A = A + число': 'A = A + number',
    'A = A − число': 'A = A − number',
    'A = A и число': 'A = A and number',
    'A = A или число': 'A = A or number',
    'сравнить A с числом (меняет флаги)': 'compare A with a number (sets the flags)',
    'перейти по адресу': 'jump to an address',
    'перейти, если результат нулевой': 'jump if the result was zero',
    'перейти, если результат не нулевой': 'jump if the result was not zero',
    'перейти, если был перенос': 'jump if there was a carry',
    'перейти, если переноса не было': 'jump if there was no carry',
    'вызвать подпрограмму': 'call a subroutine',
    'вернуться из подпрограммы': 'return from a subroutine',
    'выдать A на выводы': 'put A on the port pins',
    'считать выводы в A': 'read the port pins into A',
    'настроить направление выводов по A': 'set the pin directions from A',
    'остановить процессор': 'halt the processor'
  });

  /* ------------------------ готовые схемы --------------------------- */

  add({
    'Светодиод и резистор': 'LED and resistor',
    'Базовая цепь: резистор ограничивает ток через светодиод. Меняйте сопротивление и смотрите на яркость.':
      'The basic circuit: the resistor limits the current through the LED. Change the resistance and watch the brightness.',
    'Делитель напряжения': 'Voltage divider',
    'Потенциометр делит 12 В. Вольтметр показывает напряжение на движке.':
      'The potentiometer divides 12 V. The voltmeter reads the wiper voltage.',
    'Зарядка конденсатора': 'Charging a capacitor',
    'Классическая RC-цепь. Постоянная времени τ = R·C = 0,47 с. Смотрите экспоненту на осциллографе.':
      'The classic RC circuit. Time constant τ = R·C = 0.47 s. Watch the exponential on the scope.',
    'Выпрямитель с фильтром': 'Rectifier with a filter',
    'Однополупериодный выпрямитель 50 Гц: диод отсекает отрицательную полуволну, конденсатор сглаживает пульсации.':
      'A 50 Hz half-wave rectifier: the diode cuts off the negative half, the capacitor smooths the ripple.',
    'Транзисторный ключ': 'Transistor switch',
    'Ток базы 1 мА открывает транзистор, и лампа зажигается. Нажмите кнопку.':
      'A base current of 1 mA turns the transistor on and the lamp lights. Press the button.',
    'Колебательный контур': 'LC tank',
    'Заряженный конденсатор и катушка обмениваются энергией: f = 1/(2π√LC) ≈ 5 кГц. Затухание задаёт сопротивление обмотки.':
      'A charged capacitor and a coil trade energy: f = 1/(2π√LC) ≈ 5 kHz. The winding resistance sets the damping.',
    'Усилитель на ОУ': 'Op-amp amplifier',
    'Неинвертирующий усилитель: Кu = 1 + Rос/R1 = 11. Входной синус 0,5 В превращается в 5,5 В.':
      'Non-inverting amplifier: gain = 1 + Rf/R1 = 11. A 0.5 V sine at the input becomes 5.5 V.',
    'Мультивибратор': 'Multivibrator',
    'Два транзистора поочерёдно открываются — светодиоды мигают. Период задают RC-цепочки: T ≈ 0,7·C·(Rб1 + Rб2).':
      'Two transistors take turns conducting and the LEDs blink. The RC networks set the period: T ≈ 0.7·C·(Rb1 + Rb2).',
    'Мигалка на таймере 555': '555 timer blinker',
    'Конденсатор заряжается через оба резистора и разряжается через второй. Частота ≈ 1,44/((R1+2·R2)·C). Вывод 4 подтянут к питанию, на выводе 5 — помехоподавляющий конденсатор.':
      'The capacitor charges through both resistors and discharges through the second one. Frequency ≈ 1.44/((R1+2·R2)·C). Pin 4 is pulled to the supply and pin 5 carries a decoupling capacitor.',
    'Блок питания 5 В': '5 V power supply',
    'Трансформатор понижает напряжение, мост выпрямляет обе полуволны, конденсатор сглаживает, стабилизатор держит ровно 5 В.':
      'The transformer steps the voltage down, the bridge rectifies both halves, the capacitor smooths and the regulator holds exactly 5 V.',
    'Ночник на фоторезисторе': 'Photoresistor night light',
    'Делитель из резистора и фоторезистора управляет транзистором: станет темно — светодиод зажжётся. Двигайте ползунок освещённости.':
      'A divider of a resistor and a photoresistor drives the transistor: when it gets dark the LED comes on. Drag the illuminance slider.',
    'Двигатель и выключатель': 'Motor and switch',
    'Вал раскручивается не сразу: мешает инерция. Пусковой ток больше рабочего, а противо-ЭДС растёт вместе с оборотами.':
      'The shaft does not spin up at once — inertia holds it back. The starting current is higher than the running one, and the back-EMF grows with the speed.',
    'Бегущие огни на процессоре': 'Running lights on a processor',
    'Процессор EC-8 сдвигает единицу по четырём линиям порта. Программу можно править прямо в свойствах: выделите процессор и откройте поле «Программа».':
      'The EC-8 shifts a single one along four port lines. You can edit the program right in the properties: select the processor and open the “Program” field.',
    'Процессор с внешней памятью': 'Processor with external memory',
    'Настоящая микропроцессорная система: процессор EC-8B сам ничего не помнит и на каждом такте читает байт из микросхемы памяти по шинам адреса и данных. Программа лежит в памяти — выделите её и откройте поле «Содержимое».':
      'A real microprocessor system: the EC-8B remembers nothing by itself and reads a byte from the memory chip over the address and data buses on every cycle. The program lives in the memory — select it and open the “Contents” field.',
    'Калькулятор на двух процессорах': 'Calculator on two processors',
    'SB1 и SB2 набирают два числа от 0 до 9, SB3 — «равно». DD1 складывает их и передаёт сумму по одному проводу серией импульсов, DD2 принимает её и мигает светодиодом столько раз, сколько получилось. Схему прислал пользователь — собрана языковой моделью по описанию формата.':
      'SB1 and SB2 dial in two numbers from 0 to 9 and SB3 is “equals”. DD1 adds them and sends the sum down a single wire as a train of pulses; DD2 counts them and blinks the LED that many times. A user sent this circuit in — a language model built it from the format description.',
    'Восемь огней по трём проводам': 'Eight lights over three wires',
    'У процессора всего четыре линии, а светодиодов восемь. Сдвиговый регистр 74HC595 решает это: процессор вдвигает в него байт по одному биту (ДАН и СДВ), а по сигналу ЗАЩ весь байт разом выходит на Q0…Q7.':
      'The processor has only four lines and there are eight LEDs. A 74HC595 shift register solves it: the processor pushes a byte in one bit at a time (DS and SHCP), and on STCP the whole byte appears at once on Q0…Q7.',
    'Счётчик на цифровом индикаторе': 'Counter on a digital display',
    'Драйвер MAX7219 сам перебирает разряды и держит цифры, поэтому процессору хватает трёх линий: ДАН, ТАКТ и ЗАГР. Ток сегментов задаёт резистор R1 между V+ и ISET — без него индикатор не загорится. Счёт идёт от 0000 и дальше.':
      'The MAX7219 scans the digits and holds the numbers itself, so three lines are enough for the processor: DIN, CLK and LOAD. Resistor R1 between V+ and ISET sets the segment current — without it the display stays dark. The count starts at 0000 and goes on.'
  });

  /* ---------------------- программы примеров ----------------------- */

  add({
    '; Бегущий огонёк по четырём светодиодам.\n\n        LDI 0b1111\n        DIR             ; все линии на выход\n        LDI 0b0001\n        ST 0xF0         ; текущая маска\n\nцикл:   LD 0xF0\n        OUT\n        CALL пауза\n        LD 0xF0\n        SHL             ; сдвинуть огонёк\n        ANDI 0b1111\n        JNZ дальше\n        LDI 0b0001      ; дошли до края — начать сначала\nдальше: ST 0xF0\n        JMP цикл\n\nпауза:  LDI 6\n        ST 0xF1\nвнеш:   LDI 20\n        ST 0xF2\nвнутр:  LD 0xF2\n        DEC\n        ST 0xF2\n        JNZ внутр\n        LD 0xF1\n        DEC\n        ST 0xF1\n        JNZ внеш\n        RET':
      '; A light running across four LEDs.\n\n        LDI 0b1111\n        DIR                 ; all lines to output\n        LDI 0b0001\n        ST 0xF0             ; current mask\n\nloop:   LD 0xF0\n        OUT\n        CALL delay\n        LD 0xF0\n        SHL                 ; shift the light along\n        ANDI 0b1111\n        JNZ next\n        LDI 0b0001          ; hit the end — start over\nnext:   ST 0xF0\n        JMP loop\n\ndelay:  LDI 6\n        ST 0xF1\nouter:  LDI 20\n        ST 0xF2\ninner:  LD 0xF2\n        DEC\n        ST 0xF2\n        JNZ inner\n        LD 0xF1\n        DEC\n        ST 0xF1\n        JNZ outer\n        RET',
    '; Бегущий огонёк на четырёх светодиодах.\n; И программа, и переменные лежат в этой микросхеме:\n; процессор читает их по шине адреса и данных.\n\n        LDI 0b1111\n        DIR             ; линии порта на выход\n        LDI 0b0001\n        ST 0x80         ; текущая маска — в память\n\nцикл:   LD 0x80\n        OUT\n        CALL пауза\n        LD 0x80\n        SHL             ; сдвинуть огонёк\n        ANDI 0b1111\n        JNZ дальше\n        LDI 0b0001      ; дошли до края — начать сначала\nдальше: ST 0x80\n        JMP цикл\n\nпауза:  LDI 40\n        ST 0x81\nждём:   LD 0x81\n        DEC\n        ST 0x81\n        JNZ ждём\n        RET':
      '; A light running across four LEDs.\n; Both the program and its variables live in this chip:\n; the processor reads them over the address and data bus.\n\n        LDI 0b1111\n        DIR                 ; port lines to output\n        LDI 0b0001\n        ST 0x80             ; current mask goes to memory\n\nloop:   LD 0x80\n        OUT\n        CALL delay\n        LD 0x80\n        SHL                 ; shift the light along\n        ANDI 0b1111\n        JNZ next\n        LDI 0b0001          ; hit the end — start over\nnext:   ST 0x80\n        JMP loop\n\ndelay:  LDI 40\n        ST 0x81\nwait:   LD 0x81\n        DEC\n        ST 0x81\n        JNZ wait\n        RET',
    '        LDI 0b0111\n        DIR                 ; P0 — ДАН, P1 — СДВ, P2 — ЗАЩ\n        LDI 1\n        ST 0xF0             ; бегущий огонёк\n\nцикл:   LD 0xF0\n        ST 0xF1\n        CALL посыл\n        CALL пауза\n        LD 0xF0\n        SHL                 ; сдвинули на разряд\n        JNZ дальше\n        LDI 1               ; дошли до края — начать сначала\nдальше: ST 0xF0\n        JMP цикл\n\n; выдаёт байт из 0xF1 старшим битом вперёд и защёлкивает его\nпосыл:  LDI 8\n        ST 0xF2\nбит:    LD 0xF1\n        SHL                 ; старший бит ушёл в перенос\n        ST 0xF1\n        JC един\n        LDI 0\n        JMP выдать\nедин:   LDI 1\nвыдать: OUT                 ; выставили бит\n        ORI 0b0010\n        OUT                 ; фронт такта — регистр его принял\n        ANDI 0b1101\n        OUT\n        LD 0xF2\n        DEC\n        ST 0xF2\n        JNZ бит\n        LDI 0b0100\n        OUT                 ; фронт защёлки — байт вышел на Q0…Q7\n        LDI 0\n        OUT\n        RET\n\nпауза:  LDI 25\n        ST 0xF3\nвнеш:   LDI 25\n        ST 0xF4\nвнутр:  LD 0xF4\n        DEC\n        ST 0xF4\n        JNZ внутр\n        LD 0xF3\n        DEC\n        ST 0xF3\n        JNZ внеш\n        RET':
      '        LDI 0b0111\n        DIR                 ; P0 — DS, P1 — SHCP, P2 — STCP\n        LDI 1\n        ST 0xF0             ; running light\n\nloop:   LD 0xF0\n        ST 0xF1\n        CALL send\n        CALL delay\n        LD 0xF0\n        SHL                 ; shifted by one place\n        JNZ next\n        LDI 1               ; hit the end — start over\nnext:   ST 0xF0\n        JMP loop\n\n; sends the byte at 0xF1, top bit first, then latches it\nsend:   LDI 8\n        ST 0xF2\nbit:    LD 0xF1\n        SHL                 ; the top bit went into the carry\n        ST 0xF1\n        JC one\n        LDI 0\n        JMP put\none:    LDI 1\nput:    OUT                 ; the bit is on the line\n        ORI 0b0010\n        OUT                 ; clock edge — the register took it\n        ANDI 0b1101\n        OUT\n        LD 0xF2\n        DEC\n        ST 0xF2\n        JNZ bit\n        LDI 0b0100\n        OUT                 ; latch edge — the byte is on Q0…Q7\n        LDI 0\n        OUT\n        RET\n\ndelay:  LDI 25\n        ST 0xF3\nouter:  LDI 25\n        ST 0xF4\ninner:  LD 0xF4\n        DEC\n        ST 0xF4\n        JNZ inner\n        LD 0xF3\n        DEC\n        ST 0xF3\n        JNZ outer\n        RET',
    '; Счётчик 0000…9999 на индикаторе через MAX7219.\n; P0 — ДАН, P1 — ТАКТ, P2 — ЗАГР.\n\n        LDI 0b0111\n        DIR\n        LDI 0x0C\n        ST 0xF2\n        LDI 0x01\n        ST 0xF3\n        CALL слово          ; выйти из режима покоя\n        LDI 0x09\n        ST 0xF2\n        LDI 0xFF\n        ST 0xF3\n        CALL слово          ; дешифратор на всех разрядах\n        LDI 0x0B\n        ST 0xF2\n        LDI 0x03\n        ST 0xF3\n        CALL слово          ; показывать четыре разряда\n        LDI 0x0A\n        ST 0xF2\n        LDI 0x0F\n        ST 0xF3\n        CALL слово          ; полная яркость\n        LDI 0\n        ST 0xF6\n        ST 0xF7\n        ST 0xF8\n        ST 0xF9\n\nцикл:   CALL показать\n        CALL пауза\n        CALL прибавить\n        JMP цикл\n\nпоказать:\n        LDI 1\n        ST 0xF2\n        LD 0xF6\n        ST 0xF3\n        CALL слово\n        LDI 2\n        ST 0xF2\n        LD 0xF7\n        ST 0xF3\n        CALL слово\n        LDI 3\n        ST 0xF2\n        LD 0xF8\n        ST 0xF3\n        CALL слово\n        LDI 4\n        ST 0xF2\n        LD 0xF9\n        ST 0xF3\n        CALL слово\n        RET\n\nприбавить:\n        LD 0xF9\n        INC\n        CMPI 10\n        JNZ гот3\n        LDI 0\n        ST 0xF9\n        LD 0xF8\n        INC\n        CMPI 10\n        JNZ гот2\n        LDI 0\n        ST 0xF8\n        LD 0xF7\n        INC\n        CMPI 10\n        JNZ гот1\n        LDI 0\n        ST 0xF7\n        LD 0xF6\n        INC\n        CMPI 10\n        JNZ гот0\n        LDI 0\nгот0:   ST 0xF6\n        RET\nгот1:   ST 0xF7\n        RET\nгот2:   ST 0xF8\n        RET\nгот3:   ST 0xF9\n        RET\n\n; посылка 16 бит: старший байт 0xF2, младший 0xF3\nслово:  LDI 0\n        OUT                 ; ЗАГР вниз\n        LD 0xF2\n        ST 0xF0\n        CALL посыл\n        LD 0xF3\n        ST 0xF0\n        CALL посыл\n        LDI 0b0100\n        OUT                 ; фронт ЗАГР — слово принято\n        LDI 0\n        OUT\n        RET\n\n; побайтная выдача, старшим битом вперёд\nпосыл:  LDI 8\n        ST 0xF1\nбит:    LD 0xF0\n        SHL\n        ST 0xF0\n        JC един\n        LDI 0\n        JMP выдать\nедин:   LDI 1\nвыдать: OUT\n        ORI 0b0010\n        OUT                 ; фронт такта\n        ANDI 0b1101\n        OUT\n        LD 0xF1\n        DEC\n        ST 0xF1\n        JNZ бит\n        RET\n\nпауза:  LDI 25\n        ST 0xF4\nвнеш:   LDI 25\n        ST 0xF5\nвнутр:  LD 0xF5\n        DEC\n        ST 0xF5\n        JNZ внутр\n        LD 0xF4\n        DEC\n        ST 0xF4\n        JNZ внеш\n        RET':
      '; A 0000…9999 counter on the display through a MAX7219.\n; P0 — DIN, P1 — CLK, P2 — LOAD.\n\n        LDI 0b0111\n        DIR\n        LDI 0x0C\n        ST 0xF2\n        LDI 0x01\n        ST 0xF3\n        CALL word           ; leave idle mode\n        LDI 0x09\n        ST 0xF2\n        LDI 0xFF\n        ST 0xF3\n        CALL word           ; decoder on every digit\n        LDI 0x0B\n        ST 0xF2\n        LDI 0x03\n        ST 0xF3\n        CALL word           ; show four digits\n        LDI 0x0A\n        ST 0xF2\n        LDI 0x0F\n        ST 0xF3\n        CALL word           ; full brightness\n        LDI 0\n        ST 0xF6\n        ST 0xF7\n        ST 0xF8\n        ST 0xF9\n\nloop:   CALL show\n        CALL delay\n        CALL bump\n        JMP loop\n\nshow:\n        LDI 1\n        ST 0xF2\n        LD 0xF6\n        ST 0xF3\n        CALL word\n        LDI 2\n        ST 0xF2\n        LD 0xF7\n        ST 0xF3\n        CALL word\n        LDI 3\n        ST 0xF2\n        LD 0xF8\n        ST 0xF3\n        CALL word\n        LDI 4\n        ST 0xF2\n        LD 0xF9\n        ST 0xF3\n        CALL word\n        RET\n\nbump:\n        LD 0xF9\n        INC\n        CMPI 10\n        JNZ done3\n        LDI 0\n        ST 0xF9\n        LD 0xF8\n        INC\n        CMPI 10\n        JNZ done2\n        LDI 0\n        ST 0xF8\n        LD 0xF7\n        INC\n        CMPI 10\n        JNZ done1\n        LDI 0\n        ST 0xF7\n        LD 0xF6\n        INC\n        CMPI 10\n        JNZ done0\n        LDI 0\ndone0:  ST 0xF6\n        RET\ndone1:  ST 0xF7\n        RET\ndone2:  ST 0xF8\n        RET\ndone3:  ST 0xF9\n        RET\n\n; send 16 bits: high byte 0xF2, low byte 0xF3\nword:   LDI 0\n        OUT                 ; LOAD low\n        LD 0xF2\n        ST 0xF0\n        CALL send\n        LD 0xF3\n        ST 0xF0\n        CALL send\n        LDI 0b0100\n        OUT                 ; LOAD edge — the word is taken\n        LDI 0\n        OUT\n        RET\n\n; send a byte, top bit first\nsend:   LDI 8\n        ST 0xF1\nbit:    LD 0xF0\n        SHL\n        ST 0xF0\n        JC one\n        LDI 0\n        JMP put\none:    LDI 1\nput:    OUT\n        ORI 0b0010\n        OUT                 ; clock edge\n        ANDI 0b1101\n        OUT\n        LD 0xF1\n        DEC\n        ST 0xF1\n        JNZ bit\n        RET\n\ndelay:  LDI 25\n        ST 0xF4\nouter:  LDI 25\n        ST 0xF5\ninner:  LD 0xF5\n        DEC\n        ST 0xF5\n        JNZ inner\n        LD 0xF4\n        DEC\n        ST 0xF4\n        JNZ outer\n        RET',
    '; Мигает светодиодом на выводе P0.\n; Задержка сделана двумя вложенными циклами.\n\n        LDI 0b1111      ; все четыре линии\n        DIR             ; настроить как выходы\n\nцикл:   LDI 0b0001      ; P0 = 1\n        OUT\n        CALL пауза\n        LDI 0b0000      ; P0 = 0\n        OUT\n        CALL пауза\n        JMP цикл\n\nпауза:  LDI 10          ; внешний счётчик\n        ST 0xF0\nвнеш:   LDI 25          ; внутренний счётчик\n        ST 0xF1\nвнутр:  LD 0xF1\n        DEC\n        ST 0xF1\n        JNZ внутр\n        LD 0xF0\n        DEC\n        ST 0xF0\n        JNZ внеш\n        RET':
      '; Blinks an LED on pin P0.\n; The delay is two nested loops.\n\n        LDI 0b1111          ; all four lines\n        DIR                 ; set them as outputs\n\nloop:   LDI 0b0001          ; P0 = 1\n        OUT\n        CALL delay\n        LDI 0b0000          ; P0 = 0\n        OUT\n        CALL delay\n        JMP loop\n\ndelay:  LDI 10              ; outer counter\n        ST 0xF0\nouter:  LDI 25              ; inner counter\n        ST 0xF1\ninner:  LD 0xF1\n        DEC\n        ST 0xF1\n        JNZ inner\n        LD 0xF0\n        DEC\n        ST 0xF0\n        JNZ outer\n        RET',
    '; Содержимое памяти для процессора EC-8B.\n; Мигает светодиодом на линии P0.\n\n        LDI 0b1111      ; все четыре линии порта\n        DIR             ; настроить как выходы\n\nцикл:   LDI 1           ; P0 = 1\n        OUT\n        CALL пауза\n        LDI 0           ; P0 = 0\n        OUT\n        CALL пауза\n        JMP цикл\n\nпауза:  LDI 40          ; счётчик лежит в ячейке 0x80\n        ST 0x80\nвн:     LD 0x80\n        DEC\n        ST 0x80\n        JNZ вн\n        RET':
      '; Memory contents for the EC-8B processor.\n; Blinks an LED on line P0.\n\n        LDI 0b1111          ; all four port lines\n        DIR                 ; set them as outputs\n\nloop:   LDI 1               ; P0 = 1\n        OUT\n        CALL delay\n        LDI 0               ; P0 = 0\n        OUT\n        CALL delay\n        JMP loop\n\ndelay:  LDI 40              ; the counter lives in cell 0x80\n        ST 0x80\nwait:   LD 0x80\n        DEC\n        ST 0x80\n        JNZ wait\n        RET',
  });

  /* --------------------- описание формата для ИИ --------------------- */

  add({
    ' — одно из: ':
      ' — one of: ',
    ' (true или false)':
      ' (true or false)',
    '"текст программы" (см. раздел про процессор)':
      '"program text" (see the processor section)',
    'не меньше ':
      'at least ',
    'не больше ':
      'at most ',
    ' ELECTROCORE — КАК СОБРАТЬ СХЕМУ':
      ' ELECTROCORE — HOW TO BUILD A CIRCUIT',
    ' Описание формата для языковой модели.':
      ' Format description for a language model.',
    ' Файл собран самой программой, поэтому всегда соответствует ей.':
      ' The program itself generated this file, so it always matches it.',
    'ElectroCore — симулятор электроники. Он считает схему по законам':
      'ElectroCore is an electronics simulator. It solves circuits by the laws',
    'электротехники: метод узловых потенциалов, метод Ньютона для':
      'of electrical engineering: modified nodal analysis and Newton\'s method',
    'нелинейных элементов. Схема лежит на поле в клетку.':
      'for nonlinear parts. The circuit lies on a squared field.',
    'Тебе дают этот файл и просьбу человека. Собери схему и выдай её':
      'You are given this file and a request from a person. Build the circuit',
    'в формате JSON, описанном ниже. Человек вставит твой ответ в':
      'and answer in the JSON format described below. The person will paste your',
    'программу, и схема появится на столе и сразу заработает.':
      'answer into the program and the circuit will appear and start working.',
    ' 1. ГЛАВНОЕ ПРАВИЛО ОТВЕТА':
      ' 1. THE MAIN RULE OF THE ANSWER',
    'Выдай РОВНО ОДИН блок JSON. Внутри блока — только JSON, без':
      'Give EXACTLY ONE block of JSON. Inside the block there is only JSON, with',
    'комментариев (в JSON их не бывает) и без многоточий. Пояснения':
      'no comments (JSON has none) and no ellipses. Write explanations for the',
    'для человека пиши до или после блока, не внутри.':
      'person before or after the block, never inside it.',
    'Схема должна быть рабочей: если её не проверить в уме, человек':
      'The circuit must work: if you do not check it in your head, the person',
    'получит мёртвый стол. Мысленно проследи каждую цепь от плюса':
      'gets a dead bench. Trace every path in your mind from the plus of the',
    'источника до земли.':
      'source down to ground.',
    ' 2. СИСТЕМА КООРДИНАТ':
      ' 2. THE COORDINATE SYSTEM',
    'Поле бесконечное, единица измерения — клетка.':
      'The field is endless and its unit is one cell.',
    '  x растёт вправо, y растёт ВНИЗ.':
      '  x grows to the right, y grows DOWNWARDS.',
    '  Координаты целые. Ноль может быть где угодно, удобно ставить':
      '  Coordinates are whole numbers. Zero can be anywhere; it is handy to',
    '  первую деталь около (0,0).':
      '  put the first part near (0,0).',
    'Масштаб: 2 клетки = 2,54 мм — это шаг выводов микросхем и':
      'Scale: 2 cells = 2.54 mm — the pin pitch of chips and of a',
    'макетной платы. Между рядами выводов микросхемы 6 клеток =':
      'breadboard. Between the two pin rows of a chip there are 6 cells =',
    '7,62 мм, как у настоящего корпуса DIP.':
      '7.62 mm, as on a real DIP package.',
    'Оговорка: точен именно шаг выводов. Корпуса отдельных деталей':
      'A caveat: it is the pin pitch that is exact. The bodies of small parts',
    'нарисованы крупнее натуральной величины, чтобы читались на':
      'are drawn larger than life so they can be read on the',
    'экране. Для раскладки это неважно — ориентируйся на габариты':
      'screen. For layout this does not matter — go by the footprints',
    'в клетках из справочника, они настоящие.':
      'in cells from the reference, those are real.',
    'Поворот детали задаётся полем "rot": 0, 1, 2, 3 — это 0°, 90°,':
      'Rotation is set by the "rot" field: 0, 1, 2, 3 — that is 0°, 90°,',
    '180°, 270° по часовой стрелке. Вывод с локальным смещением':
      '180°, 270° clockwise. A pin with the local offset',
    '(dx, dy) из справочника после поворота оказывается в точке:':
      '(dx, dy) from the reference ends up, after rotation, at:',
    'Абсолютная координата вывода = координата детали + это смещение.':
      'The absolute pin coordinate = the part\'s coordinate plus this offset.',
    'Пример: резистор в точке (10, 4) без поворота имеет выводы':
      'Example: a resistor at (10, 4) with no rotation has its pins',
    'в (8, 4) и (12, 4). Он же с rot=1 — в (10, 2) и (10, 6),':
      'at (8, 4) and (12, 4). The same part with rot=1 has them at (10, 2) and (10, 6),',
    'то есть встаёт вертикально.':
      'that is, it stands upright.',
    ' 3. КАК РАСКЛАДЫВАТЬ ДЕТАЛИ':
      ' 3. HOW TO LAY THE PARTS OUT',
    'У каждой детали в справочнике указан габарит в клетках. Это':
      'Every part in the reference has a footprint in cells. It is the',
    'прямоугольник вокруг её центра, куда попадает корпус и выводы.':
      'rectangle around its centre that holds the body and the pins.',
    'ПРАВИЛА:':
      'RULES:',
    '  1. Габариты двух деталей НЕ должны пересекаться. Это главная':
      '  1. The footprints of two parts must NOT overlap. This is the main',
    '     ошибка при автоматической раскладке — проверь её отдельно.':
      '     mistake in automatic layout — check it separately.',
    '  2. Между габаритами оставляй минимум 2 клетки. Если между':
      '  2. Leave at least 2 cells between footprints. If wires will run',
    '     деталями пойдут провода — 4…6 клеток.':
      '     between the parts, leave 4…6 cells.',
    '  3. Соседние детали одной цепочки ставь с шагом 10…14 клеток':
      '  3. Place neighbouring parts of one chain 10…14 cells apart',
    '     по оси цепочки. Параллельные цепочки (например четыре':
      '     along the chain. Parallel chains (four LEDs, say)',
    '     светодиода) разноси на 6…8 клеток.':
      '     should be 6…8 cells apart.',
    '  4. ВАЖНО: выводы разных деталей, оказавшиеся в ОДНОЙ точке,':
      '  4. IMPORTANT: pins of different parts that land on the SAME point',
    '     соединяются автоматически, без провода. Это удобно, когда':
      '     join automatically, with no wire. That is handy when you want',
    '     нужно состыковать детали вплотную, но если ты не хотел':
      '     parts butted together, but if you did not mean such a',
    '     такого соединения — держи расстояние.':
      '     connection — keep them apart.',
    '  5. Привычная компоновка: питание сверху, земля снизу, сигнал':
      '  5. The usual layout: power at the top, ground at the bottom, signal',
    '     идёт слева направо. Источник слева, нагрузка справа.':
      '     running left to right. Source on the left, load on the right.',
    '  6. Земля («ground») нужна почти всегда — это опорная точка':
      '  6. A ground ("ground") is needed almost always — it is the reference',
    '     отсчёта напряжений. Ставь ОДНУ землю на схему и своди к':
      '     point for voltages. Put ONE ground in the circuit and bring all',
    '     ней все обратные провода. Без земли программа сама выберет':
      '     return wires to it. Without a ground the program picks a reference',
    '     опорный узел, и показания будут считаться от него.':
      '     node itself and readings are counted from there.',
    '  7. Обозначения в поле "id" давай по ГОСТ: R1 R2 — резисторы,':
      '  7. Give designations in the "id" field the usual way: R1 R2 for resistors,',
    '     C — конденсаторы, L — катушки, VD — диоды, VT — транзисторы,':
      '     C for capacitors, L for coils, VD for diodes, VT for transistors,',
    '     DD — цифровые микросхемы, DA — аналоговые, HL — лампы и':
      '     DD for digital chips, DA for analogue ones, HL for lamps and',
    '     светодиоды, GB — батареи, SA — выключатели, SB — кнопки,':
      '     LEDs, GB for batteries, SA for switches, SB for buttons,',
    '     M — двигатели, HA — зуммеры, PV PA PW — приборы.':
      '     M for motors, HA for buzzers, PV PA PW for meters.',
    '     Эти обозначения будут видны на схеме.':
      '     These designations are shown on the circuit.',
    '  8. Провода прокладываются САМИ: программа выбирает свободные':
      '  8. Wires route THEMSELVES: the program picks free grid',
    '     линии сетки и разводит их так, чтобы не накладывались.':
      '     lines and lays them out so they do not overlap.',
    '     Тебе достаточно сказать, что с чем соединить.':
      '     It is enough for you to say what connects to what.',
    ' 4. ФОРМАТ ОТВЕТА':
      ' 4. THE ANSWER FORMAT',
    '  "title": "Название схемы",':
      '  "title": "Circuit name",',
    '  "note": "Одна-две фразы, что схема делает (необязательно)",':
      '  "note": "A sentence or two on what the circuit does (optional)",',
    '      "id": "R1",            строка, уникальна, станет обозначением':
      '      "id": "R1",            string, unique, becomes the designation',
    '      "type": "resistor",    ключ из справочника ниже':
      '      "type": "resistor",    a key from the reference below',
    '      "x": 10, "y": 4,       целые координаты центра':
      '      "x": 10, "y": 4,       whole coordinates of the centre',
    '      "rot": 0,              0..3, можно не писать если 0':
      '      "rot": 0,              0..3, may be left out if 0',
    '      "props": { "R": 470 }  параметры, можно не писать':
      '      "props": { "R": 470 }  settings, may be left out',
    '      "color": 0            0..9, необязательно (см. ниже)':
      '      "color": 0            0..9, optional (see below)',
    'ЗНАЧЕНИЯ ПАРАМЕТРОВ пиши числами в основных единицах СИ:':
      'SETTING VALUES are written as numbers in base SI units:',
    '  сопротивление в омах:      4,7 кОм  →  4700':
      '  resistance in ohms:        4.7 kΩ   →  4700',
    '  ёмкость в фарадах:         100 нФ   →  1e-7':
      '  capacitance in farads:     100 nF   →  1e-7',
    '  индуктивность в генри:     1 мГн    →  0.001':
      '  inductance in henries:     1 mH     →  0.001',
    '  напряжение в вольтах, ток в амперах, частота в герцах.':
      '  voltage in volts, current in amperes, frequency in hertz.',
    'Строки вида "4.7k" тоже принимаются, но числа надёжнее.':
      'Strings like "4.7k" are accepted too, but numbers are safer.',
    'ЦВЕТА ПРОВОДОВ ("color", необязательно) — как в наборе перемычек:':
      'WIRE COLOURS ("color", optional) — as in a set of jumpers:',
    'Если не указывать, цвета назначатся по кругу. Осмысленно:':
      'If you leave them out, colours are handed round in turn. Sensible:',
    'красный на плюс питания, чёрный на общий провод.':
      'red on the plus of the supply, black on the common wire.',
    ' 5. ПОЛНЫЙ ПРИМЕР':
      ' 5. A COMPLETE EXAMPLE',
    'Это настоящая рабочая схема — светодиод с токоограничивающим':
      'This is a real working circuit — an LED with a current-limiting',
    'резистором и выключателем. Разбери её строчку за строчкой.':
      'resistor and a switch. Go through it line by line.',
    'Разбор: выключатель и резистор стоят в одну линию с запасом по':
      'A walk-through: the switch and the resistor stand in one line with',
    '7…8 клеток; светодиод развёрнут (rot=1) и потому стоит':
      '7…8 cells to spare; the LED is turned (rot=1) and so stands',
    'вертикально; земля одна, к ней сходятся и минус батареи, и':
      'upright; there is one ground, and both the minus of the battery and',
    'катод светодиода. Габариты нигде не пересекаются.':
      'the cathode of the LED come to it. No footprints overlap.',
    'Провода в примере заданы только парами «деталь — вывод»:':
      'The wires in the example are given only as pairs "part — pin":',
    'как именно они лягут на поле, программа решит сама.':
      'how exactly they lie on the field is for the program to decide.',
    ' 6. СПРАВОЧНИК ДЕТАЛЕЙ':
      ' 6. PARTS REFERENCE',
    'Формат записи:':
      'The way an entry is written:',
    '  ключ — Название':
      '  key — Name',
    '    габарит: Ш × В клеток':
      '    footprint: W × H cells',
    '    выводы: индекс «имя» (dx,dy) · …':
      '    pins: index "name" (dx,dy) · …',
    '    параметры: имя = значение — пояснение':
      '    settings: name = value — explanation',
    'Индекс вывода — это число для полей "fromPin" и "toPin".':
      'A pin index is the number for the "fromPin" and "toPin" fields.',
    'габарит: ':
      'footprint: ',
    ' клеток':
      ' cells',
    'выводы: ':
      'pins: ',
    'нет':
      'none',
    'параметры:':
      'settings:',
    ' 7. ДВЕ ВЫЧИСЛИТЕЛЬНЫЕ МАШИНЫ':
      ' 7. TWO COMPUTING MACHINES',
    'В наборе их две, и путать их нельзя:':
      'There are two of them in the set and they must not be confused:',
    '  cpu8     Микроконтроллер EC-8. Процессор, память и четыре линии':
      '  cpu8     The EC-8 microcontroller. Processor, memory and four',
    '           ввода-вывода в одном корпусе, как ATtiny. Внешних':
      '           I/O lines in one package, like an ATtiny. No external',
    '           микросхем не нужно: питание, общий провод — и он пошёл.':
      '           chips needed: power, ground — and off it goes.',
    '           Программа лежит в параметре "code".':
      '           The program lives in the "code" setting.',
    '  cpu_bus  Процессор EC-8B. Своей памяти нет совсем. На каждом':
      '  cpu_bus  The EC-8B processor. It has no memory at all. On every',
    '           такте он выставляет адрес и читает байт по внешней':
      '           cycle it puts out an address and reads a byte over the',
    '           шине. Без микросхемы памяти он не сделает ничего.':
      '           external bus. Without a memory chip it does nothing.',
    '           Программа лежит в параметре "content" этой памяти.':
      '           The program lives in the "content" setting of that memory.',
    'Берите cpu8, когда нужно просто «умное» поведение схемы, и':
      'Take cpu8 when the circuit just needs to behave "cleverly", and',
    'cpu_bus, когда человек просит показать настоящую шину, внешнюю':
      'cpu_bus when the person asks to show a real bus, external',
    'память или устройство компьютера.':
      'memory, or how a computer is put together.',
    'Программа пишется обычным текстом. В JSON переводы строк':
      'The program is written as plain text. In JSON write line breaks',
    'записывай как \\n.':
      'as \\n.',
    'Устройство обеих машин: восемь бит, регистры A и B, флаги нуля':
      'Both machines: eight bits, registers A and B, zero (Z) and carry',
    '(Z) и переноса (C), адресное пространство 256 байт. У EC-8 это':
      '(C) flags, an address space of 256 bytes. For the EC-8 that is',
    'его собственная память, у EC-8B — внешняя. Возвраты из':
      'its own memory, for the EC-8B an external one. Return addresses',
    'подпрограмм хранит аппаратный стек на восемь уровней, поэтому':
      'are kept by a hardware stack eight levels deep, so',
    'CALL работает всегда. Под переменные бери адреса подальше от':
      'CALL always works. For variables take addresses well clear of the',
    'программы: 0x80…0xFE.':
      'program: 0x80…0xFE.',
    'Правила записи:':
      'How to write it:',
    '  метка:  объявляется двоеточием в начале строки':
      '  label:  declared with a colon at the start of a line',
    '  ;       всё после точки с запятой — комментарий':
      '  ;       everything after a semicolon is a comment',
    '  числа   200, 0xC8, $C8, 0b11001000 — одно и то же':
      '  numbers 200, 0xC8, $C8, 0b11001000 are the same thing',
    '  DB      кладёт байты в память подряд':
      '  DB      puts bytes into memory one after another',
    'Линии порта P0…P3 — настоящие выводы. Перед работой настрой':
      'Port lines P0…P3 are real pins. Before using them set their',
    'направление: положи маску в A и выполни DIR (1 = выход).':
      'direction: put a mask in A and run DIR (1 = output).',
    'OUT выдаёт младшие четыре бита A на выводы, IN читает их в A.':
      'OUT puts the low four bits of A on the pins, IN reads them into A.',
    'СИСТЕМА КОМАНД:':
      'INSTRUCTION SET:',
    ' число':
      ' number',
    ' адрес':
      ' address',
    'Задержки делай циклами — отдельной команды паузы нет. У EC-8':
      'Make delays with loops — there is no pause instruction. On the EC-8',
    'при частоте 2000 Гц одна команда занимает 0,5 мс. У EC-8B такт':
      'at 2000 Hz one instruction takes 0.5 ms. On the EC-8B a cycle',
    'уходит на каждое обращение к памяти: команда без операнда — 1':
      'goes on every memory access: an instruction without an operand takes 1',
    'такт, с операндом — 2, LD и ST — 3. Цикл «LD, DEC, ST, JNZ»':
      'cycle, with an operand 2, LD and ST 3. The loop "LD, DEC, ST, JNZ"',
    'стоит 9 тактов, поэтому счёт до 40 при 2000 Гц даёт около':
      'costs 9 cycles, so counting to 40 at 2000 Hz gives about',
    '0,2 с — заметное глазу мигание.':
      '0.2 s — a blink the eye can follow.',
    'КАК СОБРАТЬ СИСТЕМУ «EC-8B + ПАМЯТЬ»':
      'HOW TO BUILD THE "EC-8B + MEMORY" SYSTEM',
    'Провода между процессором и памятью (номера выводов — из':
      'Wires between the processor and the memory (pin numbers from the',
    'справочника, они же подписаны на корпусах):':
      'reference; the same names are printed on the packages):',
    '  cpu_bus 6…13  (A0…A7)  →  memory 4…11  (A0…A7)   шина адреса':
      '  cpu_bus 6…13  (A0…A7)  →  memory 4…11  (A0…A7)   address bus',
    '  cpu_bus 20…27 (D0…D7)  →  memory 16…23 (D0…D7)   шина данных':
      '  cpu_bus 20…27 (D0…D7)  →  memory 16…23 (D0…D7)   data bus',
    '  cpu_bus 18 (/ЧТ)       →  memory 14 (/ЧТ)':
      '  cpu_bus 18 (/RD)       →  memory 14 (/OE)',
    '  cpu_bus 19 (/ЗП)       →  memory 15 (/ЗП)':
      '  cpu_bus 19 (/WR)       →  memory 15 (/WE)',
    '  memory 2 (/ВЫБ)        →  земля      микросхема всегда выбрана':
      '  memory 2 (/CS)         →  ground     the chip is always selected',
    '  memory 3 (ВЫБ2)        →  вывод 0 самой памяти (плюс питания)':
      '  memory 3 (CE2)         →  pin 0 of the memory itself (the supply)',
    '  memory 12, 13 (A8, A9) →  земля      старшие адреса не нужны':
      '  memory 12, 13 (A8, A9) →  ground     the top addresses are unused',
    '  питание и общий провод — на выводы 0 и 1 обеих микросхем':
      '  power and ground go to pins 0 and 1 of both chips',
    'Это 21 провод, не считая питания. Пропустишь хоть один разряд':
      'That is 21 wires, not counting power. Miss a single bit of',
    'адреса или данных — процессор прочитает не тот байт и схема':
      'address or data and the processor reads the wrong byte, and the circuit',
    'будет вести себя бессмысленно. Сверяй по списку.':
      'behaves senselessly. Check them off against the list.',
    'Раскладка: ставь память прямо над процессором со сдвигом влево':
      'Layout: put the memory straight above the processor, shifted left',
    'на две клетки (например, процессор в (0,0), память в (-2,-34)).':
      'by two cells (processor at (0,0), memory at (-2,-34), say).',
    'Тогда шина адреса ложится слева, шина данных справа, и провода':
      'Then the address bus lies on the left and the data bus on the right, and the wires',
    'идут ровными пучками, не пересекая корпуса.':
      'run in neat bundles without crossing the packages.',
    'Светодиоды, кнопки и прочее вешай на линии порта P0…P3':
      'Hang LEDs, buttons and the rest on the port lines P0…P3',
    '(выводы 14…17) — так же, как у EC-8.':
      '(pins 14…17), just as with the EC-8.',
    ' 8. ИНДИКАТОРЫ И МИКРОСХЕМЫ УПРАВЛЕНИЯ':
      ' 8. DISPLAYS AND THE CHIPS THAT DRIVE THEM',
    'У процессора всего четыре линии порта. Когда выходов не хватает,':
      'The processor has only four port lines. When outputs run short,',
    'в дело идут те же микросхемы, что и в жизни.':
      'the same chips are used as in real life.',
    'seg7 — ОДНА ЦИФРА':
      'seg7 — ONE DIGIT',
    'Восемь светодиодов: сегменты a…g и точка dp. Общий вывод сажают':
      'Eight LEDs: segments a…g and the point dp. The common pin goes',
    'на землю (параметр common = cathode) или на питание (anode).':
      'to ground (setting common = cathode) or to the supply (anode).',
    'Каждому сегменту нужен свой резистор 220…470 Ω — иначе сгорит.':
      'Every segment needs its own 220…470 Ω resistor — or it burns out.',
    'Выводов десять, общих среди них два и они соединены внутри.':
      'There are ten pins; two of them are common and joined inside.',
    'seg7x4 — ЧЕТЫРЕ ЦИФРЫ':
      'seg7x4 — FOUR DIGITS',
    'Сегменты у всех разрядов общие, разряды включаются по очереди':
      'All digits share their segments and are switched on in turn',
    'выводами Р1…Р4. Вручную такой индикатор зажигать неудобно —':
      'by pins D1…D4. Lighting such a display by hand is awkward —',
    'его ставят вместе с max7219.':
      'it is used together with a max7219.',
    'sr595 — СДВИГОВЫЙ РЕГИСТР 74HC595':
      'sr595 — THE 74HC595 SHIFT REGISTER',
    'Превращает три линии в восемь. Порядок работы:':
      'Turns three lines into eight. The order of work:',
    '  1. выставить бит на ДАН (вывод 13), старшим битом вперёд;':
      '  1. put a bit on DS (pin 13), top bit first;',
    '  2. дать фронт на СДВ (вывод 10) — бит вошёл в регистр;':
      '  2. give an edge on SHCP (pin 10) — the bit is in the register;',
    '  3. повторить восемь раз;':
      '  3. repeat eight times;',
    '  4. дать фронт на ЗАЩ (вывод 11) — байт вышел на Q0…Q7.':
      '  4. give an edge on STCP (pin 11) — the byte is on Q0…Q7.',
    'Вывод /СБР (9) соединяют с питанием, /РАЗР (12) — с землёй.':
      'Pin /MR (9) goes to the supply, /OE (12) to ground.',
    'Выходы: Q0 — вывод 14, Q1…Q7 — выводы 0…6. К каждому светодиоду':
      'Outputs: Q0 is pin 14, Q1…Q7 are pins 0…6. Every LED',
    'по-прежнему нужен резистор.':
      'still needs a resistor.',
    'max7219 — ДРАЙВЕР ИНДИКАТОРОВ':
      'max7219 — THE DISPLAY DRIVER',
    'Держит до восьми разрядов и сам их перебирает. Три линии:':
      'Holds up to eight digits and scans them itself. Three lines:',
    'ДАН (вывод 0), ТАКТ (12), ЗАГР (11).':
      'DIN (pin 0), CLK (12), LOAD (11).',
    'ОБЯЗАТЕЛЬНО: резистор 10 кΩ между V+ (вывод 23) и ISET (15).':
      'REQUIRED: a 10 kΩ resistor between V+ (pin 23) and ISET (15).',
    'Он задаёт ток сегментов; без него индикатор не загорится.':
      'It sets the segment current; without it the display stays dark.',
    'Питание — на вывод 23, общий провод — на вывод 3.':
      'Power goes to pin 23, ground to pin 3.',
    'Соединение с seg7x4 (по именам выводов из справочника):':
      'Connecting to seg7x4 (by the pin names from the reference):',
    '  СЕГ A…СЕГ DP драйвера → одноимённые выводы индикатора':
      '  SEG A…SEG DP of the driver → the same-named pins of the display',
    '  Р0 → Р1, Р1 → Р2, Р2 → Р3, Р3 → Р4':
      '  DIG0 → D1, DIG1 → D2, DIG2 → D3, DIG3 → D4',
    'Обмен — шестнадцать бит, старшим вперёд: сначала байт адреса':
      'A transfer is sixteen bits, top bit first: first the register',
    'регистра, потом байт данных. По фронту ЗАГР слово принимается.':
      'address byte, then the data byte. An edge on LOAD takes the word in.',
    '  0x01…0x08  разряды с первого по восьмой':
      '  0x01…0x08  digits one to eight',
    '  0x09       дешифратор цифр: 0xFF — на всех разрядах':
      '  0x09       digit decoder: 0xFF means on every digit',
    '  0x0A       яркость, 0x00…0x0F':
      '  0x0A       brightness, 0x00…0x0F',
    '  0x0B       сколько разрядов показывать, 0x00…0x07':
      '  0x0B       how many digits to show, 0x00…0x07',
    '  0x0C       0x01 — работа, 0x00 — режим покоя':
      '  0x0C       0x01 for running, 0x00 for idle mode',
    '  0x0F       0x01 — зажечь всё разом (проверка индикатора)':
      '  0x0F       0x01 lights everything at once (display test)',
    'После включения микросхема в режиме покоя и всё погашено, так что':
      'After power-up the chip is idle and everything is dark, so',
    'начинай всегда с 0x0C01. При включённом дешифраторе в разряд':
      'always start with 0x0C01. With the decoder on, a digit register',
    'пишется просто цифра 0…9; бит 0x80 добавляет точку.':
      'simply takes the number 0…9; bit 0x80 adds the point.',
    'Пример рабочей программы для процессора есть в самой программе:':
      'There is a working program for the processor inside the app itself:',
    'схема «Счётчик на цифровом индикаторе».':
      'the circuit "Counter on a digital display".',
    ' 9. ПРОВЕРЬ ПЕРЕД ОТВЕТОМ':
      ' 9. CHECK BEFORE YOU ANSWER',
    '  [ ] JSON синтаксически верен, без комментариев и многоточий':
      '  [ ] the JSON is syntactically valid, with no comments or ellipses',
    '  [ ] "type" каждой детали есть в справочнике':
      '  [ ] the "type" of every part exists in the reference',
    '  [ ] все "id" различны, а "from"/"to" ссылаются на существующие':
      '  [ ] all "id" values differ, and "from"/"to" point at existing parts',
    '  [ ] номера выводов не выходят за границы (см. справочник)':
      '  [ ] pin numbers stay in range (see the reference)',
    '  [ ] габариты деталей нигде не пересекаются':
      '  [ ] no footprints overlap anywhere',
    '  [ ] в схеме есть земля и все обратные провода идут к ней':
      '  [ ] the circuit has a ground and every return wire goes to it',
    '  [ ] у светодиода есть токоограничивающий резистор':
      '  [ ] the LED has a current-limiting resistor',
    '  [ ] полярные детали (светодиод, диод, электролит, батарея)':
      '  [ ] polarised parts (LED, diode, electrolytic, battery)',
    '      включены правильной стороной':
      '      are connected the right way round',
    '  [ ] микросхемы получают питание и общий провод':
      '  [ ] the chips get power and ground',
    '  [ ] у каждого сегмента индикатора свой резистор, а у max7219':
      '  [ ] every display segment has its own resistor, and the max7219',
    '      стоит резистор задатчика между V+ и ISET':
      '      has its set resistor between V+ and ISET',
    '  [ ] каждая цепь прослежена от источника до земли':
      '  [ ] every path is traced from the source to ground',
    ' Конец описания. Дальше идёт просьба человека.':
      ' End of the description. The person\'s request follows.',
  });

  /* ------------------------ статическая разметка ---------------------- */

  add({
    'ElectroCore — симулятор электроники':
      'ElectroCore — an electronics simulator',
    '0 с':
      '0 s',
    '50 мкс':
      '50 µs',
    '0,2 мс':
      '0.2 ms',
    '1 мс':
      '1 ms',
    '5 мс':
      '5 ms',
    '20 мс':
      '20 ms',
    '50 мс':
      '50 ms',
    '200 мс':
      '200 ms',
    '1 с':
      '1 s',
    '5 с':
      '5 s',
    'Русский':
      'Русский',
    'Выберите схему — она соберётся на столе и сразу заработает. Меняйте номиналы и смотрите, что изменится.':
      'Pick a circuit — it will appear on the bench and start working at once. Change the values and see what happens.',
    'Схема через ИИ':
      'Circuit by AI',
    'Языковая модель может собрать схему за вас — даже если про ElectroCore она ничего не знает. Описание формата ниже объясняет ей всё: какие есть детали, как нумеруются выводы, как расставлять элементы и в каком виде отвечать.':
      'A language model can build a circuit for you — even if it knows nothing about ElectroCore. The format description below tells it everything: what parts there are, how the pins are numbered, how to place things and how to answer.',
    'Скачайте описание':
      'Download the description',
    'и приложите его к разговору с ИИ.':
      'and attach it to your conversation with the AI.',
    'Скачать описание (.txt)':
      'Download the description (.txt)',
    'Напишите, что нужно собрать.':
      'Write what you need built.',
    'Например: «собери блок питания на 5 вольт от переменных 24 вольт» или «сделай светофор на процессоре: зелёный, жёлтый, красный по кругу».':
      'For example: “build a 5 volt power supply from 24 volts AC” or “make a traffic light on a processor: green, yellow, red in turn”.',
    'Вставьте ответ сюда.':
      'Paste the answer here.',
    'Рамки':
      'Fences',
    'и пояснения вокруг JSON убирать не нужно.':
      'and explanations around the JSON need not be removed.',
    'Собрать схему':
      'Build the circuit',
    'Вставить текущую схему':
      'Paste the current circuit',
    'Кнопка «Вставить текущую схему» кладёт в поле то, что сейчас на столе — удобно, когда нужно попросить ИИ что-то переделать в уже собранной схеме.':
      'The “Paste the current circuit” button puts whatever is on the bench into the field — handy when you want to ask the AI to change something in a circuit you already have.',
    'Как пользоваться':
      'How to use it',
    'Сборка схемы':
      'Building a circuit',
    'Коснитесь элемента в палитре, затем рабочего стола — элемент встанет на сетку.':
      'Tap a part in the palette, then the bench — the part lands on the grid.',
    'Кнопка «Вид» вверху переключает рабочий стол между реалистичными деталями и условными обозначениями схемы.':
      'The “Look” button at the top switches the bench between realistic parts and schematic symbols.',
    'Потяните от кружка на конце вывода к другому выводу — появится провод.':
      'Drag from the circle at the end of a pin to another pin — a wire appears.',
    'Перетаскивайте элементы, чтобы двигать их; провода перестроятся сами.':
      'Drag parts to move them; the wires re-route themselves.',
    'Выключатели и кнопки переключаются касанием во время работы.':
      'Switches and buttons toggle at a touch while the circuit runs.',
    'подключают параллельно участку,':
      'go across the part under test,',
    'амперметр':
      'an ammeter',
    '— последовательно.':
      'goes in series.',
    'имеет две пары клемм: токовые (в разрыв цепи) и клеммы напряжения (параллельно нагрузке).':
      'has two pairs of terminals: current ones (in series with the circuit) and voltage ones (across the load).',
    'Рядом с каждым элементом видны напряжение, ток и мощность.':
      'Voltage, current and power are shown beside every part.',
    'Кнопка «На график» в свойствах выводит величину на осциллограф.':
      'The “To chart” button in the properties sends a value to the scope.',
    'Клавиши':
      'Keys',
    'Пробел':
      'Space',
    'пуск / пауза':
      'run / pause',
    'выбор / провод / стирание':
      'move / wire / erase',
    'повернуть элемент':
      'rotate the part',
    'переключить вид стола':
      'switch the bench look',
    'удалить выделенное':
      'delete the selection',
    'отменить / повторить':
      'undo / redo',
    'дублировать':
      'duplicate',
    'Колесо мыши':
      'Mouse wheel',
    'масштаб':
      'zoom',
    'Средняя кнопка / пробел + тяга':
      'Middle button / space + drag',
    'панорама':
      'pan',
    'Процессор EC-8':
      'The EC-8 processor',
    'Восьмибитный процессор с памятью на 256 байт и четырьмя линиями ввода-вывода. Все действия идут через регистр A, второй операнд берётся из регистра B или прямо из команды. Программа пишется в свойствах элемента; метка объявляется двоеточием, комментарий начинается с точки с запятой, числа можно писать как 200, 0xC8 или 0b11001000.':
      'An eight-bit processor with 256 bytes of memory and four I/O lines. Everything goes through register A; the second operand comes from register B or straight from the instruction. The program is written in the part\'s properties; a label is declared with a colon, a comment starts with a semicolon, and numbers can be written as 200, 0xC8 or 0b11001000.',
    'Физика':
      'Physics',
    'Расчёт ведётся модифицированным методом узловых потенциалов с методом Ньютона–Рафсона для нелинейных элементов. Реактивные элементы интегрируются по методу трапеций. Диоды описываются уравнением Шокли, биполярные транзисторы — моделью Эберса–Молла, полевые — квадратичной моделью.':
      'The solver uses modified nodal analysis with the Newton–Raphson method for nonlinear parts. Reactive parts are integrated by the trapezoidal rule. Diodes follow the Shockley equation, bipolar transistors the Ebers–Moll model and field-effect ones a square-law model.',
    'Сюда вставьте ответ модели…':
      'Paste the model\'s answer here…',
  });

  /* ------------------------ режимы и справка ------------------------- */

  add({
    'Режимы работы': 'Working modes',
    'Рука — ничего не меняет: кнопки нажимаются, выключатели щёлкают, детали остаются на местах.':
      'Hand — changes nothing: buttons press, switches click, parts stay where they are.',
    '— ничего не меняет: кнопки нажимаются, выключатели щёлкают, детали остаются на местах.':
      '— changes nothing: buttons press, switches click, parts stay where they are.',
    '— двигать детали. Нажатие на провод подсвечивает его и показывает, откуда и куда он идёт.':
      '— move parts. Clicking a wire highlights it and shows where it runs from and to.',
    '— тянуть провода от вывода к выводу. Нажатие на провод спросит, удалить ли его; Shift с нажатием удаляет сразу.':
      '— draw wires from pin to pin. Clicking a wire asks whether to delete it; Shift with the click deletes at once.',
    '— удалять детали, тоже с вопросом.': '— delete parts, with a question too.',
    'На кончике каждого вывода виден кружок цвета подключённого к нему провода — по нему сразу понятно, что куда идёт.':
      'At the end of every pin there is a dot in the colour of the wire attached to it — so it is obvious at a glance what goes where.',
    'рука / перемещение / провод / стирание': 'hand / move / wire / erase',
    'подключают параллельно участку,': 'goes across the part under test,',
    'Язык: русский': 'Language: Russian'
  });
})(window);
