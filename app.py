import os
import uuid
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# ── Load .env first ───────────────────────────────────────────────────────────
load_dotenv()

# ── RAG imports ───────────────────────────────────────────────────────────────
from langchain_community.document_loaders.pdf import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
import chromadb

# ── Force offline mode so HuggingFace is never contacted at runtime ───────────
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_DATASETS_OFFLINE", "1")

# ── Read API keys from environment ────────────────────────────────────────────
GROQ_API_KEY     = os.getenv("GROQ_API_KEY", "")
GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY   = os.getenv("OPENAI_API_KEY", "")
DEFAULT_PROVIDER = os.getenv("DEFAULT_PROVIDER", "groq").lower()

if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY not found in .env")

PROVIDER_KEYS = {
    "groq":   GROQ_API_KEY,
    "gemini": GEMINI_API_KEY,
    "openai": OPENAI_API_KEY,
}

# ── Flask setup ───────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["UPLOAD_FOLDER"]      = "data/pdfs"
app.config["VECTOR_STORE_DIR"]   = "data/vector_store"
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

os.makedirs(app.config["UPLOAD_FOLDER"],    exist_ok=True)
os.makedirs(app.config["VECTOR_STORE_DIR"], exist_ok=True)

MODEL_NAME  = "all-MiniLM-L6-v2"
LOCAL_MODEL = os.path.join(os.path.dirname(__file__), "models", MODEL_NAME)

embedding_model = None
chroma_client   = None
collection      = None
COLLECTION_NAME = "pdf_documents"


def get_embedding_model():
    global embedding_model
    if embedding_model is not None:
        return embedding_model
    if os.path.isdir(LOCAL_MODEL):
        print(f"[model] Loading from local path: {LOCAL_MODEL}")
        os.environ.pop("TRANSFORMERS_OFFLINE", None)
        embedding_model = SentenceTransformer(LOCAL_MODEL)
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        return embedding_model
    try:
        print(f"[model] Trying HF cache for '{MODEL_NAME}'")
        os.environ.pop("TRANSFORMERS_OFFLINE", None)
        embedding_model = SentenceTransformer(MODEL_NAME)
        embedding_model.save(LOCAL_MODEL)
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        return embedding_model
    except Exception as e:
        raise RuntimeError(
            f"Could not load embedding model. Run: python download_model.py\nError: {e}"
        )


def get_collection():
    global chroma_client, collection
    if chroma_client is None:
        chroma_client = chromadb.PersistentClient(path=app.config["VECTOR_STORE_DIR"])
    if collection is None:
        collection = chroma_client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"description": "RAG vector store"},
        )
    return collection


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/config")
def config():
    return jsonify({
        "default_provider":    DEFAULT_PROVIDER,
        "available_providers": [p for p, k in PROVIDER_KEYS.items() if k],
    })


@app.route("/status")
def status():
    col      = get_collection()
    uploaded = [f for f in os.listdir(app.config["UPLOAD_FOLDER"]) if f.endswith(".pdf")]
    return jsonify({
        "uploaded_pdfs":  len(uploaded),
        "pdf_names":      uploaded,
        "indexed_chunks": col.count(),
    })


@app.route("/upload", methods=["POST"])
def upload():
    if "files" not in request.files:
        return jsonify({"error": "No files provided"}), 400
    saved = []
    for file in request.files.getlist("files"):
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            continue
        filename = secure_filename(file.filename)
        file.save(os.path.join(app.config["UPLOAD_FOLDER"], filename))
        saved.append(filename)
    if not saved:
        return jsonify({"error": "No valid PDF files found in request"}), 400
    return jsonify({"message": f"Uploaded {len(saved)} file(s)", "files": saved})


@app.route("/ingest", methods=["POST"])
def ingest():
    folder    = app.config["UPLOAD_FOLDER"]
    pdf_files = [f for f in os.listdir(folder) if f.lower().endswith(".pdf")]
    if not pdf_files:
        return jsonify({"error": "No PDFs found. Upload files first."}), 400

    all_docs = []
    for filename in pdf_files:
        loader = PyMuPDFLoader(os.path.join(folder, filename))
        all_docs.extend(loader.load())

    splitter   = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks     = splitter.split_documents(all_docs)

    try:
        model = get_embedding_model()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    texts      = [c.page_content for c in chunks]
    embeddings = model.encode(texts, show_progress_bar=False)

    col = get_collection()
    try:
        existing = col.get()
        if existing["ids"]:
            col.delete(ids=existing["ids"])
    except Exception:
        pass

    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        meta = dict(chunk.metadata)
        meta["doc_index"]      = i
        meta["content_length"] = len(chunk.page_content)
        col.add(
            ids=[f"doc_{uuid.uuid4()}"],
            metadatas=[meta],
            documents=[chunk.page_content],
            embeddings=[emb.tolist()],
        )

    return jsonify({
        "message":        "Ingestion complete",
        "pdfs_processed": len(pdf_files),
        "chunks_indexed": col.count(),
    })


@app.route("/query", methods=["POST"])
def query():
    data         = request.get_json() or {}
    user_query   = data.get("query", "").strip()
    llm_provider = DEFAULT_PROVIDER          # always use .env DEFAULT_PROVIDER
    top_k        = int(data.get("top_k", 5))

    if not user_query:
        return jsonify({"error": "Query is empty"}), 400

    api_key = PROVIDER_KEYS.get(llm_provider, "")
    if not api_key:
        return jsonify({
            "error": f"No API key configured for '{llm_provider}'. "
                     f"Add {llm_provider.upper()}_API_KEY to your .env file."
        }), 400

    col = get_collection()
    if col.count() == 0:
        return jsonify({"error": "No documents indexed. Upload and ingest PDFs first."}), 400

    try:
        model = get_embedding_model()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    q_emb   = model.encode([user_query])[0]
    results = col.query(
        query_embeddings=[q_emb.tolist()],
        n_results=min(top_k, col.count()),
    )

    retrieved_docs = []
    if results["documents"] and results["documents"][0]:
        for doc_id, meta, doc, dist in zip(
            results["ids"][0],
            results["metadatas"][0],
            results["documents"][0],
            results["distances"][0],
        ):
            retrieved_docs.append({
                "id":               doc_id,
                "document":         doc,
                "metadata":         meta,
                "similarity_score": round(1 - dist, 4),
            })

    context = "\n\n".join([d["document"] for d in retrieved_docs]) if retrieved_docs else ""
    if not context:
        return jsonify({"answer": "No relevant content found in the indexed documents.", "sources": []})

    try:
        answer = generate_with_llm(user_query, context, api_key, llm_provider)
    except Exception as e:
        return jsonify({"error": f"LLM error: {str(e)}"}), 500

    sources = [
        {
            "source":  d["metadata"].get("source", "Unknown"),
            "page":    d["metadata"].get("page", "?"),
            "score":   d["similarity_score"],
            "snippet": d["document"][:200] + "...",
        }
        for d in retrieved_docs
    ]
    return jsonify({"answer": answer, "sources": sources})


def generate_with_llm(query, context, api_key, provider):
    prompt = (
        "You are a helpful assistant. Answer the query using ONLY the provided context.\n"
        "Be concise, accurate, and cite key points from the context.\n\n"
        f"Context:\n{context}\n\nQuery:\n{query}\n\nAnswer:"
    )
    if provider == "groq":
        from langchain_groq import ChatGroq
        llm = ChatGroq(groq_api_key=api_key, model="llama-3.1-8b-instant",
                       temperature=0.1, max_tokens=1024)
        return llm.invoke(prompt).content
    elif provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.messages import HumanMessage, SystemMessage
        llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", google_api_key=api_key, temperature=0.1)
        msgs = [
            SystemMessage(content="You are a helpful assistant. Answer using only the provided context."),
            HumanMessage(content=f"Context:\n{context}\n\nQuery:\n{query}"),
        ]
        return llm.invoke(msgs).content
    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(openai_api_key=api_key, model="gpt-4o-mini",
                         temperature=0.1, max_tokens=1024)
        return llm.invoke(prompt).content
    else:
        return "Unsupported LLM provider selected."


@app.route("/clear", methods=["POST"])
def clear():
    global collection
    try:
        col      = get_collection()
        existing = col.get()
        if existing["ids"]:
            col.delete(ids=existing["ids"])
        folder = app.config["UPLOAD_FOLDER"]
        for f in os.listdir(folder):
            if f.endswith(".pdf"):
                os.remove(os.path.join(folder, f))
        collection = None
        get_collection()
        return jsonify({"message": "Cleared all PDFs and vector store."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)