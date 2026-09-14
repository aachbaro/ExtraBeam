import type { ReactNode } from "react";

const featureBullets = [
  "Page publique et CV visible",
  "Gestion des disponibilites",
  "Facturation et paiement Stripe"
];

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-eb-page text-eb-text">
      <div className="flex min-h-screen">
        <section className="relative hidden overflow-hidden bg-eb-panel px-12 py-10 text-white md:flex md:w-[52%] md:flex-col lg:px-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-[-120px] top-[-100px] h-80 w-80 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(37,99,235,0.16) 0%, rgba(37,99,235,0.08) 24%, rgba(37,99,235,0.02) 52%, rgba(37,99,235,0) 72%)"
            }}
          />

          <div className="relative z-10 flex items-start">
            <span className="font-logo text-[32px] leading-none text-white">Rivebelle</span>
          </div>

          <div className="relative z-10 flex flex-1 items-center">
            <div className="max-w-[480px]">
              <h1 className="font-sans text-[28px] font-light leading-[1.25] text-white">
                Gerez vos missions et votre facturation depuis un seul endroit.
              </h1>
              <p className="mt-4 max-w-[420px] text-[14px] leading-6 text-eb-muted">
                Vitrine pro, agenda, missions et factures - pour les independants qui veulent avancer vite.
              </p>
              <ul className="mt-8 space-y-4 text-[14px] text-white/92">
                {featureBullets.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-eb-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen w-full flex-col border-l border-eb-layout bg-white px-6 py-8 md:w-[48%] md:px-10 lg:px-12">
          <div className="flex flex-1 items-center justify-center">{children}</div>
        </section>
      </div>
    </main>
  );
}
