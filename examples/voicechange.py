#!/usr/bin/env python3
"""Drive the VoiceChange desktop app from Python (standard library only).

    python3 voicechange.py state
    python3 voicechange.py voices
    python3 voicechange.py set "Deep Narrator"
    python3 voicechange.py on | off | toggle
    python3 voicechange.py pitch -4
    python3 voicechange.py events

Needs VoiceChange running with Settings → Other apps switched on.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

APP_ID = "io.voicechange.desktop"


def control_file() -> Path:
    if os.environ.get("VOICECHANGE_CONTROL_FILE"):
        return Path(os.environ["VOICECHANGE_CONTROL_FILE"])
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_ID / "control.json"
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / APP_ID / "control.json"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / APP_ID / "control.json"


def connection():
    try:
        c = json.loads(control_file().read_text())
    except OSError:
        sys.exit("VoiceChange control isn't set up: open Settings → Other apps and switch it on.")
    if not c.get("enabled"):
        sys.exit("Control from other apps is off: switch it on in VoiceChange → Settings → Other apps.")
    return f"http://127.0.0.1:{c['port']}", c["token"]


def command(name, **args):
    base, token = connection()
    req = urllib.request.Request(
        f"{base}/v1/{name}",
        data=json.dumps(args).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": "voicechange-py/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        err = json.load(e).get("error", {})
        sys.exit(f"[{err.get('code', e.code)}] {err.get('message', '')}")
    except urllib.error.URLError:
        sys.exit("VoiceChange isn't running.")


def events():
    base, token = connection()
    req = urllib.request.Request(f"{base}/v1/events", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as r:
        name = ""
        for raw in r:
            line = raw.decode().rstrip("\n")
            if line.startswith("event: "):
                name = line[7:]
            elif line.startswith("data: "):
                print(name, line[6:], flush=True)


def main(argv):
    cmd, rest = (argv[0], argv[1:]) if argv else ("state", [])
    if cmd == "state":
        out = command("state")
    elif cmd == "voices":
        for v in command("voice.list")["voices"]:
            flags = (" (Studio)" if v.get("locked") else "") + ("" if v.get("downloaded") else " [not downloaded]")
            print(f"{v['id']:<28} {v['name']}{flags}")
        return
    elif cmd == "set":
        out = command("voice.set", id=" ".join(rest))
    elif cmd in ("on", "off", "toggle"):
        out = command({"on": "voice.start", "off": "voice.stop", "toggle": "voice.toggle"}[cmd])
    elif cmd == "pitch":
        out = command("mixer.set", pitch=float(rest[0]))
    elif cmd == "events":
        return events()
    else:
        sys.exit(__doc__)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
