"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../clients/page.module.css";

/**
 * Estado de la configuración.
 *
 * No muestra ni permite editar secretos: el panel no tiene por qué verlos, y
 * un formulario que los enseñe convierte cualquier acceso al panel en acceso a
 * las claves. Solo dice qué está configurado y qué falta.
 */
export default function SettingsPage() {
  const [estado, setEstado] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then(setEstado)
      .catch(() => setEstado(null));
  }, []);

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.back}>← Volver al Command Center</Link>
      <h1 className={styles.title}>Ajustes</h1>

      <p style={{ opacity: .7, maxWidth: "52ch", marginTop: ".6rem" }}>
        La configuración vive en <code>services/api/.env</code>. Aquí solo se
        consulta el estado: las claves no se muestran ni se editan desde el
        panel, para que acceder a él no equivalga a tener los secretos.
      </p>

      <h2 style={{ fontSize: "1.05rem", margin: "2rem 0 .6rem" }}>Estado del sistema</h2>
      <table className={styles.table}>
        <tbody>
          {estado ? Object.entries({
            "Entradas de conocimiento": (estado as any).conocimiento,
            "Subagentes": (estado as any).subagentes,
            "Herramientas": (estado as any).herramientas,
            "Coste acumulado": `${(estado as any).coste_eur} €`,
            "Prospectos activos": (estado as any).captacion?.prospectos_activos,
            "Correos enviados": (estado as any).captacion?.correos_enviados,
            "Cuentas objetivo": (estado as any).captacion?.cuentas_objetivo,
            "En supresión": (estado as any).captacion?.en_supresion,
          }).map(([k, v]) => (
            <tr key={k}>
              <td style={{ opacity: .7 }}>{k}</td>
              <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{String(v ?? "—")}</td>
            </tr>
          )) : <tr><td>Cargando…</td></tr>}
        </tbody>
      </table>

      <h2 style={{ fontSize: "1.05rem", margin: "2.5rem 0 .6rem" }}>Cambiar configuración</h2>
      <pre style={{
        background: "#FAF9F7", padding: "1rem", borderRadius: "8px",
        border: "1px solid #E8E5E0", fontSize: ".85rem", overflowX: "auto",
      }}>{`cd services/api
nano .env          # claves, remitente, límites
npm run dev        # recarga sola al guardar`}</pre>
    </div>
  );
}
