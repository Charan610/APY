import time
import os
import hashlib
import secrets
import base64
import json
import hmac
from typing import Optional, Dict
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_db

try:
    import jwt
except Exception:
    jwt = None

try:
    import bcrypt
    HAS_BCRYPT = True
except Exception:
    HAS_BCRYPT = False

SECRET_KEY = "cse-attendance-ledger-jwt-secret-key-2026"
ALGORITHM = "HS256"
TOKEN_EXPIRE_SECONDS = 60 * 60 * 24 * 30  # 30 days

security = HTTPBearer(auto_error=False)

LOGIN_ATTEMPTS: Dict[str, list] = {}
MAX_ATTEMPTS = 10
ATTEMPT_WINDOW_SECONDS = 300  # 5 minutes

def check_rate_limit(register_number: str):
    now = time.time()
    attempts = LOGIN_ATTEMPTS.get(register_number, [])
    recent_attempts = [t for t in attempts if now - t < ATTEMPT_WINDOW_SECONDS]
    LOGIN_ATTEMPTS[register_number] = recent_attempts
    
    if len(recent_attempts) >= MAX_ATTEMPTS:
        wait_time = int(ATTEMPT_WINDOW_SECONDS - (now - recent_attempts[0]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts for {register_number}. Please try again in {wait_time} seconds."
        )

def record_failed_attempt(register_number: str):
    now = time.time()
    attempts = LOGIN_ATTEMPTS.get(register_number, [])
    attempts.append(now)
    LOGIN_ATTEMPTS[register_number] = attempts

def clear_rate_limit(register_number: str):
    if register_number in LOGIN_ATTEMPTS:
        del LOGIN_ATTEMPTS[register_number]

def hash_pin(pin: str) -> str:
    if HAS_BCRYPT:
        try:
            salt = bcrypt.gensalt()
            return bcrypt.hashpw(pin.encode('utf-8'), salt).decode('utf-8')
        except Exception:
            pass
    # Pure Python PBKDF2 Fallback (Zero Binary Dependencies)
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', pin.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"pbkdf2:{salt}:{key.hex()}"

def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    if not hashed_pin:
        return False
    if hashed_pin.startswith("pbkdf2:"):
        try:
            _, salt, key_hex = hashed_pin.split(":")
            key = hashlib.pbkdf2_hmac('sha256', plain_pin.encode('utf-8'), salt.encode('utf-8'), 100000)
            return secrets.compare_digest(key.hex(), key_hex)
        except Exception:
            return False
    elif HAS_BCRYPT:
        try:
            return bcrypt.checkpw(plain_pin.encode('utf-8'), hashed_pin.encode('utf-8'))
        except Exception:
            return False
    return False

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    expire = int(time.time() + TOKEN_EXPIRE_SECONDS)
    to_encode.update({"exp": expire})
    if jwt is not None:
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    def encode_part(value):
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")
    header = encode_part(json.dumps({"alg": ALGORITHM, "typ": "JWT"}, separators=(",", ":")).encode())
    body = encode_part(json.dumps(to_encode, separators=(",", ":")).encode())
    signing_input = f"{header}.{body}".encode("ascii")
    signature = hmac.new(SECRET_KEY.encode(), signing_input, hashlib.sha256).digest()
    return f"{header}.{body}.{encode_part(signature)}"

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in."
        )
    token = credentials.credentials
    try:
        if jwt is not None:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        else:
            header, body, encoded_signature = token.split(".")
            signing_input = f"{header}.{body}".encode("ascii")
            expected_signature = hmac.new(SECRET_KEY.encode(), signing_input, hashlib.sha256).digest()
            actual_signature = base64.urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))
            if not hmac.compare_digest(actual_signature, expected_signature):
                raise ValueError("Invalid token signature")
            payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
            if int(payload.get("exp", 0)) < int(time.time()):
                raise ValueError("Token expired")
        sub_val = payload.get("sub")
        if sub_val is None or str(sub_val) == "None":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token claims"
            )
        user_id = int(sub_val)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT u.id, u.register_number, u.section_id, u.baseline_attended, 
                   u.baseline_total, u.baseline_date, s.branch, s.section_label
            FROM users u
            JOIN sections s ON u.section_id = s.id
            WHERE u.id = ?
            """,
            (user_id,)
        )
        user = cursor.fetchone()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        return dict(user)
