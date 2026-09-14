import { useState, type FormEvent } from "react";
import { useGoogleLogin, type CodeResponse } from "@react-oauth/google";
import { Link, Navigate, useNavigate } from "react-router-dom";

import {
  getDefaultAppPath,
  getOidcForgotPasswordUrl,
  getOidcLoginUrl,
  googleLogin,
  isMockApiEnabled,
  login,
  showLocalDebugAuth,
} from "../api";
import { EyeIcon, GoogleIcon, Spinner } from "../components/AuthIcons";
import AuthShell from "../components/AuthShell";
import { useUserContext } from "../context/UserContext";

type LoadingTarget = "email" | "google" | null;

const hasGoogleClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, setUser } = useUserContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loadingTarget, setLoadingTarget] = useState<LoadingTarget>(null);
  const oidcLoginUrl = getOidcLoginUrl();
  const oidcForgotPasswordUrl = getOidcForgotPasswordUrl(oidcLoginUrl);

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoadingTarget("email");

    try {
      const response = await login(email, password);
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

  const triggerGoogleLogin = useGoogleLogin({
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
      <div className="w-full max-w-[360px] rounded-eb-card border border-eb-layout bg-white p-7 md:max-w-[380px]">
        <div className="mb-8">
          <span className="font-logo text-[24px] leading-none text-eb-text">Rivebelle</span>
          <h2 className="mt-7 text-[22px] font-semibold leading-tight text-eb-text">Connexion</h2>
          <p className="mt-2 text-[14px] leading-6 text-eb-secondary">
            Accedez a votre espace freelance ou client.
          </p>
        </div>

        <div className="space-y-5">
          <div className="space-y-3 rounded-eb-card border border-eb-layout bg-[#F8FAFF] p-4">
            <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-eb-primary">Compte partage</p>
            <p className="text-[14px] leading-6 text-eb-text">
              Utilisez le compte pascuans pour partager la meme identite entre Rivebelle et fragment.
            </p>
            <a
              href={oidcLoginUrl}
              className="eb-focus-ring inline-flex min-h-[44px] w-full items-center justify-center rounded-eb bg-eb-primary px-4 text-[14px] font-medium text-white"
            >
              Continuer avec le compte pascuans
            </a>
            <a
              href={oidcForgotPasswordUrl}
              className="inline-flex text-[12px] text-eb-secondary transition-colors hover:text-eb-text"
            >
              Mot de passe oublie ?
            </a>
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
                  triggerGoogleLogin();
                }}
              >
                {loadingTarget === "google" ? (
                  <>
                    <Spinner />
                    <span>Connexion Google...</span>
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    <span>Continuer avec Google</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-3 text-[13px] text-eb-muted">
                <div className="h-px flex-1 bg-eb-layout" />
                <span>- ou -</span>
                <div className="h-px flex-1 bg-eb-layout" />
              </div>

              <form className="space-y-4" onSubmit={(event) => void handleLoginSubmit(event)}>
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
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="eb-focus-ring block min-h-[42px] w-full rounded-eb border border-eb-input bg-white px-3 pr-11 text-[14px] text-eb-text outline-none placeholder:text-eb-muted disabled:cursor-not-allowed disabled:bg-[#F7F7F5]"
                      placeholder="Entrez votre mot de passe"
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

                <div className="flex justify-end">
                  <a href={oidcForgotPasswordUrl} className="text-[12px] text-eb-secondary transition-colors hover:text-eb-text">
                    Mot de passe oublie ?
                  </a>
                </div>

                <button
                  type="submit"
                  className="eb-focus-ring inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-eb border border-transparent bg-eb-primary px-4 text-[14px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loadingTarget !== null}
                >
                  {loadingTarget === "email" ? (
                    <>
                      <Spinner />
                      <span>Connexion...</span>
                    </>
                  ) : (
                    <span>Se connecter</span>
                  )}
                </button>

                {error ? <p className="text-[13px] leading-5 text-eb-google">{error}</p> : null}
              </form>

              <p className="text-[14px] leading-6 text-eb-secondary">
                Pas encore de compte ?{" "}
                <Link to="/register" className="font-medium text-eb-success">
                  S'inscrire
                </Link>
              </p>
            </>
          ) : (
            <p className="text-[14px] leading-6 text-eb-secondary">
              Pas encore de compte ?{" "}
              <Link to="/register" className="font-medium text-eb-success">
                S'inscrire
              </Link>
            </p>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
