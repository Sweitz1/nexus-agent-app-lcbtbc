"""
RAG (Retrieval-Augmented Generation) pipeline.
Indexes documents, retrieves relevant chunks, and answers questions using any LLM.
"""

import os
from pathlib import Path
from typing import Optional

import litellm
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / "config" / ".env")

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "claude-sonnet-4-6")
DEFAULT_EMBED_MODEL = os.getenv("EMBED_MODEL", "text-embedding-3-small")


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


def embed_texts(texts: list[str], model: str = DEFAULT_EMBED_MODEL) -> list[list[float]]:
    """Get embeddings for a list of texts via LiteLLM."""
    response = litellm.embedding(model=model, input=texts)
    return [item["embedding"] for item in response.data]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    import math
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    return dot / (mag_a * mag_b + 1e-10)


class SimpleVectorStore:
    """In-memory vector store — swap for ChromaDB / Qdrant in production."""

    def __init__(self):
        self.documents: list[str] = []
        self.embeddings: list[list[float]] = []
        self.metadata: list[dict] = []

    def add(self, texts: list[str], metadatas: list[dict] | None = None, embed_model: str = DEFAULT_EMBED_MODEL):
        embeddings = embed_texts(texts, embed_model)
        self.documents.extend(texts)
        self.embeddings.extend(embeddings)
        self.metadata.extend(metadatas or [{} for _ in texts])

    def search(self, query: str, k: int = 5, embed_model: str = DEFAULT_EMBED_MODEL) -> list[tuple[str, float, dict]]:
        query_emb = embed_texts([query], embed_model)[0]
        scores = [(cosine_similarity(query_emb, emb), i) for i, emb in enumerate(self.embeddings)]
        scores.sort(reverse=True)
        return [(self.documents[i], score, self.metadata[i]) for score, i in scores[:k]]


class RAGPipeline:
    def __init__(
        self,
        llm_model: str = DEFAULT_MODEL,
        embed_model: str = DEFAULT_EMBED_MODEL,
        chunk_size: int = 1000,
        overlap: int = 200,
        top_k: int = 5,
    ):
        self.llm_model = llm_model
        self.embed_model = embed_model
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.top_k = top_k
        self.store = SimpleVectorStore()

    def index_text(self, text: str, source: str = ""):
        chunks = chunk_text(text, self.chunk_size, self.overlap)
        metadatas = [{"source": source, "chunk": i} for i in range(len(chunks))]
        self.store.add(chunks, metadatas, self.embed_model)
        return len(chunks)

    def index_file(self, path: str | Path) -> int:
        path = Path(path)
        text = path.read_text(encoding="utf-8", errors="replace")
        return self.index_text(text, source=str(path))

    def index_directory(self, directory: str | Path, glob: str = "**/*.txt") -> int:
        directory = Path(directory)
        total = 0
        for file in directory.glob(glob):
            total += self.index_file(file)
        return total

    def query(self, question: str, stream: bool = False) -> str:
        results = self.store.search(question, k=self.top_k, embed_model=self.embed_model)
        context = "\n\n---\n\n".join(
            f"[Source: {meta.get('source', 'unknown')}, chunk {meta.get('chunk', 0)}]\n{doc}"
            for doc, score, meta in results
        )

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a helpful assistant. Answer the user's question using ONLY the provided context. "
                    "If the answer isn't in the context, say so. "
                    "Cite your sources by referencing the source names."
                ),
            },
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {question}",
            },
        ]

        kwargs = {"model": self.llm_model, "messages": messages, "max_tokens": 4096, "stream": stream}
        if self.llm_model.startswith("ollama/"):
            kwargs["api_base"] = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

        if stream:
            chunks = []
            for chunk in litellm.completion(**kwargs):
                delta = chunk.choices[0].delta.content or ""
                print(delta, end="", flush=True)
                chunks.append(delta)
            print()
            return "".join(chunks)
        else:
            resp = litellm.completion(**kwargs)
            return resp.choices[0].message.content


# ── ChromaDB backend (production) ────────────────────────────────

class ChromaRAGPipeline(RAGPipeline):
    """Production RAG using ChromaDB as the vector store."""

    def __init__(self, collection_name: str = "default", persist_dir: str = ".chroma", **kwargs):
        super().__init__(**kwargs)
        try:
            import chromadb
            from chromadb.config import Settings
            self.client = chromadb.PersistentClient(path=persist_dir)
            self.collection = self.client.get_or_create_collection(
                name=collection_name,
                metadata={"hnsw:space": "cosine"}
            )
        except ImportError:
            raise ImportError("Install chromadb: pip install chromadb")

    def index_text(self, text: str, source: str = "") -> int:
        chunks = chunk_text(text, self.chunk_size, self.overlap)
        embeddings = embed_texts(chunks, self.embed_model)
        ids = [f"{source}_{i}" for i in range(len(chunks))]
        self.collection.add(
            ids=ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=[{"source": source, "chunk": i} for i in range(len(chunks))]
        )
        return len(chunks)

    def query(self, question: str, stream: bool = False) -> str:
        q_emb = embed_texts([question], self.embed_model)[0]
        results = self.collection.query(query_embeddings=[q_emb], n_results=self.top_k)
        docs = results["documents"][0]
        metas = results["metadatas"][0]
        context = "\n\n---\n\n".join(
            f"[Source: {m.get('source', '?')}]\n{d}" for d, m in zip(docs, metas)
        )
        messages = [
            {"role": "system", "content": "Answer using ONLY the provided context. Cite sources."},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
        ]
        resp = litellm.completion(model=self.llm_model, messages=messages, max_tokens=4096)
        return resp.choices[0].message.content


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--index", nargs="+", help="Files or directories to index")
    parser.add_argument("--query", help="Query to run")
    args = parser.parse_args()

    pipeline = RAGPipeline(llm_model=args.model)

    if args.index:
        for path in args.index:
            p = Path(path)
            if p.is_dir():
                n = pipeline.index_directory(p)
            else:
                n = pipeline.index_file(p)
            print(f"Indexed {n} chunks from {path}")

    if args.query:
        print(f"\nAnswer: ", end="")
        pipeline.query(args.query, stream=True)
    else:
        while True:
            try:
                q = input("\nQuestion: ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if q in ("exit", "quit"):
                break
            print("Answer: ", end="")
            pipeline.query(q, stream=True)
