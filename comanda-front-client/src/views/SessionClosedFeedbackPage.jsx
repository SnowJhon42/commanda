import { useMemo, useState } from "react";

export function SessionClosedFeedbackPage({
  tableCode,
  clientUrl = "",
  restaurantName = "",
  whatsappShareTemplate = "",
  saving,
  error,
  onSubmit,
  onRestart,
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const whatsappUrl = useMemo(() => {
    const message = String(whatsappShareTemplate || "").trim() || "Estuve en COMANDA y la pasé muy bien.";
    let shareUrl = "";
    try {
      if (clientUrl) {
        const parsed = new URL(clientUrl);
        shareUrl = `${parsed.origin}${parsed.pathname}`;
      } else if (typeof window !== "undefined") {
        shareUrl = `${window.location.origin}/`;
      }
    } catch {
      shareUrl = typeof window !== "undefined" ? `${window.location.origin}/` : "";
    }
    const shareText = shareUrl ? `${message}\n${shareUrl}` : message;
    const text = encodeURIComponent(shareText);
    return {
      message,
      shareUrl,
      shareText,
      mobileDeepLink: `whatsapp://send?text=${text}`,
      mobileWebLink: `https://api.whatsapp.com/send?text=${text}`,
      desktopWebLink: `https://web.whatsapp.com/send?text=${text}`,
    };
  }, [tableCode, clientUrl, restaurantName, whatsappShareTemplate]);

  const handleShareWhatsapp = async () => {
    if (typeof window === "undefined") return;

    const canNativeShare = typeof window.navigator.share === "function";

    if (canNativeShare) {
      try {
        await window.navigator.share({
          text: whatsappUrl.message,
          url: whatsappUrl.shareUrl || undefined,
        });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    const ua = window.navigator.userAgent || "";
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    if (isMobile) {
      window.location.href = whatsappUrl.mobileWebLink;
      return;
    }
    window.open(whatsappUrl.desktopWebLink, "_blank", "noopener,noreferrer");
  };

  const submit = (e) => {
    e.preventDefault();
    if (!rating) return;
    onSubmit({ rating, comment });
  };

  return (
    <section className="panel feedback-panel">
      <h2>Gracias por visitarnos</h2>
      <p className="muted">
        Cerramos la mesa {tableCode || "-"}. Como fue tu experiencia?
      </p>

      <form className="entry-form" onSubmit={submit}>
        <label className="field">
          Puntua tu experiencia
          <div className="stars-row" role="radiogroup" aria-label="Puntaje">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={value <= rating ? "star-btn star-btn-on" : "star-btn"}
                onClick={() => setRating(value)}
                aria-label={`${value} estrellas`}
              >
                {"\u2605"}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          Comentario (opcional)
          <textarea
            className="feedback-textarea"
            placeholder="Si queres, dejanos un comentario."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <button type="submit" className="btn-primary btn-full" disabled={saving || !rating}>
          {saving ? "Enviando..." : "Enviar opinion"}
        </button>
      </form>

      <div className="feedback-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={handleShareWhatsapp}
        >
          Compartir
        </button>
        <button type="button" className="btn-secondary" onClick={onRestart}>
          Cerrar
        </button>
      </div>
    </section>
  );
}
