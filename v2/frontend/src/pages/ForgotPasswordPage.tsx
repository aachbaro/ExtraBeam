import { Link } from "react-router-dom";
import { getOidcForgotPasswordUrl, getOidcLoginUrl } from "../api";

const WARM_CSS = `
  @keyframes ebSlideIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .riv-forgot-title {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 400;
  }
`;

export default function ForgotPasswordPage() {
  const resetUrl = getOidcForgotPasswordUrl(getOidcLoginUrl());

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
              maxWidth: "none",
              opacity: 0.6,
              zIndex: 0,
            }}
          />
          <div className="relative z-10">
            <Link to="/" className="font-logo text-[28px] leading-none select-none" style={{ color: "#956818" }}>
              Rivebelle
            </Link>
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
              <Link to="/" className="font-logo text-[24px] leading-none" style={{ color: "#956818" }}>Rivebelle</Link>
            </div>

            <h2 className="riv-forgot-title text-[24px] leading-tight" style={{ color: "#352b1d" }}>
              Mot de passe oublié
            </h2>
            <p className="mt-2 text-[14px] leading-6" style={{ color: "#6b5540" }}>
              La réinitialisation se fait depuis le serveur central Rivebelle.
            </p>

            <div className="mt-8 space-y-5">
              <a
                href={resetUrl}
                className="eb-focus-ring inline-flex min-h-[44px] w-full items-center justify-center rounded-xl text-[14px] font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: "#2d7a52" }}
              >
                Recevoir un lien de réinitialisation
              </a>

              <p className="text-[13px] leading-6" style={{ color: "#6b5540" }}>
                Une fois le mot de passe changé, la connexion reviendra automatiquement sur Rivebelle.
              </p>

              <p className="text-[14px] leading-6" style={{ color: "#6b5540" }}>
                Retour à la{" "}
                <Link to="/login" className="font-medium" style={{ color: "#956818" }}>
                  connexion
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
