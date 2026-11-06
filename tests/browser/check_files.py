import json, re, sys, zipfile, os
from pypdf import PdfReader
import openpyxl, docx
from PIL import Image

items = json.load(open(sys.argv[1], encoding="utf-8"))
failed = 0
def report(name, ok, detail=""):
    global failed
    failed += not ok
    print(f"{'PASS' if ok else 'FAIL'} {name}{' — ' + detail if detail else ''}")

for item in items:
    name, path, kind = item["name"], item["file"], item["kind"]
    base = os.path.basename(path)
    problems = []
    if item.get("nameMatches") and not re.fullmatch(item["nameMatches"], base):
        problems.append(f"name {base}")
    text = ""
    if kind == "pdf":
        reader = PdfReader(path)
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        pages = len(reader.pages)
        uris = [a.get_object().get("/A", {}).get("/URI", "") for p in reader.pages for a in (p.get("/Annots") or [])]
        meta = reader.metadata or {}
        if item.get("title") and meta.get("/Title") != item["title"]: problems.append(f"title {meta.get('/Title')!r}")
        if item.get("minPages") and pages < item["minPages"]: problems.append(f"pages {pages}")
        if item.get("pages") and pages != item["pages"]: problems.append(f"pages {pages}")
        for u in item.get("absentUris", []):
            if any(u in str(x) for x in uris): problems.append(f"uri {u} present")
        if item.get("imageOnly") and text.strip(): problems.append("expected an image-only page")
        if item.get("hasImage"):
            images = sum(len(p.images) for p in reader.pages[:1])
            if images < 1: problems.append("no image on first page")
        if item.get("order"):
            # Compare positions on the page: extraction order is not reading order.
            a, b = item["order"]
            found = {}
            for index, page in enumerate(reader.pages):
                def visit(t, cm, tm, fd, fs, index=index):
                    for key in (a, b):
                        if key in t and key not in found:
                            found[key] = (index, -(tm[5] * cm[3] + cm[5]))
                page.extract_text(visitor_text=visit)
            if not (a in found and b in found and found[a] < found[b]): problems.append(f"order {a!r} before {b!r}: {found}")
        detail = f"{pages} pages"
    elif kind in ("markdown", "json", "csv", "mhtml"):
        raw = open(path, "rb").read()
        text = raw.decode("utf-8-sig", errors="replace")
        if kind == "json":
            data = json.loads(text)
            if data.get("schemaVersion") != 1 or "$schema" not in data: problems.append("schema fields")
        if kind == "csv" and not raw.startswith(b"\xef\xbb\xbf"): problems.append("no BOM")
        detail = f"{len(raw)} bytes"
    elif kind == "docx":
        d = docx.Document(path)
        text = "\n".join(p.text for p in d.paragraphs) + "\n" + "\n".join(c.text for t in d.tables for r in t.rows for c in r.cells)
        headings = sum(1 for p in d.paragraphs if p.style.name.startswith("Heading"))
        if item.get("tables") is not None and len(d.tables) < item["tables"]: problems.append(f"tables {len(d.tables)}")
        if item.get("headings") is not None and headings < item["headings"]: problems.append(f"headings {headings}")
        if item.get("images") is not None and len(d.inline_shapes) < item["images"]: problems.append(f"images {len(d.inline_shapes)}")
        if item.get("titleStyle") and not any(p.style.name == "Title" and p.text == item["titleStyle"] for p in d.paragraphs): problems.append("title paragraph")
        core = d.core_properties
        if not (core.comments or "").startswith("Source: "): problems.append("no source in properties")
        detail = f"{len(d.paragraphs)} paragraphs, {len(d.tables)} tables, {len(d.inline_shapes)} images"
    elif kind == "xlsx":
        wb = openpyxl.load_workbook(path)
        if item.get("sheets") and wb.sheetnames != item["sheets"]: problems.append(f"sheets {wb.sheetnames}")
        if item.get("sheets") == ["Vendas por região", "Equipe"]:
            ws = wb["Vendas por região"]
            checks = {
                "A2 text 007": ws["A2"].value == "007" and ws["A2"].data_type == "s",
                "C2 currency number": ws["C2"].value == 1299.9 and "R$" in ws["C2"].number_format,
                "D2 date": hasattr(ws["D2"].value, "year") and ws["D2"].value.day == 5 and ws["D2"].value.month == 11,
                "E2 formula kept as text": ws["E2"].value == "=SUM(A1:A3)" and ws["E2"].data_type == "s",
                "E3 phone kept as text": ws["E3"].value == "+55 11 9999" and ws["E3"].data_type == "s",
                "frozen header": ws.freeze_panes == "A2",
                "filter": ws.auto_filter.ref == "A1:E3",
                "percent": wb["Equipe"]["B2"].value == 0.45
            }
            problems += [k for k, ok in checks.items() if not ok]
        if item.get("sheets") == ["Links", "Metadata"]:
            links = list(wb["Links"].values)
            meta = dict((r[0], r[1]) for r in list(wb["Metadata"].values)[1:])
            if meta.get("Language") != "pt-BR": problems.append("metadata language")
            detail_links = len(links) - 1
        text = "\n".join(str(c) for ws in wb for row in ws.values for c in row if c is not None)
        detail = f"sheets {wb.sheetnames}"
    elif kind == "png":
        img = Image.open(path)
        w, h = img.size
        if item.get("width") and abs(w - item["width"]) > 4: problems.append(f"width {w}")
        if item.get("height") and abs(h - item["height"]) > 4: problems.append(f"height {h}")
        if item.get("minWidth") and w < item["minWidth"]: problems.append(f"width {w}")
        detail = f"{w}x{h}"
    elif kind == "zip":
        z = zipfile.ZipFile(path)
        names = z.namelist()
        if z.testzip() is not None: problems.append("corrupt entry")
        for e in item.get("entries", []):
            if e not in names: problems.append(f"missing {e}")
        if item.get("entryCount") and len(names) != item["entryCount"]: problems.append(f"entries {names}")
        if "report.txt" in names:
            report_text = z.read("report.txt").decode("utf-8")
            for c in item.get("reportContains", []):
                if c not in report_text: problems.append(f"report lacks {c!r}")
        detail = ", ".join(names)
    for c in item.get("contains", []):
        if c not in text: problems.append(f"missing {c!r}")
    for a in item.get("absent", []):
        if a in text: problems.append(f"contains {a!r}")
    report(f"{name} [{base}]", not problems, "; ".join(problems) if problems else detail)
print(f"\n{len(items) - failed}/{len(items)} files verified")
sys.exit(1 if failed else 0)
