import os

os.environ.setdefault('VERCEL', '1')

import pytest
from routers import notification_routes


@pytest.mark.parametrize('old_broadcast', [None, {'version': '1.4.6', 'apk_url': 'https://example.test/old.apk', 'release_notes': 'Old release', 'created_at': '2026-10-11'}])
def test_latest_apk_fallback_does_not_offer_obsolete_apk(monkeypatch, old_broadcast):
    monkeypatch.setattr(notification_routes, 'get_latest_apk_broadcast', lambda: old_broadcast)
    result = notification_routes.get_latest_apk_info()
    assert result['version'] == '1.4.7'
    assert result['apk_url'] == 'https://github.com/Charan610/APY/releases/download/v1.4.7/APY.apk'


def test_newer_broadcast_remains_discoverable(monkeypatch):
    broadcast = {'version': '1.5.0', 'apk_url': 'https://example.test/new.apk', 'release_notes': 'Newer release', 'created_at': '2026-11-01'}
    monkeypatch.setattr(notification_routes, 'get_latest_apk_broadcast', lambda: broadcast)
    result = notification_routes.get_latest_apk_info()
    assert result['version'] == '1.5.0'
    assert result['apk_url'] == 'https://example.test/new.apk'
