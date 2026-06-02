// ═══════════════════════════════════════════════════════════════
// TermsScreen — пользовательское соглашение (оферта).
//
// ВАЖНО: контент — РАБОЧАЯ ВЕРСИЯ для разработки. Перед запуском
// обязательно ревью юристом. Все placeholder'ы вида [BUSINESS_NAME],
// [BUSINESS_INN], [SUPPORT_EMAIL] и т.д. — должны быть заменены на
// реальные данные. См. PHASE_J_NOTES.md.
//
// Юрисдикция: РФ (152-ФЗ, ГК РФ, ФЗ «О защите прав потребителей»).
// ═══════════════════════════════════════════════════════════════
import { useCallback, type ReactNode, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackButton } from '../utils/backButton';

const LAST_UPDATED = '01.06.2026';

export function TermsScreen() {
  const nav = useNavigate();
  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Условия использования</span>
      </div>

      <div style={styles.scroll}>
        <div style={styles.iconRow}>
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth={1.5}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1={16} y1={13} x2={8} y2={13} />
            <line x1={16} y1={17} x2={8} y2={17} />
          </svg>
          <div style={styles.iconLabel}>Последнее обновление: {LAST_UPDATED}</div>
        </div>

        <Disclaimer />

        <LegalSection title="1. Общие положения и предмет оферты">
          <p>
            Настоящий документ является публичной офертой (далее — «Оферта»)
            индивидуального предпринимателя [BUSINESS_NAME] (ИНН [BUSINESS_INN],
            ОГРНИП [BUSINESS_OGRNIP]), далее — «Исполнитель», и определяет условия
            использования мини-приложения «Купидон» (далее — «Сервис»),
            размещённого в мессенджере Telegram.
          </p>
          <p>
            Использование Сервиса означает безоговорочное принятие настоящих
            Условий пользователем (далее — «Пользователь»). Если Вы не согласны
            с какими-либо положениями, незамедлительно прекратите использование
            Сервиса.
          </p>
        </LegalSection>

        <LegalSection title="2. Описание Сервиса">
          <p>
            «Купидон» — это AI-ассистент по знакомствам и общению. Сервис
            предоставляет следующие возможности:
          </p>
          <ul style={styles.list}>
            <li>Анализ переписки с использованием AI и рекомендации по ответам.</li>
            <li>Симулятор знакомств с виртуальными собеседниками.</li>
            <li>Разбор отказов, помощь с первым сообщением, поддерживающие реплики.</li>
            <li>Образовательный контент (теория общения, лента сообщества).</li>
          </ul>
          <p>
            Сервис носит вспомогательный и развлекательный характер. Исполнитель
            не гарантирует достижения каких-либо конкретных результатов в личной
            или общественной жизни Пользователя.
          </p>
        </LegalSection>

        <LegalSection title="3. Возраст и право использования">
          <p>
            Сервис доступен лицам, достигшим 18 лет. Регистрируясь и используя
            Сервис, Пользователь подтверждает свой возраст и дееспособность.
          </p>
        </LegalSection>

        <LegalSection title="4. Тарифы и оплата">
          <p>
            Доступ к расширенным функциям предоставляется на условиях подписки.
            Оплата производится:
          </p>
          <ul style={styles.list}>
            <li>
              Через Telegram Stars (XTR) — встроенный платёжный механизм
              мессенджера Telegram. Все вопросы по транзакциям регулируются
              условиями Telegram.
            </li>
            <li>
              Через ЮKassa (банковской картой) — в случае подключения этого
              способа. Эквайринг осуществляется в соответствии с
              законодательством РФ. [PAYMENT_PROVIDER_DETAILS]
            </li>
          </ul>
          <p>
            Актуальная стоимость и состав тарифов отображаются непосредственно
            в Сервисе на экране оформления подписки и могут изменяться
            Исполнителем.
          </p>
        </LegalSection>

        <LegalSection title="5. Возврат средств">
          <p>
            Поскольку Сервис является цифровым продуктом и доступ к нему
            предоставляется немедленно после оплаты, возврат средств возможен
            только в случаях, предусмотренных Законом РФ «О защите прав
            потребителей».
          </p>
          <p>
            Для запроса возврата, связанного с платежами в Telegram Stars,
            используйте встроенную команду <strong>/paysupport</strong> в
            нашем Telegram-боте или напишите на [SUPPORT_EMAIL] с указанием
            номера транзакции.
          </p>
        </LegalSection>

        <LegalSection title="6. Запрещённое использование">
          <p>Пользователю запрещается использовать Сервис для:</p>
          <ul style={styles.list}>
            <li>создания, распространения или анализа материалов, связанных с CSAM (sexual exploitation of children) — это влечёт незамедлительную блокировку и сообщение в правоохранительные органы;</li>
            <li>дискриминации, разжигания ненависти, угроз и оскорблений по любому признаку;</li>
            <li>обмана, мошенничества, романтических афер и иных противоправных действий;</li>
            <li>сбора, обработки или передачи персональных данных третьих лиц без их согласия;</li>
            <li>автоматизированной массовой рассылки сообщений (спама);</li>
            <li>обхода технических ограничений Сервиса, реверс-инжиниринга, попыток получить несанкционированный доступ.</li>
          </ul>
          <p>
            Исполнитель вправе ограничить или прекратить доступ к Сервису
            в одностороннем порядке при нарушении настоящего пункта без возврата
            оплаченных средств.
          </p>
        </LegalSection>

        <LegalSection title="7. Ограничение ответственности">
          <p>
            Сервис предоставляется «как есть» (as is). Исполнитель не несёт
            ответственности за:
          </p>
          <ul style={styles.list}>
            <li>результаты применения рекомендаций AI в реальном общении;</li>
            <li>содержание сообщений, отправляемых Пользователем третьим лицам;</li>
            <li>временную недоступность Сервиса в связи с техническими работами или сбоями сторонних провайдеров (Telegram, polza.ai и др.);</li>
            <li>убытки, упущенную выгоду, моральный или иной вред, причинённый использованием Сервиса.</li>
          </ul>
          <p>
            Общий размер ответственности Исполнителя в любом случае
            ограничивается суммой, уплаченной Пользователем за подписку
            за последний расчётный месяц.
          </p>
        </LegalSection>

        <LegalSection title="8. Интеллектуальная собственность">
          <p>
            Исключительные права на Сервис, его интерфейс, дизайн, тексты,
            графику, программный код и иные результаты интеллектуальной
            деятельности принадлежат Исполнителю. Пользователю предоставляется
            простое (неисключительное) ограниченное право использования Сервиса
            в личных некоммерческих целях.
          </p>
        </LegalSection>

        <LegalSection title="9. Изменение условий">
          <p>
            Исполнитель вправе в одностороннем порядке вносить изменения
            в настоящие Условия. Актуальная версия всегда доступна
            в разделе «Настройки» Сервиса. Дата последнего обновления указана
            в начале документа.
          </p>
          <p>
            Продолжение использования Сервиса после внесения изменений означает
            согласие Пользователя с новой редакцией.
          </p>
        </LegalSection>

        <LegalSection title="10. Применимое право и разрешение споров">
          <p>
            К отношениям Сторон применяется законодательство Российской Федерации.
          </p>
          <p>
            Все споры подлежат разрешению путём переговоров. При недостижении
            согласия — в судебном порядке по месту нахождения Исполнителя
            в соответствии с подсудностью, установленной законодательством РФ.
          </p>
        </LegalSection>

        <LegalSection title="11. Контакты">
          <p>
            <strong>Исполнитель:</strong> ИП [BUSINESS_NAME]<br />
            <strong>ИНН:</strong> [BUSINESS_INN]<br />
            <strong>Адрес:</strong> [BUSINESS_ADDRESS]<br />
            <strong>E-mail:</strong> [SUPPORT_EMAIL]<br />
            <strong>Telegram-поддержка:</strong> [SUPPORT_TG_USERNAME]
          </p>
        </LegalSection>

        <div style={styles.footer}>
          По вопросам, связанным с условиями использования, обращайтесь:
          {' '}[SUPPORT_EMAIL]
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Disclaimer() {
  return (
    <div style={styles.disclaimer}>
      <strong style={{ color: 'var(--status-warning)' }}>Рабочая версия.</strong>{' '}
      Документ оформлен по структуре, требуемой законодательством РФ, но
      требует финальной проверки и заверения юристом перед публичным запуском.
      Реквизиты ИП и контактные данные временно содержат placeholder'ы вида
      [BUSINESS_NAME] и будут заменены на актуальные.
    </div>
  );
}

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

// ─── Styles ───────────────────────────────────────────────────────────────────

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
