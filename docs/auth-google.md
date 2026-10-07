# Autenticación con Google

Este documento describe cómo funciona el inicio de sesión con Google en JoinSport.

## Resumen

El flujo es **ID Token** (no OAuth redirect). El frontend obtiene un JWT firmado por Google y lo envía al backend, que lo verifica y emite los tokens propios de la app.

**No se almacenan credenciales de Google.** Ni el backend ni el frontend guardan el `access_token` de Google. Solo se verifica el `idToken` una vez en el login.

---

## Componentes

| Componente | Ubicación |
|---|---|
| Client ID de Google | Google Cloud Console → APIs & Services → Credentials |
| Endpoint backend | `POST /auth/google` en `backend/src/auth/auth.controller.ts` |
| Lógica backend | `loginWithGoogle` en `backend/src/auth/auth.service.ts` |
| DTO | `backend/src/auth/dto/google-login.dto.ts` |
| Provider frontend | `frontend-web/app/providers.tsx` |
| Botón | `frontend-web/components/GoogleLoginButton.tsx` |
| Página login | `frontend-web/app/login/page.tsx` |

---

## Variables de entorno

### Backend (`backend/.env` y Render → Environment)

GOOGLE_CLIENT_ID=402921659323-o1daqg02io1v7m5uvrkr4ij3jd3p6skc.apps.googleusercontent.com


### Frontend (`frontend-web/.env.local` y Vercel → Environment Variables)

NEXT_PUBLIC_GOOGLE_CLIENT_ID=402921659323-o1daqg02io1v7m5uvrkr4ij3jd3p6skc.apps.googleusercontent.com


**Nota:** el `CLIENT_ID` es público. No hay `CLIENT_SECRET` en el flujo porque no se usa OAuth redirect. Es más seguro así.

---

## Flujo paso a paso

### 1. Usuario pulsa "Continuar con Google"

`GoogleLoginButton` (componente client-only) renderiza el botón oficial de Google vía `@react-oauth/google`.

Se carga dinámicamente con `ssr: false` para evitar que Next.js intente prerenderizarlo sin el `GoogleOAuthProvider` en el árbol.

### 2. Google autentica al usuario y devuelve un `idToken`

El popup de Google se abre, el usuario elige su cuenta, y Google devuelve al callback `onSuccess` un objeto `credentialResponse` que contiene `credential` (el `idToken`, un JWT firmado por Google).

### 3. Frontend envía el `idToken` al backend

```ts
api.post('/auth/google', { idToken: credentialResponse.credential })
4. Backend verifica el idToken
loginWithGoogle en auth.service.ts:

Crea un OAuth2Client de google-auth-library con el GOOGLE_CLIENT_ID.

Llama a verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID }).

Si el token es inválido o expirado → 401 Unauthorized.

Extrae el payload y valida:

Que exista email.

Que email_verified sea true.

5. Backend busca o crea al usuario
Si el email ya existe en la DB:

Si está deletedAt → 401 "cuenta eliminada".

Si no tiene avatar y Google sí → se actualiza.

Login directo con ese usuario.

Si el email no existe:

Se crea un User con password: null, isGhost: false, role: 'USER', username único autogenerado.

6. Backend emite tokens propios
Igual que en el login normal: accessToken (JWT) + refreshToken. La respuesta es idéntica:

json
{
  "user": { ... },
  "accessToken": "...",
  "refreshToken": "..."
}
7. Frontend guarda los tokens y redirige
Los mismos pasos que el login normal: localStorage y router.push('/home')

Casos especiales
Usuario con email/password que entra con Google
Se vincula automáticamente. No pide confirmación. El usuario existente se loguea con su cuenta.

Implicación: si alguien tiene acceso al email de otra persona (p. ej. email corporativo compartido) podría entrar con Google a esa cuenta. Es el estándar de la industria y no suele ser un problema.

Usuario de Google intenta entrar con email/password
Como password: null, el login normal lanza:

text
Esta cuenta usa inicio de sesión con Google. Por favor, inicia sesión con Google.
Esto se comprueba en login en auth.service.ts:

ts
if (!user.password) {
  throw new UnauthorizedException(
    'Esta cuenta usa inicio de sesión con Google. Por favor, inicia sesión con Google.',
  );
}
Email de Google no verificado
Se rechaza con 401. Es una medida de seguridad: solo se aceptan cuentas de Google con email verificado.

Configuración de Google Cloud Console
Pantalla de Consentimiento
Tipo de usuario: Externo.

Estado: en producción (publicada) para que cualquier usuario pueda entrar. En fase de pruebas solo entran los "Usuarios de prueba".

Credenciales OAuth 2.0
Tipo: Aplicación web.

Authorized JavaScript origins:

http://localhost:3001

https://app.joinsportapp.com

https://joinsportapp.com

https://www.joinsportapp.com

Authorized redirect URIs: no se usan (flujo de ID Token).

Dependencias
Backend: google-auth-library.

Frontend: @react-oauth/google.

Testing manual
Abre https://app.joinsportapp.com/login.

Pulsa "Continuar con Google".

Autentica con una cuenta de Google.

Deberías entrar a /home.

Verifica en la DB que el User tiene password: null.

Para probar el caso "usuario existente":

Crea un usuario con email/password cuyo email sea de Google.

Cierra sesión.

Entra con Google usando ese email.

Deberías entrar con el mismo userId (no se duplica).

Para probar el caso "usuario de Google intenta entrar con password":

Con un usuario creado vía Google, intenta entrar con email/password.

Deberías ver el mensaje: "Esta cuenta usa inicio de sesión con Google. Por favor, inicia sesión con Google."

Posibles mejoras futuras
Campo authProvider en User para saber cómo se registró cada usuario (LOCAL, GOOGLE, BOTH).

Vincular/desvincular Google desde el perfil.

Añadir más proveedores (Apple, Microsoft) con una tabla UserAuthMethod.

Logout con Google (revocar el token de Google además del propio). Actualmente no es necesario porque no almacenamos el token de Google.

text

---

## ¿Dónde lo pongo?

Crea el archivo en la raíz del repo:

```powershell
New-Item -Path C:\JJ\Apps\training-pro\docs -ItemType Directory -ErrorAction SilentlyContinue
Y guarda el markdown como C:\JJ\Apps\training-pro\docs\auth-google.md.

Si quieres, también puede vivir en backend/docs/ o frontend-web/docs/. Yo lo pondría en la raíz.

Sobre el "rol específico para usuarios de Google"
Dime si quieres que lo implementemos ahora o lo dejamos como pendiente:

Sí, lo hacemos ahora: añadimos authProvider al modelo User y migración, con los valores que decidas (LOCAL, GOOGLE, BOTH).

No, lo dejamos apuntado en el doc: es lo que ya está en la sección "Posibles mejoras futuras" del documento.

Yo lo dejaría apuntado, porque no es urgente. Cuando lo necesites (por ejemplo, para mostrar "Conectado con Google" en el perfil), lo añadimos.