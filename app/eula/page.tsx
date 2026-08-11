export default function EulaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">End User License Agreement</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective August 11, 2026</p>

      <div className="mt-8 space-y-6 leading-7 text-muted-foreground">
        <p>
          This agreement governs use of the eve AI CEO prototype operated by
          vsubia79912. By using the service, you agree to these terms.
        </p>
        <section>
          <h2 className="text-xl font-medium text-foreground">Prototype license</h2>
          <p className="mt-2">
            You receive a limited, revocable, non-exclusive right to use the
            prototype for lawful evaluation and software-development purposes. You
            may not use it to compromise systems, violate rights, or evade applicable
            service limits.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-medium text-foreground">AI-generated output</h2>
          <p className="mt-2">
            AI output may be inaccurate or incomplete. You are responsible for
            reviewing generated code, proposed changes, and pull requests before
            relying on, merging, or deploying them.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-medium text-foreground">Availability</h2>
          <p className="mt-2">
            The prototype is provided as-is and may change, fail, or be discontinued
            without notice. To the extent permitted by law, no warranties are made
            and liability is limited to amounts paid for the service, if any.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-medium text-foreground">Contact</h2>
          <p className="mt-2">Questions may be sent to victor@insiderclicks.com.</p>
        </section>
      </div>
    </main>
  );
}
