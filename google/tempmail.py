#!/usr/bin/env python3
"""
tempmail.py — Minimal Mail.tm client, auto-extracts 6-digit verification codes.

Commands:
  python3 tempmail.py new           # prints: email\npassword
  python3 tempmail.py list          # prints saved accounts as email\npassword\n...
  python3 tempmail.py inbox <email> # prints only the verification code (XXX XXX) if found
                                    # from a message received less than 1 minute ago,
                                    # otherwise prints nothing (or the message body
                                    # if you change the threshold).
"""
import os, json, urllib.request, urllib.error, uuid, re
from datetime import datetime, timezone

BASE = "https://api.mail.tm"
ACCOUNTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tempmail_accounts.json")

def load_accounts():
    if not os.path.exists(ACCOUNTS_FILE):
        return {}
    try:
        with open(ACCOUNTS_FILE, "r") as f:
            content = f.read().strip()
            if not content:
                return {}
            return json.loads(content)
    except (json.JSONDecodeError, OSError):
        # Recreate/return empty if file corrupted
        return {}

def save_accounts(data):
    with open(ACCOUNTS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def req(url, data=None, headers=None):
    if headers is None:
        headers = {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

def new_email():
    domains = req(f"{BASE}/domains")
    domain = domains["hydra:member"][0]["domain"]
    local = str(uuid.uuid4())[:8]
    address = f"{local}@{domain}"
    password = str(uuid.uuid4())

    payload = json.dumps({"address": address, "password": password}).encode()
    try:
        req(f"{BASE}/accounts", payload)
    except urllib.error.HTTPError as e:
        print("❌ Failed to create account:", e)
        return

    accounts = load_accounts()
    accounts[address] = {"address": address, "password": password}
    save_accounts(accounts)

    # Minimal output: email then password
    print(address)
    print(password)

def list_emails():
    accounts = load_accounts()
    if not accounts:
        print("⚠️ No saved emails yet.")
        return
    for addr, creds in accounts.items():
        print(f"{addr}\n{creds['password']}\n")

def _extract_code_from_text(text):
    """
    Find a 6-digit verification code in text. Accept forms:
      - 6 contiguous digits: 852559
      - grouped by space: 852 559
    Returns normalized 'XXX XXX' string or None.
    """
    if not text:
        return None
    # search for "123456" or "123 456" or similar variants
    patterns = [
        r'\b(\d{3}\s?\d{3})\b',  # 3+space?+3
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            digits = re.sub(r'\D', '', m.group(1))
            if len(digits) == 6:
                return f"{digits[:3]} {digits[3:]}"
    return None

def _parse_created_at(ts):
    """
    Parse ISO8601-like timestamp returned by mail.tm into a timezone-aware datetime.
    Handles '2025-10-20T12:34:56.789Z' and '2025-10-20T12:34:56+00:00' forms.
    """
    if not ts:
        return None
    try:
        # Normalize 'Z' to '+00:00' for fromisoformat
        if ts.endswith("Z"):
            ts = ts[:-1] + "+00:00"
        return datetime.fromisoformat(ts)
    except Exception:
        # Fallback: try common format without fractional seconds
        try:
            return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        except Exception:
            return None

def inbox(address, max_age_seconds=60):
    """
    Show the latest message for `address` only if it was received within `max_age_seconds`.
    Default max_age_seconds is 60 (1 minute).
    """
    accounts = load_accounts()
    if address not in accounts:
        print("❌ Email not found.")
        return

    password = accounts[address]["password"]
    login_payload = json.dumps({"address": address, "password": password}).encode()
    auth = req(f"{BASE}/token", login_payload)
    token = auth["token"]
    headers = {"Authorization": f"Bearer {token}"}

    messages = req(f"{BASE}/messages?page=1", headers=headers)
    mails = messages.get("hydra:member", [])

    if not mails:
        print("")  # keep output minimal
        return

    # Filter mails by createdAt within the last `max_age_seconds`.
    now = datetime.now(timezone.utc)
    recent_mails = []
    for m in mails:
        created_at = _parse_created_at(m.get("createdAt") or m.get("created_at") or "")
        if created_at is None:
            continue
        # Ensure timezone-aware
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        age = (now - created_at).total_seconds()
        if age <= max_age_seconds and age >= 0:
            recent_mails.append((age, m))

    if not recent_mails:
        # No recent mail within window — print nothing to avoid logging old OTPs.
        print("")
        return

    # pick the newest (smallest age)
    recent_mails.sort(key=lambda x: x[0])
    latest = recent_mails[0][1]
    msg_id = latest["id"]
    content = req(f"{BASE}/messages/{msg_id}", headers=headers)
    body = content.get("text") or content.get("html") or ""

    # Extract code
    code = _extract_code_from_text(body)
    if code:
        print(code)
    else:
        # fallback: print full body (trimmed)
        print(body.strip())

def main():
    import sys
    if len(sys.argv) < 2:
        print(__doc__.strip())
        return

    cmd = sys.argv[1].lower()
    if cmd == "new":
        new_email()
    elif cmd == "list":
        list_emails()
    elif cmd == "inbox" and len(sys.argv) == 2:
        # default behavior: use configured 60s threshold
        print("❗ Usage: python3 tempmail.py inbox <email>")  # keep explicit usage
    elif cmd == "inbox" and len(sys.argv) == 3:
        inbox(sys.argv[2])
    else:
        print("❌ Invalid command or missing arguments.")

if __name__ == "__main__":
    main()
