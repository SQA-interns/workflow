#!/usr/bin/env python3
"""Build the finished project input files of one feature from its feature package.

    python3 features/build-inputs.py <feature> --template <workflow clone> [--ref <git ref> | --worktree]

Reads `features/<feature>/feature-package.md`, takes its fenced ```markdown blocks in order, applies them to the
project files of the base template (the separate repository SQA-interns/workflow; default ref `main`, read with
`git show`, or the working tree with --worktree) and writes the changed files to `features/<feature>/01_input/01_project/`.
Every block must be used exactly once and every anchor must exist exactly once, otherwise the script stops: the
generated files then always match the package text word for word. Greenfield copies the generated folder over the
run's `01_input/`; brownfield gives the same requirements as the prepared change request in `features/<feature>/change/`.
Standard library only.
"""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
PRJ = "01_input/01_project/"
AC = "01_requirements/acceptance-criteria.md"

# Operations per feature, in the order of the package's markdown blocks:
#   ("append", file)                    block added at the end of the file
#   ("after", file, anchor)             block inserted on the line after the line starting with anchor
#   ("before", file, anchor)            block plus a blank line inserted before the line starting with anchor
#   ("replace", file, anchor)           the line starting with anchor is replaced by the block
OPS = {
    "import": [
        ("append", "01_requirements/user-stories.md"),
        ("after", "01_requirements/business-rules.md", "| BR-19 |"),
        ("after", "01_requirements/scope.md", "- Excel Export of a selection or of a filter (US-012)"),
        ("replace", "01_requirements/scope.md", "- Import of Contacts (Excel, CSV, vCard or any other source)"),
        ("replace", "01_requirements/scope.md", "| OQ-06 |"),
        ("before", AC, "## Traceability"),
        ("after", AC, "| US-013 |"),
        ("replace", AC, "Total: 87 criteria."),
        ("after", "01_requirements/e2e-scenarios.md", "| E2E-07 |"),
        ("after", "02_design/security-requirements.md", "| SR-11 |"),
        ("after", "02_design/architecture.md", "| Export workbook |"),
        ("after", "02_design/quality-requirements.md", "| DoD-P06 |"),
        ("append", "02_design/api-contract.md"),
    ],
    "activity": [
        ("replace", "01_requirements/user-stories.md", "In scope: the Revision list with field-level differences"),
        ("append", "01_requirements/user-stories.md"),
        ("after", "01_requirements/business-rules.md", "| BR-19 |"),
        ("after", "01_requirements/scope.md", "- Revisions, Restore and protection against lost updates (US-009)"),
        ("before", AC, "## Traceability"),
        ("after", AC, "| US-013 |"),
        ("replace", AC, "Total: 87 criteria."),
        ("after", "01_requirements/e2e-scenarios.md", "| E2E-07 |"),
        ("after", "02_design/security-requirements.md", "| SR-11 |"),
        ("after", "02_design/architecture.md", "| Export workbook |"),
        ("after", "02_design/quality-requirements.md", "| DoD-P06 |"),
        ("append", "02_design/api-contract.md"),
    ],
}

def die(msg):
    sys.exit("build-inputs: " + msg)


def blocks(feature):
    text = (ROOT / feature / "feature-package.md").read_text(encoding="utf-8").replace("\r\n", "\n")
    return [b.rstrip("\n") for b in re.findall(r"```markdown\n(.*?)```", text, re.S)]


def base_file(template, ref, rel):
    if ref is None:
        path = template / PRJ / rel
        if not path.exists():
            die(f"cannot read {path}")
        return path.read_text(encoding="utf-8").replace("\r\n", "\n")
    out = subprocess.run(["git", "show", f"{ref}:{PRJ}{rel}"], cwd=template, capture_output=True)
    if out.returncode:
        die(f"cannot read {rel} from {ref} in {template}: {out.stderr.decode().strip()}")
    return out.stdout.decode("utf-8").replace("\r\n", "\n")


def anchor_index(lines, anchor, rel):
    hits = [i for i, line in enumerate(lines) if line.startswith(anchor)]
    if len(hits) != 1:
        die(f"anchor {anchor!r} found {len(hits)} times in {rel} (expected once)")
    return hits[0]


def main():
    args = sys.argv[1:]
    if not args or args[0] not in OPS:
        die("usage: build-inputs.py <" + "|".join(OPS) + "> --template <workflow clone> [--ref <git ref> | --worktree]")
    feature = args[0]
    if "--template" not in args:
        die("--template <folder of a SQA-interns/workflow clone> is required")
    template = pathlib.Path(args[args.index("--template") + 1]).resolve()
    ref = None if "--worktree" in args else (args[args.index("--ref") + 1] if "--ref" in args else "main")
    bl, ops = blocks(feature), OPS[feature]
    if len(bl) != len(ops):
        die(f"{feature}: package has {len(bl)} blocks, script expects {len(ops)}")
    files = {}
    for block, op in zip(bl, ops):
        kind, rel = op[0], op[1]
        if rel not in files:
            files[rel] = base_file(template, ref, rel).split("\n")
        lines = files[rel]
        new = block.split("\n")
        if kind == "append":
            while lines and lines[-1] == "":
                lines.pop()
            lines += [""] + new + [""]
        else:
            i = anchor_index(lines, op[2], rel)
            if kind == "after":
                lines[i + 1:i + 1] = new
            elif kind == "before":
                lines[i:i] = new + [""]
            elif kind == "replace":
                lines[i:i + 1] = new
    out_dir = ROOT / feature / PRJ
    for rel, lines in files.items():
        target = out_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("\n".join(lines).rstrip("\n") + "\n", encoding="utf-8", newline="\n")
        print("written", target.relative_to(ROOT.parent).as_posix())
    # check: every block appears verbatim in the result
    joined = {rel: "\n".join(lines) for rel, lines in files.items()}
    for block, op in zip(bl, ops):
        if block not in joined[op[1]]:
            die(f"block for {op} not found verbatim in the result")
    print(f"{feature}: {len(bl)} blocks applied to {len(files)} files from {template} @ {ref or 'working tree'}")


if __name__ == "__main__":
    main()
