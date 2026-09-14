import { Link } from "react-router-dom";
import { useUserContext } from "../context/UserContext";
import { getDefaultAppPath } from "../api";

export default function HomePage() {
  const { user } = useUserContext();

  const appPath = user ? getDefaultAppPath(user) : null;

  return (
    <div className="min-h-screen bg-eb-page text-eb-text">
      {/* Nav */}
      <nav className="sticky top-0 z-10 border-b border-eb-layout bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="font-logo text-[22px] leading-none select-none text-eb-primary">
            Rivebelle
          </span>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-[13px] text-eb-secondary sm:block">
                  {user.display_name}
                </span>
                <Link
                  to={appPath!}
                  className="rounded-lg bg-eb-primary px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
                >
                  Mon espace →
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg border border-eb-layout px-4 py-2 text-[13px] font-medium text-eb-secondary hover:bg-eb-page transition-colors"
                >
                  Se connecter
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-eb-primary px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
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
        <p className="text-[11px] font-semibold uppercase tracking-widest text-eb-primary/70">
          La plateforme de la restauration indépendante
        </p>
        <h1 className="mt-4 text-[38px] font-light leading-tight tracking-tight text-eb-primary md:text-[52px]">
          Extras et restaurants,<br />
          <span className="font-semibold">enfin connectés</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-7 text-eb-secondary">
          Rivebelle est un espace partagé où les extras gèrent leur activité
          et où les restaurants trouvent les bonnes personnes, disponibles, au bon moment.
        </p>
        {!user && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="rounded-xl bg-eb-primary px-6 py-3 text-[14px] font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Démarrer gratuitement
            </Link>
            <Link
              to="/login"
              className="rounded-xl border border-eb-layout px-6 py-3 text-[14px] font-medium text-eb-secondary hover:bg-white transition-colors"
            >
              Se connecter
            </Link>
          </div>
        )}
        {user && (
          <Link
            to={appPath!}
            className="mt-8 inline-block rounded-xl bg-eb-primary px-6 py-3 text-[14px] font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Accéder à mon espace →
          </Link>
        )}
      </section>

      {/* Two columns — extras vs restaurants */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Extras */}
          <div className="rounded-2xl border border-eb-layout bg-white p-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-eb-primary/10 text-xl">
                👤
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-eb-primary/70">Extra</p>
                <h2 className="text-[18px] font-semibold text-eb-primary">Ton activité, bien présentée</h2>
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
                  <span className="mt-0.5 text-eb-primary">✓</span>
                  <div>
                    <p className="text-[13px] font-medium text-eb-primary">{title}</p>
                    <p className="text-[12px] leading-5 text-eb-secondary">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
            {!user && (
              <Link
                to="/register"
                className="mt-6 block w-full rounded-xl bg-eb-primary py-2.5 text-center text-[13px] font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Créer mon profil d'extra
              </Link>
            )}
          </div>

          {/* Restaurants */}
          <div className="rounded-2xl border border-eb-layout bg-white p-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-xl">
                🍽️
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-600/80">Restaurant</p>
                <h2 className="text-[18px] font-semibold text-eb-primary">Gérez votre équipe, simplement</h2>
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
                  <span className="mt-0.5 text-amber-500">✓</span>
                  <div>
                    <p className="text-[13px] font-medium text-eb-primary">{title}</p>
                    <p className="text-[12px] leading-5 text-eb-secondary">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
            {!user && (
              <Link
                to="/register"
                className="mt-6 block w-full rounded-xl border border-eb-layout py-2.5 text-center text-[13px] font-semibold text-eb-primary hover:bg-eb-page transition-colors"
              >
                Créer la page de mon restaurant
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Quick access (connected) */}
      {user && (
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <div className="rounded-2xl border border-eb-layout bg-white p-6">
            <p className="mb-4 text-[13px] font-medium text-eb-secondary">Accès rapide</p>
            <div className="flex flex-wrap gap-3">
              <Link
                to={appPath!}
                className="rounded-lg bg-eb-primary px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
              >
                Mon espace
              </Link>
              <Link
                to="/resto"
                className="rounded-lg border border-eb-layout px-4 py-2 text-[13px] font-medium text-eb-secondary hover:bg-eb-page transition-colors"
              >
                Mes restaurants
              </Link>
              {user.role === "admin" && (
                <Link
                  to="/admin"
                  className="rounded-lg border border-eb-layout px-4 py-2 text-[13px] font-medium text-eb-secondary hover:bg-eb-page transition-colors"
                >
                  Administration
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-eb-layout py-8 text-center">
        <p className="text-[12px] text-eb-secondary">
          Rivebelle — Plateforme en développement · v2
        </p>
      </footer>
    </div>
  );
}
