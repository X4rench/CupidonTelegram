// ═══════════════════════════════════════════════════════════════
// PrivacyScreen — Политика конфиденциальности.
//
// Структура соответствует требованиям 152-ФЗ «О персональных данных»
// (РФ), минимум разделов: оператор, состав данных, цели, основание,
// сроки, передача третьим лицам, права субъекта, контакты, РКН.
//
// ВНИМАНИЕ: текст — РАБОЧАЯ ВЕРСИЯ. Финальная редакция требует
// проверки юристом и соответствия требованиям Роскомнадзора.
// Placeholder'ы: [BUSINESS_NAME], [BUSINESS_INN], apppartners@mail.ru,
// [BUSINESS_ADDRESS], [RKN_REGISTRATION_NUMBER].
// ═══════════════════════════════════════════════════════════════
import { useCallback, type ReactNode, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackButton } from '../utils/backButton';

const LAST_UPDATED = '01.06.2026';

export function PrivacyScreen() {
  const nav = useNavigate();
  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Политика конфиденциальности</span>
      </div>

      <div style={styles.scroll}>
        <div style={styles.iconRow}>
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth={1.5}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9,12 11,14 15,10" />
          </svg>
          <div style={styles.iconLabel}>Последнее обновление: {LAST_UPDATED}</div>
        </div>

        <LegalSection title="1. Оператор персональных данных">
          <p>
            Оператором персональных данных является физическое лицо
            <strong> Капустин Роман Денисович</strong>, осуществляющее
            предпринимательскую деятельность в качестве плательщика налога
            на профессиональный доход (самозанятого), ИНН <strong>421212787931</strong>,
            далее — «Оператор».
          </p>
          <p>
            Уведомление в реестр операторов персональных данных Роскомнадзора
            направлено в установленном порядке (п. 1 ст. 22 ФЗ № 152-ФЗ).
          </p>
          <p>
            Настоящая Политика разработана в соответствии с Федеральным
            законом № 152-ФЗ от 27.07.2006 «О персональных данных»
            и иными нормативными актами Российской Федерации.
          </p>
        </LegalSection>

        <LegalSection title="2. Состав обрабатываемых данных">
          <p>Оператор обрабатывает следующие категории данных:</p>
          <ul style={styles.list}>
            <li>
              <strong>Идентификационные данные Telegram:</strong>{' '}
              telegram_user_id, имя (first_name), фамилия (last_name, если указана),
              username, language_code. Данные получаются из Telegram WebApp initData
              после успешной аутентификации.
            </li>
            <li>
              <strong>Анкета пользователя:</strong> возраст, опыт в общении,
              предпочитаемые платформы, цели использования Сервиса (заполняется
              добровольно при первом входе).
            </li>
            <li>
              <strong>Контент для AI-анализа:</strong> тексты переписок, описания
              ситуаций, описания виртуальных собеседников, которые Пользователь
              добровольно отправляет в Сервис.
            </li>
            <li>
              <strong>Служебные данные:</strong> история запросов к Сервису,
              счётчики использования, информация о подписке, история платежей
              (без данных банковских карт).
            </li>
            <li>
              <strong>Технические данные:</strong> IP-адрес, user-agent,
              временные метки запросов (для безопасности и аналитики).
            </li>
          </ul>
          <p>
            Оператор <strong>не собирает</strong> и не запрашивает: банковские
            реквизиты (платежи проходят через Telegram Stars / эквайер),
            геолокацию, контакты, фотографии устройства, биометрию.
          </p>
        </LegalSection>

        <LegalSection title="3. Цели обработки данных">
          <p>Персональные данные обрабатываются исключительно в целях:</p>
          <ul style={styles.list}>
            <li>предоставления функциональности Сервиса (AI-рекомендации, симулятор);</li>
            <li>идентификации Пользователя и привязки подписки/баланса;</li>
            <li>персонализации рекомендаций на основе анкеты;</li>
            <li>учёта использования и контроля лимитов согласно тарифу;</li>
            <li>обеспечения технической поддержки и обработки обращений;</li>
            <li>исполнения требований законодательства РФ.</li>
          </ul>
        </LegalSection>

        <LegalSection title="4. Правовое основание обработки">
          <p>
            Обработка осуществляется на основании <strong>согласия</strong>{' '}
            субъекта персональных данных, которое выражается посредством запуска
            мини-приложения «Купидон» через Telegram и активного использования
            Сервиса (п. 1 ч. 1 ст. 6 Федерального закона № 152-ФЗ).
          </p>
          <p>
            Согласие может быть отозвано в любой момент через удаление аккаунта
            (см. раздел 7).
          </p>
        </LegalSection>

        <LegalSection title="5. Сроки хранения">
          <p>Сроки хранения данных:</p>
          <ul style={styles.list}>
            <li>
              <strong>Профиль и анкета:</strong> в течение всего срока использования
              Сервиса. После удаления аккаунта — удаляются в течение 30 дней.
            </li>
            <li>
              <strong>История запросов и логи:</strong> до 90 дней, далее —
              автоматическое удаление (используется для предотвращения злоупотреблений
              и аналитики качества AI).
            </li>
            <li>
              <strong>Тексты для AI-анализа:</strong> могут временно сохраняться
              в результатах сессий для отображения истории. Подлежат удалению
              вместе с аккаунтом.
            </li>
            <li>
              <strong>Данные о платежах:</strong> 3 года в соответствии
              с требованиями налогового и бухгалтерского учёта (ст. 23 НК РФ).
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="6. Передача данных третьим лицам">
          <p>
            Оператор привлекает следующих обработчиков данных (processor'ов):
          </p>
          <ul style={styles.list}>
            <li>
              <strong>polza.ai</strong> (AI-провайдер): получает тексты,
              отправляемые Пользователем для AI-анализа. Persistence на стороне
              провайдера не используется, тексты обрабатываются по требованию.
              Договор обработки персональных данных предоставляется
              по запросу на apppartners@mail.ru.
            </li>
            <li>
              <strong>Telegram Messenger LLP:</strong> платёжный механизм
              Telegram Stars, доставка сообщений, авторизация. Telegram —
              самостоятельный оператор в отношении данных, передаваемых через его
              инфраструктуру.
            </li>
            <li>
              <strong>Sentry</strong> (мониторинг ошибок, при наличии): получает
              анонимизированные стек-трейсы. Тексты пользователя в логи не попадают
              (фильтруются на стороне клиента, см. раздел 9).
            </li>
            <li>
              <strong>Эквайер для платежей картой:</strong> ООО НКО «ЮMani»
              (ЮKassa), лицензия Банка России № 3510-К. Данные банковских карт
              обрабатываются эквайером в соответствии с PCI DSS, Оператору
              не передаются.
            </li>
          </ul>
          <p>
            Оператор <strong>не продаёт</strong> персональные данные и не передаёт
            их третьим лицам для рекламных или иных целей, не указанных в настоящей
            Политике.
          </p>
        </LegalSection>

        <LegalSection title="7. Права субъекта персональных данных">
          <p>Пользователь имеет право:</p>
          <ul style={styles.list}>
            <li>получать информацию об обработке своих данных;</li>
            <li>требовать уточнения, блокировки или уничтожения данных в случае их неполноты, устаревания или незаконной обработки;</li>
            <li>отзывать согласие на обработку;</li>
            <li>обжаловать действия Оператора в Роскомнадзор или в судебном порядке.</li>
          </ul>
          <p>
            <strong>Реализация прав в Сервисе:</strong>
          </p>
          <ul style={styles.list}>
            <li>
              <strong>Доступ к данным:</strong> кнопка «Редактировать профиль»
              в разделе «Профиль» отображает все сохранённые персональные данные.
            </li>
            <li>
              <strong>Изменение данных:</strong> через тот же экран
              редактирования профиля.
            </li>
            <li>
              <strong>Удаление аккаунта:</strong> «Настройки» → «Удалить аккаунт».
              Все данные удаляются в течение 30 дней.
            </li>
            <li>
              <strong>Дополнительные запросы:</strong> на e-mail
              <em> apppartners@mail.ru</em>.
            </li>
          </ul>
          <p>
            Запрос обрабатывается в срок не более 30 дней с момента получения
            (ст. 20 ФЗ № 152-ФЗ).
          </p>
        </LegalSection>

        <LegalSection title="8. Меры защиты">
          <p>
            Оператор применяет правовые, организационные и технические меры
            для защиты персональных данных:
          </p>
          <ul style={styles.list}>
            <li>передача данных по HTTPS (TLS 1.2+);</li>
            <li>аутентификация через защищённый протокол Telegram initData (HMAC-SHA256);</li>
            <li>ограничение доступа к серверам и базам данных;</li>
            <li>регулярное удаление логов согласно политике retention;</li>
            <li>журналирование действий администраторов (audit log).</li>
          </ul>
        </LegalSection>

        <LegalSection title="9. Cookies, аналитика и трекинг">
          <p>
            Сервис работает внутри Telegram WebApp и <strong>не использует cookies</strong>{' '}
            в общепринятом понимании. Локально (в памяти TG WebView) хранятся
            настройки интерфейса (выбранная тема, состояние онбординга).
          </p>
          <p>
            Анонимизированные данные об ошибках могут отправляться в систему
            Sentry. При этом:
          </p>
          <ul style={styles.list}>
            <li>заголовок Authorization обезличивается (фильтр beforeSend);</li>
            <li>тексты пользователя длиной свыше 500 символов обрезаются;</li>
            <li>идентификаторы Telegram не передаются в логи ошибок.</li>
          </ul>
        </LegalSection>

        <LegalSection title="10. Жалобы и контакты">
          <p>
            По вопросам обработки персональных данных:
          </p>
          <p>
            <strong>E-mail:</strong> apppartners@mail.ru<br />
            <strong>Адрес для письменных обращений:</strong> предоставляется
            по запросу через e-mail (в соответствии с режимом самозанятого).
          </p>
          <p>
            В случае несогласия с обработкой данных или нарушения прав
            Пользователь вправе обратиться в надзорный орган —{' '}
            <strong>Федеральную службу по надзору в сфере связи,
            информационных технологий и массовых коммуникаций
            (Роскомнадзор):</strong>
          </p>
          <ul style={styles.list}>
            <li>сайт: rkn.gov.ru</li>
            <li>электронная приёмная: rkn.gov.ru/treatments/ask-question/</li>
          </ul>
        </LegalSection>

        <LegalSection title="11. Изменения Политики">
          <p>
            Оператор вправе изменять настоящую Политику. Актуальная редакция
            всегда доступна в разделе «Настройки» Сервиса. Дата последнего
            обновления указана в начале документа.
          </p>
        </LegalSection>

        <div style={styles.footer}>
          По вопросам конфиденциальности обращайтесь: apppartners@mail.ru
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  children: ReactNode;
}

function LegalSection({ title, children }: SectionProps) {
  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <div style={styles.sectionBody}>{children}</div>
    </section>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    paddingTop: 'calc(var(--safe-top) + 16px)',
    paddingBottom: 'calc(var(--safe-bottom) + 40px)',
  },
  header: {
    padding: '0 20px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--bg-card)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', paddingTop: 4 },

  scroll: { padding: '20px 20px 40px' },

  iconRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  iconLabel: { fontSize: 13, color: 'var(--text-muted)' },

  disclaimer: {
    padding: 12,
    borderRadius: 12,
    background: 'var(--accent-soft)',
    border: '1px solid var(--border-accent)',
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    marginBottom: 24,
  },

  section: { marginBottom: 22 },
  sectionTitle: {
    margin: '0 0 8px',
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.4,
  },
  sectionBody: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    lineHeight: 1.55,
  },
  list: {
    margin: '8px 0',
    paddingLeft: 20,
  },
  footer: {
    marginTop: 24,
    paddingTop: 16,
    borderTop: '1px solid var(--border-subtle)',
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
};
