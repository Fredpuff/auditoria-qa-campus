import type { Locator, Page } from '@playwright/test';

/** Pantalla de ingreso (vista de escritorio o de celular). */
export class LoginPage {
  readonly correo: Locator;
  readonly clave: Locator;
  readonly entrar: Locator;

  constructor(private readonly page: Page, private readonly vista: 'desktop' | 'mobile' = 'desktop') {
    this.correo = vista === 'desktop' ? page.getByPlaceholder('nombre@uniminuto.edu.co') : page.getByPlaceholder('Correo institucional');
    this.clave = vista === 'desktop' ? page.locator('input[type=password]') : page.getByPlaceholder('Contraseña');
    this.entrar = page.getByRole('button', { name: 'Entrar', exact: true });
  }

  async abrir() {
    await this.page.goto(`/?view=${this.vista}`);
    await this.correo.waitFor();
  }

  /** Llena el formulario, pulsa Entrar y devuelve la respuesta de POST /api/auth/login. */
  async ingresar(correo: string, clave: string) {
    await this.correo.fill(correo);
    await this.clave.fill(clave);
    const respuesta = this.page.waitForResponse((r) => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
    await this.entrar.click();
    return respuesta;
  }

  aviso(texto: string) {
    return this.page.getByText(texto);
  }
}
