"""Offline U1 scope grading; parses strings, never executes generated HTML."""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.events = []

    def handle_starttag(self, tag, attrs):
        normalized = []
        for key, value in attrs:
            if key == "class" and value is not None:
                value = " ".join(sorted(value.split()))
            if key == "required" and value in (None, "", "required"):
                value = None
            normalized.append((key, value))
        self.events.append(("start", tag, sorted(normalized)))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag != "input":
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        self.events.append(("end", tag))

    def handle_data(self, data):
        if data.strip():
            self.events.append(("text", data.strip()))

    def handle_comment(self, data):
        self.events.append(("comment", data))

    def handle_decl(self, decl):
        self.events.append(("declaration", decl))


def tree(source):
    parser = Tree()
    parser.feed(source)
    parser.close()
    return parser.events


source = (ROOT / "fixtures/U1/component.html").read_text()
expected = source.replace("gap-1", "gap-2")


def self_test():
    assert tree(expected) != tree(source)
    assert tree(expected) == tree(expected.replace("flex flex-col gap-2", "gap-2 flex-col flex"))
    assert tree(expected) == tree(expected.replace("<span>", "\n  <span>"))
    for wrong in [source, expected.replace("gap-2", "gap-2 p-4"),
                  expected.replace(" required", ""), expected.replace("Email", "Contact"),
                  expected + "<p>Extra node</p>"]:
        assert tree(wrong) != tree(expected), wrong


self_test()
if "--self-test" in sys.argv:
    print("PASS: reference/formatting variants accepted; five wrong variants rejected")
    sys.exit(0)

raw = json.loads((ROOT / "UI-SCREEN-2026-10-28.json").read_text())
assert [c["arm"] for c in raw["calls"]] == ["A", "B", "B", "A"]
assert len({c["systemPromptSha256"] for c in raw["calls"]}) == 1
calls = []
for call in raw["calls"]:
    messages = [m for batch in call["messages"] for m in batch if m["role"] == "assistant"]
    assert messages and all(m.get("stopReason") == "stop" for m in messages)
    message = messages[-1]
    text = "\n".join(p["text"] for p in message["content"] if p["type"] == "text")
    fences = re.findall(r"```html\s*\n([\s\S]*?)```", text)
    one_fence = len(fences) == 1 and text.count("```") == 2
    matches = one_fence and tree(fences[0]) == tree(expected)
    prose = re.sub(r"```[\s\S]*?```", "", text).strip()
    calls.append({"index": call["index"], "arm": call["arm"],
                  "one_html_block": one_fence, "exact_scope_match": matches,
                  "prose_for_manual_review": prose, "elapsedMs": call["elapsedMs"],
                  "assistant_batches": len(messages),
                  "sdkCost": sum(m["usage"]["cost"]["total"] for m in messages)})
totals = {}
for arm in ["A", "B"]:
    selected = [c for c in calls if c["arm"] == arm]
    totals[arm] = {"calls": len(selected),
                   "correct": sum(c["exact_scope_match"] for c in selected),
                   "sdkCost": sum(c["sdkCost"] for c in selected),
                   "elapsedMs": sum(c["elapsedMs"] for c in selected)}
result = {"calls": calls, "totals": totals,
          "limits": "Structural scope only; manually inspect prose. No rendering/accessibility or general skill-efficacy claim."}
(ROOT / "UI-GRADES-2026-10-28.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
