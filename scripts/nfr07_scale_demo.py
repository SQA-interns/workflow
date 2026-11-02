#!/usr/bin/env python3
"""NFR-07 runtime demonstration (not a test).

Seeds one Workspace with 10,000 Contacts in the running Compose stack, then measures through the
real stack (nginx -> backend -> PostgreSQL):
  * list, search and filter requests: 95th percentile must be <= 500 ms;
  * an Export of all 10,000 Contacts must finish within 10 s.

Usage: docker compose up -d --wait && python3 scripts/nfr07_scale_demo.py
"""
import json
import random
import statistics
import subprocess
import sys
import time
import unicodedata
import urllib.request
import uuid

BASE = "http://localhost:8080"
EMULATOR = "http://localhost:9099"
API_KEY = "demo-api-key"
COUNT = 10_000
SAMPLES = 50

FIRST = ["Ana", "Bor", "Cvetka", "Saša", "Žiga", "Špela", "Matej", "Nina", "Luka", "Đurđa", "Tina", "Urban", "Maja", "Rok", "Eva"]
LAST = ["Novak", "Horvat", "Kovačič", "Krajnc", "Zupančič", "Potočnik", "Kos", "Vidmar", "Golob", "Turk", "Božič", "Kralj", "Zupan"]
COMPANIES = ["Krka", "Petrol", "Gorenje", "Mercator", "Lek", "Telekom", "Elektro", "Kolektor", "Hidria", "Pošta"]
CITIES = ["Ljubljana", "Maribor", "Celje", "Kranj", "Koper", "Novo mesto", "Velenje", "Ptuj"]
COUNTRIES = ["SI", "SI", "SI", "AT", "HR", "IT"]


def request(method, url, token=None, body=None, raw=False):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as res:
        payload = res.read()
        return payload if raw else json.loads(payload or b"null")


def norm(s):
    if s is None:
        return None
    n = unicodedata.normalize("NFD", s)
    n = "".join(ch for ch in n if not unicodedata.category(ch).startswith("M"))
    n = n.replace("đ", "d").replace("Đ", "D").lower()
    return " ".join(n.split())


def search_text(first, last, email, phone, company, city):
    parts = [norm(first), norm(last), norm(first + " " + last), norm(email), norm(phone),
             "".join(ch for ch in phone if ch.isdigit() or ch == "+"), norm(company), norm(city)]
    return "".join("\x01" + p for p in parts if p)


def tsv(v):
    if v is None:
        return "\\N"
    return str(v).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n")


def psql(sql_and_data):
    subprocess.run(["docker", "compose", "exec", "-T", "db", "psql", "-q", "-v", "ON_ERROR_STOP=1", "-U", "contacts", "-d", "contacts"],
                   input=sql_and_data.encode(), check=True)


def main():
    email = f"nfr07.{int(time.time())}@example.si"
    signup = request("POST", f"{EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
                     body={"email": email, "password": "geslo-123456", "returnSecureToken": True})
    token = signup["idToken"]
    me = request("GET", f"{BASE}/api/me", token)
    ws = request("POST", f"{BASE}/api/workspaces", token, {"name": "NFR-07 10000 kontaktov"})
    wid = ws["id"]
    print(f"Workspace {wid}; seeding {COUNT} Contacts ...")

    rnd = random.Random(7)
    tags = {f"oznaka{i}": str(uuid.uuid4()) for i in range(10)}
    contacts, attrs, ctags, revs = [], [], [], []
    for i in range(COUNT):
        cid = str(uuid.uuid4())
        first, last = rnd.choice(FIRST), rnd.choice(LAST) + ("" if i % 7 else f"-{i}")
        email_c = f"{norm(first)}.{norm(last).replace(' ', '')}.{i}@example.si"
        phone = f"+386 41 {i:06d}"
        company, city, country = rnd.choice(COMPANIES), rnd.choice(CITIES), rnd.choice(COUNTRIES)
        contact_tags = rnd.sample(list(tags), 2)
        attributes = [("kompetenca", rnd.choice(["web", "dizajn", "prodaja"])), ("leto", str(2000 + i % 25))]
        contacts.append([cid, wid, 1, "f", first, last, email_c, phone, company, city, country,
                         search_text(first, last, email_c, phone, company, city), email_c.lower(),
                         "+" + "".join(ch for ch in phone if ch.isdigit()), f"{norm(first)} {norm(last)}",
                         norm(last), norm(first), norm(company)])
        for p, (k, v) in enumerate(attributes):
            attrs.append([cid, p, k, k.lower(), v])
        for p, t in enumerate(contact_tags):
            ctags.append([cid, tags[t], p])
        state = {"firstName": first, "lastName": last, "email": email_c, "phone": phone, "company": company,
                 "jobTitle": None, "street": None, "postalCode": None, "city": city, "country": country, "note": None,
                 "attributes": [{"key": k, "value": v} for k, v in attributes], "tags": contact_tags,
                 "deleted": False, "mergedInto": None}
        revs.append([cid, wid, 1, "CREATE", me["id"], json.dumps(state, ensure_ascii=False)])

    def copy(table, cols, rows):
        return f"COPY {table} ({cols}) FROM STDIN;\n" + "".join("\t".join(tsv(v) for v in r) + "\n" for r in rows) + "\\.\n"

    script = "BEGIN;\n"
    script += copy("tags", "id, workspace_id, name, name_lower", [[tid, wid, name, name] for name, tid in tags.items()])
    script += copy("contacts", "id, workspace_id, version, deleted, first_name, last_name, email, phone, company, city, country,"
                   " search_text, email_norm, phone_norm, name_norm, sort_last, sort_first, sort_company", contacts)
    script += copy("contact_attributes", "contact_id, position, key, key_lower, value", attrs)
    script += copy("contact_tags", "contact_id, tag_id, position", ctags)
    script += copy("revisions", "contact_id, workspace_id, number, type, author_id, state", revs)
    script += "COMMIT;\nANALYZE contacts; ANALYZE contact_tags; ANALYZE contact_attributes;\n"
    psql(script)

    base = f"{BASE}/api/workspaces/{wid}/contacts"
    scenarios = {
        "list (first page)": "?size=20",
        "list (page 200, sort by company)": "?size=20&page=200&sort=company",
        "search 'kovacic'": "?q=kovacic",
        "search 'sasa novak'": "?q=sasa%20novak",
        "filter tags (all) + country + search": "?tag=oznaka1&tag=oznaka2&country=SI&q=ana",
        "filter attribute + company": "?attr=kompetenca%3Dweb&company=Krka",
    }
    ok = True
    total = request("GET", base + "?size=1", token)["total"]
    print(f"Contacts in Workspace: {total}")
    for name, query in scenarios.items():
        times = []
        for _ in range(SAMPLES // 2 if len(scenarios) * SAMPLES > 280 else SAMPLES):
            t = time.perf_counter()
            request("GET", base + query, token)
            times.append((time.perf_counter() - t) * 1000)
        times.sort()
        p95 = times[max(0, int(round(0.95 * len(times))) - 1)]
        verdict = "OK" if p95 <= 500 else "TOO SLOW"
        ok &= p95 <= 500
        print(f"  {name:42s} n={len(times):3d}  median={statistics.median(times):7.1f} ms  p95={p95:7.1f} ms  {verdict}")

    t = time.perf_counter()
    xlsx = request("POST", f"{BASE}/api/workspaces/{wid}/export", token, {"filter": {}}, raw=True)
    seconds = time.perf_counter() - t
    ok &= seconds <= 10
    print(f"  Export of all {total} Contacts: {seconds:.2f} s, {len(xlsx) / 1024:.0f} KiB  {'OK' if seconds <= 10 else 'TOO SLOW'}")
    print("NFR-07 met" if ok else "NFR-07 NOT met")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
