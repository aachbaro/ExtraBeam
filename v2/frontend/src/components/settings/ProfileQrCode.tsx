import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  slug: string;
}

export default function ProfileQrCode({ slug }: Props) {
  const [svgData, setSvgData] = useState<string>("");
  const profileUrl = `${window.location.origin}/extras/${slug}`;

  useEffect(() => {
    QRCode.toString(profileUrl, { type: "svg", margin: 1, color: { dark: "#352b1d", light: "#fdf8f1" } })
      .then(setSvgData)
      .catch(() => setSvgData(""));
  }, [profileUrl]);

  function handleDownload() {
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rivebelle-qr-${slug}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!svgData) return null;

  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "#e0d4bf", background: "#fdf8f1" }}>
      <p className="text-[14px] font-semibold" style={{ color: "#352b1d" }}>QR code de mon profil</p>
      <p className="mt-1 text-[13px]" style={{ color: "#6b5540" }}>
        Partage ce QR code pour donner accès direct à ton profil public.
      </p>
      <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div
          className="rounded-xl border p-3"
          style={{ borderColor: "#e0d4bf", background: "#fffdf7" }}
          dangerouslySetInnerHTML={{ __html: svgData }}
        />
        <div className="space-y-2">
          <p className="text-[12px] break-all" style={{ color: "#947239" }}>{profileUrl}</p>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex min-h-[36px] items-center gap-2 rounded-xl px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "#2d7a52" }}
          >
            Télécharger le SVG
          </button>
        </div>
      </div>
    </section>
  );
}
