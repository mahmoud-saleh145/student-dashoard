import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactList } from '@/features/public-site/contact-list';
import { PublicShell, Section } from '@/features/public-site/shell';
import { SUPPORT, parseLang } from '@/features/public-site/site';

export const metadata: Metadata = { title: 'Account Deletion' };

/*
 * The URL Google Play asks for in the Data safety form ("a link that users can
 * use to request that their account and associated data is deleted").
 *
 * Deletion itself is an administrator action (`DELETE /admin/users/:id`, a
 * soft delete — see users.service.ts `softDelete`). Requests arrive either as
 * an in-app support ticket (Settings → Delete account) or through the
 * channels below. What is kept afterwards is stated exactly as the code does
 * it; if `softDelete` changes, change section 3.
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
          يمكنك طلب حذف حسابك في Student Center والبيانات المرتبطة به في أي وقت، من داخل التطبيق
          أو بدونه.
        </p>

        <Section title="١. من داخل التطبيق">
          <ol>
            <li>افتح التطبيق وسجّل الدخول.</li>
            <li>اذهب إلى «حسابي» ثم «الإعدادات».</li>
            <li>اختر «حذف الحساب» ثم «طلب حذف الحساب» وأكّد.</li>
          </ol>
          <p>
            يُرسَل طلبك إلى إدارة المنصة كتذكرة دعم برقم مرجعي، ويمكنك متابعتها من قسم «الدعم» داخل
            التطبيق.
          </p>
        </Section>

        <Section title="٢. بدون التطبيق">
          <p>
            أرسل رسالة بعنوان «<bdi>{SUBJECT}</bdi>» <a href={mailto}>بالبريد الإلكتروني</a> أو عبر واتساب من
            رقم الهاتف المسجّل به الحساب، واذكر فيها اسمك الكامل ورقم هاتفك المسجّل. قد نطلب منك
            تأكيد ملكية الرقم قبل تنفيذ الحذف.
          </p>
          <ContactList lang="ar" />
        </Section>

        <Section title="٣. ما يحدث عند حذف الحساب">
          <ul>
            <li>يتم تعطيل الحساب ولا يمكن الدخول به مرة أخرى.</li>
            <li>يتم تسجيل خروجك من كل الأجهزة وإلغاء أي صلاحية لتشغيل الفيديو.</li>
            <li>يتم تحرير رقم هاتفك ليمكن التسجيل به من جديد.</li>
            <li>
              تفقد الوصول إلى كورساتك وتقدّمك ورصيد محفظتك ومشترياتك من المكتبة، ولا يمكن التراجع عن
              ذلك. الأكواد والكروت المستخدمة لا يمكن إعادة استخدامها.
            </li>
          </ul>
        </Section>

        <Section title="٤. البيانات التي نحتفظ بها">
          <p>
            نحتفظ بالسجلات التي تحتاجها المنصة لأغراض مالية وأمنية ورقابية — الاشتراكات والأكواد
            المستخدمة ومعاملات المحفظة والمشتريات ومحادثات الدعم وسجلات الأمان والتدقيق — مع سجل
            الحساب المعطّل الذي تشير إليه، والذي يتضمن اسمك ورقم هاتفك وبياناتك الدراسية وصورتك الشخصية وأجهزتك وتقدّمك في الدروس. لا تظهر هذه السجلات في التطبيق
            ولا تُستخدم إلا لهذه الأغراض. التفاصيل في{' '}
            <Link href="/privacy?lang=ar">سياسة الخصوصية</Link>.
          </p>
        </Section>
      </PublicShell>
    );
  }

  return (
    <PublicShell lang="en" path="/account-deletion" title="Delete your Student Center account">
      <p>
        You can ask for your Student Center account and its associated data to be deleted at any
        time, with or without the app.
      </p>

      <Section title="1. From inside the app">
        <ol>
          <li>Open the app and sign in.</li>
          <li>Go to Profile → Settings.</li>
          <li>Tap “Delete account”, then “Request account deletion”, and confirm.</li>
        </ol>
        <p>
          Your request goes to the platform administration as a support ticket with a reference
          number, which you can follow under Support in the app.
        </p>
      </Section>

      <Section title="2. Without the app">
        <p>
          Send a message with the subject “{SUBJECT}” <a href={mailto}>by email</a>, or on WhatsApp
          from the phone number registered on the account. Include your full name and registered
          phone number. We may ask you to confirm that the number is yours before the deletion is
          carried out.
        </p>
        <ContactList lang="en" />
      </Section>

      <Section title="3. What happens when the account is deleted">
        <ul>
          <li>The account is disabled and can no longer sign in.</li>
          <li>You are signed out on every device and any video access is revoked.</li>
          <li>Your phone number is released so it can be used to register again.</li>
          <li>
            You lose access to your courses, progress, wallet credit and library purchases, and
            this cannot be undone. Codes and cards you already redeemed cannot be reused.
          </li>
        </ul>
      </Section>

      <Section title="4. What we keep">
        <p>
          We keep the records the platform needs for financial, security and audit purposes —
          enrollments, redeemed codes, wallet transactions, purchases, support conversations and
          security and audit logs — together with the disabled account record they refer to, which
          includes your name, phone number, academic details, profile photo, devices and learning progress. These records are not visible in the app and are
          used only for those purposes. See the <Link href="/privacy">Privacy Policy</Link> for
          details.
        </p>
      </Section>
    </PublicShell>
  );
}
