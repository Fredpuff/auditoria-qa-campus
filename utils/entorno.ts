import path from 'node:path';

export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const WEB_URL = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
/** Carpeta de la aplicación auditada (commit 16ebe4d). */
export const APP_DIR = process.env.APP_DIR ?? path.resolve(__dirname, '../../../Hackaton');
export const CLAVE = 'campus123';
export const RUTA_SESIONES = path.resolve(__dirname, '../.auth/sesiones.json');
