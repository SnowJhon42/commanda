const restaurantBenefits = [
  "Ordena el flujo de pedidos desde la mesa hasta la entrega.",
  "Reduce errores entre lo que pide el cliente y lo que recibe la operacion.",
  "Mejora la transparencia del servicio para equipo y comensal.",
  "Ayuda a trabajar mejor los tiempos sin agregar complejidad al salon.",
  "Permite diseñar la experiencia visual que ve el cliente segun el estilo del local.",
];

const customerBenefits = [
  "Pide de forma agil y a su ritmo desde el celular.",
  "Entiende mejor en que estado esta su pedido.",
  "Reduce la espera incierta y gana claridad durante el servicio.",
  "Puede dejar feedback al final de la experiencia.",
];

const growthBenefits = [
  "Feedback real y simple al terminar el servicio.",
  "Mas visibilidad sobre la percepcion del cliente.",
  "Difusion organica del lugar entre amigos, contactos y redes.",
  "Una buena experiencia que puede convertirse en recomendacion.",
];

const faqs = [
  {
    question: "¿COMANDA sirve solo para tomar pedidos?",
    answer:
      "No. Tambien ordena el servicio, mejora la visibilidad del estado, permite captar feedback y favorece que una experiencia positiva se comparta.",
  },
  {
    question: "¿Reemplaza al staff?",
    answer:
      "No. COMANDA acompaña la operacion para que el equipo trabaje con mas claridad y menos friccion en cada turno.",
  },
  {
    question: "¿Por que el feedback es importante para el local?",
    answer:
      "Porque le da informacion directa sobre lo que vivio el cliente y permite detectar mejoras reales en el servicio, algo que muchos establecimientos todavia no capturan de forma simple.",
  },
  {
    question: "¿Que valor tiene que el cliente comparta la experiencia?",
    answer:
      "Ayuda a generar visibilidad organica del lugar como consecuencia natural de una buena experiencia, sin depender siempre de inversion para atraer gente.",
  },
  {
    question: "¿Se puede adaptar la experiencia al estilo de cada establecimiento?",
    answer:
      "Si. La idea es que el staff pueda diseñar la experiencia del establecimiento y que eso se convierta en la cara que ve el cliente desde la mesa.",
  },
];

const flowSteps = [
  "El cliente entra desde su celular y selecciona su mesa.",
  "Hace el pedido de forma rapida, clara y comoda.",
  "El restaurante recibe la orden con mejor estructura y visibilidad.",
  "El staff actualiza estados y mantiene el servicio bajo control.",
  "El establecimiento define la experiencia visual que ve el cliente.",
  "El cliente sigue el pedido con menos incertidumbre.",
  "Al final puede dejar feedback y compartir la experiencia.",
];

export default function Page() {
  return (
    <main className="site-shell">
      <section className="hero-panel">
        <header className="topbar">
          <div className="brand-lockup" aria-label="COMANDA">
            <span className="brand-badge">C</span>
            <div>
              <strong>COMANDA</strong>
              <p>Operacion, experiencia y presencia propia para restaurantes</p>
            </div>
          </div>

          <nav className="topnav" aria-label="Navegacion del sitio">
            <a href="#como-funciona">Como funciona</a>
            <a href="#beneficios">Beneficios</a>
            <a href="#feedback">Feedback</a>
            <a href="#cta-final">Demo</a>
          </nav>

          <a className="button button-primary topbar-cta" href="#cta-final">
            Agendar demo
          </a>
        </header>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Operacion clara. Servicio mas solido. Experiencia con identidad.</p>
            <h1>Mas orden en la operacion. Menos errores en el servicio. Una experiencia que tambien representa a tu local.</h1>
            <p className="hero-lead">
              COMANDA ayuda a restaurantes y bares a organizar pedidos, dar visibilidad al
              servicio, mejorar tiempos de atencion y transformar una buena experiencia en feedback
              real y difusion organica. Ademas, permite que cada establecimiento diseñe la
              experiencia que va a ver su cliente.
            </p>

            <div className="hero-actions">
              <a className="button button-primary" href="#cta-final">
                Agendar demo
              </a>
              <a className="button button-secondary" href="#como-funciona">
                Ver como funciona
              </a>
            </div>

            <div className="hero-proof-grid">
              <article>
                <span>Operacion</span>
                <strong>Pedidos mas claros y menos friccion en salon.</strong>
              </article>
              <article>
                <span>Experiencia</span>
                <strong>Mas transparencia y una interfaz alineada a la identidad del local.</strong>
              </article>
              <article>
                <span>Crecimiento</span>
                <strong>Feedback util y posibilidad de compartir el lugar organicamente.</strong>
              </article>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="device-stack">
              <div className="device phone-frame">
                <div className="device-heading">
                  <span>Mesa 12</span>
                  <span>Cliente</span>
                </div>
                <div className="device-card device-card-soft">
                  <small>Diseño del local</small>
                  <strong>La experiencia que ve el cliente puede responder al estilo del establecimiento.</strong>
                </div>
                <div className="device-card">
                  <small>Tracking</small>
                  <strong>El cliente entiende mejor el tiempo del servicio.</strong>
                </div>
                <div className="device-card device-card-warm">
                  <small>Cierre</small>
                  <strong>Feedback y compartir experiencia en el mismo recorrido.</strong>
                </div>
              </div>

              <div className="device dashboard-frame">
                <div className="device-heading">
                  <span>Operacion</span>
                  <span>Tablero</span>
                </div>
                <div className="board-list">
                  <article>
                    <small>Pedido recibido</small>
                    <strong>Mesa 12</strong>
                    <p>2 burgers, 1 limonada, nota especial cargada.</p>
                  </article>
                  <article>
                    <small>Preparando</small>
                    <strong>Cocina</strong>
                    <p>Estado visible para staff y cliente.</p>
                  </article>
                  <article>
                    <small>Listo</small>
                    <strong>Salon</strong>
                    <p>Mas claridad para entregar y cerrar mejor la experiencia.</p>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="content-section section-problem">
        <div className="section-heading">
          <p className="eyebrow eyebrow-dark">Problema real</p>
          <h2>Cuando la operacion no es clara, el cliente lo siente enseguida.</h2>
          <p>
            Pedidos mal tomados, tiempos poco previsibles, mesas esperando sin informacion y
            equipos resolviendo sobre la marcha. En gastronomia, el desorden operativo no queda
            puertas adentro: impacta directo en la experiencia y en como se percibe el lugar.
          </p>
        </div>

        <div className="problem-grid">
          <article className="soft-card">
            <strong>Errores en el pedido</strong>
            <p>Cuando la mesa dice una cosa y la operacion recibe otra, el servicio pierde calidad.</p>
          </article>
          <article className="soft-card">
            <strong>Falta de visibilidad</strong>
            <p>Si el cliente no entiende el estado del pedido, crece la incertidumbre y baja la paciencia.</p>
          </article>
          <article className="soft-card">
            <strong>Costo de atraer gente</strong>
            <p>Muchos locales invierten para generar movimiento, pero desaprovechan la experiencia para crecer organicamente.</p>
          </article>
          <article className="soft-card">
            <strong>Experiencias iguales</strong>
            <p>Si todos los locales muestran lo mismo, se pierde identidad en el momento en que el cliente mas la percibe.</p>
          </article>
        </div>
      </section>

      <section className="content-section dark-band">
        <div className="split-layout">
          <div>
            <p className="eyebrow">Que es COMANDA</p>
            <h2>Una herramienta para ordenar el servicio y hacerlo mas transparente.</h2>
            <p>
              COMANDA conecta la mesa con la operacion. El cliente pide desde su celular, el equipo
              recibe mejor la orden, el estado del pedido se vuelve visible y el servicio gana
              claridad para todos. Al mismo tiempo, el establecimiento puede definir la experiencia
              visual que representa su marca frente al cliente.
            </p>
          </div>

          <aside className="quote-block">
            <p>
              No se trata solo de pedir desde la mesa. Se trata de que el servicio fluya mejor,
              tenga menos errores y deje una mejor impresion.
            </p>
          </aside>
        </div>
      </section>

      <section className="content-section brand-section">
        <div className="split-layout">
          <div>
            <p className="eyebrow eyebrow-dark">Diseño del establecimiento</p>
            <h2>No solo ordena el servicio. Tambien deja que cada local muestre su propia cara.</h2>
            <p>
              COMANDA no busca que todos los restaurantes se vean iguales. La propuesta es que el
              staff pueda diseñar la experiencia del establecimiento y que ese diseño sea el frente
              que ve el cliente desde la mesa.
            </p>
          </div>

          <div className="brand-notes">
            <article className="brand-note-card">
              <small>Personalizacion</small>
              <strong>El local define como quiere verse frente al cliente.</strong>
            </article>
            <article className="brand-note-card">
              <small>Consistencia</small>
              <strong>La operacion mejora sin perder identidad visual ni tono de marca.</strong>
            </article>
            <article className="brand-note-card">
              <small>Percepcion</small>
              <strong>La experiencia digital pasa a ser parte real de la imagen del establecimiento.</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="content-section" id="como-funciona">
        <div className="section-heading">
          <p className="eyebrow eyebrow-dark">Como funciona</p>
          <h2>Agil para el cliente. Claro para el equipo.</h2>
        </div>

        <div className="timeline-grid">
          {flowSteps.map((step, index) => (
            <article key={step} className="timeline-card">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="content-section" id="beneficios">
        <div className="benefit-columns">
          <div>
            <p className="eyebrow eyebrow-dark">Para el restaurante</p>
            <h2>Mas control operativo sin sumar complejidad.</h2>
            <div className="benefit-list">
              {restaurantBenefits.map((item) => (
                <article key={item} className="benefit-card">
                  <span />
                  <p>{item}</p>
                </article>
              ))}
            </div>
          </div>

          <div>
            <p className="eyebrow eyebrow-dark">Para el cliente</p>
            <h2>Una experiencia mas agil, mas clara y mas comoda.</h2>
            <div className="benefit-list">
              {customerBenefits.map((item) => (
                <article key={item} className="benefit-card benefit-card-alt">
                  <span />
                  <p>{item}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="content-section accent-panel">
        <div className="split-layout">
          <div>
            <p className="eyebrow eyebrow-dark">Transparencia y tiempo</p>
            <h2>Cuando todos ven mejor lo que esta pasando, el servicio mejora.</h2>
          </div>
          <p className="accent-copy">
            La transparencia no es un detalle de interfaz. Es una mejora real en la experiencia.
            Cuando el cliente entiende el estado del pedido y el staff tiene mejor control del
            flujo, bajan los errores, mejora la percepcion del tiempo y el servicio se vuelve mas
            solido.
          </p>
        </div>
      </section>

      <section className="content-section" id="feedback">
        <div className="feedback-grid">
          <div className="feedback-panel">
            <p className="eyebrow eyebrow-dark">Feedback como activo</p>
            <h2>Escuchar al cliente tambien puede ser parte de la operacion.</h2>
            <p>
              COMANDA permite captar feedback al final de la experiencia, algo que muchos
              establecimientos todavia no logran de forma simple. Eso le da al local informacion
              directa para detectar mejoras, ajustar el servicio y entender mejor como se esta
              viviendo la experiencia que diseñó para su cliente.
            </p>
          </div>

          <div className="benefit-list">
            {growthBenefits.map((item) => (
              <article key={item} className="benefit-card benefit-card-dark">
                <span />
                <p>{item}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="content-section dark-band">
        <div className="split-layout">
          <div>
            <p className="eyebrow">Difusion organica</p>
            <h2>Una buena experiencia tambien puede atraer a la proxima mesa.</h2>
            <p>
              Muchos locales invierten tiempo y dinero para generar movimiento. COMANDA suma una
              ventaja adicional: si la experiencia fue buena, el cliente puede compartir el lugar o
              recomendarlo de forma organica con amigos, contactos o redes.
            </p>
          </div>

          <aside className="share-block">
            <strong>Mejor operacion adentro. Mejor reputacion afuera.</strong>
            <p>
              No como publicidad forzada, sino como consecuencia natural de una experiencia clara,
              agil y prolija.
            </p>
          </aside>
        </div>
      </section>

      <section className="content-section demo-section">
        <div className="split-layout">
          <div>
            <p className="eyebrow eyebrow-dark">Vista del producto</p>
            <h2>Verlo en accion hace evidente el impacto.</h2>
            <p>
              Desde el pedido en la mesa hasta el seguimiento, el feedback y la posibilidad de
              compartir la experiencia, COMANDA muestra un servicio mas ordenado de punta a punta.
            </p>
          </div>

          <div className="demo-frame" aria-hidden="true">
            <div className="demo-screen">
              <div className="demo-line" />
              <div className="demo-line demo-line-short" />
              <article className="demo-card">
                <strong>Pedido en curso</strong>
                <p>Mesa 12 con estado visible y menos incertidumbre.</p>
              </article>
              <article className="demo-card demo-card-dark">
                <strong>Feedback al cierre</strong>
                <p>La experiencia sigue despues del pedido.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="content-section founder-section">
        <div className="section-heading founder-copy">
          <p className="eyebrow eyebrow-dark">Quienes somos</p>
          <h2>Pensado para mejorar el servicio sin volverlo mas complejo.</h2>
          <p>
            COMANDA nace con una idea concreta: ayudar a restaurantes y bares a operar con mas
            orden, menos errores y mas claridad, sin perder simpleza ni identidad en la experiencia
            del cliente.
          </p>
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <p className="eyebrow eyebrow-dark">FAQ</p>
          <h2>Preguntas que suelen aparecer antes de una demo.</h2>
        </div>

        <div className="faq-list">
          {faqs.map((item) => (
            <details key={item.question} className="faq-item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="content-section final-cta" id="cta-final">
        <div>
          <p className="eyebrow">CTA final</p>
          <h2>
            Si queres un servicio mas ordenado, mas transparente y con mas valor para el negocio,
            vale la pena verlo funcionando.
          </h2>
          <p>
            Agenda una demo y conoce como COMANDA puede mejorar la operacion, la experiencia y la
            visibilidad de tu restaurante, sin resignar la forma en que tu local quiere mostrarse.
          </p>
        </div>

        <div className="final-actions">
          <a className="button button-primary" href="mailto:hola@comanda.app">
            Agendar demo
          </a>
          <a className="button button-secondary-dark" href="#como-funciona">
            Ver recorrido
          </a>
        </div>
      </section>
    </main>
  );
}
