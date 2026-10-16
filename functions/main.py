import json
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from firebase_admin import firestore, initialize_app
from firebase_functions import https_fn, logger, options
from firebase_functions.params import PROJECT_ID, SecretParam, StringParam

initialize_app()
options.set_global_options(max_instances=3)  # caps runaway cost on Blaze

GROQ_API_KEY = SecretParam("GROQ_API_KEY")
OWNER_EMAIL = StringParam("OWNER_EMAIL")  # set in functions/.env
SEED_PROFILE = Path(__file__).with_name("quien-soy.md")  # git-ignored, private

# Llama 3 was retired from Groq's free tier (Aug 2026); these are the vendor-recommended replacements.
GROQ_MODEL = "openai/gpt-oss-120b"
MAX_ENTRY_CHARS = 20_000
PATTERN_ENTRIES = 30
# shortcut: Groq free tier caps at 8k tokens/minute and the profile (~3.3k) rides along on every call,
# so the oldest text is dropped past this; raise on a paid tier.
MAX_JOURNAL_CHARS = 10_000
MAX_PROFILE_CHARS = 30_000
MAX_PROFILE_EDITS = 3
USER_TZ = timezone(timedelta(hours=-5))  # Colombia has no DST, so a fixed offset is exact

# Memory: each entry's meaning as a vector (Vertex AI, billed to this project, no extra key), searched in Firestore.
EMBED_MODEL = "gemini-embedding-001"
EMBED_DIMS = 768  # must match the vector index in firestore.indexes.json
MEMORY_RECALLS = 3
# shortcut: cutoff picked from a few Spanish test pairs (related ~0.84, unrelated ~0.64 similarity); tune on real entries.
MEMORY_MAX_DISTANCE = 0.3

PROFILE_CONTEXT = (
    "Antes del texto recibirás <perfil>, el documento \"Quién soy\" de la persona, escrito en primera persona. "
    "Úsalo solo para entenderla y hablarle de forma personal; no recites detalles privados que no vengan al caso."
)

DAILY_PROMPT = """Eres Umi, un oyente cálido dentro de un diario personal. """ + PROFILE_CONTEXT + """
Puede venir también <recuerdos>: entradas pasadas suyas, con fecha, que hablan de algo parecido. Si alguna de verdad se relaciona con la de hoy, conéctala con cariño en aiResponse mencionando cuándo fue; si no, ignóralas.
Lee la <entrada> (su atributo fecha es el día del que habla; si no es hoy, no digas "hoy") y responde SOLO con este JSON:
{"moodScore": int, "primaryEmotions": [str], "keyTopics": [str], "detectedGoals": [str], "aiResponse": str, "summary": str, "profileEdits": [{"find": str, "replace": str}]}

- moodScore: 1-10 según el ánimo que expresa la persona (1 muy mal, 5 neutro, 10 muy bien).
- primaryEmotions: hasta 3 emociones, una palabra cada una, en minúscula (ej. "ansiedad", "alivio").
- keyTopics: hasta 3 temas de 1-3 palabras (ej. "trabajo", "relación con mamá").
- detectedGoals: solo metas o intenciones que la persona menciona; [] si no hay. No inventes.
- aiResponse: 2-4 frases en español, tuteando. Valida lo que siente con sus propias palabras, sin juzgar, sin sermonear, sin diagnosticar y sin consejos no pedidos. Puedes cerrar con una pregunta suave. Si hay señales de riesgo para su vida, anímala con cariño a hablar hoy con alguien de confianza o una línea de ayuda local.
- summary: 1-2 frases en primera persona con los hechos concretos de la entrada (qué pasó, con quién, qué decidí o planeo), sin interpretar. Conserva nombres, lugares y cifras.
- profileEdits: actualiza el perfil solo si la entrada revela un hecho duradero nuevo o que cambió (un logro, una decisión, un cambio de situación, una persona importante, una meta nueva o cumplida). Sé fiel a lo que dice la entrada, sin exagerar ni adelantar resultados. Nunca registres el ánimo del día ni borres secciones. Cada cambio: "find" es texto copiado EXACTO de una línea del perfil y "replace" es el texto nuevo, en primera persona y con el mismo estilo. Para agregar, usa una línea existente como "find" y pon en "replace" esa misma línea más la nueva. Máximo 3; casi siempre será [].

Todo el texto del JSON va en español."""

PATTERNS_PROMPT = """Eres Umi, un acompañante con formación en psicología que lee el diario de una persona. """ + PROFILE_CONTEXT + """
Después recibirás sus entradas en orden cronológico, ya analizadas: fecha, ánimo (1-10), emociones, temas, metas y un resumen de los hechos.
Escribe en español, tuteando, con tono gentil y cercano, en Markdown y en no más de 450 palabras, con estas secciones:

## Cómo has estado
Tendencia del ánimo en el tiempo; menciona fechas o cambios concretos.
## Lo que más aparece
Temas y emociones que se repiten y cómo se relacionan.
## Tus metas
Avances o tropiezos en lo que te propusiste; si no hay metas, dilo en una frase.
## Una idea para llevarte
Una sola observación constructiva y práctica, basada en lo que escribió.

Sé específico: usa hechos, nombres, fechas y frases concretas de lo que recibes, y relaciónalos con lo que dice su perfil (sus metas, sus tensiones, las personas importantes). Evita frases genéricas que servirían para cualquier persona. No inventes hechos ni atribuyas a una fecha algo que no aparece en ella. Habla de patrones observados, no de diagnósticos. Si hay pocas entradas, dilo y sé breve."""


HORIZON_REPORTS = 8

HORIZON_PROMPT = """Eres Umi, un acompañante con formación en psicología. """ + PROFILE_CONTEXT + """
Después recibirás, en orden cronológico, los informes de patrones que fuiste escribiendo sobre el diario de una persona.
Escribe en español, tuteando, con tono gentil y cercano, en Markdown y en no más de 500 palabras, con estas secciones:

## Tu recorrido
Cómo ha cambiado su ánimo y su vida entre el primer informe y el último; menciona fechas.
## Lo que se mantiene
Temas o emociones que siguen presentes a lo largo del tiempo.
## Lo que has logrado
Avances, fortalezas y metas cumplidas, por pequeños que sean.
## Hacia dónde mirar
Una o dos sugerencias suaves y concretas para la siguiente etapa.

Sé específico: usa hechos, nombres, fechas y frases concretas de lo que recibes, y relaciónalos con lo que dice su perfil (sus metas, sus tensiones, las personas importantes). Evita frases genéricas que servirían para cualquier persona. No inventes hechos ni atribuyas a una fecha algo que no aparece en ella. Habla de patrones observados, no de diagnósticos. Si solo hay un informe, dilo y sé breve."""


def _ask_groq(system: str, user: str, effort: str, **kwargs) -> str:
    from groq import APIError, Groq, RateLimitError

    try:
        completion = Groq(api_key=GROQ_API_KEY.value).chat.completions.create(
            model=GROQ_MODEL,
            reasoning_effort=effort,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            **kwargs,
        )
    except RateLimitError as e:
        raise https_fn.HttpsError(
            https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED, "Umi necesita un minuto. Inténtalo de nuevo en un momento."
        ) from e
    except APIError as e:  # outage, timeout or bad response, after the SDK's own retries
        logger.error(f"Groq failed: {e}")
        raise https_fn.HttpsError(
            https_fn.FunctionsErrorCode.UNAVAILABLE, "Umi no pudo conectarse. Inténtalo de nuevo."
        ) from e
    return completion.choices[0].message.content or ""


def _embed(text: str) -> list[float]:
    from google import genai
    from google.genai import types

    result = genai.Client(vertexai=True, project=PROJECT_ID.value, location="us-central1").models.embed_content(
        model=EMBED_MODEL,
        contents=text[:8000],  # the model reads ~2k tokens; the start carries the meaning
        config=types.EmbedContentConfig(task_type="SEMANTIC_SIMILARITY", output_dimensionality=EMBED_DIMS),
    )
    return result.embeddings[0].values


def _memory_doc(day: str, text: str, vector: list[float]) -> dict:
    from google.cloud.firestore_v1.vector import Vector

    return {"embedding": Vector(vector), "day": day, "text": text}


def _backfill_memories(user_ref) -> None:
    """First run only: entries written before memory existed get their vector too."""
    # shortcut: one batch holds 500 writes; split it if the diary ever passes 500 entries before this runs.
    batch = firestore.client().batch()
    for snap in user_ref.collection("entries").stream():
        e = snap.to_dict()
        text = e.get("summary") or e["rawText"][:600]
        batch.set(user_ref.collection("memories").document(snap.id), _memory_doc(_day(e["createdAt"]), text, _embed(e["rawText"])))
    batch.commit()


def _recall(user_ref, vector: list[float]) -> list[dict]:
    """Past entries closest in meaning to the new one, oldest first."""
    from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
    from google.cloud.firestore_v1.vector import Vector

    memories = user_ref.collection("memories")
    if not any(memories.limit(1).stream()):
        _backfill_memories(user_ref)
    docs = memories.find_nearest(
        vector_field="embedding",
        query_vector=Vector(vector),
        distance_measure=DistanceMeasure.COSINE,
        limit=MEMORY_RECALLS,
        distance_threshold=MEMORY_MAX_DISTANCE,
    ).get()
    return sorted((d.to_dict() for d in docs), key=lambda m: m["day"])


def _profile_ref(uid: str):
    return firestore.client().collection("users").document(uid).collection("profile").document("main")


def _with_profile(profile: str, text: str) -> str:
    return f"<perfil>\n{profile or '(vacío)'}\n</perfil>\n\n{text}"


def apply_profile_edits(profile: str, edits: list[dict]) -> tuple[str, list[dict]]:
    """Applies the model's find/replace edits; anything that doesn't match exactly one spot is skipped."""
    applied = []
    for edit in edits[:MAX_PROFILE_EDITS]:
        find, replace = edit.get("find"), edit.get("replace")
        if not isinstance(find, str) or not isinstance(replace, str) or not find.strip():
            continue
        if profile.count(find) != 1 or len(replace) > 2_000:
            continue
        profile = profile.replace(find, replace)
        applied.append({"find": find, "replace": replace})
    return profile, applied


def newest_that_fit(blocks: list[str], limit: int) -> list[str]:
    """Keeps whole blocks (oldest first in, oldest first out), dropping the oldest ones past limit chars."""
    kept, size = [], 0
    for block in reversed(blocks):
        size += len(block) + 2
        if size > limit and kept:
            break
        kept.append(block)
    return kept[::-1]


def _save_report(uid: str, kind: str, report: str, sources: int) -> dict:
    """Stores a report under users/{uid}/{kind}; the frontend reads them live."""
    ref = firestore.client().collection("users").document(uid).collection(kind).document()
    ref.set({"report": report, "sources": sources, "createdAt": firestore.SERVER_TIMESTAMP})
    return {"id": ref.id, "report": report}


def _latest(uid: str, kind: str, n: int) -> list[dict]:
    """Last n docs of a user's subcollection, oldest first so they read as a timeline."""
    docs = (
        firestore.client()
        .collection("users").document(uid).collection(kind)
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .limit(n)
        .stream()
    )
    return [d.to_dict() for d in docs][::-1]


def _require_uid(req: https_fn.CallableRequest) -> str:
    """Umi is a private diary: only the verified owner account may use it."""
    if req.auth is None:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.UNAUTHENTICATED, "Debes iniciar sesión.")
    token = req.auth.token
    if not token.get("email_verified") or token.get("email") != OWNER_EMAIL.value:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.PERMISSION_DENIED, "Umi es un diario privado.")
    return req.auth.uid


def _day(moment: datetime) -> str:
    return f"{moment.astimezone(USER_TZ):%Y-%m-%d}"


def entry_day(value, now: datetime) -> date:
    """The day an entry belongs to: today by default, or a past day the user picked. Never the future."""
    today = now.astimezone(USER_TZ).date()
    if not value:
        return today
    try:
        day = date.fromisoformat(value)
    except (TypeError, ValueError):
        day = None
    if day is None or day.year < 2000:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "La fecha no es válida.")
    if day > today:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "No puedes escribir en una fecha futura.")
    return day


def _strings(value, limit: int | None = None) -> list[str]:
    items = [str(v).strip() for v in value if str(v).strip()] if isinstance(value, list) else []
    items = list(dict.fromkeys(items))  # the model sometimes repeats a tag
    return items[:limit] if limit else items


def parse_analysis(raw: str) -> dict:
    """Coerce the LLM's JSON into the exact entry schema; the model output is untrusted."""
    data = json.loads(raw)
    try:
        mood = int(round(float(data.get("moodScore", 5))))
    except (TypeError, ValueError):
        mood = 5
    return {
        "moodScore": min(10, max(1, mood)),
        "primaryEmotions": _strings(data.get("primaryEmotions"), 3),
        "keyTopics": _strings(data.get("keyTopics"), 3),
        "detectedGoals": _strings(data.get("detectedGoals")),
        "aiResponse": str(data.get("aiResponse", "")).strip(),
        "summary": str(data.get("summary", "")).strip(),
    }


@https_fn.on_call(secrets=[GROQ_API_KEY], timeout_sec=120)  # the first run also backfills memory
def analyze_daily_entry(req: https_fn.CallableRequest) -> dict:
    uid = _require_uid(req)
    text = (req.data or {}).get("rawText")
    if not isinstance(text, str) or not text.strip():
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "La entrada está vacía.")
    if len(text) > MAX_ENTRY_CHARS:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "La entrada es demasiado larga.")
    now = datetime.now(timezone.utc)
    day = entry_day((req.data or {}).get("entryDate"), now)
    backdated = day != now.astimezone(USER_TZ).date()

    db = firestore.client()
    user_ref = db.collection("users").document(uid)
    profile_ref = _profile_ref(uid)
    profile_snap = _profile_snap(req)
    profile = (profile_snap.to_dict() or {}).get("text", "") if profile_snap.exists else ""

    vector, memories = None, []
    try:
        vector = _embed(text)
        memories = _recall(user_ref, vector)
    except Exception:  # memory is a bonus: never lose an entry over it
        logger.exception("memory unavailable")

    prompt = f'<entrada fecha="{day.isoformat()}">\n{text}\n</entrada>'
    if memories:
        recalled = "\n\n".join(f"### {m['day']}\n{m['text']}" for m in memories)
        prompt = f"<recuerdos>\n{recalled}\n</recuerdos>\n\n{prompt}"
    raw = _ask_groq(DAILY_PROMPT, _with_profile(profile, prompt), "low", response_format={"type": "json_object"})
    try:
        analysis = parse_analysis(raw)
        edits = json.loads(raw).get("profileEdits")
    except (json.JSONDecodeError, AttributeError) as e:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INTERNAL, "La IA devolvió una respuesta inválida.") from e

    entry_ref = user_ref.collection("entries").document()
    new_profile, applied = apply_profile_edits(profile, edits if isinstance(edits, list) else [])
    entry = {"rawText": text, "createdAt": firestore.SERVER_TIMESTAMP, **analysis}
    if backdated:
        # End of the picked day keeps it after that day's other entries in every createdAt-ordered view.
        entry |= {"createdAt": datetime.combine(day, time(23, 59, 59), USER_TZ), "writtenAt": firestore.SERVER_TIMESTAMP}

    def save(with_edits: bool) -> None:
        """Entry, memory and profile edits land together or not at all."""
        batch = db.batch()
        batch.set(entry_ref, {**entry, "profileEdits": len(applied) if with_edits else 0})
        if vector:
            memory_text = analysis["summary"] or text[:600]
            batch.set(user_ref.collection("memories").document(entry_ref.id), _memory_doc(day.isoformat(), memory_text, vector))
        if with_edits:
            # Only if nobody edited the profile while Umi was thinking; otherwise their edit wins.
            batch.update(
                profile_ref,
                {"text": new_profile, "updatedAt": firestore.SERVER_TIMESTAMP},
                option=db.write_option(last_update_time=profile_snap.update_time),
            )
            batch.set(
                user_ref.collection("profileChanges").document(),
                {"edits": applied, "entryId": entry_ref.id, "createdAt": firestore.SERVER_TIMESTAMP},
            )
        batch.commit()

    from google.api_core.exceptions import FailedPrecondition

    try:
        save(with_edits=bool(applied))
    except FailedPrecondition:
        applied = []
        save(with_edits=False)
    return {"id": entry_ref.id, "profileEdits": len(applied), **analysis}


@https_fn.on_call()
def save_profile(req: https_fn.CallableRequest) -> dict:
    uid = _require_uid(req)
    text = (req.data or {}).get("text")
    if not isinstance(text, str):
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "El perfil debe ser texto.")
    if len(text) > MAX_PROFILE_CHARS:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "El perfil es demasiado largo.")
    _profile_ref(uid).set({"text": text, "updatedAt": firestore.SERVER_TIMESTAMP})
    return {"ok": True}


def _profile_snap(req: https_fn.CallableRequest):
    """The user's profile doc. The owner's starts as the bundled quien-soy.md so Umi knows them from day one."""
    ref = _profile_ref(req.auth.uid)
    snap = ref.get()
    if not snap.exists and SEED_PROFILE.exists():  # _require_uid already limits callers to the owner
        from google.api_core.exceptions import AlreadyExists

        try:
            ref.create({"text": SEED_PROFILE.read_text(encoding="utf-8"), "updatedAt": firestore.SERVER_TIMESTAMP})
        except AlreadyExists:
            pass  # another call seeded it first
        snap = ref.get()
    return snap


def _profile_text(req: https_fn.CallableRequest) -> str:
    snap = _profile_snap(req)
    return (snap.to_dict() or {}).get("text", "") if snap.exists else ""


@https_fn.on_call()
def ensure_profile(req: https_fn.CallableRequest) -> dict:
    _require_uid(req)
    _profile_snap(req)  # the page reads the doc live, so seeding it is enough
    return {"ok": True}


def entry_digest(e: dict) -> str:
    """Compact form of an analyzed entry, so Patterns fits all 30 entries instead of re-reading the raw text."""
    lines = [f"### {_day(e['createdAt'])} (ánimo {e.get('moodScore', '?')}/10)"]
    for label, key in (("Emociones", "primaryEmotions"), ("Temas", "keyTopics"), ("Metas", "detectedGoals")):
        if e.get(key):
            lines.append(f"{label}: {', '.join(e[key])}")
    # Entries saved before summaries existed fall back to the start of their text.
    lines.append(e.get("summary") or e.get("rawText", "")[:600])
    return "\n".join(lines)


@https_fn.on_call(secrets=[GROQ_API_KEY], timeout_sec=120)
def generate_patterns(req: https_fn.CallableRequest) -> dict:
    uid = _require_uid(req)
    entries = _latest(uid, "entries", PATTERN_ENTRIES)
    if not entries:
        raise https_fn.HttpsError(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "Escribe al menos una entrada en tu diario primero."
        )
    digests = newest_that_fit([entry_digest(e) for e in entries], MAX_JOURNAL_CHARS)
    report = _ask_groq(PATTERNS_PROMPT, _with_profile(_profile_text(req), "\n\n".join(digests)), "low")
    if not report:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INTERNAL, "No se pudo generar el informe.")
    return _save_report(uid, "patterns", report, len(digests))


@https_fn.on_call(secrets=[GROQ_API_KEY], timeout_sec=120)
def generate_horizon(req: https_fn.CallableRequest) -> dict:
    uid = _require_uid(req)
    reports = _latest(uid, "patterns", HORIZON_REPORTS)
    if not reports:
        raise https_fn.HttpsError(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "Genera al menos un informe de patrones primero."
        )
    history = newest_that_fit(
        [f"# Informe del {_day(r['createdAt'])}\n{r['report']}" for r in reports], MAX_JOURNAL_CHARS
    )
    report = _ask_groq(HORIZON_PROMPT, _with_profile(_profile_text(req), "\n\n".join(history)), "low")
    if not report:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INTERNAL, "No se pudo generar el horizonte.")
    return _save_report(uid, "horizons", report, len(history))
