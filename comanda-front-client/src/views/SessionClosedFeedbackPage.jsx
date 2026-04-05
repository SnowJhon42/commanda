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
    const text = encodeURIComponent(
      `Estuve en COMANDA (mesa ${tableCode || "-"}) y esta muy bueno! Venite que esta muy bueno.\n\nPodes ver el menu aca:\n${menuUrl}`
    );
    return `https://wa.me/?text=${text}`;
  }, [tableCode, clientUrl]);

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
          onClick={() => {
            if (typeof window === "undefined") return;
            window.open(whatsappUrl, "_blank", "noopener,noreferrer");
          }}
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
