# Phase E — Auth / Onboarding / Home / Profile

Портированы 8 экранов из RN-версии в TMA-стек (Vite + React + TS).
Кириллические директории (`Купидон`, `Купидон-TMA`) ломают bash-команды
с `cd`/`ls` — все скрипты используют абсолютные пути.

## Что портировано

| Экран RN (`src/screens/*.js`) | TMA (`mini-app/src/screens/*.tsx`) | Заметки |
| --- | --- | --- |
| `SplashScreen.js` | `SplashScreen.tsx` | Анимация — CSS pulse + sliding loader. Сам редиректит после загрузки `/me`. |
| `OnboardingScreen.js` | `OnboardingScreen.tsx` | 3 слайда (без выбора языка — только RU). Анимация — CSS keyframes. |
| `QuestionnaireScreen.js` | `QuestionnaireScreen.tsx` + `QuestionnaireForm.tsx` | Wizard-режим. Форма вынесена в shared component с `mode: 'onboarding' \| 'edit'`. |
| `HomeScreen.js` | `HomeScreen.tsx` | Расширен мой stub: tools-карусель, статистика из `/stats`, заглушка диалогов до Phase F-G, совет дня. |
| `ProfileScreen.js` | `ProfileScreen.tsx` | Аватар из TG `photo_url`, тир-бейдж, 2×2 grid статистики, секция Админка по `me.is_admin`. |
| `EditProfileScreen.js` | `EditProfileScreen.tsx` | Использует `QuestionnaireForm mode='edit'`, фото — read-only из TG. |
| `SettingsScreen.js` | `SettingsScreen.tsx` | Toggle темы — заглушка (только dark). Notifs — в localStorage. Build version в футере. |
| `DeleteProfileScreen.js` | `DeleteProfileScreen.tsx` | Двойное подтверждение: чекбокс + модалка. Success-экран после удаления. |

## Что НЕ портировано (как договорились)

- `AuthScreen.js`, `EmailAuthScreen.js` — auth в TMA через initData.
- `LanguageScreen.js` и выбор языка в Onboarding — только русский.

## API изменения

`mini-app/src/api.ts`:
- Расширен `MeUser` (поля `language_code`, `user_profile`, `requests_count`,
  `simulations_count`, `tg_bonus_claimed`, `is_admin`, `created_at`).
- Добавлены: `updateMe`, `getStats`, `getSubscription`, `claimTgBonus`, `deleteMe`.
- Добавлены типы `UserProfile`, `StatsResponse`.

`backend/src/routes/users.js`:
- `buildUserResponse` теперь возвращает `is_admin: boolean` (по `ADMIN_TELEGRAM_IDS`).

`mini-app/src/utils/backButton.ts` — новый хук `useBackButton(onBack)`,
использует `window.Telegram.WebApp.BackButton` напрямую (без `@telegram-apps/sdk-react`
импорта в каждом файле — меньше шансов сломать SSR/тесты).

## Поведение AuthGate

В `App.tsx` добавлен компонент `<AuthGate />`: при первом монтировании смотрит
на `me.onboarding_done` / `questionnaire_done`. Если не пройдено — редирект на
`/onboarding` / `/questionnaire`. Срабатывает один раз (`useRef` флаг), не лезет
если юзер уже на onboarding/questionnaire/splash.

`SplashScreen` остался как отдельный route `/splash` — на случай если захочется
вызвать его явно. Сейчас стандартный flow: `main.tsx` → `App` → AuthGate →
редирект, без захода на splash. Если визуально важен splash на старте — можно
в `main.tsx` переключиться на `nav('/splash')` при загрузке.

## Edge cases / TODO для ревью

1. **Splash route не на главном flow.** AuthGate редиректит сразу из `/`. Если
   хочется обязательного splash при холодном старте — добавить redirect из
   `main.tsx`/`App` пока `me.loading=true`. Сейчас при загрузке `me`
   просто показывается `HomeScreen` без контента (HomeScreen сам толерантен
   к `me=null`).

2. **Аватар в EditProfile read-only.** В RN-версии был ImagePicker. В TMA
   `tgUser.photo_url` приходит из initData и не редактируется — это ок и логично.
   Если потребуется кастомный аватар — нужен `<input type='file'>` + загрузка
   в backend (нет такой схемы пока).

3. **Notifs toggle — заглушка.** Просто пишет в `localStorage`. Реальная подписка
   на TG-уведомления (`web_app_request_*`) — Phase H.

4. **Theme switcher — заглушка.** Только dark пока. Phase J (по плану) добавит
   alt-темы — там обновить SettingsScreen.

5. **DeleteProfile после удаления.** Показывает success-экран и
   `window.location.reload()`. После reload `/me` upsert'ит юзера снова из
   initData (telegram_user_id уникален). Это поведение продакта, не баг — но
   стоит обсудить: возможно после удаления показывать landing-экран без авто-restore.

6. **HomeScreen «Активные диалоги»** сейчас — статичная заглушка. Когда Phase F/G
   портируют Wing/Simulator/AllDialogs, нужно подгрузить `contacts.getAll()` и
   `simulator/sessions` соответственно.

7. **AuthGate vs StrictMode.** В `main.tsx` обёртка `<StrictMode>` вызывает эффект
   AuthGate дважды в dev — `useRef` флаг это правильно отрабатывает.

8. **`is_admin` в `/me`.** Перенесено из ADMIN_TELEGRAM_IDS env в каждый ответ.
   Это удобно для UI, но потенциально утечка инфы что есть админы — если
   нужно скрыть, можно вернуть только когда сам юзер админ (уже так и сделано —
   возвращается `true/false` только своему telegram_user_id).

## Стили

- Везде inline-styles через `const styles: Record<string, CSSProperties> = {...}`
  внизу файла — единый паттерн, без CSS Modules (чтобы избежать build-config).
- Все цвета — `var(--accent-primary)` и т.д. из `theme.css`.
- Inputs — без переопределения `font-size` (глобально 16px чтобы iOS Safari не зумил).
- Кнопки — `impactHaptic('light')` / `selectionHaptic()` при тапе.

## Файлы

Новые:
- `mini-app/src/screens/SplashScreen.tsx`
- `mini-app/src/screens/OnboardingScreen.tsx`
- `mini-app/src/screens/QuestionnaireScreen.tsx`
- `mini-app/src/screens/QuestionnaireForm.tsx` (shared)
- `mini-app/src/screens/ProfileScreen.tsx`
- `mini-app/src/screens/EditProfileScreen.tsx`
- `mini-app/src/screens/SettingsScreen.tsx`
- `mini-app/src/screens/DeleteProfileScreen.tsx`
- `mini-app/src/utils/backButton.ts`

Изменённые:
- `mini-app/src/App.tsx` — реальные импорты + `<AuthGate />`.
- `mini-app/src/api.ts` — расширения типов, новые методы.
- `mini-app/src/screens/HomeScreen.tsx` — расширен.
- `mini-app/src/screens/stubs.tsx` — удалены портированные stubs.
- `backend/src/routes/users.js` — `is_admin` в ответе.
