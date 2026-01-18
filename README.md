# LabelCalc

Мобильный PWA калькулятор-сумматор с лентой. Работает офлайн через localStorage и service worker.

## Локальный запуск

Нужен любой статический сервер. Пример на Python:

```bash
python -m http.server 8000
```

Откройте в браузере `http://localhost:8000`.

## GitHub Pages

1. Перейдите в **Settings → Pages**.
2. В **Build and deployment** выберите **Deploy from a branch**.
3. Укажите ветку (например, `main`) и папку `/root`.
4. Сохраните настройки и дождитесь публикации.

## Структура

- `index.html` — базовая разметка.
- `assets/css/style.css` — стили и адаптация под мобильные.
- `assets/js/app.js` — каркас логики.
- `manifest.json` — манифест PWA.
- `sw.js` — service worker (cache-first).
