# Umi 海

Diario personal privado. Escribes una entrada y Umi la lee con tu perfil "Quién soy" y tus recuerdos parecidos, te responde con cariño, guarda su análisis y va actualizando tu perfil. Encima de eso hay tres niveles: **Diario** (cada entrada), **Patrones** (tus últimas entradas, más gráficas calculadas sin IA) y **Horizonte** (tus informes de patrones vistos desde lejos).

Solo la cuenta de `OWNER_EMAIL` puede usarla.

## Cómo está hecho

- `frontend/`: React + TypeScript + Vite + Tailwind, con Bun. Lee Firestore en vivo y nunca escribe directamente.
- `functions/main.py`: Cloud Functions en Python. Llama a Groq (`openai/gpt-oss-120b`) para analizar y a Vertex AI (`gemini-embedding-001`) para la memoria por significado. Es lo único que escribe en Firestore.
- Firestore, por usuario en `users/{uid}/`:
  - `entries`: entradas con su análisis.
  - `memories`: el vector de significado de cada entrada; tiene un índice vectorial en `firestore.indexes.json`.
  - `patterns` y `horizons`: los informes generados.
  - `profile/main` y `profileChanges`: tu "Quién soy" y los cambios que hizo Umi.

## Lo que no está en git (créalo en una copia nueva)

- `functions/.env` con `OWNER_EMAIL=tu-correo@gmail.com`.
- `functions/quien-soy.md`: tu perfil inicial, que se carga la primera vez que usas Umi.
- El secreto de Groq: `firebase functions:secrets:set GROQ_API_KEY`.
- La API de Vertex AI activada en el proyecto (`aiplatform.googleapis.com`).

## Comandos

```sh
bun run test     # pruebas del backend
bun run deploy   # despliega todo
cd frontend && bun run dev   # frontend local contra el backend real
```

El despliegue corre desde `C:\umi_psi`, un junction a esta carpeta: firebase-tools falla con la "ó" de `Simón` en la ruta. Para crearlo en otra máquina:

```powershell
New-Item -ItemType Junction -Path C:\umi_psi -Target "<ruta de esta carpeta>"
```
