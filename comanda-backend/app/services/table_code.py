def normalize_table_code(raw_table_code: str) -> str:
    normalized = (raw_table_code or "").strip().upper()
    if not normalized:
        return normalized

    if normalized.isdigit():
        # Accept numeric input from client (e.g. "12") and map it to canonical code "M12".
        return f"M{int(normalized)}"

    return normalized
