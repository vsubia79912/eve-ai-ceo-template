export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective August 11, 2026</p>

      <div className="mt-8 space-y-6 leading-7 text-muted-foreground">
        <p>
          eve AI CEO is a prototype operated by vsubia79912. It uses your Vercel
          identity to authenticate you and associate your chats, tasks, and project
          activity with your account.
        </p>
        <section>
          <h2 className="text-xl font-medium text-foreground">Information we process</h2>
          <p className="mt-2">
            We may process your Vercel profile information, including your name,
            email address, and profile image; prompts and task content you submit;
            and technical records needed to operate, secure, and troubleshoot the
            service.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-medium text-foreground">How information is used</h2>
          <p className="mt-2">
            Information is used only to authenticate users, provide the autonomous
            software workflow, store task history, prevent abuse, and improve
            reliability. The prototype does not sell personal information.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-medium text-foreground">Service providers</h2>
          <p className="mt-2">
            The service relies on Vercel, Neon, Upstash, GitHub, and configured AI
            model providers. Those providers process information according to their
            own terms and privacy policies.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-medium text-foreground">Contact</h2>
          <p className="mt-2">
            Privacy questions may be sent to victor@insiderclicks.com.
          </p>
        </section>
      </div>
    </main>
  );
}
