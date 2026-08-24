import type { NextConfig } from "next";

/**
 * El panel no habla con la API por URL absoluta: reenvía desde su mismo origen.
 * Así el navegador nunca cruza de dominio y no hace falta CORS.
 *
 * El destino es configurable porque el puerto de la API cambia entre máquinas
 * —en esta, 3000 lo ocupa otro proyecto— y tenerlo fijo hacía que el panel
 * fallara con un "Error fetching clients" que no dice nada del puerto.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3100";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
