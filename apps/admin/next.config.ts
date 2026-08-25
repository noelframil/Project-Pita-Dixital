import type { NextConfig } from "next";

/**
 * El panel no habla con la API por URL absoluta: reenvía desde su mismo origen,
 * así el navegador nunca cruza de dominio y no hace falta CORS.
 *
 * El destino es configurable porque cambia según dónde corra: en local el
 * puerto de la API varía entre máquinas —aquí el 3000 lo ocupa otro proyecto— y
 * en Docker el backend es otro contenedor. Tenerlo fijo hacía que el panel
 * fallara con un "Error fetching clients" que no dice nada del puerto.
 *
 * Se aceptan los dos nombres de variable que había en uso para no romper
 * despliegues ya configurados con cualquiera de ellos.
 */
const API_ORIGIN =
  process.env.API_ORIGIN ?? process.env.API_BASE_URL ?? "http://localhost:3100";

const nextConfig: NextConfig = {
  // Necesario para la imagen de Docker: empaqueta solo lo que hace falta.
  output: "standalone",
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
