import type { Locator, Page } from '@playwright/test';

/** Centro de mando del escritorio: cola priorizada, búsqueda y detalle de una incidencia. */
export class CentroDeMandoPage {
  readonly titulo: Locator;
  readonly buscador: Locator;
  readonly salir: Locator;

  constructor(private readonly page: Page) {
    this.titulo = page.getByRole('heading', { name: 'Cola priorizada' });
    this.buscador = page.getByPlaceholder('Código, descripción o espacio');
    this.salir = page.getByRole('button', { name: 'Salir' });
  }

  async abrir() {
    await this.page.goto('/?view=desktop');
  }

  async buscar(texto: string) {
    await this.buscador.fill(texto);
  }

  /** Botón de la cola que corresponde a un código INC-NNNNN. */
  incidencia(codigo: string) {
    return this.page.getByRole('button', { name: new RegExp(codigo) }).first();
  }

  async cerrarSesion() {
    await this.salir.click();
  }
}
