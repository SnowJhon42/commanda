function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString("es-AR");
  } catch {
    return value || "-";
  }
}

function stars(rating) {
  const safe = Math.max(0, Math.min(5, Number(rating) || 0));
  return `${"★".repeat(safe)}${"☆".repeat(5 - safe)}`;
}

export function FeedbackSummaryPage({ loading, summary }) {
  const data = summary || { avg_rating: 0, total_feedbacks: 0, distribution: [], latest_comments: [] };
  const avgLabel = Number(data.avg_rating || 0).toFixed(2);

  return (
    <section className="panel">
      <div className="section-head">
        <h3>Feedback de clientes</h3>
        <span className="muted">{data.total_feedbacks} valoraciones</span>
      </div>

      {loading && <p className="muted">Actualizando feedback...</p>}

      <div className="feedback-kpi-grid">
        <article className="feedback-kpi">
          <p className="muted">Promedio</p>
          <p className="feedback-kpi-value">{avgLabel}</p>
          <p className="feedback-stars">{stars(Math.round(Number(data.avg_rating || 0)))}</p>
        </article>
        <article className="feedback-kpi">
          <p className="muted">Total de valoraciones</p>
          <p className="feedback-kpi-value">{data.total_feedbacks}</p>
          <p className="muted">Desde mesa cerrada</p>
        </article>
      </div>

      <div className="feedback-distribution">
        {(data.distribution || []).map((row) => (
          <div key={row.rating} className="feedback-distribution-row">
            <span>{row.rating} estrellas</span>
            <strong>{row.count}</strong>
          </div>
        ))}
      </div>

      <div className="feedback-comments">
        <h4>Comentarios recientes</h4>
        {!data.latest_comments?.length ? (
          <p className="muted">Todavia no hay comentarios escritos.</p>
        ) : (
          <ul className="feedback-comment-list">
            {data.latest_comments.map((comment, idx) => (
              <li key={`${comment.table_session_id}:${comment.client_id}:${idx}`} className="feedback-comment-item">
                <div className="feedback-comment-head">
                  <strong>Mesa {comment.table_code}</strong>
                  <span className="muted">{formatDateTime(comment.created_at)}</span>
                </div>
                <p className="feedback-stars">{stars(comment.rating)}</p>
                <p>{comment.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
