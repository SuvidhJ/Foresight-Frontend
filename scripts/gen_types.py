"""Export shared/contracts.py (pydantic) as JSON Schema that json-schema-to-typescript can read.

Run through `npm run gen:types` from web/. The output replaces the hand-written mirror in
src/contract/types.ts once the team's contract exists (doc 05, I0).

Two clean-ups make the TypeScript usable:
  * per-property "title" is dropped, otherwise every field becomes its own type alias;
  * 2020-12 tuples ("prefixItems") become the draft-07 form json2ts understands.
"""
import inspect
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from pydantic import BaseModel  # noqa: E402
from pydantic.json_schema import models_json_schema  # noqa: E402

try:
    import shared.contracts as contracts  # noqa: E402
except ModuleNotFoundError:
    sys.exit(f"shared/contracts.py not found under {ROOT}. Keep using src/contract/types.ts until it exists.")


def clean(node):
    if isinstance(node, dict):
        if "prefixItems" in node:
            node["items"] = node.pop("prefixItems")
            node["minItems"] = node["maxItems"] = len(node["items"])
        for prop in node.get("properties", {}).values():
            prop.pop("title", None)
        for v in node.values():
            clean(v)
    elif isinstance(node, list):
        for v in node:
            clean(v)


models = [m for _, m in inspect.getmembers(contracts, inspect.isclass) if issubclass(m, BaseModel) and m is not BaseModel and m.__module__ == contracts.__name__]
_, schema = models_json_schema([(m, "serialization") for m in models], title="Contracts")
clean(schema)
out = Path(__file__).resolve().parents[1] / "src" / "contract" / "contracts.schema.json"
out.write_text(json.dumps(schema, indent=1), encoding="utf-8")
print(f"{len(models)} models -> {out}")
