// src/router.ts
// -------------------------------------------------------------
// Router principal de l’application
// -------------------------------------------------------------
//
// 📌 Description :
//   - Définit toutes les routes principales (publiques + privées)
//   - Gère la redirection automatique selon le rôle utilisateur
//   - Protège les routes avec meta.requiresAuth
//
// 📍 Routes :
//   - /                        → Page d’accueil (publique)
//   - /register                → Inscription (publique)
//   - /auth/callback           → Callback OAuth / Magic Link
//   - /auth/onboarding         → Complétion de profil après OAuth
//   - /client                  → Espace client (role = client)
//   - /entreprise/:slug        → Espace entreprise (role = freelance ou admin)
//   - /entreprise/:ref/factures/:id → Détail d’une facture
//
// 🔒 Règles d’accès :
//   - requiresAuth → redirige vers /register si non connecté
//   - meta.role → limite l’accès à un rôle spécifique
//
// ⚠️ Remarques :
//   - Appelle automatiquement initAuth() au chargement
//   - Redirige selon user.role quand nécessaire
// -------------------------------------------------------------

import { createRouter, createWebHistory } from "vue-router";
import type { Router } from "vue-router";

import Home from "@/pages/Home.vue";
import EntreprisePage from "@/pages/EntreprisePage.vue";
import EntrepriseCvPage from "@/pages/EntrepriseCvPage.vue";
import FacturePage from "@/pages/FacturePage.vue";
import SubscriptionManagementPage from "@/pages/SubscriptionManagementPage.vue";
import ClientPage from "@/pages/ClientPage.vue";
import RegisterPage from "@/pages/auth/RegisterPage.vue";
import AuthCallback from "@/pages/auth/callback.vue";
import OnboardingPage from "@/pages/auth/onboarding.vue";

import { useAuth } from "@/composables/useAuth";
import { useSubscriptionStore } from "@/stores/subscription.store";

declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
    role?: string | string[];
    requiresSubscription?: boolean;
  }
}

// ----------------------
// Définition des routes
// ----------------------

const routes = [
  // 🌐 Public
  {
    path: "/",
    name: "home",
    component: Home,
  },
  {
    path: "/register",
    name: "register",
    component: RegisterPage,
  },
  {
    path: "/auth/callback",
    name: "auth-callback",
    component: AuthCallback,
  },
  {
    path: "/auth/onboarding",
    name: "auth-onboarding",
    component: OnboardingPage,
    meta: { requiresAuth: true }, // profil incomplet mais user authentifié
  },

  // 👤 Client
  {
    path: "/client",
    name: "client",
    component: ClientPage,
    meta: { requiresAuth: true, role: "client" },
  },

  // 🏢 Entreprise (freelance)
  {
    path: "/entreprise/:slug",
    name: "entreprise",
    component: EntreprisePage,
    props: true,
  },

  {
    path: "/entreprise/:slug/subscription",
    name: "entreprise-subscription",
    component: SubscriptionManagementPage,
    props: true,
    meta: { requiresAuth: true, requiresSubscription: false, role: ["freelance", "admin"] },
  },

  {
    path: "/entreprise/:ref/cv",
    name: "entreprise-cv",
    component: EntrepriseCvPage,
    props: true,
  },

  // 🧾 Détail d’une facture
  {
    path: "/entreprise/:ref/factures/:id",
    name: "facture",
    component: FacturePage,
    props: true,
    meta: { requiresAuth: true, requiresSubscription: true },
  },

  // ⚠️ 404 fallback
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
];

// ----------------------
// Création du router
// ----------------------

const router: Router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

// ----------------------
// Middleware global (auth)
// ----------------------

router.beforeEach(async (to, _from, next) => {
  const { user, loading, initAuth } = useAuth();
  const subscription = useSubscriptionStore();

  // ⚙️ Initialise la session si nécessaire
  if (loading.value) await initAuth();

  const isAuthenticated = !!user.value;
  const requiredRole = to.meta.role;

  // 🔒 Route protégée sans connexion
  if (to.meta.requiresAuth && !isAuthenticated) {
    console.warn("🔒 Accès refusé : utilisateur non connecté");
    return next("/register");
  }

  // 🎯 Rôle requis non respecté
  if (requiredRole) {
    const allowedRoles = Array.isArray(requiredRole)
      ? requiredRole
      : [requiredRole];

    if (!user.value?.role || !allowedRoles.includes(user.value.role)) {
      console.warn(`🚫 Accès refusé : rôle requis (${requiredRole})`);
      return next("/");
    }
  }

  if (to.meta.requiresSubscription) {
    if (!subscription.hasLoadedOnce && !subscription.loading) {
      await subscription.refresh();
    }

    if (!subscription.loading && !subscription.hasAccess) {
      const slug = (to.params.slug as string | undefined) ?? (to.params.ref as string | undefined);
      if (slug) {
        return next({ name: "entreprise", params: { slug }, query: { locked: "subscription" } });
      }

      return next({ name: "home" });
    }
  }

  next();
});

// ----------------------
// Export
// ----------------------

export default router;
