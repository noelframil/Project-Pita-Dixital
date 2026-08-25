"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../clients/page.module.css";

type Campana = {
  name: string; subject: string; segment: string | null;
  status: string; enviados: number; rebotados: number;
};
type Prospecto = {
  email: string; display_name: string | null; organisation: string | null;
  role_title: string | null; status: string; enviados: number; ultimo: string | null;
};
type Supresion = { email: string; reason: string };

export default function OutreachPage() {
  const [datos, setDatos] = useState<{
    campanas: Campana[]; prospectos: Prospecto[]; supresion: Supresion[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/outreach")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setDatos)
      .catch((e) => setError(String(e.message)));
  }, []);

  if (error) return <div className={styles.container}><p>Error: {error}</p></div>;
  if (!datos) return <div className={styles.container}><p>Cargando…</p></div>;

  const enviadosTotal = datos.campanas.reduce((a, c) => a + c.enviados, 0);
  const activos = datos.prospectos.filter((p) => p.status === "active").length;
  const respondieron = datos.prospectos.filter((p) => p.status === "replied").length;

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.back}>← Volver al Command Center</Link>
      <h1 className={styles.title}>Captación</h1>

      <div style={{ display: "flex", gap: "2.5rem", margin: "1.5rem 0 2rem", flexWrap: "wrap" }}>
        {[
          ["Correos enviados", enviadosTotal],
          ["Prospectos activos", activos],
          ["Respondieron", respondieron],
          ["En supresión", datos.supresion.length],
        ].map(([etiqueta, valor]) => (
          <div key={String(etiqueta)}>
            <div style={{ fontSize: "1.9rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {valor as number}
            </div>
            <div style={{ fontSize: ".72rem", letterSpacing: ".08em", textTransform: "uppercase", opacity: .6 }}>
              {etiqueta as string}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: "1.05rem", margin: "2rem 0 .6rem" }}>Campañas con envíos</h2>
      <table className={styles.table}>
        <thead>
          <tr><th>Campaña</th><th>Asunto</th><th>Estado</th><th>Enviados</th><th>Fallidos</th></tr>
        </thead>
        <tbody>
          {datos.campanas.filter((c) => c.enviados > 0 || c.status === "approved").map((c) => (
            <tr key={c.name}>
              <td><strong>{c.name}</strong></td>
              <td>{c.subject}</td>
              <td>{c.status}</td>
              <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.enviados}</td>
              <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.rebotados}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: "1.05rem", margin: "2.5rem 0 .6rem" }}>Prospectos</h2>
      <table className={styles.table}>
        <thead>
          <tr><th>Contacto</th><th>Firma</th><th>Cargo</th><th>Estado</th><th>Correos</th></tr>
        </thead>
        <tbody>
          {datos.prospectos.map((p) => (
            <tr key={p.email}>
              <td><strong>{p.display_name ?? "—"}</strong><br />
                <span style={{ opacity: .6, fontSize: ".85em" }}>{p.email}</span></td>
              <td>{p.organisation ?? "—"}</td>
              <td>{p.role_title ?? "—"}</td>
              <td>{p.status}</td>
              <td style={{ fontVariantNumeric: "tabular-nums" }}>{p.enviados}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {datos.supresion.length > 0 && (
        <>
          <h2 style={{ fontSize: "1.05rem", margin: "2.5rem 0 .6rem" }}>Lista de supresión</h2>
          <table className={styles.table}>
            <thead><tr><th>Dirección</th><th>Motivo</th></tr></thead>
            <tbody>
              {datos.supresion.map((s) => (
                <tr key={s.email}><td>{s.email}</td><td>{s.reason}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
