#!/usr/bin/env python3
"""
fetch_data.py — Vendetta World Map data fetcher
Fetches all turf + player data from the SUI blockchain and writes data.json
v2.6: added garrison fields (henchman / bouncer / enforcer) per tile
"""

import asyncio, json, os, time, math
from datetime import datetime, timezone
from pathlib import Path
import aiohttp

# ── CONFIG ────────────────────────────────────────────────────────────────────
RPC_ENDPOINTS = [
    "https://rpc.suiet.app",
    "https://fullnode.mainnet.sui.io",
    "https://rpc.ankr.com/sui",
    "https://sui-mainnet.nodereal.io/v1/sui",
    "https://sui-mainnet-endpoint.blockvision.org",
]

TURF_SYSTEM   = "0x372e8fd0e12d2051860553b9e61065729dcddec11970b295bbcf19d7261cc502"
PLAYERS_REG   = "0x84a4a838939db2b6b55e1c3c2cebfb7d30fef5b8f30b4f5e4b24cd2b45a8b494"
TURF_PKG      = "0xa0c4bb412c1d6121c1b6a40954ef76c3b1f75248211209e94726496f46a59ce0"
TURF_TYPE     = f"{TURF_PKG}::iturf::TurfInformation"

BATCH_SIZE    = 50
MAX_RETRIES   = 3
TIMEOUT       = 30
MAX_SNAPSHOTS = 90

OUT_DIR = Path(__file__).parent
SNAP_DIR = OUT_DIR / "snapshots"

# ── RPC HELPER ────────────────────────────────────────────────────────────────
class RPC:
    def __init__(self, session, endpoints):
        self.session   = session
        self.endpoints = endpoints
        self._idx      = 0

    def _next(self):
        ep = self.endpoints[self._idx % len(self.endpoints)]
        self._idx += 1
        return ep

    async def call(self, method, params, retries=MAX_RETRIES):
        payload = {"jsonrpc":"2.0","id":1,"method":method,"params":params}
        for attempt in range(retries):
            ep = self._next()
            try:
                async with self.session.post(
                    ep, json=payload,
                    timeout=aiohttp.ClientTimeout(total=TIMEOUT)
                ) as r:
                    d = await r.json(content_type=None)
                    if "error" in d:
                        raise ValueError(d["error"])
                    return d["result"]
            except Exception as e:
                if attempt == retries - 1:
                    raise
                await asyncio.sleep(1 + attempt)

    async def multi_get_objects(self, ids, options=None):
        if not ids:
            return []
        opts = options or {"showContent": True}
        results = []
        for i in range(0, len(ids), BATCH_SIZE):
            batch = ids[i:i+BATCH_SIZE]
            r = await self.call(
                "sui_multiGetObjects",
                [batch, {"showContent": True, **opts}]
            )
            results.extend(r)
        return results

    async def get_dynamic_fields(self, obj_id, cursor=None):
        params = [obj_id, cursor, 50]
        return await self.call("suix_getDynamicFields", params)

    async def get_all_dynamic_fields(self, obj_id):
        items = []
        cursor = None
        while True:
            r = await self.get_dynamic_fields(obj_id, cursor)
            items.extend(r.get("data", []))
            if not r.get("hasNextPage"):
                break
            cursor = r.get("nextCursor")
        return items

# ── PLAYER FETCHING ───────────────────────────────────────────────────────────
async def fetch_all_players(rpc):
    print("Fetching player registry dynamic fields...")
    fields = await rpc.get_all_dynamic_fields(PLAYERS_REG)
    profile_ids = [f["objectId"] for f in fields if f.get("objectId")]
    print(f"  Found {len(profile_ids)} profile IDs")

    print("Fetching player objects...")
    objs = await rpc.multi_get_objects(profile_ids)
    players = {}
    for obj in objs:
        try:
            c = obj["data"]["content"]["fields"]
            pid = obj["data"]["objectId"]
            players[pid] = {
                "pid":    pid,
                "name":   c.get("name", ""),
                "wallet": c.get("owner", ""),
                "hq":     c.get("hq_tile", None),
            }
        except Exception:
            pass
    print(f"  Parsed {len(players)} players")
    return players

# ── TURF FETCHING ─────────────────────────────────────────────────────────────
async def fetch_all_turfs(rpc):
    print("Fetching turf system dynamic fields...")
    fields = await rpc.get_all_dynamic_fields(TURF_SYSTEM)
    tile_ids = [f["objectId"] for f in fields if f.get("objectId")]
    print(f"  Found {len(tile_ids)} tile IDs")

    print("Fetching tile objects...")
    objs = await rpc.multi_get_objects(tile_ids)
    tiles = []
    for obj in objs:
        try:
            c = obj["data"]["content"]["fields"]
            coord = c.get("coordinates", {}).get("fields", c.get("coordinates", {}))
            x = int(coord.get("x", 0))
            y = int(coord.get("y", 0))
            owner_id = c.get("owner_id", None)
            is_hq    = bool(c.get("is_hq", False))

            # ── GARRISON (v2.6) ──────────────────────────────────────────────
            # Garrison is stored nested under a 'garrison' or 'guard' field.
            # Field names observed on-chain: henchman_count, bouncer_count,
            # enforcer_count. We try several possible paths gracefully.
            g_h = g_b = g_e = 0
            gar = c.get("garrison") or c.get("guard") or {}
            if isinstance(gar, dict):
                gf = gar.get("fields", gar)
                g_h = int(gf.get("henchman_count", gf.get("henchman", 0)) or 0)
                g_b = int(gf.get("bouncer_count",  gf.get("bouncer",   0)) or 0)
                g_e = int(gf.get("enforcer_count", gf.get("enforcer",  0)) or 0)

            if owner_id:
                tile = {"x": x, "y": y, "owner_id": owner_id, "hq": is_hq}
                if g_h or g_b or g_e:          # only include if non-zero
                    tile["g_h"] = g_h
                    tile["g_b"] = g_b
                    tile["g_e"] = g_e
                tiles.append(tile)
        except Exception:
            pass
    print(f"  Parsed {len(tiles)} claimed tiles")
    return tiles

# ── COLOUR GENERATION ─────────────────────────────────────────────────────────
def pid_to_color(pid: str) -> str:
    h = int(pid[-6:], 16) if len(pid) >= 6 else hash(pid)
    hue = (h * 137 + 60) % 360
    return f"hsl({hue},60%,55%)"

# ── BUILD OUTPUT ──────────────────────────────────────────────────────────────
def build_output(players_dict, tiles):
    pid_to_idx = {}
    player_list = []
    tile_counts = {}

    for tile in tiles:
        oid = tile["owner_id"]
        tile_counts[oid] = tile_counts.get(oid, 0) + 1

    # Sort by tile count desc
    sorted_pids = sorted(tile_counts, key=lambda p: -tile_counts[p])

    for pid in sorted_pids:
        info = players_dict.get(pid, {})
        idx  = len(player_list)
        pid_to_idx[pid] = idx
        player_list.append({
            "pid":      pid,
            "name":     info.get("name", ""),
            "wallet":   info.get("wallet", ""),
            "color":    pid_to_color(pid),
            "tiles":    tile_counts[pid],
            "inactive": tile_counts[pid] <= 1,
        })

    out_tiles = []
    for tile in tiles:
        idx = pid_to_idx.get(tile["owner_id"])
        if idx is None:
            continue
        t = {"x": tile["x"], "y": tile["y"], "p": idx}
        if tile.get("hq"):
            t["hq"] = 1
        # Garrison fields — only include when non-zero to keep JSON compact
        if tile.get("g_h"): t["g_h"] = tile["g_h"]
        if tile.get("g_b"): t["g_b"] = tile["g_b"]
        if tile.get("g_e"): t["g_e"] = tile["g_e"]
        out_tiles.append(t)

    total  = len(tiles)
    owned  = len(out_tiles)
    return {
        "generated":   datetime.now(timezone.utc).isoformat(),
        "total_tiles": total,
        "unclaimed":   total - owned,
        "players":     player_list,
        "tiles":       out_tiles,
    }

# ── SNAPSHOT HISTORY ──────────────────────────────────────────────────────────
def update_history(snap_filename, label):
    hist_path = OUT_DIR / "history.json"
    try:
        hist = json.loads(hist_path.read_text())
    except Exception:
        hist = {"snapshots": []}

    snaps = hist.get("snapshots", [])
    # Prepend newest
    snaps.insert(0, {"file": f"snapshots/{snap_filename}", "label": label})
    # Keep max
    snaps = snaps[:MAX_SNAPSHOTS]
    hist["snapshots"] = snaps
    hist_path.write_text(json.dumps(hist, separators=(",", ":")))
    print(f"  History updated ({len(snaps)} snapshots)")

# ── MAIN ──────────────────────────────────────────────────────────────────────
async def main():
    t0 = time.time()
    SNAP_DIR.mkdir(exist_ok=True)

    async with aiohttp.ClientSession() as session:
        rpc = RPC(session, RPC_ENDPOINTS)

        players = await fetch_all_players(rpc)
        tiles   = await fetch_all_turfs(rpc)

    data = build_output(players, tiles)

    # Write data.json
    data_path = OUT_DIR / "data.json"
    data_path.write_text(json.dumps(data, separators=(",", ":")))
    print(f"Wrote {data_path} ({data_path.stat().st_size//1024} KB)")

    # Write snapshot
    now        = datetime.now(timezone.utc)
    label      = now.strftime("%Y-%m-%d %H:%M")
    snap_name  = now.strftime("data_%Y-%m-%d_%H%M.json")
    snap_path  = SNAP_DIR / snap_name
    snap_path.write_text(json.dumps(data, separators=(",", ":")))
    print(f"Wrote snapshot: {snap_name}")

    update_history(snap_name, label)
    print(f"Done in {time.time()-t0:.1f}s — {len(data['players'])} players, {len(data['tiles'])} tiles")

if __name__ == "__main__":
    asyncio.run(main())
