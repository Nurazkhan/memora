import json
from database import get_connection

conn = get_connection()
rows = conn.execute("SELECT id, name, layout_json FROM templates LIMIT 3").fetchall()
lines = []
for r in rows:
    layout = json.loads(r["layout_json"])
    lines.append(f"TEMPLATE {r['id']}: {r['name']}")
    for pi, page in enumerate(layout.get("pages", [])):
        lines.append(f"  PAGE {pi}: {page.get('name')} orient={page.get('orientation')}")
        for oi, obj in enumerate(page.get("objects", [])):
            lines.append(f"    OBJ{oi} type={obj.get('type')} role={obj.get('role')} x={round(obj.get('x',0))} y={round(obj.get('y',0))} w={round(obj.get('width',0))} h={round(obj.get('height',0))}")

lines.append("")
lines.append("CLUSTERS:")
clusters = conn.execute("SELECT id, name, project_id FROM clusters LIMIT 10").fetchall()
for c in clusters:
    lines.append(f"  id={c['id']} name={c['name']} proj={c['project_id']}")

lines.append("")
lines.append("IMAGES (first 5):")
images = conn.execute("SELECT id, filename, original_path, project_id FROM images LIMIT 5").fetchall()
for im in images:
    lines.append(f"  id={im['id']} fn={im['filename']} path={im['original_path']}")

lines.append("")
lines.append("FACES (first 5):")
faces = conn.execute("SELECT id, cluster_id, image_id, project_id FROM faces LIMIT 5").fetchall()
for f in faces:
    lines.append(f"  id={f['id']} cluster={f['cluster_id']} image={f['image_id']} proj={f['project_id']}")

conn.close()

with open("_debug_out.py", "w", encoding="utf-8") as fout:
    fout.write("# Debug output\n")
    fout.write("OUTPUT = '''\n")
    for line in lines:
        fout.write(line + "\n")
    fout.write("'''\n")
print("wrote _debug_out.py")
