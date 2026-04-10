# MSH — Asistente de Obra

App web para que el equipo de instalaciones de Grupo MSH genere minutas de obra y no conformidades desde el celular.

---

## Deploy paso a paso

### 1. Subir a GitHub

1. Entrá a [github.com](https://github.com) y creá una cuenta si no tenés
2. Hacé click en **New repository**
3. Nombre: `msh-obra`
4. Dejalo en **Private**
5. Hacé click en **Create repository**
6. Seguí las instrucciones para subir los archivos (podés arrastrarlos desde tu computadora con **uploading an existing file**)

### 2. Deploy en Vercel

1. Entrá a [vercel.com](https://vercel.com) y creá una cuenta con tu GitHub
2. Hacé click en **Add New Project**
3. Seleccioná el repositorio `msh-obra`
4. Vercel va a detectar automáticamente que es Next.js
5. Antes de deployar, agregá la variable de entorno:
   - Nombre: `ANTHROPIC_API_KEY`
   - Valor: tu API key de Anthropic (ej: `sk-ant-...`)
6. Hacé click en **Deploy**
7. En 2 minutos vas a tener la app en un link tipo `msh-obra.vercel.app`

### 3. Conectar dominio propio (obra.msh.com.ar)

1. En Vercel, entrá a tu proyecto → **Settings** → **Domains**
2. Escribí `obra.msh.com.ar` y hacé click en **Add**
3. Vercel te va a dar un registro DNS para agregar
4. Entrá al panel donde administrás el dominio `msh.com.ar`
5. Agregá el registro CNAME que te indica Vercel
6. En 5-10 minutos el dominio va a estar activo

---

## Variables de entorno necesarias

| Variable | Descripción |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Tu API key de Anthropic (console.anthropic.com) |

---

## Desarrollo local (opcional)

```bash
npm install
cp .env.example .env.local
# Editá .env.local y poné tu API key real
npm run dev
```

La app corre en http://localhost:3000
