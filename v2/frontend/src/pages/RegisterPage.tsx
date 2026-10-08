import { consumeHiringReturn, pendingHiringReturn } from '../recruitmentApi';
import { useState, type FormEvent } from "react";
import { useGoogleLogin, type CodeResponse } from "@react-oauth/google";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { getDefaultAppPath, getOidcRegisterUrl, googleLogin, isMockApiEnabled, register, showLocalDebugAuth } from "../api";
import { EyeIcon, GoogleIcon, Spinner } from "../components/AuthIcons";
import { useUserContext } from "../context/UserContext";
import type { AccountRole } from "../types";

const WARM_CSS = `
  body { overflow-x: hidden; }
  @keyframes ebSlideIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .riv-register-title {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 400;
  }
`;

type LoadingTarget = "email" | "google" | null;

const hasGoogleClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

export default function RegisterPage() {
  const navigate = useNavigate();
  const { user, setUser } = useUserContext();
  const [returnPath] = useState(pendingHiringReturn);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccountRole>(() => new URLSearchParams(window.location.search).get("role") === "client" ? "client" : "freelance");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loadingTarget, setLoadingTarget] = useState<LoadingTarget>(null);

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!displayName.trim()) {
      setError("Le nom affiche est requis.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caracteres.");
      return;
    }

    setLoadingTarget("email");

    try {
      const response = await register(displayName.trim(), email, password, role);
      const nextUser = { ...response.user, token: response.access_token };
      setUser(nextUser);
      navigate(consumeHiringReturn(getDefaultAppPath(nextUser)), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoadingTarget(null);
    }
  }

  async function submitGoogleCode(code: string) {
    setError("");
    setLoadingTarget("google");

    try {
      const response = await googleLogin(code, role);
      const nextUser = { ...response.user, token: response.access_token };
      setUser(nextUser);
      navigate(consumeHiringReturn(getDefaultAppPath(nextUser)), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoadingTarget(null);
    }
  }

  const triggerGoogleSignup = useGoogleLogin({
    flow: "auth-code",
    scope: "openid email profile",
    onSuccess: async (response: CodeResponse) => {
      await submitGoogleCode(response.code);
    },
    onError: () => {
      setLoadingTarget(null);
      setError("La connexion Google a echoue.");
    }
  });

  if (user) {
    return <Navigate to={returnPath || getDefaultAppPath(user)} replace />;
  }

  return (
    <div className="riv-warm min-h-screen" style={{ background: "#f5efe4", color: "#352b1d" }}>
      <style>{WARM_CSS}</style>

      <div className="flex min-h-screen">

        {/* Panneau gauche — illustration */}
        <div
          className="relative hidden overflow-hidden md:flex md:w-[48%] md:flex-col md:justify-between md:p-12"
          style={{ background: "#ede4d3" }}
        >
          <img
            src="/extra-sketch.png"
            aria-hidden="true"
            className="pointer-events-none select-none"
            style={{
              position: "absolute",
              left: "-40px",
              top: "0",
              height: "100%",
              width: "auto",
              opacity: 0.45,
              zIndex: 0,
            }}
          />
          <div className="relative z-10">
            <span className="font-logo text-[28px] leading-none select-none" style={{ color: "#956818" }}>
              Rivebelle
            </span>
          </div>
          <div className="relative z-10">
            <h2 className="riv-register-title text-[26px] leading-snug" style={{ color: "#352b1d" }}>
              Votre équipe quand elle est là.<br />Les bons extras quand elle ne l’est pas.
            </h2>
            <p className="mt-3 text-[14px] leading-6" style={{ color: "#6b5540" }}>
              Rejoignez Rivebelle et gérez vos missions, votre planning et votre facturation depuis un seul endroit.
            </p>
          </div>
        </div>

        {/* Panneau droit — formulaire */}
        <div
          className="flex min-h-screen w-full flex-col items-center justify-center px-6 py-10 md:w-[52%]"
          style={{ background: "#faf6ef" }}
        >
          <div
            className="w-full max-w-[380px]"
            style={{ animation: "ebSlideIn 0.35s ease both" }}
          >
            {/* Logo mobile uniquement */}
            <div className="mb-8 md:hidden">
              <span className="font-logo text-[24px] leading-none" style={{ color: "#956818" }}>Rivebelle</span>
            </div>

            <h2 className="riv-register-title text-[24px] leading-tight" style={{ color: "#352b1d" }}>
              Créer mon compte
            </h2>
            <p className="mt-2 text-[14px] leading-6" style={{ color: "#6b5540" }}>
              Choisis ton type de compte pour commencer.
            </p>

            <div className="mt-8 space-y-5">
              <div
                className="space-y-3 rounded-xl border p-4"
                style={{ background: "#f0f9f4", borderColor: "#b6ddc7" }}
              >
                <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "#2d7a52" }}>
                  Compte Rivebelle
                </p>
                <p className="text-[14px] leading-6" style={{ color: "#352b1d" }}>
                  Choisis ton profil, puis crée ton accès en quelques instants.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="eb-focus-ring min-h-[42px] rounded-xl border px-3 text-[14px] font-medium transition-colors"
                    style={role === "freelance"
                      ? { borderColor: "#956818", background: "#fdf3e3", color: "#956818" }
                      : { borderColor: "#d4c4a8", background: "white", color: "#352b1d" }}
                    onClick={() => setRole("freelance")}
                  >
                    Extra
                  </button>
                  <button
                    type="button"
                    className="eb-focus-ring min-h-[42px] rounded-xl border px-3 text-[14px] font-medium transition-colors"
                    style={role === "client"
                      ? { borderColor: "#956818", background: "#fdf3e3", color: "#956818" }
                      : { borderColor: "#d4c4a8", background: "white", color: "#352b1d" }}
                    onClick={() => setRole("client")}
                  >
                    Restaurateur
                  </button>
                </div>
                <a
                  href={getOidcRegisterUrl(role)}
                  className="eb-focus-ring inline-flex min-h-[44px] w-full items-center justify-center rounded-xl text-[14px] font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: "#2d7a52" }}
                >
                  Créer mon compte
                </a>
                <p className="text-[12px] leading-5" style={{ color: "#6b5540" }}>
                  Ce choix sera repris automatiquement au retour dans Rivebelle.
                </p>
              </div>

              {hasGoogleClientId && !showLocalDebugAuth && (
                <button
                  type="button"
                  className="eb-focus-ring inline-flex min-h-[44px] w-full items-center justify-center gap-3 rounded-xl border text-[14px] font-medium transition-colors hover:bg-white/60"
                  style={{ borderColor: "#d4c4a8", color: "#352b1d", background: "transparent" }}
                  disabled={loadingTarget !== null}
                  onClick={() => { setLoadingTarget("google"); triggerGoogleSignup(); }}
                >
                  <GoogleIcon /> Continuer avec Google
                </button>
              )}

              {showLocalDebugAuth && (
                <>
                  <div className="flex items-center gap-3 text-[13px]" style={{ color: "#947239" }}>
                    <div className="h-px flex-1" style={{ background: "#d4c4a8" }} />
                    <span>mode debug local</span>
                    <div className="h-px flex-1" style={{ background: "#d4c4a8" }} />
                  </div>
                  <button
                    type="button"
                    className="eb-focus-ring inline-flex min-h-[44px] w-full items-center justify-center gap-3 rounded-xl border border-transparent bg-eb-google px-4 text-[14px] font-medium text-white transition-colors disabled:opacity-70"
                    disabled={loadingTarget !== null}
                    onClick={() => {
                      if (isMockApiEnabled) { void submitGoogleCode("dev-google-code"); return; }
                      if (!hasGoogleClientId) { setError("La connexion Google n’est pas encore disponible."); return; }
                      setError(""); setLoadingTarget("google"); triggerGoogleSignup();
                    }}
                  >
                    {loadingTarget === "google" ? <><Spinner /><span>Inscription Google...</span></> : <><GoogleIcon /><span>S’inscrire avec Google</span></>}
                  </button>

                  <div className="flex items-center gap-3 text-[13px]" style={{ color: "#947239" }}>
                    <div className="h-px flex-1" style={{ background: "#d4c4a8" }} />
                    <span>ou</span>
                    <div className="h-px flex-1" style={{ background: "#d4c4a8" }} />
                  </div>

                  <form className="space-y-4" onSubmit={(event) => void handleRegisterSubmit(event)}>
                    <div className="space-y-2">
                      <span className="text-[13px] font-medium" style={{ color: "#352b1d" }}>Je m’inscris en tant que</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" disabled={loadingTarget !== null}
                          className="eb-focus-ring min-h-[42px] rounded-xl border px-3 text-[14px] font-medium transition-colors"
                          style={role === "freelance" ? { borderColor: "#956818", background: "#fdf3e3", color: "#956818" } : { borderColor: "#d4c4a8", background: "white", color: "#352b1d" }}
                          onClick={() => setRole("freelance")}>Extra</button>
                        <button type="button" disabled={loadingTarget !== null}
                          className="eb-focus-ring min-h-[42px] rounded-xl border px-3 text-[14px] font-medium transition-colors"
                          style={role === "client" ? { borderColor: "#956818", background: "#fdf3e3", color: "#956818" } : { borderColor: "#d4c4a8", background: "white", color: "#352b1d" }}
                          onClick={() => setRole("client")}>Restaurateur</button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="displayName" className="text-[13px] font-medium" style={{ color: "#352b1d" }}>Nom affiché</label>
                      <input id="displayName" type="text" autoComplete="name" required value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)} disabled={loadingTarget !== null}
                        placeholder="Adam"
                        className="eb-focus-ring block min-h-[42px] w-full rounded-xl border px-3 text-[14px] outline-none placeholder:text-[#b09070]"
                        style={{ borderColor: "#d4c4a8", background: "white", color: "#352b1d" }} />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="email" className="text-[13px] font-medium" style={{ color: "#352b1d" }}>Adresse email</label>
                      <input id="email" type="email" autoComplete="email" required value={email}
                        onChange={(e) => setEmail(e.target.value)} disabled={loadingTarget !== null}
                        placeholder="adam@rivebelle.fr"
                        className="eb-focus-ring block min-h-[42px] w-full rounded-xl border px-3 text-[14px] outline-none placeholder:text-[#b09070]"
                        style={{ borderColor: "#d4c4a8", background: "white", color: "#352b1d" }} />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="password" className="text-[13px] font-medium" style={{ color: "#352b1d" }}>Mot de passe</label>
                      <div className="relative">
                        <input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8}
                          value={password} onChange={(e) => setPassword(e.target.value)} disabled={loadingTarget !== null}
                          placeholder="Minimum 8 caractères"
                          className="eb-focus-ring block min-h-[42px] w-full rounded-xl border px-3 pr-11 text-[14px] outline-none placeholder:text-[#b09070]"
                          style={{ borderColor: "#d4c4a8", background: "white", color: "#352b1d" }} />
                        <button type="button" aria-label={showPassword ? "Masquer" : "Afficher"}
                          className="eb-focus-ring absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl"
                          style={{ color: "#947239" }}
                          onClick={() => setShowPassword((v) => !v)} disabled={loadingTarget !== null}>
                          <EyeIcon visible={showPassword} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="confirmPassword" className="text-[13px] font-medium" style={{ color: "#352b1d" }}>Confirmer le mot de passe</label>
                      <div className="relative">
                        <input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" required minLength={8}
                          value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loadingTarget !== null}
                          placeholder="Retapez votre mot de passe"
                          className="eb-focus-ring block min-h-[42px] w-full rounded-xl border px-3 pr-11 text-[14px] outline-none placeholder:text-[#b09070]"
                          style={{ borderColor: "#d4c4a8", background: "white", color: "#352b1d" }} />
                        <button type="button" aria-label={showConfirmPassword ? "Masquer" : "Afficher"}
                          className="eb-focus-ring absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl"
                          style={{ color: "#947239" }}
                          onClick={() => setShowConfirmPassword((v) => !v)} disabled={loadingTarget !== null}>
                          <EyeIcon visible={showConfirmPassword} />
                        </button>
                      </div>
                    </div>

                    <button type="submit" disabled={loadingTarget !== null}
                      className="eb-focus-ring inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-70"
                      style={{ background: "#2d7a52" }}>
                      {loadingTarget === "email" ? <><Spinner /><span>Création...</span></> : <span>Créer mon compte</span>}
                    </button>

                    {error && <p className="text-[13px] leading-5 text-eb-google">{error}</p>}
                  </form>
                </>
              )}

              <p className="text-[14px] leading-6" style={{ color: "#6b5540" }}>
                Déjà un compte ?{" "}
                <Link to="/login" className="font-medium" style={{ color: "#956818" }}>
                  Se connecter
                </Link>
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
