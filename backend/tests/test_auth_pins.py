import os
os.environ.setdefault("VERCEL", "1")

from auth import hash_pin, verify_pin


def test_pin_roundtrip_all_lengths():
    for pin in ["1234", "12345", "123456"]:
        h = hash_pin(pin)
        assert h and h != pin
        assert verify_pin(pin, h) is True
        assert verify_pin(pin[::-1], h) is False


def test_verify_pin_empty_hash():
    assert verify_pin("1234", "") is False


def test_wrong_pin_rejected():
    h = hash_pin("1234")
    assert verify_pin("9999", h) is False


def test_hash_not_plain():
    h = hash_pin("1234")
    assert h != "1234"
