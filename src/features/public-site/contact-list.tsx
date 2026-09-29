import { SUPPORT, displayPhone, type Lang } from './site';

/** The support channels, as links. Used by every page that says "contact us". */
export function ContactList({ lang }: { lang: Lang }) {
  const ar = lang === 'ar';
  return (
    <ul>
      <li>
        {ar ? 'البريد الإلكتروني: ' : 'Email: '}
        <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>
      </li>
      <li>
        {ar ? 'واتساب: ' : 'WhatsApp: '}
        <a href={SUPPORT.whatsappHref} dir="ltr">
          {displayPhone(SUPPORT.whatsapp)}
        </a>
      </li>
      <li>
        {ar ? 'الهاتف: ' : 'Phone: '}
        <a href={SUPPORT.phoneHref} dir="ltr">
          {displayPhone(SUPPORT.phone)}
        </a>
      </li>
    </ul>
  );
}
