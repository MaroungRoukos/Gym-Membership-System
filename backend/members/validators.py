import re

LEBANON_E164 = re.compile(r"^\+961[0-9]{8}$")


def normalize_lebanon_phone(value: str) -> str:
    if not value or not str(value).strip():
        return ""
    s = re.sub(r"[\s\-]", "", str(value).strip())
    if s.startswith("00"):
        s = "+" + s[2:]
    if not s.startswith("+"):
        if s.startswith("961"):
            s = "+" + s
        elif s.startswith("0") and len(s) >= 9:
            s = "+961" + s[1:]
        elif s.isdigit() and len(s) == 8:
            s = "+961" + s
    if not LEBANON_E164.match(s):
        raise ValueError(
            "Phone must be Lebanon format: +961 followed by 8 digits, "
            "e.g. +96131234567"
        )
    return s
