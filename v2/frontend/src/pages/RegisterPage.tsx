import { useState, type FormEvent } from "react";
import { useGoogleLogin, type CodeResponse } from "@react-oauth/google";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { getDefaultAppPath, getOidcRegisterUrl, googleLogin, isMockApiEnabled, register, showLocalDebugAuth } from "../api";
import { EyeIcon, GoogleIcon, Spinner } from "../components/AuthIcons";
import AuthShell from "../components/AuthShell";
import { useUserContext } from "../context/UserContext";
import type { AccountRole } from "../types";

type LoadingTarget = "email" | "google" | null;

const hasGoogleClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

export default function RegisterPage() {
  const navigate = useNavigate();
  const { user, setUser } = useUserContext();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccountRole>("freelance");
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
      navigate(getDefaultAppPath(nextUser), { replace: true });
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
      const response = await googleLogin(code);
      const nextUser = { ...response.user, token: response.access_token };
      setUser(nextUser);
      navigate(getDefaultAppPath(nextUser), { replace: true });
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
    return <Navigate to="/profile" replace />;
  }

  return (
    <AuthShell>
      <div className="w-full max-w-[360px] rounded-eb-card border border-eb-layout bg-white p-7 md:max-w-[400px]">
        <div className="mb-8">
          <span className="font-logo text-[24px] leading-none text-eb-text">Rivebelle</span>
          <h2 className="mt-7 text-[22px] font-semibold leading-tight text-eb-text">Inscription</h2>
          <p className="mt-2 text-[14px] leading-6 text-eb-secondary">
            Choisis ton type de compte puis cree ton acces pascuans en quelques instants.
          </p>
        </div>

        <div className="space-y-5">
          <div className="space-y-3 rounded-eb-card border border-eb-layout bg-[#F4FBF6] p-4">
            <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-eb-success">Compte central</p>
            <p className="text-[14px] leading-6 text-eb-text">
              L'inscription principale passe maintenant par le compte pascuans partage avec fragment.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`eb-focus-ring min-h-[42px] rounded-eb border px-3 text-[14px] font-medium ${
                  role === "freelance"
                    ? "border-eb-primary bg-[#EFF6FF] text-eb-primary"
                    : "border-eb-input bg-white text-eb-text"
                }`}
                onClick={() => setRole("freelance")}
              >
                Freelance
              </button>
              <button
                type="button"
                className={`eb-focus-ring min-h-[42px] rounded-eb border px-3 text-[14px] font-medium ${
                  role === "client"
                    ? "border-eb-primary bg-[#EFF6FF] text-eb-primary"
                    : "border-eb-input bg-white text-eb-text"
                }`}
                onClick={() => setRole("client")}
              >
                Client
              </button>
            </div>
            <a
              href={getOidcRegisterUrl(role)}
              className="eb-focus-ring inline-flex min-h-[44px] w-full items-center justify-center rounded-eb bg-eb-success px-4 text-[14px] font-medium text-white"
            >
              Creer mon compte pascuans
            </a>
            <p className="text-[12px] leading-5 text-eb-secondary">
              Ce choix sera repris automatiquement au retour dans Rivebelle, et tu pourras encore le changer ensuite.
            </p>
          </div>

          {showLocalDebugAuth ? (
            <>
              <div className="flex items-center gap-3 text-[13px] text-eb-muted">
                <div className="h-px flex-1 bg-eb-layout" />
                <span>mode debug local</span>
                <div className="h-px flex-1 bg-eb-layout" />
              </div>
              <button
                type="button"
                className="eb-focus-ring inline-flex min-h-[44px] w-full items-center justify-center gap-3 rounded-eb border border-transparent bg-eb-google px-4 text-[14px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                disabled={loadingTarget !== null}
                onClick={() => {
                  if (isMockApiEnabled) {
                    void submitGoogleCode("dev-google-code");
                    return;
                  }

                  if (!hasGoogleClientId) {
                    setError("Google n'est pas configure cote frontend. Renseigne VITE_GOOGLE_CLIENT_ID dans frontend/.env.");
                    return;
                  }

                  setError("");
                  setLoadingTarget("google");
                  triggerGoogleSignup();
                }}
              >
                {loadingTarget === "google" ? (
                  <>
                    <Spinner />
                    <span>Inscription Google...</span>
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    <span>S'inscrire avec Google</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-3 text-[13px] text-eb-muted">
                <div className="h-px flex-1 bg-eb-layout" />
                <span>- ou -</span>
                <div className="h-px flex-1 bg-eb-layout" />
              </div>

              <form className="space-y-4" onSubmit={(event) => void handleRegisterSubmit(event)}>
                <div className="space-y-2">
                  <span className="text-[13px] font-medium text-eb-text">Je m'inscris en tant que</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`eb-focus-ring min-h-[42px] rounded-eb border px-3 text-[14px] font-medium ${
                        role === "freelance"
                          ? "border-eb-primary bg-[#EFF6FF] text-eb-primary"
                          : "border-eb-input bg-white text-eb-text"
                      }`}
                      onClick={() => setRole("freelance")}
                      disabled={loadingTarget !== null}
                    >
                      Freelance
                    </button>
                    <button
                      type="button"
                      className={`eb-focus-ring min-h-[42px] rounded-eb border px-3 text-[14px] font-medium ${
                        role === "client"
                          ? "border-eb-primary bg-[#EFF6FF] text-eb-primary"
                          : "border-eb-input bg-white text-eb-text"
                      }`}
                      onClick={() => setRole("client")}
                      disabled={loadingTarget !== null}
                    >
                      Client
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="displayName" className="text-[13px] font-medium text-eb-text">
                    Nom affiche
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    autoComplete="name"
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="eb-focus-ring block min-h-[42px] w-full rounded-eb border border-eb-input bg-white px-3 text-[14px] text-eb-text outline-none placeholder:text-eb-muted disabled:cursor-not-allowed disabled:bg-[#F7F7F5]"
                    placeholder="Adam"
                    disabled={loadingTarget !== null}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-[13px] font-medium text-eb-text">
                    Adresse email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="eb-focus-ring block min-h-[42px] w-full rounded-eb border border-eb-input bg-white px-3 text-[14px] text-eb-text outline-none placeholder:text-eb-muted disabled:cursor-not-allowed disabled:bg-[#F7F7F5]"
                    placeholder="adam@Rivebelle.fr"
                    disabled={loadingTarget !== null}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-[13px] font-medium text-eb-text">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="eb-focus-ring block min-h-[42px] w-full rounded-eb border border-eb-input bg-white px-3 pr-11 text-[14px] text-eb-text outline-none placeholder:text-eb-muted disabled:cursor-not-allowed disabled:bg-[#F7F7F5]"
                      placeholder="Minimum 8 caracteres"
                      disabled={loadingTarget !== null}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      className="eb-focus-ring absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-eb text-eb-secondary"
                      onClick={() => setShowPassword((current) => !current)}
                      disabled={loadingTarget !== null}
                    >
                      <EyeIcon visible={showPassword} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-[13px] font-medium text-eb-text">
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="eb-focus-ring block min-h-[42px] w-full rounded-eb border border-eb-input bg-white px-3 pr-11 text-[14px] text-eb-text outline-none placeholder:text-eb-muted disabled:cursor-not-allowed disabled:bg-[#F7F7F5]"
                      placeholder="Retapez votre mot de passe"
                      disabled={loadingTarget !== null}
                    />
                    <button
                      type="button"
                      aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      className="eb-focus-ring absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-eb text-eb-secondary"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      disabled={loadingTarget !== null}
                    >
                      <EyeIcon visible={showConfirmPassword} />
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="eb-focus-ring inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-eb border border-transparent bg-eb-success px-4 text-[14px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loadingTarget !== null}
                >
                  {loadingTarget === "email" ? (
                    <>
                      <Spinner />
                      <span>Creation du compte...</span>
                    </>
                  ) : (
                    <span>Creer mon compte</span>
                  )}
                </button>

                {error ? <p className="text-[13px] leading-5 text-eb-google">{error}</p> : null}
              </form>

              <p className="text-[14px] leading-6 text-eb-secondary">
                Deja un compte ?{" "}
                <Link to="/login" className="font-medium text-eb-primary">
                  Se connecter
                </Link>
              </p>
            </>
          ) : (
            <p className="text-[14px] leading-6 text-eb-secondary">
              Deja un compte ?{" "}
              <Link to="/login" className="font-medium text-eb-primary">
                Se connecter
              </Link>
            </p>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
