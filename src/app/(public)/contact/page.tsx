import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactList } from '@/features/public-site/contact-list';
import { PublicShell, Section } from '@/features/public-site/shell';
import { parseLang } from '@/features/public-site/site';

export const metadata: Metadata = { title: 'Support' };

/*
 * The public "Support URL" for App Store Connect and the contact page for
 * Google Play. `/support` is already the staff support inbox, hence `/contact`.
 *
 * It must stay reachable without signing in (listed in PUBLIC_PAGE_PATHS) and
 * must only describe what the mobile app really does. The app is
 * consumption-only: it never sells, never takes codes or payments, so this page
 * never tells anyone to buy, redeem or pay anything.
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
            أسرع طريقة للتواصل هي قسم «الدعم» داخل التطبيق («حسابي» ثم «الإعدادات» ثم «الدعم»): افتح
            تذكرة وتابع الرد عليها من نفس المكان. ويمكنك أيضًا الوصول إلى واتساب والبريد الإلكتروني من
            «الإعدادات» ثم «عن التطبيق».
          </p>
        </Section>

        <Section title="تواصل معنا">
          <ContactList lang="ar" />
          <p>
            عند التواصل اذكر اسمك الكامل ورقم الهاتف المسجّل به الحساب، ولا ترسل كلمة المرور أبدًا.
          </p>
        </Section>

        <Section title="الدخول إلى حسابك">
          <p>
            <strong>تسجيل الدخول:</strong> اسم الدخول هو رقم هاتفك المسجّل وكلمة المرور الخاصة بك.
          </p>
          <p>
            <strong>نسيت كلمة المرور؟</strong> إعادة تعيين كلمة المرور تتم عن طريق الإدارة فقط. اختر
            «نسيت كلمة المرور؟» في شاشة الدخول وتواصل مع الدعم من رقمك المسجّل، وستحصل على كلمة مرور
            جديدة بعد التأكد من هويتك.
          </p>
          <p>
            <strong>الكورس لا يظهر في التطبيق؟</strong> يعرض التطبيق الكورسات والمواد المتاحة على
            حسابك. اسحب الشاشة لأسفل لتحديث «كورساتي» أو سجّل الخروج ثم الدخول. إذا لم يظهر، تواصل
            مع الدعم واذكر اسم الكورس.
          </p>
        </Section>

        <Section title="الأجهزة وموافقة الإدارة">
          <p>
            يرتبط كل حساب بجهاز واحد لحماية المحتوى. أول جهاز تسجّل الدخول منه يُعتمد تلقائيًا.
          </p>
          <p>
            <strong>غيّرت هاتفك؟</strong> سجّل الدخول من الجهاز الجديد؛ يُرسل طلب تغيير الجهاز إلى
            الإدارة للمراجعة، ويمكنك متابعته من «الإعدادات» ثم «الأجهزة». لن تعمل الفيديوهات على الجهاز
            الجديد حتى تتم الموافقة. لتسريع المراجعة تواصل مع الدعم من رقمك المسجّل.
          </p>
          <p>
            <strong>فقدت هاتفك أو تريد إزالة جهاز قديم؟</strong> تواصل مع الدعم لتقوم الإدارة بإلغاء
            الجهاز القديم أو إعادة ضبط أجهزة الحساب.
          </p>
        </Section>

        <Section title="مشاكل التشغيل">
          <p>
            تأكد من أن لديك أحدث إصدار من التطبيق واتصالًا ثابتًا بالإنترنت. يتوقف تشغيل الفيديو أثناء
            تسجيل الشاشة أو عرضها على شاشة أخرى، وهذا مقصود لحماية المحتوى. إذا استمرت المشكلة، تواصل مع
            الدعم واذكر اسم الدرس ونوع جهازك.
          </p>
        </Section>

        <Section title="حذف الحساب والخصوصية">
          <p>
            يمكنك حذف حسابك من داخل التطبيق في أي وقت — راجع{' '}
            <Link href="/account-deletion?lang=ar">حذف الحساب</Link>. ولمعرفة البيانات التي نجمعها راجع{' '}
            <Link href="/privacy?lang=ar">سياسة الخصوصية</Link>.
          </p>
        </Section>
      </PublicShell>
    );
  }

  return (
    <PublicShell lang="en" path="/contact" title="Student Center Support">
      <Section title="In the app">
        <p>
          The fastest way to reach us is Support inside the app (Profile → Settings → Support): open
          a ticket and follow the reply in the same place. WhatsApp and email are also available
          from Settings → About this app.
        </p>
      </Section>

      <Section title="Contact us">
        <ContactList lang="en" />
        <p>
          When you contact us, give your full name and the phone number registered on the account.
          Never send your password.
        </p>
      </Section>

      <Section title="Getting into your account">
        <p>
          <strong>Signing in:</strong> your sign-in name is your registered phone number, with your
          own password.
        </p>
        <p>
          <strong>Forgot your password?</strong> Passwords are reset by the administration only. Tap
          “Forgot your password?” on the sign-in screen and contact support from your registered
          number; you will get a new password once we have confirmed it is you.
        </p>
        <p>
          <strong>A course is not showing in the app?</strong> The app shows the courses and
          materials that are active on your account. Pull down on My courses to refresh, or sign out
          and in again. If it is still missing, contact support with the course name.
        </p>
      </Section>

      <Section title="Devices and approval">
        <p>
          Each account is linked to one device to protect the content. The first device you sign in
          on is approved automatically.
        </p>
        <p>
          <strong>Changed your phone?</strong> Sign in on the new device; a device-change request is
          sent to the administration for review, and you can follow it under Settings → Devices.
          Videos will not play on the new device until it is approved. To speed this up, contact
          support from your registered number.
        </p>
        <p>
          <strong>Lost your phone, or want an old device removed?</strong> Contact support and the
          administration will remove the old device or reset the devices on your account.
        </p>
      </Section>

      <Section title="Playback problems">
        <p>
          Make sure the app is up to date and your internet connection is stable. Video stops while
          the screen is being recorded or shown on another display — that is intentional, to protect
          the content. If a problem continues, contact support with the lesson name and your device
          model.
        </p>
      </Section>

      <Section title="Account deletion and privacy">
        <p>
          You can delete your account from inside the app at any time — see{' '}
          <Link href="/account-deletion">Account Deletion</Link>. For the information we collect, see
          the <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </Section>
    </PublicShell>
  );
}
