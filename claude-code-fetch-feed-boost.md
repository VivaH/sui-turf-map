# Uitbreiding fetch_data.py: feed_people timer en boost_production perk opslaan

## Lees eerst
- `fetch_data.py` regels 119–140 (Step 2: Player profiles)
- `fetch_data.py` regels 252–268 (player_list opbouw)

---

## Context

In Step 2 worden Player objecten geladen. De `profiles` dict slaat momenteel op:
`name`, `wallet`, `isInactive`, `hqTile`.

De Player objecten bevatten ook `timers` en `perks` als VecMap velden.
We willen twee extra waarden uitlezen en opslaan:

1. `feed_people` uit `timers` — timestamp (ms) van de volgende feed deadline
2. `boost_production` uit `perks` — timestamp (ms) tot wanneer de boost actief is

---

## Datastructuur (beide zijn VecMaps)

```python
# timers en perks hebben dezelfde structuur:
# f["timers"]["fields"]["contents"] = [
#     {"fields": {"key": "feed_people", "value": "1775937196477"}},
#     {"fields": {"key": "boost_production", "value": "1773002373907"}},
#     ...
# ]

def extract_vecmap(raw):
    """Extract a VecMap fields dict to a flat Python dict."""
    result = {}
    if not isinstance(raw, dict):
        return result
    contents = raw.get("fields", {}).get("contents", [])
    for entry in contents:
        ef = entry.get("fields", {}) if isinstance(entry, dict) else {}
        k = ef.get("key")
        v = ef.get("value")
        if k:
            result[k] = int(v) if v is not None else 0
    return result
```

---

## Wijziging 1 — Step 2: uitlezen in profiles dict

Zoek het blok waar `profiles[pid]` wordt gevuld (regels ~132–137).

Voeg toe:
```python
# Timers
timers = extract_vecmap(f.get("timers"))
# Perks
perks  = extract_vecmap(f.get("perks"))

profiles[pid] = {
    "name":         f.get("player_name", ""),
    "wallet":       f.get("player_address", ""),
    "isInactive":   f.get("is_inactive") in (True, "true"),
    "hqTile":       f.get("headquarter_tile"),
    "feedDeadline": timers.get("feed_people", 0),
    "boostUntil":   perks.get("boost_production", 0),
}
```

Voeg de `extract_vecmap` helper toe vlak boven de Step 2 loop.

---

## Wijziging 2 — player_list opbouw: velden doorgeven

Zoek het blok waar `player_list.append({...})` staat (regels ~259–268).

Voeg twee velden toe:
```python
"feed":  p.get("feedDeadline", 0),   # ms timestamp: next feed deadline
"boost": p.get("boostUntil", 0),     # ms timestamp: boost active until (0 = inactive)
```

---

## Wat de VWM er mee kan doen (ter info, geen code nodig)

- `feed` → spelers met deadline in het verleden markeren als mogelijk inactief
  in de spelerslijst, zonder live fetch
- `boost` → spelers met actieve boost een icoontje geven op de kaart

---

## Vereisten
- Alleen `fetch_data.py` aanpassen
- `extract_vecmap` helper toevoegen vlak boven de Step 2 loop
- Geen andere wijzigingen
- Bump versienummer in `fetch_data.py` als dat aanwezig is, anders overslaan
- Commit message en changelog in het Engels
