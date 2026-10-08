import { Link } from "react-router-dom";
import { getDefaultAppPath, getOidcLogoutUrl } from "../api";
import { useUserContext } from "../context/UserContext";

const WARM_CSS = `
  @keyframes ebFadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .riv-warm h1, .riv-warm h2 {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 400;
  }
`;

export default function HomePage() {
  const { user, clearUser } = useUserContext();
  const appPath = user ? getDefaultAppPath(user) : null;
  async function handleLogout() {
    await clearUser();
    window.location.href = getOidcLogoutUrl(`${window.location.origin}/`);
  }

  return (
    <div
      className="riv-warm relative isolate min-h-screen overflow-x-hidden"
      style={{ background: "#f5efe4", color: "#352b1d" }}
    >
      <style>{WARM_CSS}</style>

      {/* Fixed background — outside animated ancestors so position:fixed works correctly. */}
      <img
        src="/extra-sketch.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none"
        style={{
          position: "fixed",
          right: "-60px",
          top: "0",
          height: "100vh",
          width: "auto",
          maxWidth: "none",
          opacity: 0.18,
          zIndex: 0,
        }}
      />

      <div className="relative z-10" style={{ animation: "ebFadeUp 0.4s ease both" }}>

      {/* Nav */}
      <nav
        className="sticky top-0 z-10 border-b backdrop-blur-sm"
        style={{ background: "rgba(255,253,247,0.92)", borderColor: "#e0d4bf" }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="font-logo text-[22px] leading-none select-none" style={{ color: "#956818" }}>
            Rivebelle
          </span>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-[13px] sm:block" style={{ color: "#947239" }}>
                  {user.display_name}
                </span>
                <Link
                  to={appPath!}
                  className="rounded-xl px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 transition-opacity"
                  style={{ background: "#956818" }}
                >
                  Mon espace →
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl border px-4 py-2 text-[13px] font-medium transition-colors"
                  style={{ borderColor: "#e0d4bf", color: "#947239", background: "transparent" }}
                >
                  Se déconnecter
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-xl border px-4 py-2 text-[13px] font-medium transition-colors hover:opacity-80"
                  style={{ borderColor: "#e0d4bf", color: "#947239" }}
                >
                  Se connecter
                </Link>
                <Link
                  to="/register"
                  className="rounded-xl px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 transition-opacity"
                  style={{ background: "#956818" }}
                >
                  Créer un compte
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pt-20 pb-20">
        <div className="max-w-[560px]">
          <div className="mb-7 h-1 w-10 rounded-full" style={{ background: "#f3c64c" }} />
          <h1
            className="text-[40px] leading-[1.15] tracking-tight md:text-[54px]"
            style={{ color: "#352b1d" }}
          >
            Votre équipe quand elle est là.{" "}
            <span style={{ color: "#956818" }}>Les bons extras quand elle ne l'est pas.</span>
          </h1>
          <p className="mt-6 text-[16px] leading-7" style={{ color: "#6b5a42" }}>
            Rivebelle centralise les disponibilités de votre équipe, construit vos plannings et vous permet de faire appel aux bons extras quand un service reste à couvrir.
          </p>
          {!user && (
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="rounded-xl px-6 py-3 text-[14px] font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background: "#956818" }}
              >
                Gérer mon restaurant
              </Link>
              <Link
                to="/register"
                className="rounded-xl border px-6 py-3 text-[14px] font-medium transition-colors hover:opacity-80"
                style={{ borderColor: "#e0d4bf", color: "#947239" }}
              >
                Je suis extra
              </Link>
            </div>
          )}
          {user && (
            <Link
              to={appPath!}
              className="mt-8 inline-block rounded-xl px-6 py-3 text-[14px] font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ background: "#956818" }}
            >
              Accéder à mon espace →
            </Link>
          )}
        </div>
      </section>

      {/* Planning — section principale */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div
          className="overflow-hidden rounded-[26px] shadow-[0_10px_35px_-25px_#947239]"
          style={{ border: "1px solid #e0d4bf", background: "#fffdf7" }}
        >
          <div className="h-3" style={{ background: "#f3c64c" }} />
          <div className="p-8 md:p-10">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#b08030" }}>
              Pour les restaurants
            </p>
            <h2 className="mb-4 text-[28px] leading-snug md:text-[34px]" style={{ color: "#352b1d" }}>
              Un planning construit autour de votre équipe
            </h2>
            <p className="mb-8 max-w-xl text-[15px] leading-7" style={{ color: "#6b5a42" }}>
              Chaque membre renseigne ses disponibilités et ses préférences. Rivebelle propose un planning sur une à six semaines qui tient compte des contrats, des compétences nécessaires à chaque service et des contraintes de chacun.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                ["Disponibilités en temps réel", "L'équipe indique ses dispo depuis son profil. Vous voyez en un coup d'œil qui peut être là et sur quel service."],
                ["Planning intelligent", "Contrats, compétences, repos, préférences, chevauchements : tout est pris en compte. Vous ajustez, verrouillez, publiez."],
                ["Renforts intégrés", "Si un service reste incomplet, vous faites appel à un extra directement depuis le même outil. Aucun changement d'application."],
                ["Suivi des heures", "Les heures planifiées sont visibles par semaine et sur le mois. Pas d'outil annexe, pas d'export à la main."],
              ].map(([title, desc]) => (
                <div key={title} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "#f3c64c" }} />
                  <div>
                    <p className="text-[14px] font-semibold" style={{ color: "#352b1d" }}>{title}</p>
                    <p className="mt-0.5 text-[13px] leading-5" style={{ color: "#6b5a42" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            {!user && (
              <Link
                to="/register"
                className="mt-8 inline-block rounded-xl px-6 py-3 text-[14px] font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background: "#956818" }}
              >
                Créer l'espace de mon restaurant
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="mb-10 text-center">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#b08030" }}>
            Comment ça marche
          </p>
          <h2 className="text-[26px] leading-snug md:text-[32px]" style={{ color: "#352b1d" }}>
            De la semaine habituelle au renfort de dernière minute
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div
            className="overflow-hidden rounded-[26px]"
            style={{ border: "1px solid #e0d4bf", background: "#fffdf7" }}
          >
            <div className="h-3" style={{ background: "#f3c64c" }} />
            <div className="p-7">
              <p className="mb-6 text-[12px] font-semibold uppercase tracking-widest" style={{ color: "#b08030" }}>Restaurant</p>
              <ol className="space-y-4">
                {[
                  "Votre équipe renseigne ses disponibilités",
                  "Vous définissez les besoins par service",
                  "Rivebelle propose le planning",
                  "Vous ajustez, verrouillez et publiez",
                  "Si un service reste incomplet, vous faites appel à un extra",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                      style={{ background: "#f9e8ad", color: "#956818" }}
                    >
                      {i + 1}
                    </span>
                    <p className="pt-0.5 text-[13px] leading-5" style={{ color: "#352b1d" }}>{step}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div
            className="overflow-hidden rounded-[26px]"
            style={{ border: "1px solid #e0d4bf", background: "#fffdf7" }}
          >
            <div className="h-3" style={{ background: "#dba52a" }} />
            <div className="p-7">
              <p className="mb-6 text-[12px] font-semibold uppercase tracking-widest" style={{ color: "#b08030" }}>Extra</p>
              <ol className="space-y-4">
                {[
                  "Vous créez votre profil et renseignez vos disponibilités",
                  "Les restaurants de votre réseau vous retrouvent",
                  "Vous recevez une proposition de mission",
                  "Vous effectuez la mission",
                  "Vous validez les heures et générez la facture",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                      style={{ background: "#f9e8ad", color: "#956818" }}
                    >
                      {i + 1}
                    </span>
                    <p className="pt-0.5 text-[13px] leading-5" style={{ color: "#352b1d" }}>{step}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Pour les extras */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div
          className="overflow-hidden rounded-[26px] shadow-[0_10px_35px_-25px_#947239]"
          style={{ border: "1px solid #e0d4bf", background: "#fffdf7" }}
        >
          <div className="h-3" style={{ background: "#dba52a" }} />
          <div className="p-8 md:p-10">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#b08030" }}>
              Pour les extras
            </p>
            <h2 className="mb-4 text-[28px] leading-snug md:text-[34px]" style={{ color: "#352b1d" }}>
              Un profil qui travaille avec vous
            </h2>
            <p className="mb-8 max-w-xl text-[15px] leading-7" style={{ color: "#6b5a42" }}>
              Votre profil présente votre expérience, votre poste et vos disponibilités. Les restaurants de votre réseau peuvent vous retrouver et vous proposer des missions directement.
            </p>
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                ["Profil partageable", "Un lien ou un QR code. Les restaurants voient votre expérience, votre poste, votre taux horaire et vos disponibilités d'un coup d'œil."],
                ["Missions et disponibilités", "Gérez vos disponibilités, acceptez ou refusez les propositions, suivez vos missions en cours."],
                ["Facturation intégrée", "Vos heures sont enregistrées sur la mission. Générez la facture en quelques secondes avec vos coordonnées pré-remplies."],
              ].map(([title, desc]) => (
                <div key={title} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "#dba52a" }} />
                  <div>
                    <p className="text-[14px] font-semibold" style={{ color: "#352b1d" }}>{title}</p>
                    <p className="mt-0.5 text-[13px] leading-5" style={{ color: "#6b5a42" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            {!user && (
              <Link
                to="/register"
                className="mt-8 inline-block rounded-xl border px-6 py-3 text-[14px] font-semibold transition-colors hover:opacity-80"
                style={{ borderColor: "#e0d4bf", color: "#956818" }}
              >
                Créer mon profil d'extra
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Accès rapide (connecté) */}
      {user && (
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <div
            className="overflow-hidden rounded-[26px] shadow-[0_10px_35px_-25px_#947239]"
            style={{ border: "1px solid #e0d4bf", background: "#fffdf7" }}
          >
            <div className="h-3" style={{ background: "#f3c64c" }} />
            <div className="p-6">
              <p className="mb-4 text-[13px] font-medium" style={{ color: "#947239" }}>Accès rapide</p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to={appPath!}
                  className="rounded-xl px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
                  style={{ background: "#956818" }}
                >
                  Mon espace
                </Link>
                <Link
                  to="/resto"
                  className="rounded-xl border px-4 py-2 text-[13px] font-medium transition-colors hover:opacity-80"
                  style={{ borderColor: "#e0d4bf", color: "#947239" }}
                >
                  Mes restaurants
                </Link>
                {user.role === "admin" && (
                  <Link
                    to="/admin"
                    className="rounded-xl border px-4 py-2 text-[13px] font-medium transition-colors hover:opacity-80"
                    style={{ borderColor: "#e0d4bf", color: "#947239" }}
                  >
                    Administration
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CTA final */}
      {!user && (
        <section className="mx-auto max-w-5xl px-4 pb-20">
          <div
            className="overflow-hidden rounded-[26px] p-10 text-center"
            style={{ border: "1px solid #e0d4bf", background: "#fffdf7" }}
          >
            <div className="mx-auto mb-6 h-1 w-10 rounded-full" style={{ background: "#f3c64c" }} />
            <h2 className="mb-3 text-[26px] leading-snug md:text-[30px]" style={{ color: "#352b1d" }}>
              Prêt à démarrer ?
            </h2>
            <p className="mx-auto mb-8 max-w-sm text-[15px] leading-7" style={{ color: "#6b5a42" }}>
              Créez votre compte en quelques minutes. Gratuit pour les extras, sans engagement pour les restaurants.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/register"
                className="rounded-xl px-6 py-3 text-[14px] font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background: "#956818" }}
              >
                Créer un compte
              </Link>
              <Link
                to="/login"
                className="rounded-xl border px-6 py-3 text-[14px] font-medium transition-colors hover:opacity-80"
                style={{ borderColor: "#e0d4bf", color: "#947239" }}
              >
                Se connecter
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-8 text-center border-t" style={{ borderColor: "#e0d4bf" }}>
        <p className="text-[12px]" style={{ color: "#b08030" }}>
          Rivebelle — Paris
        </p>
      </footer>
      </div>
    </div>
  );
}
