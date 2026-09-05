"""Rewrite `import { ..., Text, ... } from "react-native"` to use the Inter Text wrapper."""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
IMPORT_RE = re.compile(r'import\s*\{([^}]*)\}\s*from\s*"react-native";')
changed = []
for path in list((ROOT / "app").rglob("*.tsx")) + list((ROOT / "src").rglob("*.tsx")):
    if path.name == "text.tsx" and path.parent.name == "components":
        continue
    src = path.read_text()
    m = IMPORT_RE.search(src)
    if not m:
        continue
    specs = [s.strip() for s in m.group(1).replace("\n", " ").split(",") if s.strip()]
    if "Text" not in specs:
        continue
    specs = [s for s in specs if s != "Text"]
    if specs:
        if len(specs) > 4:
            new_import = 'import {\n  ' + ',\n  '.join(specs) + ',\n} from "react-native";'
        else:
            new_import = 'import { ' + ', '.join(specs) + ' } from "react-native";'
    else:
        new_import = ''
    wrapper = 'import { Text } from "@/src/components/text";'
    replacement = (new_import + "\n" if new_import else "") + wrapper
    src = src[: m.start()] + replacement + src[m.end():]
    path.write_text(src)
    changed.append(str(path.relative_to(ROOT)))
print("\n".join(changed))
