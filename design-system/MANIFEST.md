# MANIFEST.md — индекс дизайн-системы

Статус заполнения категорий дизайн-системы. Обновляется после каждого шага этапа 2.

> Источник: Figma-файл «Библиотека» (`SZpOoVhI07GPa3Vf7BRc10`) команды Tumodo + файл «Сайт» (`4CDDq4FHtdWL4plDz3MVFF`); реестр ссылок — `figma/FIGMA-SOURCES.md`. Обновлено 2026-08-04.

| Категория | Где лежит | Правила | Статус |
|-----------|-----------|---------|--------|
| Цвета | `tokens/colors.json` | — | **заполнено**: 18 токенов (Brand 4, Neutral 8, Accent 6) с ролями по «Схеме использования цветов». Дубли `-20` удалены по решению пользователя; канонический синий — #005AFF |
| Типографика | `tokens/typography.json` | `fonts/FONTS-RULES.md` | **заполнено**: все 12 стилей файла «Библиотека» (страница «Текст» 1:46) — 7 `Presentation/*` для слайдов (обложка 80/60 ExtraBold, заголовок страницы 50 Bold, текст 30/25/20, сноски 16) и 5 `SMM/*` (в слайдах не использовать). Все — Nunito Sans. Ролей KPI-цифр в Figma нет |
| Сетка | `tokens/grid.md` | — | **заполнено**: эталонный фрейм «Layout 16:9» (221:207) — 1920×1080, поля 120, 7 колонок × 6 строк, gutter 25, safe area 1680×840. Плюс форматы A4 / Instagram и контейнеры Main/Medium/Small |
| Отступы | `tokens/spacing.json` | — | **частично**: подтверждённые Figma значения — поля слайда 120, gutter 25, межабзацный 20, внутренние отступы контейнеров 60/45/35. Общей шкалы (8/16/24/…) в Figma нет — ждёт решения пользователя |
| Эффекты | `tokens/effects.json` | — | **заполнено**: все 5 стилей эффектов (Shaddow-Light, Shaddow-Dark, Glass-Depp-Frost, Shaddow-Light-Frost, Glass-Extra-Frost) и 3 градиента (Peach/Green/Dark-Blue). Скругления стилями не заданы: наблюдения 8/20/30px |
| Логотип | `logo/svg/`, `logo/png/` | `logo/LOGO-RULES.md`, `logo/catalog.json` | заполнено: Logo_Tumodo и Symbol_Tumodo по 5 вариантов (Dark/Black/Blue/Light/White) в SVG и PNG + правила охранного поля (X = 60px). Мин. размеры и запреты — ждут остальных слайдов брендбука |
| Иконки | `icons/svg/` | `icons/ICONS-RULES.md`, `icons/catalog.json` | **заполнено**: 347 иконок в едином стиле 24×24 / штрих 1.5px — 300 фирменных `icon-*.svg` из Figma (основной набор) + 47 дополняющих `lucide-*.svg` (дубли удалены, штрих приведён к 1.5px) |
| Шрифты (файлы) | `fonts/files/` | `fonts/FONTS-RULES.md` | **заполнено**: `NunitoSans-Variable.woff2` — вариативный, ось веса 200–1000 (проверено в браузере), покрывает все начертания шкалы (400/600/700/800). Курсива нет |
| Фото | `photos/people/`, `photos/illustrations/`, `photos/3d/` | `photos/PHOTOS-RULES.md`, `photos/catalog.json` | **заполнено**: 28 фото в `people/` и 8 объектов в `3d/` переименованы в осмысленные латинские имена (`<роль>-<сцена>.webp` / `3d-<объект>.webp`) и описаны в `catalog.json` по содержимому кадров; роли моделей (accountant / employee / manager / travel-coordinator) сопоставлены по референсам пользователя. `PHOTOS-RULES.md` заполнен: стилистика, правила и таблица-каталог. `illustrations/` пусто |
| Паттерны | `patterns/svg/`, `patterns/png/` | `patterns/PATTERNS-RULES.md`, `patterns/catalog.json` | частично: 2 SVG-волны с обложки «Библиотеки». Правила не написаны |
| Мокапы | `mockups/files/` | `mockups/MOCKUPS-RULES.md` | пусто: мокапов в доступных страницах Figma нет |
| Эталоны слайдов | `canon/layouts/`, `canon/decks/`, `canon/bad/` | `canon/README.md`, `canon/AUDIT.md` | **заполнено**: 43 эталона в `layouts/` — 10 макетов по 3–5 вариаций (главный + var-N) + архив 126 классифицированных слайдов в `decks/library/` (`catalog.tsv`) + колода `decks/brandbook/` (5 слайдов). Кандидаты в новые макеты — в `AUDIT.md` |
