import type { FreelancerProfile } from "../types";

interface Props {
  profile: FreelancerProfile;
}

function normalizePhoneHref(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function ContactAction({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex min-h-[44px] w-full items-center justify-center rounded-eb border border-eb-layout bg-[#fffdf7] px-4 text-center text-[13px] font-medium leading-5 text-eb-text transition-colors hover:bg-eb-page sm:w-auto sm:flex-1"
    >
      {label}
    </a>
  );
}

export default function ProfileContactSection({ profile }: Props) {
  if (!profile.phone && !profile.email) {
    return null;
  }

  return (
    <section className="rounded-eb-card border border-eb-layout bg-[#fffdf7] p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        {profile.phone && (
          <ContactAction
            href={`tel:${normalizePhoneHref(profile.phone)}`}
            label={profile.phone}
          />
        )}
        {profile.email && (
          <ContactAction
            href={`mailto:${profile.email}`}
            label={profile.email}
          />
        )}
      </div>
    </section>
  );
}
