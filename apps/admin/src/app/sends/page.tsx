"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../clients/page.module.css";

type Envio = {
  id: string; para: string; nombre: string | null; firma: string | null;
  cargo: string | null; de: string; responder_a: string | null;
  campana: string; asunto: string; estado: string; enviado: string | null;
  error: string | null; unsubscribe_url: string; cuerpo: string;
};

export default function SendsPage() {
  const [envios, setEnvios] = useState<Envio[] | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/sends?limit=200")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setEnvios(d.envios))
      .catch((e) => setError(String(e.message)));
  }, []);

  if (error) return <div className={styles.container}><p>Error: {error}</p></div>;
  if (!envios) return <div className={styles.container}><p>Cargando…</p></div>;

  const enviados = envios.filter((e) => e.estado === "sent").length;
  const fallidos = envios.filter((e) => e.estado === "failed").length;

  return (
    <div className={styles.container}>
      <Link href="/outreach" className={styles.back}>← Volver a Captación</Link>
      <h1 className={styles.title}>Correos enviados</h1>

      <div style={{ display: "flex", gap: "2.5rem", margin: "1.2rem 0 1.8rem" }}>
        <div>
          <div style={{ fontSize: "1.9rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{enviados}</div>
          <div style={{ fontSize: ".72rem", letterSpacing: ".08em", textTransform: "uppercase", opacity: .6 }}>Entregados</div>
        </div>
        <div>
          <div style={{ fontSize: "1.9rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fallidos}</div>
          <div style={{ fontSize: ".72rem", letterSpacing: ".08em", textTransform: "uppercase", opacity: .6 }}>Fallidos</div>
        </div>
      </div>

      <p style={{ fontSize: ".85rem", opacity: .6, marginBottom: "1rem" }}>
        Pulsa en cualquier fila para ver el correo exacto que recibió esa persona.
      </p>

      <table className={styles.table}>
        <thead>
          <tr><th>Destinatario</th><th>Firma</th><th>Asunto</th><th>Estado</th><th>Enviado</th></tr>
        </thead>
        <tbody>
          {envios.map((e) => (
            <>
              <tr
                key={e.id}
                onClick={() => setAbierto(abierto === e.id ? null : e.id)}
                style={{ cursor: "pointer" }}
              >
                <td>
                  <strong>{e.nombre ?? "—"}</strong><br />
                  <span style={{ opacity: .6, fontSize: ".85em" }}>{e.para}</span>
                </td>
                <td>{e.firma ?? "—"}<br />
                  <span style={{ opacity: .6, fontSize: ".85em" }}>{e.cargo ?? ""}</span></td>
                <td>{e.asunto}</td>
                <td>
                  <span style={{
                    fontSize: ".72rem", padding: ".18rem .5rem", borderRadius: "3px", fontWeight: 600,
                    background: e.estado === "sent" ? "#E3EFE9" : "#F6E5E3",
                    color: e.estado === "sent" ? "#2A6149" : "#8E322B",
                  }}>
                    {e.estado === "sent" ? "enviado" : "fallido"}
                  </span>
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums", fontSize: ".85em" }}>
                  {e.enviado ? new Date(e.enviado).toLocaleString("es-ES") : "—"}
                </td>
              </tr>
              {abierto === e.id && (
                <tr key={`${e.id}-detalle`}>
                  <td colSpan={5} style={{ background: "#FAF9F7", padding: "1.2rem" }}>
                    <div style={{ fontSize: ".82rem", opacity: .7, marginBottom: ".8rem", lineHeight: 1.8 }}>
                      <div><strong>De:</strong> {e.de}</div>
                      <div><strong>Para:</strong> {e.para}</div>
                      {e.responder_a && <div><strong>Responder a:</strong> {e.responder_a}</div>}
                      <div><strong>Asunto:</strong> {e.asunto}</div>
                      <div><strong>Campaña:</strong> {e.campana}</div>
                      {e.error && <div style={{ color: "#8E322B" }}><strong>Error:</strong> {e.error}</div>}
                    </div>
                    <pre style={{
                      whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: ".9rem",
                      lineHeight: 1.65, background: "#fff", padding: "1.1rem",
                      borderRadius: "8px", border: "1px solid #E8E5E0", margin: 0,
                    }}>{e.cuerpo}</pre>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
