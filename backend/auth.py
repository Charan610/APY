import time
import bcrypt
import jwt
from typing import Optional, Dict
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_db

SECRET_KEY = "cse-attendance-ledger-jwt-secret-key-2026"
ALGORITHM = "HS256"
TOKEN_EXPIRE_SECONDS = 60 * 60 * 24 * 30  # 30 days

security = HTTPBearer()

# In-memory rate limiter for login attempts per register_number
# Tracks {register_number: [timestamp1, timestamp2, ...]}
LOGIN_ATTEMPTS: Dict[str, list] = {}
MAX_ATTEMPTS = 5
ATTEMPT_WINDOW_SECONDS = 300  # 5 minutes

def check_rate_limit(register_number: str):
    now = time.time()
    attempts = LOGIN_ATTEMPTS.get(register_number, [])
    # Filter attempts within window
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
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pin.encode('utf-8'), salt).decode('utf-8')

def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    return bcrypt.checkpw(plain_pin.encode('utf-8'), hashed_pin.encode('utf-8'))

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    expire = int(time.time() + TOKEN_EXPIRE_SECONDS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub_val = payload.get("sub")
        if sub_val is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token claims"
            )
        user_id = int(sub_val)
    except jwt.PyJWTError as e:
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
