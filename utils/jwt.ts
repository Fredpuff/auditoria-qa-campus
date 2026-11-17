import { createHmac } from 'node:crypto';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function firmar(payload: Record<string, unknown>, secreto: string) {
  const cabecera = b64({ alg: 'HS256', typ: 'JWT' });
  const cuerpo = b64(payload);
  const firma = createHmac('sha256', secreto).update(`${cabecera}.${cuerpo}`).digest('base64url');
  return `${cabecera}.${cuerpo}.${firma}`;
}

export function leer(token: string): Record<string, any> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

/** Cambia el contenido del token sin volver a firmarlo. */
export function alterar(token: string, cambios: Record<string, unknown>) {
  const [c, , f] = token.split('.');
  return `${c}.${b64({ ...leer(token), ...cambios })}.${f}`;
}

/** Secreto publicado en el archivo .env.example del repositorio auditado. */
export const SECRETO_DE_EJEMPLO = 'cambia-esto-por-un-secreto-largo-de-al-menos-32-caracteres';
