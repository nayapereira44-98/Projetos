"""Gera um único HTML (sem core.js/app.js separados) para publicar como página avulsa."""
import pathlib, re, sys
here = pathlib.Path(__file__).parent
html = (here / "index.html").read_text(encoding="utf-8")
body = html.split("<!-- ARTIFACT-START -->")[1].split("<!-- ARTIFACT-END -->")[0]
body = body.replace("</head>\n<body>\n<!-- BODY-START -->\n", "")
for name in ("core.js", "app.js"):
    js = (here / name).read_text(encoding="utf-8")
    body = body.replace(f'<script src="{name}"></script>', f"<script>\n{js}</script>")
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else here / "rota-certa-unico.html")
out.write_text(body, encoding="utf-8")
print(out, len(body))
