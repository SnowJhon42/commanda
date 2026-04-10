import { useMemo, useState } from "react";

export function SessionClosedFeedbackPage({
  tableCode,
  clientUrl = "",
  saving,
  error,
  onSubmit,
  onRestart,
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const whatsappUrl = useMemo(() => {
    const menuUrl = clientUrl || (typeof window !== "undefined" ? window.location.origin : "");
    const message = `Estuve en COMANDA y la pasé muy bien. Mirá la carta acá:\n${menuUrl}`;
    const text = encodeURIComponent(message);
    return {
      message,
      mobileDeepLink: `whatsapp://send?text=${text}`,
      mobileWebLink: `https://api.whatsapp.com/send?text=${text}`,
      desktopWebLink: `https://web.whatsapp.com/send?text=${text}`,
    };
  }, [tableCode, clientUrl]);

  const handleShareWhatsapp = async () => {
    if (typeof window === "undefined") return;

    const ua = window.navigator.userAgent || "";
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    const canNativeShare = typeof window.navigator.share === "function";

    if (canNativeShare) {
      try {
        await window.navigator.share({
          text: whatsappUrl.message,
          url: clientUrl || window.location.origin,
        });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    if (isMobile) {
      window.location.href = whatsappUrl.mobileDeepLink;
      window.setTimeout(() => {
        window.location.href = whatsappUrl.mobileWebLink;
      }, 900);
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
          Compartir por WhatsApp
        </button>
        <button type="button" className="btn-secondary" onClick={onRestart}>
          Cerrar
        </button>
      </div>
    </section>
  );
}
