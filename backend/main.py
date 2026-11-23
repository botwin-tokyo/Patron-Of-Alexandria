import re
from pathlib import Path, PureWindowsPath

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from librarian_client import forward, upstream

app = FastAPI(title="Document Library Client")
FILE_LIMIT = 16 * 1024 * 1024
BODY_LIMIT = 32 * 1024 * 1024
MAX_FILES = 8


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=32000)
    provider: str = Field(min_length=1, max_length=64)
    model: str | None = None
    top_k: int | None = Field(None, ge=1)
    document_ids: list[int] | None = Field(None, min_length=1)
    max_context_chars: int | None = Field(None, ge=1)


class Answer(BaseModel):
    answer: str
    model: str
    provider: str
    used_document_ids: list[int]


class Document(BaseModel):
    id: int
    filename: str
    status: str


class UploadResult(BaseModel):
    documents: list[Document]


@app.post("/api/check-connection")
def connect(client=Depends(upstream)):
    providers = forward(client, "GET", "api/patron/session").get("providers", [])
    if not providers:
        raise HTTPException(409, "Configure a provider URL, model and any required provider key in Librarian.")
    return {"providers": providers}


@app.post("/api/ask", response_model=Answer)
def ask(body: AskRequest, client=Depends(upstream)):
    return forward(client, "POST", "api/chat/", json=body.model_dump(exclude_none=True))


@app.get("/api/documents/{doc_id}/status", response_model=Document)
def document_status(doc_id: int, client=Depends(upstream)):
    return forward(client, "GET", f"api/documents/{doc_id}/status")


class UploadTooLarge(MultiPartException):
    pass


@app.post("/api/upload", response_model=UploadResult)
async def upload(request: Request, client=Depends(upstream)):
    if request.headers.get("content-type", "").split(";")[0] != "multipart/form-data":
        raise HTTPException(415, "Send a multipart upload.")

    async def limited_body():
        total = 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > BODY_LIMIT:
                raise UploadTooLarge("Batch exceeds 32 MiB.")
            yield chunk

    try:
        form = await MultiPartParser(request.headers, limited_body(), max_files=MAX_FILES,
                                     max_fields=0).parse()
    except UploadTooLarge:
        raise HTTPException(413, "Batch exceeds 32 MiB.") from None
    except MultiPartException:
        raise HTTPException(400, "Invalid upload. Send up to eight files.") from None
    try:
        files = []
        for field, item in form.multi_items():
            if field != "files" or not isinstance(item, UploadFile):
                raise HTTPException(400, "Expected files under the files field.")
            name = item.filename or ""
            if not name or name in {".", ".."} or PureWindowsPath(name).name != name or any(ord(c) < 32 for c in name):
                raise HTTPException(400, "Invalid filename.")
            if item.size is None or item.size > FILE_LIMIT:
                raise HTTPException(413, "Each file must be at most 16 MiB.")
            mime = item.content_type or "application/octet-stream"
            if not re.fullmatch(r"[A-Za-z0-9!#$&^_.+/-]+", mime):
                mime = "application/octet-stream"
            files.append(("files", (name, item.file, mime)))
        if not files:
            raise HTTPException(400, "Select at least one file.")
        return await run_in_threadpool(forward, client, "POST", "api/documents/upload", files=files)
    finally:
        await form.close()


dist = Path(__file__).resolve().parents[1] / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
