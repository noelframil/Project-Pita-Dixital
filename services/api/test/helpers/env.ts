/**
 * `config.ts` valida el entorno al importarse y mata el proceso si falta algo.
 * Eso está bien en producción y estorba en las pruebas, así que aquí se rellenan
 * los huecos con valores de mentira.
 *
 * Ninguna prueba abre una conexión a Postgres ni llama a un proveedor real: lo
 * que se comprueba son funciones puras y las comprobaciones de red que TIENEN
 * que fallar. Estos valores solo existen para que los módulos carguen.
 *
 * Impórtalo antes que nada en cada fichero de pruebas: los módulos ES se
 * evalúan en el orden en que se declaran los imports.
 */
process.env.DATABASE_URL ??= 'postgresql://pita:pita@localhost:5433/pita_test';
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.API_KEY_PEPPER ??= 'pepper-de-pruebas-nunca-en-produccion';
process.env.OLLAMA_HOST ??= 'http://127.0.0.1:11499';
