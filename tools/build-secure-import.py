#!/usr/bin/env python3
"""Build private planner import files from the MXC wedding workbook.

The generated files belong in an ignored folder and must not be committed.
"""

from __future__ import annotations

import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd


TABLES = ["tasks", "budget_items", "guests", "vendors", "timeline_items", "content_blocks"]


def clean(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).replace("\xa0", " ").strip()
    if not text or text.lower() in {"nan", "none"}:
        return None
    return re.sub(r"\s+", " ", text)


def number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and not (isinstance(value, float) and math.isnan(value)):
        return float(value)
    text = clean(value)
    if not text:
        return None
    text = text.replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


def money(value: Any) -> float:
    parsed = number(value)
    return round(parsed, 2) if parsed is not None else 0.0


def compact_money(value: float) -> int | float:
    value = round(float(value), 2)
    return int(value) if value.is_integer() else value


def status_from_sheet(status: str | None, total: float, paid: float) -> str:
    text = (status or "").lower()
    if "enquir" in text or "tbc" in text:
        return "pending"
    if "booked" in text or "paid" in text or "purchased" in text:
        return "approved" if total > 0 and paid >= total else "pending"
    return "outstanding"


def category_for(title: str, fallback: str | None = None) -> str:
    text = title.lower()
    rules = [
        ("Civil Ceremony", ["civil", "gibraltar", "ceremony"]),
        ("Rings", ["ring"]),
        ("Attire", ["outfit", "suit", "dress", "bow tie"]),
        ("Venue", ["venue"]),
        ("Accommodation", ["accommodation"]),
        ("Catering", ["catering"]),
        ("Cake", ["cake", "dessert"]),
        ("Bar", ["drink", "bar"]),
        ("Photo/video", ["photo", "video"]),
        ("Decor", ["decor", "floral", "flower"]),
        ("Production", ["av", "lighting"]),
        ("Furniture", ["furniture"]),
        ("Transport", ["transport"]),
        ("Beauty", ["hair", "make up", "makeup"]),
        ("Entertainment", ["dj", "entertainment"]),
    ]
    for label, needles in rules:
        if any(needle in text for needle in needles):
            return label
    return fallback or "General"


def celebration_for_misc(title: str) -> str:
    text = title.lower()
    if "spain" in text:
        return "spain"
    if "south africa" in text or re.search(r"\bsa\b", text):
        return "south_africa"
    return "shared"


def row_id(prefix: str, index: int) -> str:
    return f"workbook-{prefix}-{index:03d}"


def audit_note(*parts: str | None) -> str | None:
    values = [part for part in parts if part]
    return " | ".join(values) if values else None


def parse_budget_sheet(
    workbook: Path,
    sheet_name: str,
    celebration: str,
    currency: str,
    prefix: str,
    start_index: int,
) -> list[dict[str, Any]]:
    df = pd.read_excel(workbook, sheet_name=sheet_name, header=None, dtype=object)
    items: list[dict[str, Any]] = []
    section = "General"
    index = start_index

    for _, row in df.iterrows():
        section_label = clean(row.iloc[0] if len(row) > 0 else None)
        title = clean(row.iloc[1] if len(row) > 1 else None)
        if section_label and not title and section_label.upper() not in {"MXC WEDDING PLANNING"}:
            section = section_label.title()
            continue
        if not title or title.upper() in {"ITEM", "TOTAL", "RUNNING TOTALS"}:
            continue

        notes = clean(row.iloc[2] if len(row) > 2 else None)
        deposit_raw = row.iloc[3] if len(row) > 3 else None
        remaining_raw = row.iloc[4] if len(row) > 4 else None
        total_raw = row.iloc[5] if len(row) > 5 else None
        status = clean(row.iloc[6] if len(row) > 6 else None)

        total = money(total_raw)
        deposit = money(deposit_raw)
        remaining = number(remaining_raw)
        paid = max(total - remaining, 0) if remaining is not None and total else deposit
        if total and not paid and status and "paid" in status.lower() and remaining is None:
            paid = total

        item_celebration = celebration if celebration != "shared" else celebration_for_misc(title)
        item_currency = "ZAR" if item_celebration == "south_africa" else currency
        note = audit_note(
            notes,
            f"Workbook status: {status}" if status else None,
            f"Workbook remaining: {clean(remaining_raw)}" if remaining is None and clean(remaining_raw) else None,
            f"Workbook section: {section}" if section != "General" else None,
        )
        index += 1
        items.append(
            {
                "id": row_id(prefix, index),
                "title": title,
                "owner": "shared",
                "celebration": item_celebration,
                "category": category_for(title, section if section != "General" else None),
                "currency": item_currency,
                "estimated": compact_money(total),
                "deposit": compact_money(deposit),
                "paid": compact_money(paid),
                "due_date": None,
                "status": status_from_sheet(status, total, paid),
                "notes": note,
            }
        )
    return items


def parse_tasks(workbook: Path, now: str) -> list[dict[str, Any]]:
    df = pd.read_excel(workbook, sheet_name="To Do", header=None, dtype=object)
    tasks: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        action = clean(row.iloc[1] if len(row) > 1 else None)
        if not action or action.upper() == "ACTION":
            continue
        done = row.iloc[0] is True
        category = "Legal" if "gibraltar" in action.lower() else "General"
        tasks.append(
            {
                "id": row_id("task", len(tasks) + 1),
                "title": action,
                "description": None,
                "owner": "shared",
                "celebration": "shared",
                "category": category,
                "priority": "high" if not done and category == "Legal" else "normal",
                "due_date": None,
                "status": "approved" if done else "outstanding",
                "notes": "Imported from workbook To Do sheet.",
                "created_at": now,
                "updated_at": now,
            }
        )
    return tasks


def parse_guests(workbook: Path, sheet_name: str, celebration: str, prefix: str, now: str) -> list[dict[str, Any]]:
    df = pd.read_excel(workbook, sheet_name=sheet_name, header=None, dtype=object)
    guests: list[dict[str, Any]] = []
    for _, row in df.iloc[3:].iterrows():
        name = clean(row.iloc[1] if len(row) > 1 else None)
        if not name or name.upper() in {"NAME", "TOTAL"}:
            continue
        invited = row.iloc[2] if len(row) > 2 else None
        if invited is not True:
            continue

        rsvp = clean(row.iloc[3] if len(row) > 3 else None)
        other_ceremony = clean(row.iloc[4] if len(row) > 4 else None)
        dietary = clean(row.iloc[5] if len(row) > 5 else None)
        transport = clean(row.iloc[6] if len(row) > 6 else None)
        song = clean(row.iloc[7] if len(row) > 7 else None)
        note = clean(row.iloc[8] if len(row) > 8 else None)

        normalized_rsvp = {"yes": "yes", "no": "no", "tbc": "tbc"}.get((rsvp or "").lower(), "no_response")
        clean_dietary = None if dietary and dietary.lower() in {"n/a", "na"} else dietary
        clean_transport = None if transport and transport.lower() in {"nan"} else transport
        notes = audit_note(
            f"Other ceremony: {other_ceremony}" if other_ceremony and other_ceremony.lower() not in {"n/a", "na"} else None,
            f"Song: {song}" if song else None,
            note,
        )

        guests.append(
            {
                "id": row_id(prefix, len(guests) + 1),
                "name": name,
                "party_name": None,
                "owner": "shared",
                "celebration": celebration,
                "rsvp_status": normalized_rsvp,
                "dietary": clean_dietary,
                "transport": clean_transport,
                "accommodation": None,
                "contact": None,
                "notes": notes,
                "created_at": now,
                "updated_at": now,
            }
        )
    return guests


def build_vendors(budget_items: list[dict[str, Any]], now: str) -> list[dict[str, Any]]:
    vendors: list[dict[str, Any]] = []

    def add_from_budget(item: dict[str, Any]) -> None:
        item_title = str(item["title"])
        vendor_name = str(item.get("notes") or item_title).split("|", 1)[0].strip()
        if vendor_name.lower().startswith("workbook status:"):
            vendor_name = item_title
        vendors.append(
            {
                "id": row_id("vendor", len(vendors) + 1),
                "name": vendor_name,
                "owner": "shared",
                "celebration": item["celebration"],
                "category": item["category"],
                "contact_name": None,
                "email": None,
                "phone": None,
                "currency": item["currency"],
                "quote_amount": item["estimated"],
                "next_action": f"Follow up {item_title.lower()} status.",
                "due_date": None,
                "status": item["status"],
                "notes": "Imported from workbook budget/vendor notes.",
                "created_at": now,
                "updated_at": now,
            }
        )

    vendor_categories = {"Venue", "Photo/video", "Catering", "Beauty", "Entertainment", "Transport", "Decor", "Production"}
    for item in budget_items:
        if item["celebration"] == "shared" or item["category"] not in vendor_categories:
            continue
        add_from_budget(item)

    return vendors


def baseline_timeline(now: str) -> list[dict[str, Any]]:
    return [
        {
            "id": "workbook-timeline-001",
            "title": "Spain guest arrival",
            "owner": "shared",
            "celebration": "spain",
            "item_date": "2026-10-10",
            "item_time": "17:30",
            "audience": "guest",
            "location": "Spain venue",
            "sort_order": 10,
            "status": "pending",
            "notes": "",
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "workbook-timeline-002",
            "title": "Spain ceremony",
            "owner": "shared",
            "celebration": "spain",
            "item_date": "2026-10-10",
            "item_time": "18:00",
            "audience": "guest",
            "location": "Spain venue",
            "sort_order": 20,
            "status": "pending",
            "notes": "",
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "workbook-timeline-003",
            "title": "South Africa guest arrival",
            "owner": "shared",
            "celebration": "south_africa",
            "item_date": "2026-12-19",
            "item_time": "16:30",
            "audience": "guest",
            "location": "South Africa venue",
            "sort_order": 10,
            "status": "pending",
            "notes": "",
            "created_at": now,
            "updated_at": now,
        },
    ]


def with_timestamps(rows: list[dict[str, Any]], now: str) -> list[dict[str, Any]]:
    for row in rows:
        row.setdefault("created_at", now)
        row.setdefault("updated_at", now)
    return rows


def sql_value(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert_if_missing(table: str, columns: list[str], row: dict[str, Any], match: dict[str, Any]) -> str:
    values = ", ".join(sql_value(row.get(column)) for column in columns)
    predicates = " and ".join(f"{column} = {sql_value(value)}" for column, value in match.items())
    return (
        f"insert into public.{table} ({', '.join(columns)})\n"
        f"select {values}\n"
        f"where not exists (select 1 from public.{table} where {predicates});"
    )


def build_sql(data: dict[str, list[dict[str, Any]]], generated_at: str) -> str:
    lines = [
        "-- MXC Wedding private Supabase seed",
        f"-- Generated {generated_at} from MXC Wedding Planner.xlsx.",
        "-- Contains private planner data. Do not commit this file.",
        "",
        "begin;",
        "",
    ]

    for row in data["tasks"]:
        columns = ["title", "description", "owner", "celebration", "category", "priority", "due_date", "status", "notes"]
        lines.append(insert_if_missing("tasks", columns, row, {"title": row["title"], "owner": row["owner"], "celebration": row["celebration"]}))
    for row in data["budget_items"]:
        columns = ["title", "owner", "celebration", "category", "currency", "estimated", "deposit", "paid", "due_date", "status", "notes"]
        lines.append(insert_if_missing("budget_items", columns, row, {"title": row["title"], "celebration": row["celebration"], "category": row["category"]}))
    for row in data["guests"]:
        columns = ["name", "party_name", "owner", "celebration", "rsvp_status", "dietary", "transport", "accommodation", "contact", "notes"]
        lines.append(insert_if_missing("guests", columns, row, {"name": row["name"], "celebration": row["celebration"]}))
    for row in data["vendors"]:
        columns = ["name", "owner", "celebration", "category", "contact_name", "email", "phone", "currency", "quote_amount", "next_action", "due_date", "status", "notes"]
        lines.append(insert_if_missing("vendors", columns, row, {"name": row["name"], "celebration": row["celebration"], "category": row["category"]}))
    for row in data["timeline_items"]:
        columns = ["title", "owner", "celebration", "item_date", "item_time", "audience", "location", "sort_order", "status", "notes"]
        lines.append(insert_if_missing("timeline_items", columns, row, {"title": row["title"], "celebration": row["celebration"], "item_date": row["item_date"]}))

    lines.extend(["", "commit;", ""])
    return "\n\n".join(lines)


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: build-secure-import.py <workbook.xlsx> [output-dir]", file=sys.stderr)
        return 2

    workbook = Path(sys.argv[1]).expanduser().resolve()
    output_dir = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) > 2 else Path("private-data").resolve()
    if not workbook.exists():
        print(f"Workbook not found: {workbook}", file=sys.stderr)
        return 1

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    now = generated_at.replace("+00:00", "Z")

    budget_items: list[dict[str, Any]] = []
    budget_items.extend(parse_budget_sheet(workbook, "Spain", "spain", "EUR", "budget", 0))
    budget_items.extend(parse_budget_sheet(workbook, "South Africa", "south_africa", "ZAR", "budget", len(budget_items)))
    budget_items.extend(parse_budget_sheet(workbook, "Misc Items", "shared", "EUR", "budget", len(budget_items)))
    budget_items = with_timestamps(budget_items, now)

    data = {
        "tasks": parse_tasks(workbook, now),
        "budget_items": budget_items,
        "guests": parse_guests(workbook, "Spain Guests", "spain", "guest-spain", now)
        + parse_guests(workbook, "SA Guests", "south_africa", "guest-sa", now),
        "vendors": build_vendors(budget_items, now),
        "timeline_items": baseline_timeline(now),
        "content_blocks": [],
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    package = {
        "generated_at": generated_at,
        "source_workbook": workbook.name,
        "privacy": "Private planner data. Do not commit or publish this file.",
        "counts": {table: len(data[table]) for table in TABLES},
        "data": data,
    }

    json_path = output_dir / "MXC_Wedding_Secure_Import.json"
    sql_path = output_dir / "MXC_Wedding_Supabase_Seed.sql"
    json_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sql_path.write_text(build_sql(data, generated_at), encoding="utf-8")

    print(json.dumps({"json": str(json_path), "sql": str(sql_path), "counts": package["counts"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
