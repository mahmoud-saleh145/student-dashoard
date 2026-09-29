import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactList } from '@/features/public-site/contact-list';
import { PublicShell, Section } from '@/features/public-site/shell';
import { parseLang } from '@/features/public-site/site';

export const metadata: Metadata = { title: 'Support' };

/*
 * The "Support URL" for App Store Connect and the contact page for Google Play.
 * `/support` is already the staff support inbox, hence `/contact`.
 */

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const lang = parseLang((await searchParams).lang);

  if (lang === 'ar') {
    return (
      <PublicShell lang="ar" path="/contact" title="دعم Student Center">
        <Section title="داخل التطبيق">
          <p>
            الطريقة الأسرع هي قسم «الدعم» داخل التطبيق: افتح تذكرة جديدة وتابع الرد عليها من نفس
            المكان. ويمكنك أيضًا الوصول إلى واتساب والبريد الإلكتروني من «الإعدادات» ثم «عن التطبيق».
          </p>
        </Section>
        <Section title="تواصل معنا">
          <ContactList lang="ar" />
        </Section>
        <Section title="أسئلة شائعة">
          <p>
            <strong>نسيت كلمة المرور؟</strong> اختر «نسيت كلمة المرور؟» في شاشة الدخول وتواصل مع الدعم
            من رقمك المسجّل.
          </p>
          <p>
            <strong>غيّرت هاتفك؟</strong> سجّل الدخول من الجهاز الجديد؛ سيصل طلب تغيير الجهاز إلى
            الإدارة للمراجعة.
          </p>
          <p>
            <strong>الكود لا يعمل؟</strong> تأكد من كتابته كما هو مطبوع، ثم تواصل مع الدعم مع ذكر اسم
            الكورس.
          </p>
          <p>
            <strong>حذف الحساب:</strong> راجع <Link href="/account-deletion?lang=ar">حذف الحساب</Link>.
          </p>
        </Section>
      </PublicShell>
    );
  }

  return (
    <PublicShell lang="en" path="/contact" title="Student Center Support">
      <Section title="In the app">
        <p>
          The fastest way to reach us is Support inside the app: open a ticket and follow the reply
          in the same place. WhatsApp and email are also available from Settings → About this app.
        </p>
      </Section>
      <Section title="Contact us">
        <ContactList lang="en" />
      </Section>
      <Section title="Common questions">
        <p>
          <strong>Forgot your password?</strong> Tap “Forgot your password?” on the sign-in screen and
          contact support from your registered number.
        </p>
        <p>
          <strong>Changed your phone?</strong> Sign in on the new device; a device-change request is
          sent to the administration for review.
        </p>
        <p>
          <strong>Code not working?</strong> Check it is typed exactly as printed, then contact
          support with the course name.
        </p>
        <p>
          <strong>Deleting your account:</strong> see{' '}
          <Link href="/account-deletion">Account Deletion</Link>.
        </p>
      </Section>
    </PublicShell>
  );
}
