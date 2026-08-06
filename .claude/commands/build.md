---
description: Собрать HTML-презентацию из input/<имя>.md и показать скриншоты слайдов
argument-hint: <имя>
---

Собери HTML-презентацию из `input/$ARGUMENTS.md` по правилам проекта.

Алгоритм:
1. Прочитай `CLAUDE.md`, `rules/*` (включая `rules/mistakes.md`), `design-system/MANIFEST.md`.
2. Распарси `input/$ARGUMENTS.md`: фронтматтер, слайды (разделитель `---`), пометки `[layout: ...]`, `[image: ...]` (имеют приоритет), заметки `<!-- notes: ... -->` (в слайд не попадают).
3. Для слайдов без пометок выбери макет по `rules/slide-layouts.md` и `rules/presentation-rules.md`.
4. Если контент нарушает `rules/content-rules.md` — предложи сокращение, решение за пользователем.
5. Собери через `node scripts/build.js $ARGUMENTS` самодостаточный `output/$ARGUMENTS/index.html`.
6. Визуальный цикл (обязателен): `node scripts/screenshot.js $ARGUMENTS` → для каждого слайда открой скриншот и эталон макета из `design-system/canon/layouts/<layout>.png`, сверь композицию/отступы/визуальный вес и проверь по антипаттернам из `rules/mistakes.md` → исправь → переснимай слайд (`node scripts/screenshot.js $ARGUMENTS <номер>`) до совпадения с эталоном, максимум 3 итерации на слайд.
7. Если эталона для макета нет — сверь с колодами из `canon/decks/` и явно сообщи пользователю список макетов без эталона.
8. Покажи пользователю финальные скриншоты.

Железные правила: только токены и ассеты из `design-system/`; сборка не меняет дизайн-систему и правила; результат только в `output/$ARGUMENTS/`.
