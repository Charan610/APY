import os
import sys

# Add backend directory to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import init_db
from seed_data import seed_database
from main import app

# Ensure database tables and seeds are initialized on serverless startup
try:
    init_db()
    seed_database()
except Exception as e:
    print("Vercel startup init notice:", e)

# Export the FastAPI app for Vercel Serverless
handler = app
