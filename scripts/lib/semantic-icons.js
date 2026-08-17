'use strict';

// Только фирменный icon-* набор из Figma. Порядок важен: более специфичные
// сценарии проверяются раньше общих слов вроде «данные» или «отчёт».
const PHOTO_LIST_ICON_RULES = [
  { pattern: /маршрут|направлен|город|пересад|географ|туда-обратно/i, icon: 'icons/svg/icon-route.svg' },
  { pattern: /тревел.?политик|нарушен|безопас|прав[ао] доступа|ограничен/i, icon: 'icons/svg/icon-shield-alert.svg' },
  { pattern: /статус|возврат|обмен|штраф|сбор|отмен/i, icon: 'icons/svg/icon-refresh-cw.svg' },
  { pattern: /поставщик|авиакомпан|класс обслуж|отел|перевозчик/i, icon: 'icons/svg/icon-building-2.svg' },
  { pattern: /расход|затрат|стоим|бюджет|эконом|динамик|структур/i, icon: 'icons/svg/icon-chart-line.svg' },
  { pattern: /показател|рассчит|цифр|метрик|аналитик/i, icon: 'icons/svg/icon-calculator.svg' },
  { pattern: /отч[её]т|вывод|презентац|выгруз|excel|файл/i, icon: 'icons/svg/icon-file-chart-column.svg' },
  { pattern: /сотрудник|команд|роль|пользовател|отдел/i, icon: 'icons/svg/icon-users.svg' },
  { pattern: /билет|бронирован|поездк|авиа|рейс/i, icon: 'icons/svg/icon-tickets-plane.svg' },
  { pattern: /вопрос|запрос|поиск|спросите/i, icon: 'icons/svg/icon-search.svg' },
];

function selectPhotoListIcon(text) {
  const value = String(text || '');
  const match = PHOTO_LIST_ICON_RULES.find((rule) => rule.pattern.test(value));
  return match ? match.icon : '';
}

module.exports = { PHOTO_LIST_ICON_RULES, selectPhotoListIcon };
