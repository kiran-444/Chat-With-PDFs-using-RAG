"""
Run this ONCE before starting the Flask app:
    python download_model.py

It downloads all-MiniLM-L6-v2 into a local `models/` folder so the
app never needs to reach the internet again.
"""

import os
from sentence_transformers import SentenceTransformer

MODEL_NAME = "all-MiniLM-L6-v2"
LOCAL_PATH = os.path.join(os.path.dirname(__file__), "models", MODEL_NAME)

print(f"Downloading '{MODEL_NAME}' → {LOCAL_PATH}")
model = SentenceTransformer(MODEL_NAME)
model.save(LOCAL_PATH)
print("Done! Model saved locally.")
print(f"Path: {LOCAL_PATH}")
