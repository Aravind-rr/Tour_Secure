from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import math

app = FastAPI(title="Anomaly Service")

@app.get("/health")
def health():
    return {"status": "ok"}

class Point(BaseModel):
    lat: float
    lon: float
    t: int  # epoch seconds

class RouteCheck(BaseModel):
    planned: List[Point]
    actual: List[Point]
    max_deviation_m: float = 300.0
    max_gap_seconds: int = 1200

def haversine(p1: Point, p2: Point)->float:
    R = 6371000
    dLat = math.radians(p2.lat - p1.lat)
    dLon = math.radians(p2.lon - p1.lon)
    a = math.sin(dLat/2)**2 + math.cos(math.radians(p1.lat))*math.cos(math.radians(p2.lat))*math.sin(dLon/2)**2
    return 2*R*math.asin(math.sqrt(a))

@app.post("/check")
def check_route(req: RouteCheck):
    alerts = []
    if not req.planned or not req.actual:
        return {"ok": False, "alerts": ["missing data"]}

    for i, a in enumerate(req.actual):
        j = min(i, len(req.planned)-1)
        d = haversine(a, req.planned[j])
        if d > req.max_deviation_m:
            alerts.append(f"Deviation {int(d)}m at t={a.t} (max {int(req.max_deviation_m)})")
    for i in range(1, len(req.actual)):
        if (req.actual[i].t - req.actual[i-1].t) > req.max_gap_seconds:
            alerts.append(f"Inactivity gap {req.actual[i].t - req.actual[i-1].t}s")
    return {"ok": True, "anomalous": len(alerts)>0, "alerts": alerts}
