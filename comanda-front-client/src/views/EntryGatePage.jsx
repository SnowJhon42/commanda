export function EntryGatePage({
  tableCode,
  guestCount,
  errors,
  onTableCodeChange,
  onGuestCountChange,
  onContinue,
}) {
  const submit = (e) => {
    e.preventDefault();
    onContinue();
  };

  return (
    <section className="panel entry-panel">
      <p className="kicker">Bienvenida</p>
      <h2>Bienvenido a tu mesa digital</h2>
      <p className="muted">Ingresa tu mesa y cuantas personas son para empezar.</p>

      <form className="entry-form" onSubmit={submit}>
        <label className="field">
          Mesa
          <input
            value={tableCode}
            onChange={(e) => onTableCodeChange(e.target.value)}
            placeholder="Ej: 9 o M9"
          />
          {errors?.table ? <span className="error-text field-error">{errors.table}</span> : null}
        </label>

        <label className="field">
          Personas
          <input
            type="number"
            min="1"
            max="20"
            value={guestCount}
            onChange={(e) => onGuestCountChange(e.target.value)}
            placeholder="Ej: 3"
          />
          {errors?.guests ? <span className="error-text field-error">{errors.guests}</span> : null}
        </label>

        <button className="btn-primary btn-full" type="submit">
          Ver menu
        </button>
      </form>
    </section>
  );
}
