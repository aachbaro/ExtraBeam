import { Link } from "react-router-dom";
import { getDefaultAppPath, getOidcLogoutUrl } from "../api";
import { useUserContext } from "../context/UserContext";

const WARM_CSS = `
  @keyframes ebFadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .riv-warm h1 {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 400;
  }
  .riv-warm .eb-input {
    border-color: #decfb5;
    border-radius: 12px;
    background: #fffdf7;
  }
  .riv-warm .eb-input:focus { outline-color: #dba52a; }
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
      className="riv-warm min-h-screen"
      style={{ background: "#f5efe4", color: "#352b1d", animation: "ebFadeUp 0.4s ease both" }}
    >
      <style>{WARM_CSS}</style>

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
      <section className="mx-auto max-w-5xl px-4 pt-16 pb-12 text-center">
        {/* Bande jaune décorative */}
        <div className="mx-auto mb-8 h-1 w-12 rounded-full" style={{ background: "#f3c64c" }} />

        <h1
          className="text-[38px] leading-tight tracking-tight md:text-[52px]"
          style={{ color: "#352b1d" }}
        >
          La plateforme des extras<br />
          <span style={{ color: "#956818" }}>et des restaurants</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-7" style={{ color: "#6b5a42" }}>
          Côté extra : gérez vos disponibilités, vos contacts clients et vos factures depuis un seul endroit.
          Côté restaurant : organisez votre planning, votre équipe, et faites appel aux bons profils quand vous en avez besoin.
        </p>
        {!user && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="rounded-xl px-6 py-3 text-[14px] font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ background: "#956818" }}
            >
              Démarrer gratuitement
            </Link>
            <Link
              to="/login"
              className="rounded-xl border px-6 py-3 text-[14px] font-medium transition-colors hover:opacity-80"
              style={{ borderColor: "#e0d4bf", color: "#947239" }}
            >
              Se connecter
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
      </section>

      {/* Two columns — extras vs restaurants */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="grid gap-5 md:grid-cols-2">
          {/* Extras */}
          <div
            className="overflow-hidden rounded-[26px] shadow-[0_10px_35px_-25px_#947239]"
            style={{ border: "1px solid #e0d4bf", background: "#fffdf7" }}
          >
            <div className="h-3" style={{ background: "#f3c64c" }} />
            <div className="p-7">
              <div className="mb-5 flex items-center gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full text-xl"
                  style={{ background: "#f9e8ad" }}
                >
                  👤
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#b08030" }}>Extra</p>
                  <h2 className="text-[18px] font-semibold" style={{ color: "#352b1d" }}>Ton activité, bien présentée</h2>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  ["Profil public partageable", "Présente ton expérience, ton poste, ton taux horaire — les restaurants voient tout d'un coup d'œil."],
                  ["Agenda de disponibilité", "Indique tes dispo et tes indisponibilités. Les clients peuvent te proposer des missions directement sur ton agenda."],
                  ["Gestion des missions", "Reçois des propositions, accepte, suis l'avancement. Tout dans un seul endroit."],
                  ["Facturation intégrée", "Génère tes factures à partir de tes missions. SIRET, TVA, coordonnées — pré-remplis automatiquement."],
                ].map(([title, desc]) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 font-semibold" style={{ color: "#f3c64c" }}>✓</span>
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: "#352b1d" }}>{title}</p>
                      <p className="text-[12px] leading-5" style={{ color: "#6b5a42" }}>{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {!user && (
                <Link
                  to="/register"
                  className="mt-6 block w-full rounded-xl py-2.5 text-center text-[13px] font-semibold text-white hover:opacity-90 transition-opacity"
                  style={{ background: "#956818" }}
                >
                  Créer mon profil d'extra
                </Link>
              )}
            </div>
          </div>

          {/* Restaurants */}
          <div
            className="overflow-hidden rounded-[26px] shadow-[0_10px_35px_-25px_#947239]"
            style={{ border: "1px solid #e0d4bf", background: "#fffdf7" }}
          >
            <div className="h-3" style={{ background: "#dba52a" }} />
            <div className="p-7">
              <div className="mb-5 flex items-center gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full text-xl"
                  style={{ background: "#f9e8ad" }}
                >
                  🍽️
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#b08030" }}>Restaurant</p>
                  <h2 className="text-[18px] font-semibold" style={{ color: "#352b1d" }}>Gérez votre équipe, simplement</h2>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  ["Page restaurant", "Votre établissement a sa propre page avec logo, description et équipe. Comme une carte de visite digitale."],
                  ["Planning des shifts", "Créez vos services midi et soir pour la semaine. Publiez-les quand ils sont prêts."],
                  ["Disponibilités de l'équipe", "Chaque membre indique sa dispo par shift. Vous voyez en un coup d'œil qui est là."],
                  ["Recherche d'extras *(à venir)*", "Trouvez parmi les extras disponibles ceux dont le profil correspond à vos besoins du moment."],
                ].map(([title, desc]) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 font-semibold" style={{ color: "#dba52a" }}>✓</span>
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: "#352b1d" }}>{title}</p>
                      <p className="text-[12px] leading-5" style={{ color: "#6b5a42" }}>{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {!user && (
                <Link
                  to="/register"
                  className="mt-6 block w-full rounded-xl border py-2.5 text-center text-[13px] font-semibold transition-colors hover:opacity-80"
                  style={{ borderColor: "#e0d4bf", color: "#956818" }}
                >
                  Créer la page de mon restaurant
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Quick access (connected) */}
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

      {/* Footer */}
      <footer className="py-8 text-center border-t" style={{ borderColor: "#e0d4bf" }}>
        <p className="text-[12px]" style={{ color: "#b08030" }}>
          Rivebelle — Plateforme en développement · v2
        </p>
      </footer>
    </div>
  );
}
