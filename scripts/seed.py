import json
import sys
import urllib.request

api = sys.argv[1].rstrip("/")

PADDOCKS = [
    [[175.56492171, -37.669798673], [175.564692322, -37.670980814], [175.566673048, -37.671423138], [175.566856512, -37.670155113], [175.56492171, -37.669798673]],
    [[175.568799193, -37.671738681], [175.568463288, -37.672550916], [175.569520311, -37.672578545], [175.569939052, -37.671724439], [175.568799193, -37.671738681]],
]
COLLARS = 12


def call(method, path, body=None):
    req = urllib.request.Request(
        api + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(req) as res:
        return json.load(res)


if call("GET", "/farmers"):
    print("farm data exists, skipping seed")
    sys.exit()

farmer = call("POST", "/farmers", {"name": "Demo Farm", "location": {"lng": 175.5668, "lat": -37.6712}})
base = f"/farmers/{farmer['id']}"
paddocks = [call("POST", f"{base}/paddocks", {"polygon": {"type": "Polygon", "coordinates": [ring]}}) for ring in PADDOCKS]
collars = call("POST", f"{base}/collars", {"count": COLLARS})
call("PATCH", f"{base}/collars", {"collar_ids": [c["id"] for c in collars], "paddock_id": paddocks[0]["id"]})
print(f"seeded Demo Farm: {len(paddocks)} paddocks, {COLLARS} collars")
