import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

import main
from librarian_client import upstream


class ProxyTests(unittest.TestCase):
    def setUp(self):
        self.calls = []

        def handle(request):
            self.calls.append(request)
            return self.handler(request)

        self.remote = httpx.Client(base_url="https://library.invalid/", transport=httpx.MockTransport(handle))
        main.app.dependency_overrides[upstream] = lambda: self.remote
        self.addCleanup(main.app.dependency_overrides.clear)
        self.addCleanup(self.remote.close)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def test_configured_provider_required(self):
        self.handler = lambda _: httpx.Response(200, json={"providers": []})
        self.assertEqual(self.client.post("/api/check-connection").status_code, 409)

    def test_redirects_and_upstream_errors_are_sanitized(self):
        for status, expected in [(302, 502), (401, 401), (500, 502)]:
            self.handler = lambda _: httpx.Response(status, headers={"location": "https://other.invalid/"}, text="private upstream detail")
            result = self.client.post("/api/check-connection")
            self.assertEqual(result.status_code, expected)
            self.assertNotIn("private upstream detail", result.text)
        self.assertEqual(len(self.calls), 3)

    def test_upload_limits_before_forwarding(self):
        with patch.object(main, "FILE_LIMIT", 4):
            result = self.client.post("/api/upload", files={"files": ("notes.txt", b"12345")})
            self.assertEqual(result.status_code, 413)
        with patch.object(main, "BODY_LIMIT", 8):
            result = self.client.post("/api/upload", files={"files": ("notes.txt", b"1")})
            self.assertEqual(result.status_code, 413)
        files = [("files", ("notes.txt", b"1"))] * 9
        self.assertEqual(self.client.post("/api/upload", files=files).status_code, 400)
        self.assertEqual(self.calls, [])

    def test_upload_and_chat_overlap(self):
        started = threading.Event()
        release = threading.Event()
        def handle(req):
            if req.url.path == "/api/documents/upload":
                self.assertIn(b'filename="notes.txt"', req.content)
                self.assertIn(b"Content-Type: text/plain", req.content)
                started.set()
                self.assertTrue(release.wait(5))
                return httpx.Response(200, json={"documents": [{"id": 1, "filename": "notes.txt", "status": "processing", "original_path": "/private"}]})
            return httpx.Response(200, json={"provider": "custom", "model": "test", "answer": "ok", "used_document_ids": []})

        self.handler = handle
        with TestClient(main.app) as client, ThreadPoolExecutor() as pool:
            upload = pool.submit(client.post, "/api/upload", files={"files": ("notes.txt", b"abc", "text/plain")})
            try:
                self.assertTrue(started.wait(5))
                chat = pool.submit(client.post, "/api/ask", json={"query": "hello", "provider": "custom"})
                self.assertEqual(chat.result(timeout=3).status_code, 200)
            finally:
                release.set()
            result = upload.result()
            self.assertEqual(result.status_code, 200)
            self.assertNotIn("original_path", result.text)
