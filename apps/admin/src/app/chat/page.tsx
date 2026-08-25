"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

/**
 * Consola de chat con los bots.
 *
 * Habla con `/api/v1/chat`, la misma ruta que usa cualquier cliente externo:
 * lo que se ve aquí es exactamente lo que vería un huésped o un inversor, con
 * el mismo prompt, el mismo RAG y los mismos guardrails. Una pantalla que
 * llamara a un atajo interno enseñaría un bot que no existe.
 */
type Turno = {
  rol: "user" | "bot";
  texto: string;
  meta?: string;
};

const BOTS = [
  { slug: "zrc", nombre: "Zenith Rise Capital", clave: "pita_xs9h8xq4hbff_uYwj8QfxNEVQlfgqURiYIhKFZJ8a00iG" },
  { slug: "casa-nigran", nombre: "Pita Tola · Casa de Nigrán", clave: "pita_YRMMBAKdWqmJ_S9HaBurSly2Gepii2gWz0GNUEgT4yvl0" },
];

export default function ChatPage() {
  const [bot, setBot] = useState(BOTS[0]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sesion, setSesion] = useState("panel_1");
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turnos, cargando]);

  // Sesión nueva al cambiar de bot: reutilizarla mezclaría el historial de dos
  // clientes distintos en la misma conversación.
  function cambiarBot(b: typeof BOTS[number]) {
    setBot(b);
    setTurnos([]);
    setAviso(null);
    setSesion(`panel_${Date.now().toString(36)}`);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const mensaje = texto.trim();
    if (!mensaje || cargando) return;

    setTurnos((t) => [...t, { rol: "user", texto: mensaje }]);
    setTexto("");
    setCargando(true);
    setAviso(null);

    try {
      const r = await fetch("/api/v1/chat", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${bot.clave}` },
        body: JSON.stringify({ session_id: sesion, message: mensaje }),
      });
      const d = await r.json();

      if (!r.ok) {
        setAviso(d?.error ? `${r.status} · ${d.error}` : `Error ${r.status}`);
      } else if (d.status === "handoff_requested" || d.status === "handoff") {
        setTurnos((t) => [...t, {
          rol: "bot",
          texto: d.data?.reply ?? "Derivado a una persona.",
          meta: "⚠ escaló a un humano",
        }]);
      } else {
        const u = d.data?.usage;
        setTurnos((t) => [...t, {
          rol: "bot",
          texto: d.data?.reply ?? "(sin respuesta)",
          meta: [
            d.data?.model,
            u ? `${u.total_tokens} tokens` : null,
            d.data?.latency_ms ? `${(d.data.latency_ms / 1000).toFixed(1)}s` : null,
            d.data?.tools_used?.length ? `herramientas: ${d.data.tools_used.join(", ")}` : null,
          ].filter(Boolean).join(" · "),
        }]);
      }
    } catch (err) {
      setAviso(`No se pudo contactar con la API: ${String(err)}`);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <Link href="/" style={{ fontSize: ".85rem", opacity: .6, marginBottom: ".8rem" }}>
        ← Volver al Command Center
      </Link>

      <div className={styles.head}>
        <h1 className={styles.title}>Hablar con Pita</h1>
        <p className={styles.sub}>Usa /api/v1/chat, igual que un cliente real</p>
      </div>

      <div className={styles.picker}>
        {BOTS.map((b) => (
          <button
            key={b.slug}
            onClick={() => cambiarBot(b)}
            className={`${styles.chip} ${b.slug === bot.slug ? styles.chipOn : ""}`}
          >
            {b.nombre}
          </button>
        ))}
      </div>

      <div className={styles.log}>
        {turnos.length === 0 && !cargando && (
          <p className={styles.vacio}>
            Escríbele algo.<br />
            {bot.slug === "zrc"
              ? "Prueba: «Soy de un family office, ¿qué tenéis en agro?»"
              : "Prueba: «¿Cuál es la clave del wifi?»"}
          </p>
        )}
        {turnos.map((t, i) => (
          <div key={i} className={`${styles.row} ${t.rol === "user" ? styles.rowUser : ""}`}>
            <div>
              <div className={`${styles.bubble} ${t.rol === "user" ? styles.user : styles.bot}`}>
                {t.texto}
              </div>
              {t.meta && <div className={styles.meta}>{t.meta}</div>}
            </div>
          </div>
        ))}
        {cargando && (
          <div className={styles.row}>
            <div className={`${styles.bubble} ${styles.bot}`} style={{ opacity: .55 }}>pensando…</div>
          </div>
        )}
        <div ref={finRef} />
      </div>

      {aviso && <div className={styles.aviso}>{aviso}</div>}

      <form className={styles.form} onSubmit={enviar}>
        <input
          className={styles.input}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe un mensaje…"
          disabled={cargando}
        />
        <button className={styles.send} type="submit" disabled={cargando || !texto.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
