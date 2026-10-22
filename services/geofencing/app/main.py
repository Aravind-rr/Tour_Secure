from fastapi import FastAPI, Query
from shapely.geometry import Point, Polygon
from typing import Optional, List, Dict, Any
import json, os

app = FastAPI(title="Geofencing Service")
ZONES_FILE = os.path.join(os.path.dirname(__file__), "zones.json")

def load_zones()->List[Dict[str,Any]]:
    with open(ZONES_FILE, "r") as f:
        raw = json.load(f)
    zones = []
    for z in raw.get("zones", []):
        zones.append({
            "name": z["name"],
            "score": int(z["score"]),
            "polygon": z["polygon"],
            "poly": Polygon(z["polygon"])
        })
    return zones

ZONES = load_zones()

@app.get("/health")
def health():
    return {"status": "ok"}

def score_for_point(lat: float, lon: float):
    p = Point(lon, lat)
    for z in ZONES:
        if z["poly"].contains(p):
            return z["score"], z["name"]
    # distance-based fallback: further from RedZone center => higher score
    red = next((z for z in ZONES if z["name"]=="RedZone"), None)
    red_center = red["poly"].centroid if red else Point(80.28, 13.095)
    dist = p.distance(red_center)
    score = max(20, min(95, 90 - dist*500))
    return int(score), None

@app.get("/score")
def get_score(lat: float = Query(...), lon: float = Query(...)):
    score, zone = score_for_point(lat, lon)
    return {"score": score, "zone": zone}

@app.get("/zones")
def get_zones():
    return {"zones": [{ "name": z["name"], "score": z["score"], "polygon": z["polygon"] } for z in ZONES]}
