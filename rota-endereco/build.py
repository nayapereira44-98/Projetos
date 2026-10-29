"""Gera um único HTML com tudo embutido para publicar como página avulsa."""
import pathlib, sys
here = pathlib.Path(__file__).parent
html = (here / "index.html").read_text(encoding="utf-8")
body = html.split("<!-- ARTIFACT-START -->")[1].split("<!-- ARTIFACT-END -->")[0]
body = body.replace("</head>\n<body>\n<!-- BODY-START -->\n", "")
for src, path in (("../rota-certa/core.js", here.parent / "rota-certa" / "core.js"), ("app.js", here / "app.js")):
    body = body.replace(f'<script src="{src}"></script>', "<script>\n" + path.read_text(encoding="utf-8") + "</script>")
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else here / "rota-endereco-unico.html")
out.write_text(body, encoding="utf-8")
print(out, len(body))
