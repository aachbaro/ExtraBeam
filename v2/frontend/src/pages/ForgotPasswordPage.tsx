import { Link } from "react-router-dom";

import AuthShell from "../components/AuthShell";
import { getOidcForgotPasswordUrl, getOidcLoginUrl } from "../api";

export default function ForgotPasswordPage() {
  const resetUrl = getOidcForgotPasswordUrl(getOidcLoginUrl());

  return (
    <AuthShell>
      <div className="w-full max-w-[360px] rounded-eb-card border border-eb-layout bg-white p-7 md:max-w-[400px]">
        <div className="mb-8">
          <span className="font-logo text-[24px] leading-none text-eb-text">Rivebelle</span>
          <h2 className="mt-7 text-[22px] font-semibold leading-tight text-eb-text">Mot de passe oublie</h2>
          <p className="mt-2 text-[14px] leading-6 text-eb-secondary">
            Le mot de passe du compte partage pascuans se reinitialise depuis le serveur central.
          </p>
        </div>

        <div className="space-y-4">
          <a
            href={resetUrl}
            className="eb-focus-ring inline-flex min-h-[44px] w-full items-center justify-center rounded-eb bg-eb-primary px-4 text-[14px] font-medium text-white"
          >
            Recevoir un lien de reinitialisation
          </a>

          <p className="text-[13px] leading-6 text-eb-secondary">
            Une fois le mot de passe change, la connexion reviendra sur Rivebelle.
          </p>

          <p className="text-[14px] leading-6 text-eb-secondary">
            Retour a{" "}
            <Link to="/login" className="font-medium text-eb-success">
              la connexion
            </Link>
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
