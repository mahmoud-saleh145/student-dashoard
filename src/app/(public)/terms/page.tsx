import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactList } from '@/features/public-site/contact-list';
import { PublicShell, Section } from '@/features/public-site/shell';
import { parseLang } from '@/features/public-site/site';

export const metadata: Metadata = { title: 'Terms & Conditions' };

/*
 * Describes the rules the platform actually enforces (device binding, access
 * codes, wallet scope, content protection). If a rule changes in the backend,
 * change it here too.
 */

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const lang = parseLang((await searchParams).lang);
  return (
    <PublicShell
      lang={lang}
      path="/terms"
      title={lang === 'ar' ? 'الشروط والأحكام' : 'Terms & Conditions'}
    >
      {lang === 'ar' ? <Arabic /> : <English />}
    </PublicShell>
  );
}

function English() {
  return (
    <>
      <Section title="1. Agreement">
        <p>
          By creating an account or using the Student Center app you agree to these terms and to
          the <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the
          app.
        </p>
      </Section>

      <Section title="2. The service">
        <p>
          Student Center gives university students access to courses, recorded lessons, lesson
          attachments, library materials, notifications and support. Courses and materials are
          prepared by instructors and published by the platform administration. What is offered
          can change over time.
        </p>
      </Section>

      <Section title="3. Your account">
        <ul>
          <li>Give accurate registration details, including your own mobile number.</li>
          <li>One account per person. Accounts are personal and may not be shared, sold or transferred.</li>
          <li>Keep your password secret. You are responsible for activity on your account.</li>
          <li>
            An account can be used on a limited number of devices set by the administration.
            Using a new device may require the administration to approve a device change.
          </li>
        </ul>
      </Section>

      <Section title="4. Access to courses and materials">
        <ul>
          <li>
            Depending on the course, access is granted for free, by redeeming an access code, or
            by administration approval. Access may be limited to a period set for the course.
          </li>
          <li>An access code or recharge card can be redeemed once and cannot be reused.</li>
          <li>
            Wallet credit can only be spent on Library materials inside the app. Course access is
            never paid from the wallet.
          </li>
          <li>
            The administration may revoke access that was obtained through misuse, fraud or a
            breach of these terms.
          </li>
        </ul>
      </Section>

      <Section title="5. Content protection and acceptable use">
        <p>You may not:</p>
        <ul>
          <li>record, screenshot, download, copy, share or republish lessons or materials;</li>
          <li>let anyone else use your account;</li>
          <li>
            try to bypass device binding, watermarks, screen-capture protection or any other
            security measure, or tamper with, decompile or reverse-engineer the app;
          </li>
          <li>use the service to harass anyone or to break the law.</li>
        </ul>
        <p>
          Videos carry a visible watermark identifying your account. When screen recording or a
          similar risk is detected, playback may stop and the event is recorded. Breaking these
          rules can lead to suspension or closure of the account.
        </p>
      </Section>

      <Section title="6. Intellectual property">
        <p>
          Courses, videos, attachments and library materials belong to their instructors and the
          platform. You receive a personal, non-transferable right to view them in the app for your
          own study while your access lasts. The Student Center name and logo may not be used
          without permission.
        </p>
      </Section>

      <Section title="7. Availability">
        <p>
          We work to keep the service available, but it may be interrupted for maintenance, updates
          or reasons outside our control, and features may change. You may need to update the app
          to keep using it.
        </p>
      </Section>

      <Section title="8. Suspension and deletion">
        <p>
          The administration may suspend or close accounts that break these terms. You may ask for
          your account to be deleted at any time — see{' '}
          <Link href="/account-deletion">Account Deletion</Link>.
        </p>
      </Section>

      <Section title="9. Limitation of liability">
        <p>
          The service is provided as it is and as available. To the extent permitted by law, we are
          not liable for indirect losses or for losses caused by events outside our reasonable
          control. Nothing in these terms limits rights you have under law that cannot be limited.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>
          We may update these terms. The date at the top shows the latest version; significant
          changes will be announced in the app. Continuing to use the app means you accept the
          updated terms.
        </p>
      </Section>

      <Section title="11. Contact">
        <ContactList lang="en" />
      </Section>
    </>
  );
}

function Arabic() {
  return (
    <>
      <Section title="١. الموافقة">
        <p>
          بإنشاء حساب أو استخدام تطبيق Student Center فإنك توافق على هذه الشروط وعلى{' '}
          <Link href="/privacy?lang=ar">سياسة الخصوصية</Link>. إذا لم توافق فلا تستخدم التطبيق.
        </p>
      </Section>

      <Section title="٢. الخدمة">
        <p>
          يتيح Student Center لطلاب الجامعات الوصول إلى الكورسات والدروس المسجّلة ومرفقات الدروس
          ومواد المكتبة والإشعارات والدعم. يُعدّ المحاضرون الكورسات والمواد وتنشرها إدارة المنصة،
          وقد يتغيّر المحتوى المتاح مع الوقت.
        </p>
      </Section>

      <Section title="٣. حسابك">
        <ul>
          <li>قدّم بيانات تسجيل صحيحة، ومنها رقم هاتفك أنت.</li>
          <li>حساب واحد لكل شخص. الحساب شخصي ولا يجوز مشاركته أو بيعه أو نقله.</li>
          <li>حافظ على سرية كلمة المرور، فأنت مسؤول عن أي نشاط على حسابك.</li>
          <li>
            يمكن استخدام الحساب على عدد محدود من الأجهزة تحدده الإدارة، وقد يتطلب استخدام جهاز جديد
            موافقة الإدارة على تغيير الجهاز.
          </li>
        </ul>
      </Section>

      <Section title="٤. الوصول إلى الكورسات والمواد">
        <ul>
          <li>
            حسب الكورس، يُمنح الوصول مجانًا أو باستخدام كود وصول أو بموافقة الإدارة، وقد يكون الوصول
            لمدة محددة للكورس.
          </li>
          <li>كود الوصول أو كارت الشحن يُستخدم مرة واحدة فقط ولا يمكن إعادة استخدامه.</li>
          <li>رصيد المحفظة يُستخدم فقط لمواد المكتبة داخل التطبيق، ولا يُخصم منه أبدًا للاشتراك في الكورسات.</li>
          <li>يحق للإدارة إلغاء أي وصول تم الحصول عليه بإساءة استخدام أو احتيال أو مخالفة لهذه الشروط.</li>
        </ul>
      </Section>

      <Section title="٥. حماية المحتوى والاستخدام المقبول">
        <p>لا يجوز لك:</p>
        <ul>
          <li>تسجيل الدروس أو المواد أو تصويرها أو تنزيلها أو نسخها أو مشاركتها أو إعادة نشرها؛</li>
          <li>السماح لأي شخص آخر باستخدام حسابك؛</li>
          <li>
            محاولة تجاوز ربط الجهاز أو العلامة المائية أو حماية الشاشة أو أي إجراء أمني، أو العبث
            بالتطبيق أو تفكيكه أو الهندسة العكسية له؛
          </li>
          <li>استخدام الخدمة لمضايقة أي شخص أو لمخالفة القانون.</li>
        </ul>
        <p>
          تحمل الفيديوهات علامة مائية ظاهرة تحدد حسابك. عند اكتشاف تسجيل للشاشة أو خطر مشابه قد
          يتوقف التشغيل ويُسجَّل الحدث. مخالفة هذه القواعد قد تؤدي إلى إيقاف الحساب أو إغلاقه.
        </p>
      </Section>

      <Section title="٦. الملكية الفكرية">
        <p>
          الكورسات والفيديوهات والمرفقات ومواد المكتبة مملوكة لمحاضريها وللمنصة. تحصل على حق شخصي غير
          قابل للنقل لمشاهدتها داخل التطبيق لمذاكرتك طوال مدة وصولك. لا يجوز استخدام اسم Student Center
          أو شعاره دون إذن.
        </p>
      </Section>

      <Section title="٧. توفر الخدمة">
        <p>
          نعمل على إتاحة الخدمة باستمرار، لكنها قد تتوقف للصيانة أو التحديث أو لأسباب خارجة عن
          إرادتنا، وقد تتغير الخصائص. قد تحتاج إلى تحديث التطبيق لمواصلة استخدامه.
        </p>
      </Section>

      <Section title="٨. الإيقاف والحذف">
        <p>
          يحق للإدارة إيقاف أو إغلاق الحسابات المخالفة لهذه الشروط. ويمكنك طلب حذف حسابك في أي وقت —
          راجع <Link href="/account-deletion?lang=ar">حذف الحساب</Link>.
        </p>
      </Section>

      <Section title="٩. حدود المسؤولية">
        <p>
          تُقدَّم الخدمة كما هي وحسب توفرها. وبالقدر الذي يسمح به القانون، لا نتحمل المسؤولية عن
          الخسائر غير المباشرة أو الناتجة عن ظروف خارجة عن سيطرتنا المعقولة. ولا يحدّ أي شيء في هذه
          الشروط من حقوقك القانونية التي لا يجوز تقييدها.
        </p>
      </Section>

      <Section title="١٠. التغييرات">
        <p>
          قد نحدّث هذه الشروط، ويوضح التاريخ أعلى الصفحة أحدث نسخة، وسنعلن التغييرات المهمة داخل
          التطبيق. استمرارك في استخدام التطبيق يعني قبولك للشروط المحدّثة.
        </p>
      </Section>

      <Section title="١١. التواصل">
        <ContactList lang="ar" />
      </Section>
    </>
  );
}
