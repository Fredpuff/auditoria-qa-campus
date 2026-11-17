import type { Locator, Page } from '@playwright/test';

/** Asistente de reporte de la vista de celular: Dónde → Punto exacto → Qué pasa → Detalle → Confirmar. */
export class ReportePage {
  readonly buscador: Locator;
  readonly continuar: Locator;
  readonly descripcion: Locator;
  readonly enviar: Locator;

  constructor(private readonly page: Page) {
    this.buscador = page.getByPlaceholder('Buscar salón, laboratorio o baño');
    this.continuar = page.getByRole('button', { name: 'Continuar' });
    this.descripcion = page.locator('textarea');
    this.enviar = page.getByRole('button', { name: 'Enviar reporte' });
  }

  async abrir() {
    await this.page.goto('/?view=mobile');
    await this.buscador.waitFor();
  }

  paso(nombre: string) {
    return this.page.getByRole('heading', { level: 2, name: nombre });
  }

  async elegirEspacio(busqueda: string, nombre: string) {
    await this.buscador.fill(busqueda);
    await this.page.getByRole('button', { name: new RegExp(`^${nombre}`, 'i') }).first().click();
  }

  async omitirPuntoExacto() {
    await this.page.getByRole('button', { name: 'Omitir este paso' }).click();
  }

  async elegirTipoYRiesgo(categoria: string, riesgo: string) {
    await this.page.getByRole('button', { name: new RegExp(`^${categoria}`) }).click();
    await this.page.getByRole('button', { name: new RegExp(`^${riesgo}`) }).click();
    await this.continuar.click();
  }

  async describir(texto: string) {
    await this.descripcion.fill(texto);
    await this.continuar.click();
  }

  /** Envía el reporte y devuelve la respuesta de POST /api/incidents. */
  async enviarReporte() {
    const respuesta = this.page.waitForResponse((r) => /\/api\/incidents$/.test(r.url()) && r.request().method() === 'POST');
    await this.enviar.click();
    return respuesta;
  }
}
