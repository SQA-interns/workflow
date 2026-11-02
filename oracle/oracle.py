#!/usr/bin/env python3
"""Hidden oracle of the contacts feature experiment: black-box checks of a finished run through the fixed API
(`02_design/api-contract.md`) and the Firebase Auth Emulator. Never show this file to a run's agent.

Scenario groups:
  R  regression: the base project (every run: normal, greenfield and brownfield)
  I  feature `import`     (runs whose features include import)
  A  feature `activity`   (runs whose features include activity)
A new feature is one function `feature_<name>(ctx)` with its own scenario letter, added to FEATURES at the end of this file.

Phases (restart the backend with the listed settings before each phase):
  main       RATE_LIMIT_PER_MINUTE=10000   -> R01..R31 and the features' scenarios
  ratelimit  RATE_LIMIT_PER_MINUTE=3       -> R32 (the 4th request of one User to one endpoint in a minute gets 429)

Settings (environment variables):
  ORACLE_BASE_URL      backend URL                       default http://127.0.0.1:8080
  ORACLE_AUTH_URL      Firebase Auth Emulator URL        default http://127.0.0.1:9099
  FIREBASE_PROJECT_ID  the run's project id (from .env)  default demo-kontakti

Usage: python3 oracle.py <main|ratelimit> --feature <none|import|activity|import,activity> [--out <file.json>]
Usually started by run.py, which reads the features from the run's run-config.md.
Standard library only (Python 3.10+). Users are created in the emulator; every name the oracle generates is letters
only and carries a random tag, and every scenario works in Workspaces it creates itself, so earlier data never
disturbs the checks.
"""
import base64, io, json, os, random, re, string, sys, time, urllib.error, urllib.parse, urllib.request, uuid, zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

BASE = os.environ.get("ORACLE_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
AUTH_URL = os.environ.get("ORACLE_AUTH_URL", "http://127.0.0.1:9099").rstrip("/")
PROJECT = os.environ.get("FIREBASE_PROJECT_ID") or "demo-kontakti"
IDT = AUTH_URL + "/identitytoolkit.googleapis.com/v1"
TAG = "".join(random.choice(string.ascii_lowercase) for _ in range(6))   # letters only
FIELDS = ["firstName", "lastName", "email", "phone", "company", "jobTitle", "street", "postalCode", "city", "country", "note"]
EXPORT_FIXED = ["id"] + FIELDS + ["tags"]
R = {}


class Harness(Exception):
    """The oracle could not set up a scenario (emulator unreachable, a prerequisite call failed): reported as 'harness'."""


# ------------------------------------------------------------------ helpers
def letters(n=6):
    """A unique letters-only word, e.g. for a last name."""
    return TAG + "".join(random.choice(string.ascii_lowercase) for _ in range(n))


def http(method, path, body=None, token=None, headers=None, base=BASE, raw=False, data=None):
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            content, status, ctype = r.read(), r.status, r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        content, status, ctype = e.read(), e.code, e.headers.get("Content-Type", "")
    except urllib.error.URLError as e:
        return 0, None, str(e.reason)
    if raw:
        return status, content, ctype
    try:
        return status, json.loads(content) if content else None, ctype
    except ValueError:
        return status, None, ctype


def api(method, path, user=None, body=None, **kw):
    st, js, _ = http(method, path, body=body, token=user.token if user else None, **kw)
    return st, js


def error_fields(js):
    return {e.get("field") for e in (js or {}).get("errors", []) if isinstance(e, dict)}


def record(sc, result, detail):
    R[sc] = {"result": result if isinstance(result, str) else ("pass" if result else "fail"), "detail": detail}
    print(f"{sc:5s} {R[sc]['result']:7s} {detail}")


def scenario(sc, fn, *args):
    """Run one scenario; a Harness error is 'harness', any other crash is a 'fail' with the reason."""
    try:
        fn(sc, *args)
    except Harness as e:
        record(sc, "harness", str(e))
    except Exception as e:   # the run's API answered something the oracle could not read
        record(sc, False, f"crashed on the response: {type(e).__name__}: {e}")


# ---- users in the Auth emulator
class User:
    def __init__(self, email, password, local_id, token):
        self.email, self.password, self.local_id, self.token, self.id = email, password, local_id, token, None

    def sign_in(self):
        st, js, _ = http("POST", "/accounts:signInWithPassword?key=demo-api-key",
                         {"email": self.email, "password": self.password, "returnSecureToken": True}, base=IDT)
        if st != 200:
            raise Harness(f"emulator sign-in failed ({st})")
        self.token = js["idToken"]

    def verify(self):
        st, _, _ = http("POST", f"/projects/{PROJECT}/accounts:update", {"localId": self.local_id, "emailVerified": True},
                        headers={"Authorization": "Bearer owner"}, base=IDT)
        if st != 200:
            raise Harness(f"emulator could not verify the email ({st})")
        self.sign_in()

    def me(self):
        st, js = api("GET", "/api/me", self)
        if st == 200 and isinstance(js, dict):
            self.id = js.get("id")
        return st, js


def new_user(verified=True, email=None):
    email = email or f"{letters(5)}@example.org"
    password = "Geslo" + letters(8)
    st, js, err = http("POST", "/accounts:signUp?key=demo-api-key",
                       {"email": email, "password": password, "returnSecureToken": True}, base=IDT)
    if st != 200:
        raise Harness(f"emulator sign-up failed ({st} {err})")
    u = User(email, password, js["localId"], js["idToken"])
    if verified:
        u.verify()
    u.me()
    return u


def forged(token, **claims):
    """The same emulator token with changed claims (the emulator does not sign its tokens)."""
    h, p, s = (token.split(".") + ["", ""])[:3]
    payload = json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))
    payload.update(claims)
    p2 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"{h}.{p2}.{s}"


# ---- workspaces, members, contacts
def workspace(owner, name=None):
    st, js = api("POST", "/api/workspaces", owner, {"name": name or "Prostor " + letters(4)})
    if st != 201 or not isinstance(js, dict) or not js.get("id"):
        raise Harness(f"could not create a Workspace ({st})")
    return js["id"]


def add_member(owner, ws, user_or_email, role):
    email = user_or_email if isinstance(user_or_email, str) else user_or_email.email
    return api("POST", f"/api/workspaces/{ws}/members", owner, {"email": email, "role": role})


def team():
    """Owner, Editor, Viewer of one new Workspace."""
    owner, editor, viewer = new_user(), new_user(), new_user()
    ws = workspace(owner)
    for u, role in ((editor, "EDITOR"), (viewer, "VIEWER")):
        st, js = add_member(owner, ws, u, role)
        if st != 201:
            raise Harness(f"could not add a {role} ({st})")
    return ws, owner, editor, viewer


def contact_body(**kw):
    body = {"firstName": "Ana", "lastName": letters(), "attributes": [], "tags": []}
    body.update(kw)
    return body


def create(user, ws, **kw):
    """(status, contact or None, full response)"""
    st, js = api("POST", f"/api/workspaces/{ws}/contacts", user, contact_body(**kw))
    c = js.get("contact") if isinstance(js, dict) else None
    return st, c, js


def must_create(user, ws, **kw):
    st, c, js = create(user, ws, **kw)
    if st != 201 or not c:
        raise Harness(f"could not create a Contact ({st}, errors {sorted(error_fields(js), key=str)})")
    return c


def update(user, ws, c, **changes):
    body = {k: c.get(k) for k in FIELDS}
    body["attributes"], body["tags"], body["version"] = c.get("attributes") or [], c.get("tags") or [], c.get("version")
    body.update(changes)
    st, js = api("PUT", f"/api/workspaces/{ws}/contacts/{c['id']}", user, body)
    return st, (js.get("contact") if isinstance(js, dict) else None), js


def get_contact(user, ws, cid):
    return api("GET", f"/api/workspaces/{ws}/contacts/{cid}", user)


def listing(user, ws, query=""):
    st, js = api("GET", f"/api/workspaces/{ws}/contacts{query}", user)
    return st, js if isinstance(js, dict) else {}


def ids_of(js):
    return [c.get("id") for c in (js or {}).get("items", [])]


def q(**params):
    return "?" + urllib.parse.urlencode([(k, v) for k, vs in params.items() for v in (vs if isinstance(vs, list) else [vs])])


def revisions(user, ws, cid):
    st, js = api("GET", f"/api/workspaces/{ws}/contacts/{cid}/revisions", user)
    return st, js if isinstance(js, list) else []


def count_named(user, ws, last):
    st, js = listing(user, ws, q(q=last))
    return js.get("totalItems")


def tags_of(user, ws):
    st, js = api("GET", f"/api/workspaces/{ws}/tags", user)
    return {t.get("name"): t for t in js} if isinstance(js, list) else {}


# ---- export (xlsx read with the standard library)
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_xlsx(content):
    """(rows as lists of strings, number of formula cells, number of non-empty cells that are not text)"""
    z = zipfile.ZipFile(io.BytesIO(content))
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    sheet = sorted((n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n)), key=lambda n: int(re.findall(r"\d+", n)[-1]))[0]
    rows, formulas, nontext = [], 0, 0
    for row in ET.fromstring(z.read(sheet)).iter("{%s}row" % NS["m"]):
        cells = {}
        for c in row.findall("m:c", NS):
            col = re.match(r"[A-Z]+", c.get("r", "A")).group(0)
            idx = 0
            for ch in col:
                idx = idx * 26 + ord(ch) - 64
            t, v = c.get("t"), c.find("m:v", NS)
            if c.find("m:f", NS) is not None:
                formulas += 1
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
            else:
                val = v.text if v is not None else ""
                if val:
                    nontext += 1
            cells[idx - 1] = val or ""
        rows.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
    return rows, formulas, nontext


def export(user, ws, body):
    st, content, ctype = http("POST", f"/api/workspaces/{ws}/export", body=body, token=user.token, raw=True)
    if st != 200:
        return st, [], [], (0, 0)
    try:
        rows, formulas, nontext = read_xlsx(content)
    except Exception as e:
        raise AssertionError(f"export is not a workbook: {e}")
    header = rows[0] if rows else []
    return st, header, [dict(zip(header, r + [""] * (len(header) - len(r)))) for r in rows[1:]], (formulas, nontext)


# ---- import (xlsx written with the standard library: inline strings, optional formula cells)
def col_name(i):
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def write_xlsx(rows, formulas=None):
    """rows: lists of strings (None = empty cell); formulas: {(row index, column index): formula text}."""
    formulas = formulas or {}
    out = []
    for ri, row in enumerate(rows):
        cells = []
        for ci, v in enumerate(row):
            ref = f"{col_name(ci)}{ri + 1}"
            if (ri, ci) in formulas:
                cells.append(f'<c r="{ref}"><f>{escape(formulas[(ri, ci)])}</f><v>2</v></c>')
            elif v not in (None, ""):
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>')
        out.append(f'<row r="{ri + 1}">{"".join(cells)}</row>')
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
             + "".join(out) + "</sheetData></worksheet>")
    files = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Kontakti" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/worksheets/sheet1.xml": sheet,
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, text in files.items():
            z.writestr(name, text)
    return buf.getvalue()


def upload(user, ws, content, filename="kontakti.xlsx",
           ctype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"):
    boundary = "----oracle" + letters(8)
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
    st, js, _ = http("POST", f"/api/workspaces/{ws}/import", token=user.token, data=body,
                     headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    return st, js if isinstance(js, dict) else {}


# ------------------------------------------------------------------ regression: the base project
def r01_me(sc, ctx):
    u = new_user()
    st, js = u.me()
    st2, js2 = u.me()
    good = st == 200 and js.get("email") == u.email and js.get("emailVerified") is True and js2.get("id") == js.get("id")
    record(sc, good, f"GET /api/me {st}, email matches {js.get('email') == u.email}, verified {js.get('emailVerified')}, same id twice {js2.get('id') == js.get('id')}")


def r02_tokens(sc, ctx):
    u = ctx["A"]
    now = int(time.time())
    cases = {"none": None, "garbage": "not-a-token", "wrong audience": forged(u.token, aud="other-project", iss="https://securetoken.google.com/other-project"),
             "expired": forged(u.token, exp=now - 3600, iat=now - 7200)}
    codes = {k: http("GET", "/api/workspaces", token=t)[0] for k, t in cases.items()}
    record(sc, all(c == 401 for c in codes.values()), f"statuses {codes} (expected 401 each)")


def r03_workspaces(sc, ctx):
    a = new_user()
    st, js = api("POST", "/api/workspaces", a, {"name": "  Prostor " + letters(3) + "  "})
    blank = api("POST", "/api/workspaces", a, {"name": "   "})
    long = api("POST", "/api/workspaces", a, {"name": "x" * 101})
    st_l, lst = api("GET", "/api/workspaces", a)
    roles = {w.get("id"): w.get("role") for w in (lst or [])}
    good = (st == 201 and js.get("role") == "OWNER" and roles.get(js.get("id")) == "OWNER"
            and blank[0] == 400 and "name" in error_fields(blank[1]) and long[0] == 400 and "name" in error_fields(long[1]) and len(roles) == 1)
    record(sc, good, f"create {st} role {js.get('role') if js else None}, listed {roles.get(js.get('id') if js else None)}, blank {blank[0]}, 101 chars {long[0]}, Workspaces listed {len(roles)}")


def r04_members(sc, ctx):
    owner, b = new_user(), new_user()
    ws = workspace(owner)
    st, js = add_member(owner, ws, b.email.upper(), "EDITOR")
    lst = api("GET", "/api/workspaces", b)[1] or []
    role = next((w.get("role") for w in lst if w.get("id") == ws), None)
    st2, _ = add_member(owner, ws, b.email, "VIEWER")
    record(sc, st == 201 and (js or {}).get("status") == "ACTIVE" and role == "EDITOR" and st2 == 409,
           f"add existing User {st} status {(js or {}).get('status')}, role in their list {role}, add again {st2} (expected 409)")


def r05_invitation(sc, ctx):
    owner = new_user()
    ws = workspace(owner)
    email = f"{letters(5)}@example.org"
    st, js = add_member(owner, ws, email, "VIEWER")
    invited = new_user(email=email)
    lst = api("GET", "/api/workspaces", invited)[1] or []
    role = next((w.get("role") for w in lst if w.get("id") == ws), None)
    inv = (api("GET", f"/api/workspaces/{ws}/members", owner)[1] or {}).get("invitations", [])
    record(sc, st == 201 and (js or {}).get("status") == "PENDING" and role == "VIEWER" and not any(i.get("email", "").lower() == email for i in inv),
           f"invite {st} status {(js or {}).get('status')}, role after sign-in {role}, invitation still listed {any(i.get('email', '').lower() == email for i in inv)}")


def r06_unverified(sc, ctx):
    owner = new_user()
    ws = workspace(owner)
    email = f"{letters(5)}@example.org"
    add_member(owner, ws, email, "EDITOR")
    u = new_user(verified=False, email=email)
    before = api("GET", f"/api/workspaces/{ws}", u)[0]
    u.verify()
    u.me()
    after = api("GET", f"/api/workspaces/{ws}", u)[0]
    record(sc, before == 404 and after == 200, f"unverified: Workspace {before} (expected 404), after verification {after} (expected 200)")


def r07_last_owner(sc, ctx):
    owner, other = new_user(), new_user()
    ws = workspace(owner)
    leave = api("DELETE", f"/api/workspaces/{ws}/members/{owner.id}", owner)[0]
    demote = api("PATCH", f"/api/workspaces/{ws}/members/{owner.id}", owner, {"role": "VIEWER"})[0]
    add_member(owner, ws, other, "OWNER")
    demote2 = api("PATCH", f"/api/workspaces/{ws}/members/{other.id}", owner, {"role": "VIEWER"})[0]
    rename = api("PATCH", f"/api/workspaces/{ws}", other, {"name": "Novo ime"})[0]
    record(sc, leave == 409 and demote == 409 and demote2 == 200 and rename == 403,
           f"last Owner leaves {leave}, demotes self {demote} (expected 409 each); second Owner demoted {demote2}, then renames {rename} (expected 403)")


def r08_roles(sc, ctx):
    ws, owner, ed, vi = team()
    c, other = must_create(ed, ws), must_create(ed, ws)
    deleted = must_create(ed, ws)
    api("DELETE", f"/api/workspaces/{ws}/contacts/{deleted['id']}?version={deleted['version']}", ed)
    codes = {
        "editor renames Workspace": api("PATCH", f"/api/workspaces/{ws}", ed, {"name": "x"})[0],
        "editor adds Member": add_member(ed, ws, f"{letters(4)}@example.org", "VIEWER")[0],
        "viewer creates Contact": create(vi, ws)[0],
        "viewer updates Contact": update(vi, ws, c, firstName="Eva")[0],
        "viewer deletes Contact": api("DELETE", f"/api/workspaces/{ws}/contacts/{c['id']}?version={c['version']}", vi)[0],
        "viewer merges": api("POST", f"/api/workspaces/{ws}/merge", vi, {"survivorId": c["id"], "contacts": [{"id": c["id"], "version": 1}, {"id": other["id"], "version": 1}]})[0],
        "editor purges": api("POST", f"/api/workspaces/{ws}/contacts/{deleted['id']}/purge", ed)[0],
        "viewer renames Tag": 403,
    }
    tag_c = must_create(ed, ws, tags=["oznaka" + letters(2)])
    tag = next(iter(tags_of(ed, ws).values()), {})
    codes["viewer renames Tag"] = api("PATCH", f"/api/workspaces/{ws}/tags/{tag.get('id')}", vi, {"name": "drugo"})[0]
    unchanged = get_contact(owner, ws, c["id"])[1] or {}
    record(sc, all(v == 403 for v in codes.values()) and unchanged.get("version") == 1 and tag_c,
           f"{codes} (expected 403 each); Contact still version {unchanged.get('version')}")


def r09_isolation(sc, ctx):
    ws, owner, ed, vi = team()
    c = must_create(ed, ws)
    outsider = new_user()
    ghost = str(uuid.uuid4())
    paths = [("GET", ""), ("PATCH", ""), ("GET", "/members"), ("GET", "/contacts"), ("GET", f"/contacts/{c['id']}"),
             ("GET", f"/contacts/{c['id']}/revisions"), ("GET", "/tags"), ("GET", "/duplicates"), ("POST", "/merge"), ("POST", "/export"),
             ("POST", "/contacts"), ("DELETE", "")]
    bodies = {"PATCH": {"name": "x"}, "POST": {"contactIds": [c["id"]]}}
    diffs = []
    for m, p in paths:
        real = http(m, f"/api/workspaces/{ws}{p}", body=bodies.get(m), token=outsider.token)
        fake = http(m, f"/api/workspaces/{ghost}{p.replace(c['id'], str(uuid.uuid4()))}", body=bodies.get(m), token=outsider.token)
        if real[0] != 404 or fake[0] != 404 or real[1] != fake[1]:
            diffs.append(f"{m} {p or '/'}: {real[0]} vs {fake[0]}")
    still = get_contact(owner, ws, c["id"])[0]
    record(sc, not diffs and still == 200, f"{len(paths)} endpoints, differing or not 404: {diffs or 'none'}; Workspace still there {still == 200}")


def r10_cross_path(sc, ctx):
    ws, owner, ed, vi = team()
    c = must_create(ed, ws)
    b = new_user()
    v = workspace(b)
    other = must_create(b, v)
    base = f"/api/workspaces/{v}/contacts/{c['id']}"
    codes = {"get": api("GET", base, b)[0], "update": update(b, v, c, firstName="Hack")[0],
             "delete": api("DELETE", f"{base}?version=1", b)[0], "restore": api("POST", f"{base}/restore", b, {"version": 1})[0],
             "purge": api("POST", f"{base}/purge", b)[0],
             "merge": api("POST", f"/api/workspaces/{v}/merge", b, {"survivorId": other["id"], "contacts": [{"id": other["id"], "version": 1}, {"id": c["id"], "version": 1}]})[0]}
    after = get_contact(owner, ws, c["id"])[1] or {}
    good = codes["get"] == 404 and codes["update"] == 404 and codes["delete"] == 404 and codes["restore"] == 404 and codes["purge"] == 404 \
        and codes["merge"] in (400, 404) and after.get("version") == 1 and not after.get("deleted")
    record(sc, good, f"{codes} (expected 404; merge 400 or 404); Contact unchanged {after.get('version') == 1 and not after.get('deleted')}")


def r11_isolation_lists(sc, ctx):
    a, b = new_user(), new_user()
    w, v = workspace(a), workspace(b)
    last, tagname, email = letters(), "skupna" + letters(2), f"{letters(4)}@example.org"
    for u, ws in ((a, w), (a, w), (b, v)):
        must_create(u, ws, lastName=last, email=email, tags=[tagname])
    s = listing(b, v, q(q=last))[1]
    t = tags_of(b, v).get(tagname, {})
    d = api("GET", f"/api/workspaces/{v}/duplicates", b)[1] or {}
    st, header, rows, _ = export(b, v, {"filter": {"q": last}})
    good = s.get("totalItems") == 1 and t.get("contactCount") == 1 and not d.get("sets") and len(rows) == 1
    record(sc, good, f"in V: search {s.get('totalItems')}, Tag count {t.get('contactCount')}, Duplicate sets {len(d.get('sets') or [])}, export rows {len(rows)} (expected 1, 1, 0, 1)")


def r12_create(sc, ctx):
    ws, owner, ed, vi = team()
    vals = {"firstName": "Maja", "lastName": letters(), "email": f"{letters(3)}@primer.si", "phone": "+386 41 123 456", "company": "Primer doo",
            "jobTitle": "Vodja", "street": "Slovenska cesta 1", "postalCode": "1000", "city": "Ljubljana", "country": "si", "note": "Opomba"}
    st, c, _ = create(ed, ws, **vals)
    c = c or {}
    wrong = [k for k in FIELDS if c.get(k) != (vals[k].upper() if k == "country" else vals[k])]
    record(sc, st == 201 and c.get("version") == 1 and not wrong, f"create {st}, version {c.get('version')}, fields differing {wrong or 'none'} (country expected SI)")


def r13_rejections(sc, ctx):
    ws, owner, ed, vi = team()
    last = letters()
    cases = {
        "no name or email": ({"firstName": "  ", "lastName": None, "email": ""}, None),
        "invalid email": ({"lastName": last, "email": "ni-email"}, "email"),
        "unknown country": ({"lastName": last, "country": "XX"}, "country"),
        "three-letter country": ({"lastName": last, "country": "SVN"}, "country"),
        "first name 101": ({"lastName": last, "firstName": "a" * 101}, "firstName"),
    }
    bad = []
    for name, (body, field) in cases.items():
        st, _, js = create(ed, ws, **body)
        if st != 400 or (field and field not in error_fields(js)):
            bad.append(f"{name}: {st} {sorted(error_fields(js), key=str)}")
    total = listing(owner, ws)[1].get("totalItems")
    record(sc, not bad and total == 0, f"rejections not as expected: {bad or 'none'}; Contacts stored {total} (expected 0)")


def r14_trim(sc, ctx):
    ws, owner, ed, vi = team()
    last = letters()
    c = must_create(ed, ws, firstName="  Eva  ", lastName=f" {last} ", company="   ", city=" Maribor ")
    good = c.get("firstName") == "Eva" and c.get("lastName") == last and c.get("company") is None and c.get("city") == "Maribor"
    record(sc, good, f"stored {[c.get('firstName'), c.get('lastName'), c.get('company'), c.get('city')]} (expected Eva, name, None, Maribor)")


def r15_slovenian(sc, ctx):
    ws, owner, ed, vi = team()
    vals = {"firstName": "Šárka Čeč", "lastName": "Žužek" + letters(), "company": "Čebelarstvo Ćirić", "city": "Škofja Loka",
            "street": "Ulica Đure Đakovića 3", "note": "čšžČŠŽ", "attributes": [{"key": "jezik", "value": "nemščina"}]}
    c = must_create(ed, ws, **vals)
    back = get_contact(vi, ws, c["id"])[1] or {}
    wrong = [k for k in vals if back.get(k) != vals[k]]
    record(sc, not wrong, f"fields changed on the way: {wrong or 'none'}")


def r16_version(sc, ctx):
    ws, owner, ed, vi = team()
    c = must_create(ed, ws)
    st1, c2, _ = update(ed, ws, c, firstName="Petra")
    st2, _, js = update(owner, ws, c, firstName="Nina")
    now = get_contact(vi, ws, c["id"])[1] or {}
    record(sc, st1 == 200 and (c2 or {}).get("version") == 2 and st2 == 409 and now.get("firstName") == "Petra" and now.get("version") == 2,
           f"update with v1 {st1} -> version {(c2 or {}).get('version')}; second update with v1 {st2} (expected 409); now {now.get('firstName')} v{now.get('version')}")


def r17_delete_restore(sc, ctx):
    ws, owner, ed, vi = team()
    c = must_create(ed, ws)
    st = api("DELETE", f"/api/workspaces/{ws}/contacts/{c['id']}?version=1", ed)[0]
    active = ids_of(listing(vi, ws)[1])
    deleted_view = ids_of(listing(vi, ws, "?deleted=true")[1])
    got = get_contact(vi, ws, c["id"])[1] or {}
    revs = revisions(vi, ws, c["id"])[1]
    st_r, js_r = api("POST", f"/api/workspaces/{ws}/contacts/{c['id']}/restore", ed, {"version": 2})
    revs2 = revisions(vi, ws, c["id"])[1]
    good = (st == 204 and c["id"] not in active and c["id"] in deleted_view and got.get("deleted") is True
            and [r.get("changeType") for r in revs] == ["DELETE", "CREATE"] and st_r == 200 and (js_r or {}).get("deleted") is False
            and revs2 and revs2[0].get("changeType") == "RESTORE" and c["id"] in ids_of(listing(vi, ws)[1]))
    record(sc, good, f"delete {st}, in list {c['id'] in active}, in Deleted view {c['id'] in deleted_view}, deleted flag {got.get('deleted')}, "
                     f"revisions {[r.get('changeType') for r in revs]}, restore {st_r}, newest after restore {revs2[0].get('changeType') if revs2 else None}")


def r18_attributes(sc, ctx):
    ws, owner, ed, vi = team()
    attrs = [{"key": "kompetenca", "value": "spletnoProgramiranje"}, {"key": "jezik", "value": "nemščina"}]
    c = must_create(ed, ws, attributes=attrs)
    order_ok = c.get("attributes") == attrs
    cases = {
        "key pattern": ([{"key": "1slabo", "value": "x"}], "attributes[0].key"),
        "case duplicate": ([{"key": "Barva", "value": "x"}, {"key": "barva", "value": "y"}], "attributes[1].key"),
        "predefined name": ([{"key": "Email", "value": "x"}], "attributes[0].key"),
        "tags name": ([{"key": "TAGS", "value": "x"}], "attributes[0].key"),
        "empty value": ([{"key": "prazno", "value": ""}], None),
        "501 value": ([{"key": "dolgo", "value": "x" * 501}], None),
        "101 attributes": ([{"key": f"k{i}", "value": "x"} for i in range(101)], None),
    }
    bad = []
    for name, (a, field) in cases.items():
        st, _, js = create(ed, ws, attributes=a)
        if st != 400 or (field and field not in error_fields(js)):
            bad.append(f"{name}: {st} {sorted(error_fields(js), key=str)}")
    st_u, c2, _ = update(ed, ws, c, attributes=[{"key": "kompetenca", "value": "oblikovanje"}])
    replaced = (c2 or {}).get("attributes") == [{"key": "kompetenca", "value": "oblikovanje"}]
    record(sc, order_ok and not bad and replaced, f"order kept {order_ok}; rejections not as expected: {bad or 'none'}; update replaces {replaced}")


def r19_tags(sc, ctx):
    ws, owner, ed, vi = team()
    t1 = "neObvescaj" + letters(2)
    a = must_create(ed, ws, tags=[t1, "udelezenec2025"])
    b = must_create(ed, ws, tags=[t1.upper()])
    tg = tags_of(vi, ws)
    reuse = b.get("tags") == [t1] and tg.get(t1, {}).get("contactCount") == 2 and t1.upper() not in tg and tg.get("udelezenec2025", {}).get("contactCount") == 1
    cases = {"space": ["ne obvescaj"], "51 chars": ["a" * 51], "case repeat": ["Abc", "aBC"], "51 tags": [f"t{i}" for i in range(51)]}
    codes = {k: create(ed, ws, tags=v)[0] for k, v in cases.items()}
    bad = [f"{k}: {v}" for k, v in codes.items() if v != 400]
    record(sc, reuse and not bad, f"implicit Tags and case-insensitive reuse {reuse} (counts {[(k, v.get('contactCount')) for k, v in tg.items()]}); rejections not 400: {bad or 'none'}")


def r20_tag_rename_delete(sc, ctx):
    ws, owner, ed, vi = team()
    old, other = "udelezenec" + letters(2), "drugi" + letters(2)
    a, b = must_create(ed, ws, tags=[old]), must_create(ed, ws, tags=[old, other])
    tg = tags_of(ed, ws)
    new = old + "x"
    st = api("PATCH", f"/api/workspaces/{ws}/tags/{tg[old]['id']}", ed, {"name": new})[0]
    ca, cb = get_contact(vi, ws, a["id"])[1] or {}, get_contact(vi, ws, b["id"])[1] or {}
    renamed = new in ca.get("tags", []) and new in cb.get("tags", []) and ca.get("version") == 2 and cb.get("version") == 2
    clash = api("PATCH", f"/api/workspaces/{ws}/tags/{tg[old]['id']}", ed, {"name": other.upper()})[0]
    st_d = api("DELETE", f"/api/workspaces/{ws}/tags/{tg[other]['id']}", ed)[0]
    cb2 = get_contact(vi, ws, b["id"])[1] or {}
    gone = other not in tags_of(vi, ws) and other not in cb2.get("tags", []) and cb2.get("version") == 3
    rtype = (revisions(vi, ws, b["id"])[1] or [{}])[0].get("changeType")
    record(sc, st == 200 and renamed and clash == 409 and st_d == 204 and gone and rtype == "UPDATE",
           f"rename {st}, on both Contacts with a new Revision {renamed}; rename onto existing {clash} (expected 409); delete {st_d}, gone with Revision {gone}, type {rtype}")


def r21_search(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    s1 = must_create(ed, ws, firstName="Saša", lastName="Novak" + k)
    s2 = must_create(ed, ws, firstName="Sasa", lastName="Kranjc" + k)
    s3 = must_create(ed, ws, firstName="Ana", lastName="Šuštar" + k)
    p = must_create(ed, ws, firstName="Iva", lastName="Prva" + k, email=f"iva.{k}@primerx.si")
    c2 = must_create(ed, ws, firstName="Iva", lastName="Druga" + k, company=f"PRIMERX {k} doo")
    c3 = must_create(ed, ws, firstName="Iva", lastName="Tretja" + k, city=f"Primerxgrad{k}")
    sasa = set(ids_of(listing(vi, ws, q(q="sasa", size=100))[1]))
    sus = set(ids_of(listing(vi, ws, q(q="SUŠ", size=100))[1]))
    prim = set(ids_of(listing(vi, ws, q(q="primerx", size=100))[1]))
    good = sasa == {s1["id"], s2["id"]} and sus == {s3["id"]} and prim == {p["id"], c2["id"], c3["id"]}
    record(sc, good, f"'sasa' {len(sasa)} (expected 2, the right ones {sasa == {s1['id'], s2['id']}}), 'SUŠ' {len(sus)} (expected 1), 'primerx' in email/company/city {len(prim)} (expected 3)")


def r22_filters(sc, ctx):
    ws, owner, ed, vi = team()
    x, y = "x" + letters(2), "y" + letters(2)
    cx, cy, cxy = must_create(ed, ws, tags=[x]), must_create(ed, ws, tags=[y]), must_create(ed, ws, tags=[x, y])
    a1 = must_create(ed, ws, attributes=[{"key": "kompetenca", "value": "spletnoProgramiranje"}])
    a2 = must_create(ed, ws, attributes=[{"key": "kompetenca", "value": "oblikovanje"}])
    k = letters(3)
    m = must_create(ed, ws, lastName="Iskani" + k, country="SI", company="Primer doo")
    must_create(ed, ws, lastName="Iskani" + k, country="AT", company="Primer doo")
    must_create(ed, ws, lastName="Iskani" + k, country="SI", company="Drugo doo")
    all_ = set(ids_of(listing(vi, ws, q(tag=[x, y]))[1]))
    any_ = set(ids_of(listing(vi, ws, q(tag=[x, y], tagMode="any"))[1]))
    av = set(ids_of(listing(vi, ws, q(attr="kompetenca=SPLETNOprogramiranje"))[1]))
    ak = set(ids_of(listing(vi, ws, q(attr="kompetenca"))[1]))
    comb = set(ids_of(listing(vi, ws, q(country="si", company="primer doo", q="iskani" + k))[1]))
    good = all_ == {cxy["id"]} and any_ == {cx["id"], cy["id"], cxy["id"]} and av == {a1["id"]} and ak == {a1["id"], a2["id"]} and comb == {m["id"]}
    record(sc, good, f"tags all {len(all_)}/1, any {len(any_)}/3, attr key=value {len(av)}/1, attr key {len(ak)}/2, country+company+text {len(comb)}/1")


def r23_paging(sc, ctx):
    ws, owner, ed, vi = team()
    for i in range(30):
        must_create(ed, ws, lastName="Stran" + letters(4))
    p0 = listing(vi, ws, q(page=0, size=25, sort="lastName"))[1]
    p1 = listing(vi, ws, q(page=1, size=25, sort="lastName"))[1]
    st, js = listing(vi, ws, q(size=101))
    ids0, ids1 = ids_of(p0), ids_of(p1)
    names = [c.get("lastName") for c in p0.get("items", []) + p1.get("items", [])]
    good = len(ids0) == 25 and len(ids1) == 5 and p1.get("totalItems") == 30 and not set(ids0) & set(ids1) and names == sorted(names) and st == 400 and "size" in error_fields(js)
    record(sc, good, f"page 0 {len(ids0)}, page 1 {len(ids1)}, total {p1.get('totalItems')}, overlap {len(set(ids0) & set(ids1))}, sorted {names == sorted(names)}, size=101 {st}")


def r24_revisions(sc, ctx):
    ws, owner, ed, vi = team()
    tag = "zacasna" + letters(2)
    c = must_create(ed, ws, email=f"{letters(3)}@primer.si", tags=[tag])
    _, c2, _ = update(owner, ws, c, email=f"{letters(3)}@drugi.si")
    revs = revisions(vi, ws, c["id"])[1]
    meta = [(r.get("number"), r.get("changeType"), (r.get("author") or {}).get("userId")) for r in revs]
    first_ok = meta == [(2, "UPDATE", owner.id), (1, "CREATE", ed.id)] and (revs[1].get("state") or {}).get("email") == c["email"]
    _, c3, _ = update(ed, ws, c2 or {}, tags=[])
    tg = tags_of(ed, ws)
    api("DELETE", f"/api/workspaces/{ws}/tags/{tg.get(tag, {}).get('id')}", ed)
    st, back = api("POST", f"/api/workspaces/{ws}/contacts/{c['id']}/revisions/1/restore", ed, {"version": 3})
    revs2 = revisions(vi, ws, c["id"])[1]
    back = back or {}
    restored = (st == 200 and back.get("email") == c["email"] and back.get("tags") == [tag] and back.get("version") == 4
                and revs2 and revs2[0].get("changeType") == "RESTORE" and tag in tags_of(vi, ws)
                and [r.get("number") for r in revs2] == [4, 3, 2, 1])
    record(sc, first_ok and restored, f"history {meta} as expected {first_ok}; restore of Revision 1 {st}, version {back.get('version')}, Tag back {back.get('tags') == [tag]}, numbers {[r.get('number') for r in revs2]}")


def r25_revisions_immutable(sc, ctx):
    ws, owner, ed, vi = team()
    c = must_create(ed, ws)
    path = f"/api/workspaces/{ws}/contacts/{c['id']}/revisions/1"
    codes = {m: api(m, path, owner, {"state": {"firstName": "x"}} if m != "DELETE" else None)[0] for m in ("PUT", "PATCH", "DELETE")}
    revs = revisions(vi, ws, c["id"])[1]
    record(sc, all(v in (404, 405) for v in codes.values()) and len(revs) == 1 and (revs[0].get("state") or {}).get("firstName") == "Ana",
           f"{codes} (expected 404 or 405); Revisions unchanged {len(revs) == 1}")


def r26_duplicates(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    e1, e2 = must_create(ed, ws, email=f"Ana.{k}@Primer.si"), must_create(ed, ws, email=f"ana.{k}@primer.si")
    p1, p2 = must_create(ed, ws, phone="00386 41 555 777"), must_create(ed, ws, phone="+386-41-555-777")
    must_create(ed, ws, phone="12345"), must_create(ed, ws, phone="12345")
    n1, n2 = must_create(ed, ws, firstName="Saša", lastName="Novak" + k), must_create(ed, ws, firstName="sasa ", lastName=" NOVAK" + k.upper())
    must_create(ed, ws, firstName="Žan", lastName=None, email=None, phone=None, note="x" + k), must_create(ed, ws, firstName="Žan", lastName=None)
    t1 = must_create(ed, ws, email=f"t.{k}@primer.si")
    t2 = must_create(ed, ws, email=f"t.{k}@primer.si", phone="+386 31 999 888")
    t3 = must_create(ed, ws, phone="00386 31 999 888")
    sets = (api("GET", f"/api/workspaces/{ws}/duplicates", vi)[1] or {}).get("sets") or []
    got = {frozenset(c.get("id") for c in s.get("contacts", [])): set(s.get("matchedOn") or []) for s in sets}
    want = {frozenset({e1["id"], e2["id"]}): {"EMAIL"}, frozenset({p1["id"], p2["id"]}): {"PHONE"},
            frozenset({n1["id"], n2["id"]}): {"NAME"}, frozenset({t1["id"], t2["id"], t3["id"]}): {"EMAIL", "PHONE"}}
    api("DELETE", f"/api/workspaces/{ws}/contacts/{e2['id']}?version=1", ed)
    sets2 = (api("GET", f"/api/workspaces/{ws}/duplicates", vi)[1] or {}).get("sets") or []
    gone = not any(e1["id"] in {c.get("id") for c in s.get("contacts", [])} for s in sets2)
    record(sc, got == want and gone, f"sets as expected {got == want} ({len(got)} sets, expected 4: email, phone, name, transitive email+phone); set gone after delete {gone}")


def r27_possible_duplicates(sc, ctx):
    ws, owner, ed, vi = team()
    email = f"{letters(4)}@primer.si"
    first = must_create(ed, ws, email=email)
    st, c, js = create(ed, ws, email=email.upper())
    pd = (js or {}).get("possibleDuplicates") or []
    hit = any((d.get("contact") or {}).get("id") == first["id"] and "EMAIL" in (d.get("matchedOn") or []) for d in pd)
    st2, c2, js2 = create(ed, ws, email=f"{letters(4)}@drugo.si")
    record(sc, st == 201 and hit and st2 == 201 and (js2 or {}).get("possibleDuplicates") == [],
           f"saved {st}, warning names the first Contact with EMAIL {hit}; without match {st2} with empty list {(js2 or {}).get('possibleDuplicates') == []}")


def r28_merge(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    s = must_create(ed, ws, lastName="Ena" + k, email=f"s.{k}@primer.si", phone=None, tags=["x" + k], attributes=[{"key": "a", "value": "1"}, {"key": "kompetenca", "value": "s"}])
    d = must_create(ed, ws, lastName="Dva" + k, email=f"d.{k}@primer.si", phone="+386 40 111 222", tags=["y" + k], attributes=[{"key": "b", "value": "2"}, {"key": "kompetenca", "value": "d"}])
    e = must_create(ed, ws, lastName="Tri" + k)
    body = {"survivorId": s["id"], "contacts": [{"id": s["id"], "version": 1}, {"id": d["id"], "version": 1}, {"id": e["id"], "version": 1}],
            "fieldSources": {"email": d["id"]}, "attributeSources": {"kompetenca": d["id"]}}
    bad = {
        "one contact": {**body, "contacts": body["contacts"][:1]},
        "survivor not listed": {**body, "survivorId": str(uuid.uuid4())},
        "repeated": {**body, "contacts": body["contacts"] + [body["contacts"][1]]},
        "11 contacts": {**body, "contacts": body["contacts"] + [{"id": must_create(ed, ws)["id"], "version": 1} for _ in range(8)]},
    }
    bad_codes = {k2: api("POST", f"/api/workspaces/{ws}/merge", ed, b)[0] for k2, b in bad.items()}
    stale = api("POST", f"/api/workspaces/{ws}/merge", ed, {**body, "contacts": [{"id": s["id"], "version": 1}, {"id": d["id"], "version": 7}]})[0]
    st, sv = api("POST", f"/api/workspaces/{ws}/merge", ed, body)
    sv = sv or {}
    attrs = {a.get("key"): a.get("value") for a in sv.get("attributes", [])}
    dd, ee = get_contact(vi, ws, d["id"])[1] or {}, get_contact(vi, ws, e["id"])[1] or {}
    srev = (revisions(vi, ws, s["id"])[1] or [{}])[0].get("changeType")
    drev = (revisions(vi, ws, d["id"])[1] or [{}])[0].get("changeType")
    good = (all(v == 400 for v in bad_codes.values()) and stale == 409 and st == 200 and sv.get("lastName") == "Ena" + k
            and sv.get("email") == d["email"] and sv.get("phone") == "+386 40 111 222" and set(sv.get("tags", [])) == {"x" + k, "y" + k}
            and attrs == {"a": "1", "b": "2", "kompetenca": "d"} and dd.get("deleted") is True and dd.get("mergedInto") == s["id"]
            and ee.get("mergedInto") == s["id"] and srev == "MERGE" and drev == "MERGED_AWAY")
    record(sc, good, f"invalid requests {bad_codes} (expected 400), stale {stale} (409); merge {st}: email from D {sv.get('email') == d['email']}, phone filled {sv.get('phone')}, "
                     f"Tags {sorted(sv.get('tags', []))}, Attributes {attrs}, others merged into S {dd.get('mergedInto') == s['id'] and ee.get('mergedInto') == s['id']}, Revisions {srev}/{drev}")


def r29_export(sc, ctx):
    ws, owner, ed, vi = team()
    tag = "udelezenec" + letters(2)
    cs = [must_create(ed, ws, lastName=f"Izvoz{letters(3)}{i}", tags=[tag] if i < 3 else []) for i in range(5)]
    special = must_create(ed, ws, firstName="=1+1", lastName="Šuštar" + letters(2), company="@SUM(A1)", note="-2", city="+3",
                          tags=[tag, "neObvescaj"], attributes=[{"key": "kompetenca", "value": "č"}, {"key": "Jezik", "value": "nemščina"}])
    st, header, rows, _ = export(vi, ws, {"contactIds": [cs[0]["id"], cs[1]["id"]]})
    sel = st == 200 and sorted(r.get("id") for r in rows) == sorted([cs[0]["id"], cs[1]["id"]])
    st2, header2, rows2, (formulas, nontext) = export(vi, ws, {"filter": {"tags": [tag], "sort": "lastName", "direction": "asc"}})
    want_ids = sorted([c for c in cs[:3]] + [special], key=lambda c: (c["lastName"], c["firstName"] or "", c["id"]))
    filt = st2 == 200 and [r.get("id") for r in rows2] == [c["id"] for c in want_ids]
    cols = header2 == EXPORT_FIXED + ["jezik", "kompetenca"]
    srow = next((r for r in rows2 if r.get("id") == special["id"]), {})
    cells = (srow.get("firstName") == "=1+1" and srow.get("company") == "@SUM(A1)" and srow.get("note") == "-2" and srow.get("city") == "+3"
             and srow.get("lastName") == special["lastName"] and srow.get("kompetenca") == "č" and srow.get("jezik") == "nemščina"
             and sorted(srow.get("tags", "").split(", ")) == sorted(["neObvescaj", tag]) and formulas == 0 and nontext == 0)
    api("DELETE", f"/api/workspaces/{ws}/contacts/{cs[4]['id']}?version=1", ed)
    rej = {"both": export(vi, ws, {"contactIds": [cs[0]["id"]], "filter": {}})[0], "neither": export(vi, ws, {})[0],
           "deleted id": export(vi, ws, {"contactIds": [cs[4]["id"]]})[0]}
    record(sc, sel and filt and cols and cells and all(v == 400 for v in rej.values()),
           f"selection {sel}, filter rows and order {filt}, columns {cols}, special cells as text {cells} (formulas {formulas}, non-text {nontext}), rejections {rej} (expected 400)")


def r30_purge(sc, ctx):
    ws, owner, ed, vi = team()
    c = must_create(ed, ws)
    active = api("POST", f"/api/workspaces/{ws}/contacts/{c['id']}/purge", owner)[0]
    api("DELETE", f"/api/workspaces/{ws}/contacts/{c['id']}?version=1", ed)
    st = api("POST", f"/api/workspaces/{ws}/contacts/{c['id']}/purge", owner)[0]
    after, revs = get_contact(owner, ws, c["id"])[0], api("GET", f"/api/workspaces/{ws}/contacts/{c['id']}/revisions", owner)[0]
    record(sc, active == 409 and st == 204 and after == 404 and revs == 404,
           f"purge active {active} (409), purge Deleted contact {st} (204), then Contact {after} and Revisions {revs} (404)")


def r31_delete_workspace(sc, ctx):
    ws, owner, ed, vi = team()
    c = must_create(ed, ws, tags=["t" + letters(2)])
    name = api("GET", f"/api/workspaces/{ws}", owner)[1].get("name")
    wrong = api("DELETE", f"/api/workspaces/{ws}?" + urllib.parse.urlencode({"confirmName": name + "x"}), owner)
    by_editor = api("DELETE", f"/api/workspaces/{ws}?" + urllib.parse.urlencode({"confirmName": name}), ed)[0]
    st = api("DELETE", f"/api/workspaces/{ws}?" + urllib.parse.urlencode({"confirmName": name}), owner)[0]
    after = {u: api("GET", f"/api/workspaces/{ws}", x)[0] for u, x in (("owner", owner), ("editor", ed), ("viewer", vi))}
    cst = get_contact(ed, ws, c["id"])[0]
    record(sc, wrong[0] == 400 and "confirmName" in error_fields(wrong[1]) and by_editor == 403 and st == 204 and all(v == 404 for v in after.values()) and cst == 404,
           f"wrong name {wrong[0]}, by Editor {by_editor}, delete {st}, afterwards {after} and Contact {cst} (404 each)")


REGRESSION = [r01_me, r02_tokens, r03_workspaces, r04_members, r05_invitation, r06_unverified, r07_last_owner, r08_roles,
              r09_isolation, r10_cross_path, r11_isolation_lists, r12_create, r13_rejections, r14_trim, r15_slovenian,
              r16_version, r17_delete_restore, r18_attributes, r19_tags, r20_tag_rename_delete, r21_search, r22_filters,
              r23_paging, r24_revisions, r25_revisions_immutable, r26_duplicates, r27_possible_duplicates, r28_merge,
              r29_export, r30_purge, r31_delete_workspace]


def regression():
    ctx = {"A": new_user()}
    for i, fn in enumerate(REGRESSION, 1):
        scenario(f"R{i:02d}", fn, ctx)
    return ctx


# ------------------------------------------------------------------ feature `import` (US-014)
HEAD = ["firstName", "lastName", "email", "company", "tags", "kompetenca"]


def imp_rows(n, k):
    return [HEAD] + [[f"Ime{chr(97 + i)}", f"Uvoz{k}{chr(97 + i)}", f"u{chr(97 + i)}.{k}@primer.si", "Primer doo", f"uvoz{k}, skupina{k}", f"vrednost{i}"] for i in range(n)]


def contacts_named(user, ws, text):
    return listing(user, ws, q(q=text, size=100))[1].get("items", [])


def i01_valid(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    st, js = upload(ed, ws, write_xlsx(imp_rows(3, k)))
    got = [get_contact(vi, ws, cid)[1] or {} for cid in js.get("contactIds", [])]
    good = (st == 201 and js.get("created") == 3 and [c.get("lastName") for c in got] == [f"Uvoz{k}{c}" for c in "abc"]
            and all(sorted(c.get("tags", [])) == sorted([f"uvoz{k}", f"skupina{k}"]) and c.get("company") == "Primer doo" for c in got)
            and [c.get("attributes") for c in got] == [[{"key": "kompetenca", "value": f"vrednost{i}"}] for i in range(3)])
    record(sc, good, f"import {st}, created {js.get('created')}, rows in order with fields, Tags and Attributes {good}")


def i02_round_trip(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    src = [must_create(ed, ws, firstName="Špela", lastName=f"Krog{k}{c}", email=f"{c}.{k}@primer.si", country="SI", tags=["a" + k],
                       attributes=[{"key": "kompetenca", "value": "č" + c}]) for c in "ab"]
    st, content, _ = http("POST", f"/api/workspaces/{ws}/export", body={"filter": {"q": f"Krog{k}"}}, token=vi.token, raw=True)
    v = workspace(ed)
    st2, js = upload(ed, v, content)
    got = sorted(contacts_named(ed, v, f"Krog{k}"), key=lambda c: c.get("lastName"))
    same = len(got) == 2 and all(all(g.get(f) == s.get(f) for f in FIELDS) and g.get("tags") == s.get("tags") and g.get("attributes") == s.get("attributes")
                                 and g.get("id") != s.get("id") for g, s in zip(got, src))
    record(sc, st == 200 and st2 == 201 and same, f"export {st}, import into another Workspace {st2}, equal Contacts {same}")


def i03_headers(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    rows = [["FIRSTNAME", "Email", "id", "tags", "lastName", "kompetenca"], ["Maja", f"m.{k}@primer.si", "ignoriraj", "t" + k, "Glava" + k, "x"]]
    st, js = upload(ed, ws, write_xlsx(rows))
    c = (contacts_named(vi, ws, "Glava" + k) or [{}])[0]
    good = st == 201 and c.get("firstName") == "Maja" and c.get("email") == f"m.{k}@primer.si" and c.get("tags") == ["t" + k] \
        and c.get("attributes") == [{"key": "kompetenca", "value": "x"}] and c.get("id") != "ignoriraj"
    record(sc, good, f"import {st}, headers matched case-insensitively and in any order, id ignored {good}")


def i04_cells(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    rows = [["firstName", "lastName", "company", "tags"], ["  Eva  ", "Celica" + k, None, "a, ,b ,"], [None, None, None, None], ["Ana", "Celica" + k + "x", "  ", ""]]
    st, js = upload(ed, ws, write_xlsx(rows))
    got = sorted(contacts_named(vi, ws, "Celica" + k), key=lambda c: c.get("lastName"))
    good = st == 201 and js.get("created") == 2 and len(got) == 2 and got[0].get("firstName") == "Eva" and got[0].get("company") is None \
        and sorted(got[0].get("tags", [])) == ["a", "b"] and got[1].get("company") is None and got[1].get("tags") == []
    record(sc, good, f"import {st}, created {js.get('created')} (expected 2, empty row skipped), trimmed and Tags a, b {good}")


def i05_all_or_nothing(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    rows = imp_rows(3, k)
    rows[2][2] = "ni-email"
    st, js = upload(ed, ws, write_xlsx(rows))
    left = len(contacts_named(vi, ws, f"Uvoz{k}"))
    tags_left = [t for t in tags_of(vi, ws) if k in t]
    record(sc, st == 400 and "rows[3].email" in error_fields(js) and left == 0 and not tags_left,
           f"import {st}, errors {sorted(error_fields(js), key=str)} (expected rows[3].email), Contacts left {left}, Tags left {len(tags_left)}")


def i06_row_rule(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    rows = imp_rows(3, k)
    rows[3] = [None, None, None, "Primer doo", None, "x"]
    st, js = upload(ed, ws, write_xlsx(rows))
    record(sc, st == 400 and "rows[4]" in error_fields(js) and not contacts_named(vi, ws, f"Uvoz{k}"),
           f"import {st}, errors {sorted(error_fields(js), key=str)} (expected rows[4]), nothing created")


def i07_headers_invalid(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    r1 = imp_rows(1, k)
    r1[0] = HEAD[:5] + ["1slabo"]
    st1, js1 = upload(ed, ws, write_xlsx(r1))
    r2 = imp_rows(1, k)
    r2[0] = HEAD[:5] + ["EMAIL"]
    st2, js2 = upload(ed, ws, write_xlsx(r2))
    dup_ok = bool(error_fields(js2) & {"headers[3]", "headers[6]"})   # either of the two equal headers may be named
    record(sc, st1 == 400 and "headers[6]" in error_fields(js1) and st2 == 400 and dup_ok and not contacts_named(vi, ws, f"Uvoz{k}"),
           f"invalid key {st1} {sorted(error_fields(js1), key=str)} (expected headers[6]), duplicate header {st2} {sorted(error_fields(js2), key=str)} (expected headers[3] or [6])")


def i08_file(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    cases = {"not xlsx": (b"firstName;lastName\nAna;Novak\n", "kontakti.csv", "text/csv"),
             "header only": (write_xlsx([HEAD]), "k.xlsx", None),
             "10001 rows": (write_xlsx([["lastName"]] + [[f"Mnogo{k}{i}"] for i in range(10001)]), "k.xlsx", None)}
    res = {}
    for name, (content, fn, ct) in cases.items():
        st, js = upload(ed, ws, content, fn, ct) if ct else upload(ed, ws, content, fn)
        res[name] = (st, "file" in error_fields(js))
    left = listing(vi, ws)[1].get("totalItems")
    record(sc, all(s == 400 and f for s, f in res.values()) and left == 0, f"{res} (expected 400 with file each), Contacts left {left}")


def i09_formula(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    rows = imp_rows(2, k)
    st, js = upload(ed, ws, write_xlsx(rows, formulas={(1, 3): "1+1"}))
    fields = error_fields(js)
    record(sc, st == 400 and any(str(f).startswith("rows[2]") for f in fields) and not contacts_named(vi, ws, f"Uvoz{k}"),
           f"import {st}, errors {sorted(fields, key=str)} (expected one for row 2), nothing created")


def i10_revisions(sc, ctx):
    ws, owner, ed, vi = team()
    st, js = upload(ed, ws, write_xlsx(imp_rows(2, letters(3))))
    revs = [revisions(vi, ws, cid)[1] for cid in js.get("contactIds", [])]
    good = st == 201 and len(revs) == 2 and all(len(r) == 1 and r[0].get("number") == 1 and r[0].get("changeType") == "CREATE"
                                                 and (r[0].get("author") or {}).get("userId") == ed.id for r in revs)
    record(sc, good, f"import {st}, each Contact has one CREATE Revision by the Editor {good}")


def i11_duplicates(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    existing = must_create(ed, ws, email=f"obstojeci.{k}@primer.si")
    rows = [["firstName", "lastName", "email", "phone"], ["A", "Dvojnik" + k + "a", f"OBSTOJECI.{k}@PRIMER.SI", None],
            ["B", "Dvojnik" + k + "b", None, "+386 41 777 888"], ["C", "Dvojnik" + k + "c", None, "00386 41 777 888"]]
    st, js = upload(ed, ws, write_xlsx(rows))
    ids = js.get("contactIds") or [None, None, None]
    pd = {d.get("row"): {(m.get("contactId"), tuple(sorted(m.get("matchedOn") or []))) for m in d.get("matches", [])} for d in js.get("possibleDuplicates") or []}
    good = st == 201 and pd.get(2) == {(existing["id"], ("EMAIL",))} and pd.get(3) == {(ids[2], ("PHONE",))} and pd.get(4) == {(ids[1], ("PHONE",))}
    record(sc, good, f"import {st}, row 2 matches the existing Contact by EMAIL, rows 3 and 4 each other by PHONE: {good} (reported rows {sorted(pd)})")


def i12_roles(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    st_v, _ = upload(vi, ws, write_xlsx(imp_rows(1, k)))
    st_o, _ = upload(new_user(), ws, write_xlsx(imp_rows(1, k)))
    left = len(contacts_named(owner, ws, f"Uvoz{k}"))
    record(sc, st_v == 403 and st_o == 404 and left == 0, f"Viewer {st_v} (403), non-Member {st_o} (404), Contacts created {left}")


def i13_slovenian(sc, ctx):
    ws, owner, ed, vi = team()
    k = letters(3)
    rows = [["firstName", "lastName", "company", "kompetenca"], ["Šárka", "Žužek" + k, "Čebelarstvo Ćirić", "čšžČŠŽ"]]
    st, js = upload(ed, ws, write_xlsx(rows))
    c = (contacts_named(vi, ws, "Žužek" + k) or [{}])[0]
    good = st == 201 and c.get("firstName") == "Šárka" and c.get("company") == "Čebelarstvo Ćirić" and c.get("attributes") == [{"key": "kompetenca", "value": "čšžČŠŽ"}]
    record(sc, good, f"import {st}, text unchanged {good}")


def feature_import(ctx):
    for i, fn in enumerate([i01_valid, i02_round_trip, i03_headers, i04_cells, i05_all_or_nothing, i06_row_rule, i07_headers_invalid,
                            i08_file, i09_formula, i10_revisions, i11_duplicates, i12_roles, i13_slovenian], 1):
        scenario(f"I{i:02d}", fn, ctx)


# ------------------------------------------------------------------ feature `activity` (US-015)
def activity(user, ws, **params):
    st, js = api("GET", f"/api/workspaces/{ws}/activity" + (q(**params) if params else ""), user)
    return st, js if isinstance(js, dict) else {}


def entries(js):
    return [(e.get("contactId"), e.get("revisionNumber"), e.get("changeType"), (e.get("author") or {}).get("userId")) for e in js.get("items", [])]


def pause():
    time.sleep(0.05)   # distinct times, so the newest-first order does not depend on tie-breaking


def a01_order(sc, ctx):
    ws, owner, ed, vi = team()
    c1 = must_create(ed, ws); pause()
    update(owner, ws, c1, firstName="Druga"); pause()
    c2 = must_create(ed, ws)
    st, js = activity(vi, ws)
    want = [(c2["id"], 1, "CREATE", ed.id), (c1["id"], 2, "UPDATE", owner.id), (c1["id"], 1, "CREATE", ed.id)]
    record(sc, st == 200 and entries(js) == want and all(e.get("createdAt") for e in js.get("items", [])) and js.get("totalItems") == 3,
           f"activity {st}, entries as expected {entries(js) == want}, total {js.get('totalItems')}")


def a02_names(sc, ctx):
    ws, owner, ed, vi = team()
    c = must_create(ed, ws, firstName="Ana"); pause()
    update(ed, ws, c, firstName="Maja")
    st, js = activity(vi, ws, contactId=c["id"])
    names = {e.get("revisionNumber"): (e.get("contact") or {}).get("firstName") for e in js.get("items", [])}
    record(sc, names == {1: "Ana", 2: "Maja"}, f"names per Revision {names} (expected 1: Ana, 2: Maja)")


def a03_delete_restore(sc, ctx):
    ws, owner, ed, vi = team()
    c = must_create(ed, ws); pause()
    api("DELETE", f"/api/workspaces/{ws}/contacts/{c['id']}?version=1", ed); pause()
    api("POST", f"/api/workspaces/{ws}/contacts/{c['id']}/restore", ed, {"version": 2}); pause()
    d = must_create(ed, ws); pause()
    api("DELETE", f"/api/workspaces/{ws}/contacts/{d['id']}?version=1", ed)
    types = [e[2] for e in entries(activity(vi, ws, contactId=c["id"])[1])]
    dtypes = [e[2] for e in entries(activity(vi, ws, contactId=d["id"])[1])]
    record(sc, types == ["RESTORE", "DELETE", "CREATE"] and dtypes == ["DELETE", "CREATE"], f"restored Contact {types}, Deleted contact still listed {dtypes}")


def a04_merge(sc, ctx):
    ws, owner, ed, vi = team()
    s, d, e = must_create(ed, ws), must_create(ed, ws), must_create(ed, ws)
    pause()
    st = api("POST", f"/api/workspaces/{ws}/merge", ed, {"survivorId": s["id"], "contacts": [{"id": x["id"], "version": 1} for x in (s, d, e)]})[0]
    js = activity(vi, ws, changeType=["MERGE", "MERGED_AWAY"])[1]
    got = sorted((x[0], x[2]) for x in entries(js))
    want = sorted([(s["id"], "MERGE"), (d["id"], "MERGED_AWAY"), (e["id"], "MERGED_AWAY")])
    record(sc, st == 200 and got == want, f"merge {st}, entries {len(got)} as expected {got == want}")


def a05_tag_rename(sc, ctx):
    ws, owner, ed, vi = team()
    t = "oznaka" + letters(2)
    a, b, other = must_create(ed, ws, tags=[t]), must_create(ed, ws, tags=[t]), must_create(ed, ws)
    pause()
    tid = tags_of(ed, ws)[t]["id"]
    api("PATCH", f"/api/workspaces/{ws}/tags/{tid}", ed, {"name": t + "x"})
    ups = sorted(x[0] for x in entries(activity(vi, ws, changeType="UPDATE")[1]))
    record(sc, ups == sorted([a["id"], b["id"]]), f"UPDATE entries for exactly the two tagged Contacts {ups == sorted([a['id'], b['id']])} ({len(ups)})")


def a06_author(sc, ctx):
    ws, owner, ed, vi = team()
    must_create(ed, ws), must_create(owner, ws), must_create(ed, ws)
    js = activity(vi, ws, author=ed.id)[1]
    e = entries(js)
    record(sc, len(e) == 2 and all(x[3] == ed.id for x in e) and js.get("totalItems") == 2, f"Editor's entries {len(e)}/2, total {js.get('totalItems')}")


def a07_types(sc, ctx):
    ws, owner, ed, vi = team()
    a = must_create(ed, ws)
    _, a2, _ = update(ed, ws, a, firstName="Nova")
    b = must_create(ed, ws)
    api("DELETE", f"/api/workspaces/{ws}/contacts/{b['id']}?version=1", ed)
    types = sorted(x[2] for x in entries(activity(vi, ws, changeType=["CREATE", "DELETE"])[1]))
    record(sc, types == ["CREATE", "CREATE", "DELETE"], f"types {types} (expected CREATE, CREATE, DELETE)")


def a08_contact(sc, ctx):
    ws, owner, ed, vi = team()
    a, b = must_create(ed, ws), must_create(ed, ws)
    pause()
    update(ed, ws, a, firstName="Nova")
    e = entries(activity(vi, ws, contactId=a["id"])[1])
    record(sc, [(x[0], x[1]) for x in e] == [(a["id"], 2), (a["id"], 1)], f"entries of one Contact newest first {[(x[1], x[2]) for x in e]}")


def a09_combined(sc, ctx):
    ws, owner, ed, vi = team()
    a = must_create(ed, ws)
    update(owner, ws, a, firstName="Nova")
    b = must_create(owner, ws)
    _, b2, _ = update(ed, ws, b, firstName="Druga")
    e = entries(activity(vi, ws, author=ed.id, changeType="UPDATE")[1])
    record(sc, [(x[0], x[2], x[3]) for x in e] == [(b["id"], "UPDATE", ed.id)], f"author and type together: {len(e)} entries (expected 1)")


def a10_paging(sc, ctx):
    ws, owner, ed, vi = team()
    for _ in range(30):
        must_create(ed, ws)
    p0, p1 = activity(vi, ws, page=0, size=25)[1], activity(vi, ws, page=1, size=25)[1]
    k0, k1 = {(x[0], x[1]) for x in entries(p0)}, {(x[0], x[1]) for x in entries(p1)}
    record(sc, len(k0) == 25 and len(k1) == 5 and p1.get("totalItems") == 30 and not k0 & k1,
           f"page 0 {len(k0)}, page 1 {len(k1)}, total {p1.get('totalItems')}, overlap {len(k0 & k1)}")


def a11_invalid(sc, ctx):
    ws, owner, ed, vi = team()
    cases = {"changeType": {"changeType": "RENAME"}, "size": {"size": 0}, "size ": {"size": 101}, "page": {"page": -1},
             "author": {"author": "ni-id"}, "contactId": {"contactId": "ni-id"}}
    res = {name: activity(vi, ws, **p) for name, p in cases.items()}
    bad = {n: (st, sorted(error_fields(js), key=str)) for n, (st, js) in res.items() if st != 400 or n.strip() not in error_fields(js)}
    record(sc, not bad, f"not rejected with that parameter: {bad or 'none'}")


def a12_purge(sc, ctx):
    ws, owner, ed, vi = team()
    c = must_create(ed, ws)
    api("DELETE", f"/api/workspaces/{ws}/contacts/{c['id']}?version=1", ed)
    st = api("POST", f"/api/workspaces/{ws}/contacts/{c['id']}/purge", owner)[0]
    left = [x for x in entries(activity(vi, ws)[1]) if x[0] == c["id"]]
    record(sc, st == 204 and not left, f"purge {st}, entries left {len(left)}")


def a13_isolation(sc, ctx):
    ws, owner, ed, vi = team()
    v = workspace(owner)
    a, b = must_create(owner, ws), must_create(owner, v)
    ids = {x[0] for x in entries(activity(owner, ws)[1])}
    outsider = activity(new_user(), ws)[0]
    record(sc, ids == {a["id"]} and outsider == 404, f"only W's entries {ids == {a['id']}}, non-Member {outsider} (404)")


def a14_viewer(sc, ctx):
    ws, owner, ed, vi = team()
    must_create(ed, ws)
    st, js = activity(vi, ws)
    record(sc, st == 200 and len(js.get("items", [])) == 1, f"Viewer {st}, entries {len(js.get('items', []))}")


def feature_activity(ctx):
    for i, fn in enumerate([a01_order, a02_names, a03_delete_restore, a04_merge, a05_tag_rename, a06_author, a07_types,
                            a08_contact, a09_combined, a10_paging, a11_invalid, a12_purge, a13_isolation, a14_viewer], 1):
        scenario(f"A{i:02d}", fn, ctx)


# ------------------------------------------------------------------ rate limit phase
def phase_ratelimit():
    u = new_user()   # its own User, so the count starts at zero (the limit is per User and endpoint)
    # start at the beginning of a minute, so a window that counts per clock minute cannot split the four requests
    sec = time.time() % 60
    if sec > 45:
        time.sleep(61 - sec)
    codes = [api("GET", "/api/workspaces", u)[0] for _ in range(4)]
    record("R32", codes[:3] == [200, 200, 200] and codes[3] == 429, f"statuses {codes} (expected 200, 200, 200, 429)")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # the Windows console code page cannot show č, š, ž
    args = sys.argv[1:]
    if not args or args[0] not in ("main", "ratelimit") or "--feature" not in args:
        print(__doc__)
        sys.exit(2)
    phase = args[0]
    features = [f.strip().lower() for f in args[args.index("--feature") + 1].split(",") if f.strip() and f.strip().lower() != "none"]
    unknown = [f for f in features if f not in FEATURES]
    if unknown:
        sys.exit(f"unknown feature {', '.join(unknown)}; known: none, {', '.join(FEATURES)}")
    feature = "+".join(features) or "none"
    if http("GET", "/api/me")[0] == 0:
        sys.exit(f"backend not reachable at {BASE}")
    if http("GET", "/", base=AUTH_URL)[0] == 0:
        sys.exit(f"Auth emulator not reachable at {AUTH_URL}")
    print(f"tag {TAG}, feature {feature}, phase {phase}, project {PROJECT}")
    if phase == "main":
        try:
            ctx = regression()
        except Harness as e:
            sys.exit(f"harness: {e}")
        for f in features:
            FEATURES[f][1](ctx)
    else:
        try:
            phase_ratelimit()
        except Harness as e:
            record("R32", "harness", str(e))
    out = args[args.index("--out") + 1] if "--out" in args else f"oracle-{phase}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"phase": phase, "feature": feature, "features": features,
                   "featurePrefixes": {f: FEATURES[f][0] for f in features}, "tag": TAG, "base_url": BASE, "results": R},
                  f, indent=2, ensure_ascii=False)
    print(f"written {out}")


# ------------------------------------------------------------------ features: name -> (scenario letter, scenarios)
FEATURES = {
    "import": ("I", feature_import),
    "activity": ("A", feature_activity),
}

if __name__ == "__main__":
    main()
