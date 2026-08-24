"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import Link from "next/link";

type Client = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  keys: number;
  entries: number;
  channels: string | null;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/clients")
      .then((res) => {
        if (!res.ok) throw new Error("Error fetching clients");
        return res.json();
      })
      .then((data) => {
        setClients(data.clients);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link href="/" style={{ color: 'var(--primary)', marginBottom: '1rem', display: 'inline-block' }}>
            &larr; Volver al Dashboard
          </Link>
          <h1 className={styles.title}>Clientes</h1>
        </div>
        <button className={styles.button}>+ Nuevo Cliente</button>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableContainer}>
        {loading ? (
          <div className={styles.loading}>Cargando datos del orquestador...</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Claves API</th>
                <th>RAG (Entradas)</th>
                <th>Canales</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{client.name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#8a8f98' }}>{client.slug}</div>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${client.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                      {client.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>{client.keys}</td>
                  <td>{client.entries}</td>
                  <td>{client.channels || "—"}</td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem' }}>
                    No hay clientes registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
