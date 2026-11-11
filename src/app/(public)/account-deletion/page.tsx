import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactList } from '@/features/public-site/contact-list';
import { PublicShell, Section } from '@/features/public-site/shell';
import { SUPPORT, parseLang } from '@/features/public-site/site';

export const metadata: Metadata = { title: 'Account Deletion' };

/*
 * The URL Google Play asks for in the Data safety form ("a link that users can
 * use to request that their account and associated data is deleted"), and the
 * page App Review reads next to the in-app flow.
 *
 * It follows the backend exactly (AccountDeletionService in the API):
 *   POST /auth/account-deletion   in-app request, confirmed with the password;
 *                                 every session and video ticket is revoked at once
 *   30 days PENDING                signing in shows "Cancel deletion"
 *   hourly sweep -> erase()        identity, device and network data erased; the
 *                                 records the business must keep stay, pseudonymous
 *   wallet balance > 0             erasure waits for an administrator to settle it
 * If that service changes, change sections 1, 3 and 4.
 */

const SUBJECT = 'Account deletion request';

export default async function AccountDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const lang = parseLang((await searchParams).lang);
  const mailto = `mailto:${SUPPORT.email}?subject=${encodeURIComponent(SUBJECT)}`;

  if (lang === 'ar') {
    return (
      <PublicShell lang="ar" path="/account-deletion" title="حذف حساب Student Center">
        <p>
          يمكنك حذف حسابك في Student Center والبيانات المرتبطة به في أي وقت، من داخل التطبيق أو
          بدونه.
        </p>

        <Section title="١. من داخل التطبيق">
          <ol>
            <li>افتح التطبيق وسجّل الدخول.</li>
            <li>اذهب إلى «حسابي» ثم «الإعدادات» ثم «حذف الحساب».</li>
            <li>اكتب كلمة المرور الحالية واضغط «حذف الحساب»، ثم أكّد.</li>
          </ol>
          <p>
            يتم تسجيل خروجك من كل الأجهزة فورًا، ويظهر لك تاريخ تنفيذ الحذف (بعد ٣٠ يومًا). لا تحتاج
            إلى التواصل مع الدعم.
          </p>
        </Section>

        <Section title="٢. إلغاء الحذف خلال ٣٠ يومًا">
          <p>
            إذا غيّرت رأيك قبل تاريخ التنفيذ، سجّل الدخول في التطبيق برقم هاتفك وكلمة المرور واختر
            «إلغاء الحذف». يعود حسابك كما كان.
          </p>
        </Section>

        <Section title="٣. بدون التطبيق">
          <p>
            أرسل رسالة بعنوان «<bdi>{SUBJECT}</bdi>» <a href={mailto}>بالبريد الإلكتروني</a> أو عبر
            واتساب من رقم الهاتف المسجّل به الحساب، واذكر فيها اسمك الكامل ورقم هاتفك المسجّل. سنتأكد
            من ملكية الرقم قبل التنفيذ، ثم تتبع إدارة المنصة الخطوات نفسها الموضحة هنا.
          </p>
          <ContactList lang="ar" />
        </Section>

        <Section title="٤. ما يحدث عند تنفيذ الحذف">
          <ul>
            <li>يُمسح اسمك ورقم هاتفك وبريدك الإلكتروني (إن وُجد) وصورتك الشخصية والنوع، ولا يمكن الدخول بالحساب بعد ذلك.</li>
            <li>يُحرَّر رقم هاتفك ليمكن التسجيل به من جديد.</li>
            <li>
              تُحذف معرّفات الأجهزة وعناوين IP ورموز الإشعارات والإشعارات وطلبات تغيير الجهاز، وتُحذف
              عناوين ونصوص ما كتبته في تذاكر الدعم.
            </li>
            <li>تفقد الوصول إلى كورساتك وتقدّمك ومواد المكتبة، ولا يمكن التراجع عن ذلك بعد التنفيذ.</li>
            <li>إذا تبقّى رصيد في المحفظة، ينتظر الحذف حتى تُسوّي الإدارة هذا الرصيد معك.</li>
          </ul>
        </Section>

        <Section title="٥. البيانات التي نحتفظ بها">
          <p>
            نحتفظ — بدون هويتك — بالسجلات التي تحتاجها المنصة لأغراض مالية وأمنية ورقابية:
            الاشتراكات وسجلات التعلّم والبيانات الدراسية والأكواد المستخدمة ومعاملات المحفظة وسجلات المكتبة وسجلات الأمان والتدقيق. لا تُستخدم إلا لهذه الأغراض. التفاصيل في{' '}
            <Link href="/privacy?lang=ar">سياسة الخصوصية</Link>.
          </p>
        </Section>
      </PublicShell>
    );
  }

  return (
    <PublicShell lang="en" path="/account-deletion" title="Delete your Student Center account">
      <p>
        You can delete your Student Center account and its associated data at any time, with or
        without the app.
      </p>

      <Section title="1. From inside the app">
        <ol>
          <li>Open the app and sign in.</li>
          <li>Go to Profile → Settings → Delete account.</li>
          <li>Enter your current password, tap “Delete account”, and confirm.</li>
        </ol>
        <p>
          You are signed out on every device straight away and shown the date the deletion will be
          carried out (30 days later). You do not need to contact support.
        </p>
      </Section>

      <Section title="2. Cancelling within 30 days">
        <p>
          If you change your mind before that date, sign in to the app with your phone number and
          password and choose “Cancel deletion”. Your account is restored as it was.
        </p>
      </Section>

      <Section title="3. Without the app">
        <p>
          Send a message with the subject “{SUBJECT}” <a href={mailto}>by email</a>, or on WhatsApp
          from the phone number registered on the account. Include your full name and registered
          phone number. We confirm that the number is yours first; the administration then follows
          the same steps described here.
        </p>
        <ContactList lang="en" />
      </Section>

      <Section title="4. What happens when the deletion is carried out">
        <ul>
          <li>
            Your name, phone number, email (if any), profile photo and gender are erased, and the
            account can no longer sign in.
          </li>
          <li>Your phone number is released so it can be used to register again.</li>
          <li>
            Device identifiers, IP addresses, push tokens, notifications and device-change requests
            are removed, and the subjects and text you wrote in support tickets are deleted.
          </li>
          <li>
            You lose access to your courses, progress and library materials; this cannot be undone
            once carried out.
          </li>
          <li>
            If wallet credit is left on the account, the deletion waits until the administration has
            settled it with you.
          </li>
        </ul>
      </Section>

      <Section title="5. What we keep">
        <p>
          We keep, without your identity, the records the platform needs for financial, security
          and audit purposes: enrollments and learning records, academic details, redeemed codes,
          wallet transactions, library records, and security and audit logs. They are used only for those
          purposes. See the <Link href="/privacy">Privacy Policy</Link> for details.
        </p>
      </Section>
    </PublicShell>
  );
}
