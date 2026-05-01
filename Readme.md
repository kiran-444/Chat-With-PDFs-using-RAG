# 📄 Chat with PDFs — RAG Application

> Upload any PDF, ask questions in plain English, and get accurate answers grounded in your documents — powered by a full **Retrieval-Augmented Generation (RAG)** pipeline with your choice of LLM provider.

---

## 🧠 What is this project?

**Chat with PDFs** is a locally-run RAG (Retrieval-Augmented Generation) web application built with Flask. It lets you:

1. **Upload** one or more PDF documents
2. **Ingest** them — the app splits, embeds, and stores them in a local vector database
3. **Ask questions** — your query is semantically matched against the stored chunks and sent to an LLM along with the relevant context
4. **Get answers** grounded strictly in your documents — no hallucination from outside knowledge

Everything runs locally except the final LLM call (Groq / Gemini / OpenAI). The embedding model runs fully offline after a one-time download.

---

## 🖼️ UI Preview

> _Screenshot coming soon_

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python, Flask 3.x |
| **PDF Parsing** | PyMuPDF (`langchain-community` PyMuPDFLoader) |
| **Text Splitting** | LangChain `RecursiveCharacterTextSplitter` — chunk size 500, overlap 50 |
| **Embedding Model** | `all-MiniLM-L6-v2` via `sentence-transformers` (runs fully offline) |
| **Vector Store** | ChromaDB (persistent, local) |
| **LLM Provider** | Groq (`llama-3.1-8b-instant`) |
| **LLM Orchestration** | LangChain (`langchain-groq`) |
| **Frontend** | HTML / CSS / JS (Jinja2 template served by Flask) |

---

## 🗂️ Project Structure
```
├── 📁 data
├── 📁 static
│   ├── 📄 script.js
│   └── 🎨 style.css
├── 📁 templates
│   └── 🌐 index.html
├── ⚙️ .gitignore
├── 📄 RAG.ipynb
├── 📝 Readme.md
├── 🐍 app.py
├── 🐍 download_model.py
├── 📄 python.txt
└── 📄 requirements.txt
```
---

## 🔄 RAG Pipeline (How it works)

```
PDF Upload
    │
    ▼
PyMuPDFLoader          → extracts raw text per page
    │
    ▼
RecursiveCharacterTextSplitter  → chunks (size=500, overlap=50)
    │
    ▼
all-MiniLM-L6-v2       → converts each chunk to a 384-dim embedding vector
    │
    ▼
ChromaDB               → stores embeddings + text locally (persistent)
    │
    ▼
User Query
    │
    ▼
Embed query → similarity search → top-k=5 chunks retrieved
    │
    ▼
Groq LLM (llama-3.1-8b-instant) → answers using ONLY retrieved context
    │
    ▼
Answer + Sources returned to UI
```

---

## 🚀 How to Run

### 1. Clone the repository

```bash
git clone https://github.com/your-username/chat-with-pdfs.git
cd chat-with-pdfs
```

### 2. Create and activate a virtual environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python -m venv venv
source venv/bin/activate
```

> If you use **Miniconda**:
> ```bash
> conda create -n ragenv python=3.10 -y
> conda activate ragenv
> ```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Download the embedding model *(one-time, needs internet)*

```bash
python download_model.py
```

This downloads `all-MiniLM-L6-v2` (~90 MB) into `models/all-MiniLM-L6-v2/`.  
After this, the app runs **fully offline** for embedding.

### 5. Start the Flask server

```bash
python app.py
```

The app will be available at **`http://localhost:5000`**

---

## 🔑 Groq API Key

This app uses **Groq** as the LLM provider (free & fast).

| Provider | Get your key | Model used |
|---|---|---|
| **Groq** | https://console.groq.com | `llama-3.1-8b-instant` |

Enter your key directly in the UI when querying — it is never stored on disk.

---

## 📋 Usage Walkthrough

1. Open `http://localhost:5000` in your browser
2. **Upload** your PDF file(s) using the upload section
3. Click **Ingest** — wait for the confirmation (chunks indexed count will appear)
4. Enter your **Groq API key**
5. Type your **question** and hit Ask
6. View the **answer** along with the source chunks and similarity scores
7. Use **Clear** to reset everything and start fresh with new PDFs

---

## 🧩 Configuration (inside `app.py`)

| Config | Default | Description |
|---|---|---|
| `chunk_size` | `500` | Characters per text chunk |
| `chunk_overlap` | `50` | Overlapping characters between chunks |
| `top_k` | `5` | Number of chunks retrieved per query |
| `MAX_CONTENT_LENGTH` | `50 MB` | Max upload file size |
| `COLLECTION_NAME` | `pdf_documents` | ChromaDB collection name |

---

## 🛠️ Troubleshooting

**Model not found error on first run**
```
Run python download_model.py once while connected to the internet.
```

**ChromaDB / SQLite error on older Python**
```bash
pip install pysqlite3-binary
```

**Port 5000 already in use**
```bash
python app.py  # change port=5000 to port=5001 in app.py
```

**PDF not parsing correctly**
- Make sure the PDF is not password-protected
- Scanned image-only PDFs won't work (no text layer) — use OCR first

---

## 📦 Dependencies Overview

```
flask                   # Web server
langchain-community     # PyMuPDFLoader
langchain-text-splitters # RecursiveCharacterTextSplitter
sentence-transformers   # all-MiniLM-L6-v2 embeddings
chromadb               # Local vector store
langchain-groq         # Groq LLM integration
pymupdf                # PDF text extraction
scikit-learn / numpy   # Chromadb dependencies
```

---

## 👤 Author

**Kiran Metri**
---

## 📄 License

This project is for educational purposes as part of a structured internship program.