import { useState } from "react";
import { Link } from "react-router-dom";
import { setEmployeePin } from "../api";
import type { RestaurantMember } from "../types";
export default function EmployeeAccessSettings({
  slug,
  token,
  members,
}: {
  slug: string;
  token: string;
  members: RestaurantMember[];
}) {
  return (
    <section className="bg-white border rounded-xl p-4 mt-5 space-y-3">
      <h2 className="font-medium">Accès des employés</h2>
      <p className="text-sm">
        Choisissez un PIN de 4 à 8 chiffres par employé. Changer un PIN
        déconnecte ses sessions existantes.
      </p>
      <Link to={`/resto/${slug}/acces`} className="text-sm underline">
        Ouvrir la page de connexion de l’équipe
      </Link>
      <p className="text-xs break-all">
        {window.location.origin}/resto/{slug}/acces
      </p>
      {members
        .filter((m) => m.is_active)
        .map((m) => (
          <PinRow key={m.id} member={m} slug={slug} token={token} />
        ))}
    </section>
  );
}
function PinRow({
  member,
  slug,
  token,
}: {
  member: RestaurantMember;
  slug: string;
  token: string;
}) {
  const [pin, setPin] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="border-t pt-3 flex flex-wrap items-center gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          await setEmployeePin(slug, member.id, pin, token);
          setPin("");
          setMessage("PIN enregistré.");
        } catch (e) {
          setMessage(String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="text-sm">
        {member.name}
        <input
          aria-label={`PIN de ${member.name}`}
          placeholder={member.pin_configured ? "Nouveau PIN" : "Définir un PIN"}
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4,8}"
          minLength={4}
          maxLength={8}
          required
          autoComplete="new-password"
          className="ml-3 border rounded px-3 py-2"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
      </label>
      <button disabled={busy} className="border rounded px-3 py-2 text-sm">
        Enregistrer le PIN
      </button>
      <span role="status" className="text-xs">
        {message}
      </span>
    </form>
  );
}
