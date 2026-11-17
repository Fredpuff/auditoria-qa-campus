import type { Locator, Page } from '@playwright/test';

/** Panel de indicadores (/panel). */
export class PanelPage {
  readonly titulo: Locator;
  readonly secciones: Locator;

  constructor(private readonly page: Page) {
    this.titulo = page.getByRole('heading', { name: 'Panel de indicadores' });
    this.secciones = page.getByRole('heading', { level: 3 });
  }

  /** Abre el panel y devuelve la respuesta de GET /api/dashboard/summary. */
  async abrir() {
    const resumen = this.page.waitForResponse((r) => r.url().includes('/api/dashboard/summary'));
    await this.page.goto('/panel?view=desktop');
    return resumen;
  }

  seccion(nombre: string) {
    return this.page.getByRole('heading', { name: nombre });
  }
}
