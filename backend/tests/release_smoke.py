"""Upload a small fixture to a disposable Patron deployment and query it."""
import argparse
from getpass import getpass
import time
from uuid import uuid4

import httpx


def run(url, key):
    filename = f"release-{uuid4().hex}.txt"
    fact = "The observatory stores telescope manuals in the green binder. "
    with httpx.Client(base_url=url.rstrip("/") + "/", headers={"X-API-Key": key},
                      timeout=130, trust_env=False) as client:
        session = client.post("api/check-connection").raise_for_status().json()
        result = client.post("api/upload", files={"files": (filename, fact * 8, "text/plain")})
        doc = result.raise_for_status().json()["documents"][0]
        if doc["filename"] != filename:
            raise RuntimeError("Upload did not preserve the filename.")
        deadline = time.monotonic() + 180
        while doc["status"] == "processing" and time.monotonic() < deadline:
            time.sleep(1)
            doc = client.get(f"api/documents/{doc['id']}/status").raise_for_status().json()
        if doc["status"] != "indexed":
            raise RuntimeError(f"Index status: {doc['status']}")
        answer = client.post("api/ask", json={
            "provider": session["providers"][0], "document_ids": [doc["id"]],
            "query": "What color is the binder containing the telescope manuals?",
        }).raise_for_status().json()
        if answer["used_document_ids"] != [doc["id"]] or "green" not in answer["answer"].lower():
            raise RuntimeError("Answer did not identify the fixture and its fact.")
        print(f"Passed upload, indexing, retrieval and answer checks for {filename}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Disposable Patron instance, e.g. http://127.0.0.1:5055")
    args = parser.parse_args()
    url = httpx.URL(args.url)
    if url.scheme != "https" and not (url.scheme == "http" and url.host in {"127.0.0.1", "::1", "localhost"}):
        parser.error("Use HTTPS for a remote Patron instance.")
    run(args.url, getpass("Disposable Patron key: "))
