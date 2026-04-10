#!/usr/bin/env python3
"""
Dev server for the CPU WASM Visualizer.
Handles WASM MIME type and required COOP/COEP headers.
Run: python serve.py
Then open: http://localhost:8080
"""
import http.server
import socketserver
import os

PORT = 8080

class WASMHandler(http.server.SimpleHTTPRequestHandler):
    # Correct WASM MIME type (required for browser to load .wasm)
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.wasm': 'application/wasm',
        '.js':   'application/javascript',
    }

    def end_headers(self):
        # Required headers for SharedArrayBuffer (future-proofing)
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quieter logging
        if '200' in (args[1] if len(args) > 1 else ''):
            return
        super().log_message(fmt, *args)

# Serve from the web/ directory (where this script lives)
os.chdir(os.path.dirname(os.path.abspath(__file__)))

print(f"╔═══════════════════════════════════════╗")
print(f"║  CPU Visualizer — Dev Server          ║")
print(f"║  http://localhost:{PORT}               ║")
print(f"║  Ctrl+C to stop                       ║")
print(f"╚═══════════════════════════════════════╝")

with socketserver.TCPServer(("", PORT), WASMHandler) as httpd:
    httpd.serve_forever()
