'use strict';

const NBSP = '\u00A0';
const NB_HYPHEN = '\u2011';

// Служебные слова, которые нельзя оставлять в конце строки. Список покрывает
// короткие русские предлоги, союзы и частицы, регулярно встречающиеся в деках.
const SHORT_WORDS = [
  'в', 'во', 'и', 'а', 'но', 'да', 'или', 'либо',
  'на', 'с', 'со', 'к', 'ко', 'по', 'за', 'о', 'об', 'обо',
  'от', 'до', 'из', 'изо', 'у', 'для', 'при', 'над', 'надо',
  'под', 'подо', 'про', 'без', 'через', 'между',
  'не', 'ни', 'же', 'ли', 'бы', 'то', 'что', 'как',
];

const SHORT_WORD_RE = new RegExp(
  '(^|[\\s(«„“\'\"])(?:' + SHORT_WORDS.join('|') + ')([ \\t]+)',
  'giu'
);

function bindShortWords(value) {
  let result = String(value ?? '');
  // Повтор нужен для цепочек «и в рамках»: после первого связывания следующий
  // предлог снова становится доступен регулярному выражению.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = result.replace(SHORT_WORD_RE, (match) => match.replace(/[ \t]+$/, NBSP));
    if (next === result) break;
    result = next;
  }
  return result;
}

function bindCompoundWords(value) {
  return String(value ?? '').replace(/([а-яёa-z])-([а-яёa-z])/giu, '$1' + NB_HYPHEN + '$2');
}

function typographText(value) {
  return bindCompoundWords(bindShortWords(value));
}

// Типографируем только текстовые узлы, не затрагивая теги, классы, пути и data-
// атрибуты. Это позволяет одинаково обработать общие шаблоны и slide overrides.
function typographHtml(value) {
  return String(value ?? '')
    .split(/(<[^>]+>)/g)
    .map((part) => part.startsWith('<') ? part : typographText(part))
    .join('');
}

module.exports = {
  NBSP,
  bindShortWords,
  bindCompoundWords,
  typographText,
  typographHtml,
};
