import os
from datetime import date, datetime, timezone
from types import SimpleNamespace

from firebase_functions.https_fn import HttpsError

os.environ["OWNER_EMAIL"] = "duena@example.com"
from main import _require_uid, apply_profile_edits, entry_day, entry_digest, newest_that_fit, parse_analysis


def call_as(email, verified=True):
    return _require_uid(SimpleNamespace(auth=SimpleNamespace(uid="u1", token={"email": email, "email_verified": verified})))


# Only the verified owner gets in: this is the whole privacy model of the app.
assert call_as("duena@example.com") == "u1"
for email, verified in (("otra@example.com", True), ("duena@example.com", False)):
    try:
        call_as(email, verified)
        raise AssertionError(email)
    except HttpsError:
        pass
try:
    _require_uid(SimpleNamespace(auth=None))
    raise AssertionError("anonymous")
except HttpsError:
    pass

assert parse_analysis('{"primaryEmotions": ["ansiedad", "ansiedad", "alivio"]}')["primaryEmotions"] == ["ansiedad", "alivio"]

assert newest_that_fit(["aaaa", "bbbb", "cccc"], 12) == ["bbbb", "cccc"]  # whole blocks only, newest kept
assert newest_that_fit(["a" * 50], 10) == ["a" * 50]  # a lone oversized block still goes through
assert newest_that_fit([], 10) == []

r = parse_analysis('{"moodScore": "11", "primaryEmotions": ["a", "b", "", "c", "d"], "aiResponse": " hola "}')
assert r == {
    "moodScore": 10,
    "primaryEmotions": ["a", "b", "c"],
    "keyTopics": [],
    "detectedGoals": [],
    "aiResponse": "hola",
    "summary": "",
}, r
assert parse_analysis('{"moodScore": "nope"}')["moodScore"] == 5
assert parse_analysis('{"moodScore": -3, "detectedGoals": "not a list"}') == {
    "moodScore": 1, "primaryEmotions": [], "keyTopics": [], "detectedGoals": [], "aiResponse": "", "summary": "",
}
profile = "- Vivo en Cómbita.\n- Promedio: 4.7\n- Promedio de mi primo: 4.7\n"
new, applied = apply_profile_edits(profile, [
    {"find": "- Vivo en Cómbita.", "replace": "- Vivo en Tunja."},  # applied
    {"find": "4.7", "replace": "4.9"},  # ambiguous (2 matches): skipped
    {"find": "no existe", "replace": "x"},  # missing: skipped
    {"find": "", "replace": "x"},  # empty: skipped
    {"find": 3, "replace": "x"},  # wrong type: skipped
])
assert new == profile.replace("Cómbita", "Tunja") and len(applied) == 1, (new, applied)
assert apply_profile_edits("a b c d", [{"find": c, "replace": c.upper()} for c in "abcd"])[0] == "A B C d"  # max 3
utc = timezone.utc
# 03:00 UTC on the 17th is still 22:00 on the 16th in Colombia.
d = entry_digest({"createdAt": datetime(2026, 10, 17, 3, tzinfo=utc), "moodScore": 7, "primaryEmotions": ["alivio"],
                  "keyTopics": [], "summary": "Pasé a la segunda entrevista de Mercury.", "rawText": "largo"})
assert d.splitlines() == ["### 2026-10-16 (ánimo 7/10)", "Emociones: alivio", "Pasé a la segunda entrevista de Mercury."], d
assert entry_digest({"createdAt": datetime(2026, 1, 1, 12, tzinfo=utc), "rawText": "x" * 900}).endswith("x" * 600)

# 3am on the 17th in Colombia: "today" is the 17th, the 16th is allowed, the 18th is not.
now = datetime(2026, 10, 17, 8, tzinfo=utc)
assert entry_day(None, now) == date(2026, 10, 17)
assert entry_day("2026-10-16", now) == date(2026, 10, 16)
for bad in ("2026-10-18", "ayer", "1999-01-01", 5):
    try:
        entry_day(bad, now)
        raise AssertionError(bad)
    except HttpsError:
        pass
print("ok")
