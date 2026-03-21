#!/usr/bin/env python3
"""
Vendetta Weekly Report Generator
Compares snapshots from the last 7 days, computes stats,
calls the Anthropic API for a Roaring Twenties newspaper article,
and writes weekly_report.json.

Requires: ANTHROPIC_API_KEY environment variable
"""

import json, os, glob, sys, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

SNAPSHOTS_DIR    = "snapshots"
HQ_CAPTURES_FILE = "hq_captures.json"
REPORT_FILE      = "weekly_report.json"
ANTHROPIC_API    = "https://api.anthropic.com/v1/messages"
MODEL            = "claude-sonnet-4-20250514"

# ── LOAD SNAPSHOTS FROM LAST 7 DAYS ──────────────────────────────────────────
now_utc   = datetime.now(timezone.utc)
cutoff    = now_utc - timedelta(days=7)

all_snaps = sorted(glob.glob(f"{SNAPSHOTS_DIR}/data_*.json"))
week_snaps = []
for path in all_snaps:
    ts_str = os.path.basename(path)[5:-5]
    try:
        dt = datetime.strptime(ts_str, "%Y-%m-%d_%H%M").replace(tzinfo=timezone.utc)
        if dt >= cutoff:
            week_snaps.append((dt, path))
    except ValueError:
        continue

if len(week_snaps) < 2:
    print("Not enough snapshots in the last 7 days to generate a report.")
    sys.exit(0)

week_snaps.sort(key=lambda x: x[0])  # oldest first
dt_oldest, path_oldest = week_snaps[0]
dt_newest, path_newest = week_snaps[-1]

print(f"Comparing {len(week_snaps)} snapshots: {dt_oldest.date()} → {dt_newest.date()}")

def load_snap(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

snap_old = load_snap(path_oldest)
snap_new = load_snap(path_newest)

# ── TURF STATS ────────────────────────────────────────────────────────────────
def player_map(snap):
    return {p["pid"]: p for p in snap.get("players", [])}

old_players = player_map(snap_old)
new_players = player_map(snap_new)

all_pids = set(old_players) | set(new_players)

changes = []
for pid in all_pids:
    old_p = old_players.get(pid)
    new_p = new_players.get(pid)
    old_tiles = old_p["tiles"] if old_p else 0
    new_tiles = new_p["tiles"] if new_p else 0
    net = new_tiles - old_tiles
    name = (new_p or old_p).get("name") or "[unknown]"
    changes.append({"pid": pid, "name": name, "old": old_tiles, "new": new_tiles, "net": net})

gainers   = sorted([c for c in changes if c["net"] > 0],  key=lambda x: -x["net"])[:10]
losers    = sorted([c for c in changes if c["net"] < 0],  key=lambda x:  x["net"])[:10]
newcomers = [c for c in changes if c["old"] == 0 and c["new"] > 0]
vanished  = [c for c in changes if c["old"] > 0 and c["new"] == 0]

total_old = snap_old.get("total_tiles", 0) - snap_old.get("unclaimed", 0)
total_new = snap_new.get("total_tiles", 0) - snap_new.get("unclaimed", 0)
player_count_old = len(old_players)
player_count_new = len(new_players)

# ── HQ CAPTURES THIS WEEK ─────────────────────────────────────────────────────
try:
    with open(HQ_CAPTURES_FILE, encoding="utf-8") as f:
        all_captures = json.load(f)
except Exception:
    all_captures = []

week_captures = [
    c for c in all_captures
    if datetime.fromisoformat(c["timestamp"]) >= cutoff
]

# Count captures per attacker
hq_cap_count = {}
for c in week_captures:
    hq_cap_count[c["new_name"] or c["new_pid"][:8]] = \
        hq_cap_count.get(c["new_name"] or c["new_pid"][:8], 0) + 1
top_hq_capturers = sorted(hq_cap_count.items(), key=lambda x: -x[1])[:5]

# Count losses per victim
hq_loss_count = {}
for c in week_captures:
    hq_loss_count[c["prev_name"] or c["prev_pid"][:8]] = \
        hq_loss_count.get(c["prev_name"] or c["prev_pid"][:8], 0) + 1
top_hq_victims = sorted(hq_loss_count.items(), key=lambda x: -x[1])[:5]

# ── BUILD STATS SUMMARY ───────────────────────────────────────────────────────
def fmt_list(items, key_name="name", val_name="net", prefix="+"):
    lines = []
    for it in items:
        name = it[key_name] if isinstance(it, dict) else it[0]
        val  = it[val_name] if isinstance(it, dict) else it[1]
        sign = "+" if val > 0 else ""
        lines.append(f"  - {name}: {sign}{val} turfs")
    return "\n".join(lines) if lines else "  (none)"

stats_text = f"""
WEEK: {dt_oldest.strftime('%B %d')} – {dt_newest.strftime('%B %d, %Y')}

TERRITORY OVERVIEW
- Occupied turfs at start of week: {total_old:,}
- Occupied turfs at end of week:   {total_new:,}
- Net change: {total_new - total_old:+,} turfs
- Active players at start: {player_count_old}
- Active players at end:   {player_count_new}

TOP GAINERS (turfs claimed this week):
{fmt_list(gainers)}

TOP LOSERS (turfs lost this week):
{fmt_list(losers)}

NEW PLAYERS APPEARING THIS WEEK ({len(newcomers)} total):
{chr(10).join(f"  - {c['name']} ({c['new']} turfs)" for c in newcomers[:8]) or "  (none)"}

PLAYERS WHO VANISHED THIS WEEK ({len(vanished)} total):
{chr(10).join(f"  - {c['name']} (had {c['old']} turfs)" for c in vanished[:8]) or "  (none)"}

HQ CAPTURES THIS WEEK: {len(week_captures)} total
Recent captures:
{chr(10).join(f"  - {c['new_name'] or '[unknown]'} stormed {c['prev_name'] or '[unknown]'}'s HQ ({c['timestamp'][:10]})" for c in week_captures[-10:]) or "  (none)"}

MOST FEARED ATTACKERS (HQ captures):
{chr(10).join(f"  - {name}: {cnt} HQ(s) captured" for name, cnt in top_hq_capturers) or "  (none)"}

MOST TARGETED BOSSES (HQ losses):
{chr(10).join(f"  - {name}: lost HQ {cnt} time(s)" for name, cnt in top_hq_victims) or "  (none)"}
""".strip()

print("Stats computed. Calling Anthropic API...")
print(stats_text)

# ── CALL ANTHROPIC API ────────────────────────────────────────────────────────
api_key = os.environ.get("ANTHROPIC_API_KEY", "")
if not api_key:
    print("ERROR: ANTHROPIC_API_KEY not set.")
    sys.exit(1)

prompt = f"""You are the editor of THE VENDETTA GAZETTE, a sensationalist criminal underworld newspaper written in the style of the 1920s Roaring Twenties. Write a dramatic, entertaining front-page newspaper article based on the following weekly statistics from the criminal territory wars of Vendetta City.

Rules:
- Write in authentic 1920s newspaper prose: florid, dramatic, with colourful nicknames and underworld slang
- Use real player names from the data as criminal bosses, gang leaders and mob figures
- Invent vivid 1920s nicknames where it adds flavour (e.g. "Wu-Tang, the Iron Fist of the East Side")
- Cover the top stories: biggest territorial gains, dramatic HQ raids, rising newcomers, fallen bosses
- Include a "SPECIAL BULLETIN" sidebar for the most dramatic HQ capture of the week if one occurred
- End with a short "POLICE BLOTTER" section with 2–3 humorous one-liners about minor incidents
- Output clean HTML only — no markdown, no code fences, no explanatory text outside the article
- Use these HTML elements for structure: <h1> for the newspaper name, <h2> for the date/edition line, <h3> for article headlines, <p> for body text, <blockquote> for sidebar/bulletin, <hr> for section dividers, <em> and <strong> for emphasis
- Keep the total length to roughly 600–900 words of body text

WEEKLY STATISTICS:
{stats_text}
"""

payload = json.dumps({
    "model":      MODEL,
    "max_tokens": 2000,
    "messages":   [{"role": "user", "content": prompt}]
}).encode("utf-8")

req = urllib.request.Request(
    ANTHROPIC_API,
    data=payload,
    headers={
        "Content-Type":      "application/json",
        "x-api-key":         api_key,
        "anthropic-version": "2023-06-01",
    }
)

try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"API error {e.code}: {body}")
    sys.exit(1)

article_html = ""
for block in result.get("content", []):
    if block.get("type") == "text":
        article_html += block["text"]

if not article_html.strip():
    print("ERROR: Empty response from API.")
    sys.exit(1)

print("Article generated successfully.")

# ── SAVE REPORT ───────────────────────────────────────────────────────────────
report = {
    "generated":    now_utc.isoformat(),
    "period_start": dt_oldest.isoformat(),
    "period_end":   dt_newest.isoformat(),
    "snapshot_count": len(week_snaps),
    "html":         article_html,
    "stats": {
        "total_tiles_start": total_old,
        "total_tiles_end":   total_new,
        "hq_captures":       len(week_captures),
        "newcomers":         len(newcomers),
        "vanished":          len(vanished),
        "top_gainer":        gainers[0]["name"] if gainers else None,
        "top_gainer_net":    gainers[0]["net"]  if gainers else 0,
    }
}

with open(REPORT_FILE, "w", encoding="utf-8") as f:
    json.dump(report, f, separators=(",", ":"), ensure_ascii=False)

print(f"Report saved to {REPORT_FILE}")
