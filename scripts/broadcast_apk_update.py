#!/usr/bin/env python3
"""
broadcast_apk_update.py
CLI tool to push an APK update notification to all users who downloaded or use previous versions of APY.
Can be run directly anytime:
    python scripts/broadcast_apk_update.py
    python scripts/broadcast_apk_update.py --version 1.4.0 --notes "Enhanced features, Target simulator, and streak counter"
"""

import os
import sys
import argparse
import json
import urllib.request

# Add backend directory to sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from notifications import broadcast_apk_update_notification, get_latest_apk_broadcast
from database import init_db, get_db

def fetch_latest_github_release():
    url = "https://api.github.com/repos/Charan610/APY/releases/latest"
    req = urllib.request.Request(url, headers={"User-Agent": "APY-Update-Notifier"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            tag = data.get("tag_name", "").lstrip("v")
            apk_url = None
            for asset in data.get("assets", []):
                if asset.get("name", "").lower().endswith(".apk"):
                    apk_url = asset.get("browser_download_url")
                    break
            notes = data.get("body", "")
            return tag, apk_url, notes
    except Exception as e:
        print(f"[Notice] Could not fetch GitHub release: {e}")
        return None, None, None

def main():
    parser = argparse.ArgumentParser(description="Broadcast APK update push notification to all users.")
    parser.add_argument("--version", "-v", type=str, default=None, help="Target APK version (e.g., 1.4.0)")
    parser.add_argument("--url", "-u", type=str, default=None, help="Direct APK download URL")
    parser.add_argument("--notes", "-n", type=str, default=None, help="Release notes / announcement text")
    parser.add_argument("--sender", "-s", type=str, default="CLI Admin", help="Sender register or admin handle")

    args = parser.parse_args()

    init_db()

    target_version = args.version
    target_url = args.url
    target_notes = args.notes

    if not target_version or not target_url:
        gh_tag, gh_url, gh_notes = fetch_latest_github_release()
        if gh_tag and not target_version:
            target_version = gh_tag
        if gh_url and not target_url:
            target_url = gh_url
        if gh_notes and not target_notes:
            target_notes = gh_notes

    target_version = (target_version or "1.4.0").lstrip("v").strip()
    target_url = target_url or f"https://github.com/Charan610/APY/releases/download/v{target_version}/APY.apk"
    target_notes = target_notes or f"APY v{target_version} update is now live. Tap to update your app!"

    print("==================================================")
    print(f"🚀 BROADCASTING APK UPDATE NOTIFICATION")
    print(f"Version:      v{target_version}")
    print(f"Download URL: {target_url}")
    print(f"Sender:       {args.sender}")
    print("==================================================")

    res = broadcast_apk_update_notification(
        version=target_version,
        apk_url=target_url,
        release_notes=target_notes,
        created_by=args.sender
    )

    print("\nBroadcast Results:")
    print(f"  Status:             {res.get('status')}")
    print(f"  Total Targets:      {res.get('total_targets')}")
    print(f"  Notifications Sent: {res.get('notifications_sent')}")
    print(f"  Failed / Unreachable: {res.get('failed')}")

    if res.get("error"):
        print(f"  Errors: {res.get('error')}")

    print("\n✅ Update broadcast completed successfully!")

if __name__ == "__main__":
    main()
