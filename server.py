import argparse
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parent
RAW_DATA_DIR = os.environ.get("PROGRACE_DATA_DIR")
if RAW_DATA_DIR:
    configured_data_dir = Path(RAW_DATA_DIR)
    DATA_DIR = configured_data_dir if configured_data_dir.is_absolute() else BASE_DIR / configured_data_dir
else:
    DATA_DIR = BASE_DIR / "data"
CHAPTERS_FILE = DATA_DIR / "chapters.json"
USER_FILES = {
    "himanshu": DATA_DIR / "himanshu.json",
    "priyanshu": DATA_DIR / "priyanshu.json",
}


def safe_object(value):
    return value if isinstance(value, dict) else {}


def read_json(path: Path, default):
    if not path.exists():
        return default

    try:
        with path.open("r", encoding="utf-8") as file_obj:
            return json.load(file_obj)
    except (json.JSONDecodeError, OSError):
        return default


def write_json_atomic(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    with temp_path.open("w", encoding="utf-8") as file_obj:
        json.dump(payload, file_obj, ensure_ascii=False, indent=2)
    temp_path.replace(path)


def load_combined_data():
    chapters = safe_object(read_json(CHAPTERS_FILE, {}))
    users = {}
    for user_key, user_path in USER_FILES.items():
        users[user_key] = safe_object(read_json(user_path, {}))

    return {
        "chaptersBySubject": chapters,
        "users": users,
    }


def validate_payload(payload):
    if not isinstance(payload, dict):
        return None, "Payload must be a JSON object."

    chapters = payload.get("chaptersBySubject")
    users = payload.get("users")
    if not isinstance(chapters, dict):
        return None, "'chaptersBySubject' must be an object."
    if not isinstance(users, dict):
        return None, "'users' must be an object."

    sanitized_users = {}
    for user_key in USER_FILES:
        user_data = users.get(user_key)
        if not isinstance(user_data, dict):
            return None, f"Missing or invalid user data for '{user_key}'."
        sanitized_users[user_key] = user_data

    return {"chaptersBySubject": chapters, "users": sanitized_users}, None


def env_port(default_port: int) -> int:
    raw_port = os.environ.get("PORT")
    if not raw_port:
        return default_port
    try:
        parsed = int(raw_port)
    except ValueError:
        return default_port
    return parsed if parsed > 0 else default_port


class ProGraceHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def send_json(self, status_code, payload):
        response_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/api/data":
            self.send_json(200, load_combined_data())
            return

        super().do_GET()

    def do_POST(self):
        route = urlparse(self.path).path
        if route != "/api/data":
            self.send_json(404, {"error": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            self.send_json(400, {"error": "Empty request body."})
            return
        if content_length > 10 * 1024 * 1024:
            self.send_json(413, {"error": "Payload too large."})
            return

        try:
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, {"error": "Invalid JSON body."})
            return

        sanitized_payload, error_message = validate_payload(payload)
        if error_message:
            self.send_json(400, {"error": error_message})
            return

        try:
            write_json_atomic(CHAPTERS_FILE, sanitized_payload["chaptersBySubject"])
            for user_key, user_path in USER_FILES.items():
                write_json_atomic(user_path, sanitized_payload["users"][user_key])
        except OSError as error:
            self.send_json(500, {"error": f"Failed to write data files: {error}"})
            return

        self.send_json(200, {"ok": True})


def main():
    parser = argparse.ArgumentParser(description="Pro Grace local server with file persistence.")
    parser.add_argument(
        "--host",
        default=os.environ.get("HOST", "127.0.0.1"),
        help="Host interface to bind (default: HOST env or 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=env_port(5500),
        help="Port to serve on (default: PORT env or 5500)",
    )
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    server = ThreadingHTTPServer((args.host, args.port), ProGraceHandler)
    display_host = "127.0.0.1" if args.host == "0.0.0.0" else args.host
    print(f"Pro Grace server running at http://{display_host}:{args.port}")
    if args.host == "0.0.0.0":
        print("Listening on all interfaces for cloud deployment.")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
