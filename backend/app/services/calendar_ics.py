from dataclasses import dataclass
from datetime import date, datetime, timezone


@dataclass
class IcsEvent:
    uid: str
    summary: str
    event_date: date
    description: str | None = None
    categories: str | None = None


def _escape_ics_text(value: str) -> str:
    escaped = value.replace("\\", "\\\\")
    escaped = escaped.replace(";", r"\;").replace(",", r"\,")
    return escaped.replace("\r\n", r"\n").replace("\n", r"\n")


def _fold_ics_line(line: str, limit: int = 75) -> str:
    if len(line) <= limit:
        return line
    chunks: list[str] = []
    remaining = line
    while len(remaining) > limit:
        chunks.append(remaining[:limit])
        remaining = remaining[limit:]
    chunks.append(remaining)
    return "\r\n ".join(chunks)


def _ics_prop(name: str, value: str) -> str:
    return _fold_ics_line(f"{name}:{_escape_ics_text(value)}")


def build_icalendar(calendar_name: str, events: list[IcsEvent]) -> str:
    now_utc = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TradingJournal//EN",
        "CALSCALE:GREGORIAN",
        _ics_prop("X-WR-CALNAME", calendar_name),
        "X-WR-TIMEZONE:UTC",
    ]

    for event in events:
        lines.extend(
            [
                "BEGIN:VEVENT",
                _ics_prop("UID", event.uid),
                f"DTSTAMP:{now_utc}",
                f"DTSTART;VALUE=DATE:{event.event_date.strftime('%Y%m%d')}",
                _ics_prop("SUMMARY", event.summary),
            ]
        )
        if event.description:
            lines.append(_ics_prop("DESCRIPTION", event.description))
        if event.categories:
            lines.append(_ics_prop("CATEGORIES", event.categories))
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
