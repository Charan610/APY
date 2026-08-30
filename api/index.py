import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_LOCAL = os.path.join(CURRENT_DIR, "backend")
BACKEND_PARENT = os.path.join(os.path.dirname(CURRENT_DIR), "backend")

for p in [BACKEND_LOCAL, BACKEND_PARENT, CURRENT_DIR]:
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

from main import app
