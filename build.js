/* Сборка ElectroCore в один самодостаточный HTML-файл.
 *
 *   node build.js [путь-к-результату]
 *
 * Стили и скрипты встраиваются внутрь страницы, внешних ссылок не остаётся —
 * файл можно открыть двойным щелчком или переслать как есть.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = process.argv[2] || path.join(ROOT, 'ElectroCore.html');
const MODULES = ['util', 'i18n', 'solver', 'cpu', 'components', 'display', 'chips', 'circuit', 'render', 'skins', 'scope', 'examples', 'aiprompt', 'app'];

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Замена функцией: иначе $&, $' и подобное в коде будут истолкованы как шаблоны. */
const inject = (html, pattern, text) => {
  if (!pattern.test(html)) throw new Error('не найдено место для вставки: ' + pattern);
  return html.replace(pattern, () => text);
};

let html = read('index.html');

html = inject(html, /<link rel="stylesheet" href="css\/style\.css">/,
  '<style>\n' + read('css/style.css') + '\n</style>');

const js = MODULES
  .map((m) => '/* ═══ js/' + m + '.js ═══ */\n' + read('js/' + m + '.js'))
  .join('\n');

// внутри строки не должно встречаться закрытие тега — иначе блок оборвётся
if (/<\/script/i.test(js)) throw new Error('в коде встречается </script>');

html = inject(html, /<script src="js\/util\.js"><\/script>[\s\S]*?<script src="js\/app\.js"><\/script>/,
  '<script>\n' + js + '\n</script>');

if (/<script src=|<link rel="stylesheet"/.test(html)) throw new Error('остались внешние ссылки');

// контрольная проверка: встроенный код должен разбираться без ошибок
const inline = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
new Function(inline);

fs.writeFileSync(OUT, html);
console.log('Собрано: ' + OUT + ' (' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' КБ)');
