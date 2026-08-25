import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execAsync = promisify(exec);

export async function runCodeInterpreter(input: Record<string, unknown>): Promise<string> {
  const code = input.code as string;
  if (!code) {
    throw new Error('El parámetro "code" es obligatorio para el intérprete.');
  }

  const tmpFile = join(tmpdir(), `pita_interpreter_${Date.now()}_${Math.random().toString(36).substring(7)}.js`);

  try {
    // Guardar el código en un archivo temporal
    await writeFile(tmpFile, code, 'utf-8');

    // Ejecutar el script usando node, con timeout de 10 segundos
    const { stdout, stderr } = await execAsync(`node ${tmpFile}`, {
      timeout: 10000,
      maxBuffer: 1024 * 1024 * 2 // 2MB máximo de salida
    });

    let output = '';
    if (stdout) output += `[STDOUT]\n${stdout}\n`;
    if (stderr) output += `[STDERR]\n${stderr}\n`;

    if (!output.trim()) {
      output = 'Script ejecutado con éxito sin salida por consola.';
    }

    return output;
  } catch (error: any) {
    let errorOutput = `Error en la ejecución:\n`;
    if (error.killed) {
      errorOutput += 'Timeout: El script tardó demasiado y fue detenido.\n';
    }
    if (error.stdout) errorOutput += `[STDOUT]\n${error.stdout}\n`;
    if (error.stderr) errorOutput += `[STDERR]\n${error.stderr}\n`;
    if (error.message) errorOutput += `[MESSAGE]\n${error.message}\n`;

    return errorOutput;
  } finally {
    // Limpiar el archivo temporal
    try {
      await unlink(tmpFile);
    } catch (e) {
      // Ignorar error de limpieza
    }
  }
}
