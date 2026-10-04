#!/usr/bin/env python3
"""Reads an OWASP ZAP JSON report and fails on High findings that are not in docs/security/asvs-l1.md.

Medium and Low findings are listed in the job summary but do not fail the run: they are work to look at,
not an emergency. A High finding is "open work": fix it, or record it with a date and a reason.
"""

import json
import sys
from pathlib import Path

HIGH = 3  # ZAP's riskcode: 0 info, 1 low, 2 medium, 3 high
LABELS = {0: "Informational", 1: "Low", 2: "Medium", 3: "High"}


def main(report_path: str, checklist_path: str = "docs/security/asvs-l1.md") -> int:
    report = json.loads(Path(report_path).read_text())
    accepted = Path(checklist_path).read_text() if Path(checklist_path).exists() else ""
    alerts = [a for site in report.get("site", []) for a in site.get("alerts", [])]
    by_risk: dict[int, list[dict]] = {}
    for alert in alerts:
        by_risk.setdefault(int(alert.get("riskcode", 0)), []).append(alert)

    lines = ["### OWASP ZAP baseline", ""]
    for risk in (3, 2, 1, 0):
        items = by_risk.get(risk, [])
        lines.append(f"- {LABELS[risk]}: {len(items)}")
    lines.append("")
    open_high = []
    for risk in (3, 2, 1):
        for alert in by_risk.get(risk, []):
            known = alert.get("pluginid", "") and f"ZAP-{alert['pluginid']}" in accepted
            mark = " (accepted in asvs-l1.md)" if known else ""
            lines.append(f"- **{LABELS[risk]}** {alert.get('name', '?')} (plugin {alert.get('pluginid', '?')}, {len(alert.get('instances', []))} instance(s)){mark}")
            if risk == HIGH and not known:
                open_high.append(alert)
    summary = "\n".join(lines)
    print(summary)
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    if target:
        with target.open("a") as handle:
            handle.write(summary + "\n")
    if open_high:
        print(f"\n{len(open_high)} High finding(s) are open.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
