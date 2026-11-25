# Saba Light — Saba en el celular

Una página que se instala como app en el celular. Habla directo con tu Google (Tasks y Calendar),
así que funciona con la PC apagada. Lo que cargás acá lo levanta Saba en la PC al prenderse.

No guarda ningún dato tuyo en el código: se puede publicar en un repositorio público.

## 1. Publicarla (GitHub Pages, gratis) — una sola vez

1. En github.com: **New repository** → nombre `saba-light` → **Public** → tildá *Add a README* → **Create**.
2. En el repo: **Add file → Upload files** y arrastrá **todos los archivos de esta carpeta**
   (`C:\Projects\Atlas\mobile`). Abajo: **Commit changes**.
3. **Settings → Pages** → *Source*: **Deploy from a branch** → Branch: **main** y **/ (root)** → **Save**.
4. En 1 o 2 minutos queda en: `https://sabaconection.github.io/saba-light/`

## 2. Credencial de Google para la página — una sola vez

En console.cloud.google.com, en el **mismo proyecto de Saba**:

1. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
2. Tipo de aplicación: **Aplicación web**. Nombre: `Saba Light`.
3. **Orígenes autorizados de JavaScript → Agregar URI**: `https://sabaconection.github.io`
   (sin barra al final ni nada más).
4. **Crear** y copiá el **ID de cliente** (termina en `.apps.googleusercontent.com`).
   No hace falta el «secreto».

Google Tasks API y Google Calendar API ya tienen que estar habilitadas (son las mismas que usa la PC).

## 3. En el celular

Antes, en GitHub: abrí `config.js` en el repo → ✏️ → pegá el ID de cliente entre las comillas
de `window.SABA_CLIENT_ID = "";` → **Commit changes**. Así el celular no te lo pide.

1. Abrí `https://sabaconection.github.io/saba-light/` en Chrome (Android) o Safari (iPhone).
2. **Entrar con Google**. (Si `config.js` quedó vacío, te pide pegar el ID a mano.)
   Si aparece «Google no verificó esta app», tocá **Continuar** (es tu propia app, en modo prueba).
3. Instalala:
   - Android (Chrome): menú ⋮ → **Agregar a la pantalla principal** / **Instalar app**.
   - iPhone (Safari): botón Compartir → **Agregar a inicio**.

## Cómo se usa

- Escribí o tocá el micrófono y hablá (con pausas: corta cuando volvés a tocar).
- **Auto** adivina: «comprar pilas y café» → Compras · «pagar ABL el jueves» → Tarea ·
  «dentista mañana a las 10» → Evento. Abajo de la barra ves qué va a hacer antes de guardar.
- Si se equivoca, elegí **Tarea / Compra / Evento** antes de guardar.
- Tildá tareas y tocá compras para tacharlas. La ✕ borra (pide confirmar).
- La sesión de Google dura una hora: después, un toque en ↻ o «Entrar con Google» (sin contraseña).

## Qué NO hace (todavía)

- Frases libres con razonamiento: para eso, el bot de Telegram (con la PC prendida).
- Armar el menú: se ve acá, se arma en Saba.

## Si Google dice «401 invalid_client»

Google no encuentra ese ID de cliente. Casi siempre es el ID mal copiado (un `l` por un `1`,
un `O` por un `0`) o un cliente que se borró. Copialo de nuevo con el botón de copiar en
Credenciales, pegalo en `config.js` y recargá la página en el celular.
