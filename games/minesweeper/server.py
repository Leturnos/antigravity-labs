import http.server
import socketserver
import json
import os

PORT = 8000
SCORE_FILE = 'scores.json'

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/score':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            
            # Read score from local scores.json file
            score_data = {"vitorias": 0, "derrotas": 0, "tempo_recorde": 0}
            if os.path.exists(SCORE_FILE):
                try:
                    with open(SCORE_FILE, 'r', encoding='utf-8') as f:
                        score_data = json.load(f)
                except Exception:
                    pass
            self.wfile.write(json.dumps(score_data).encode('utf-8'))
        else:
            # Default static file serving
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/score':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                result = data.get('result') # 'win', 'loss'
                time_taken = data.get('time') # integer seconds
                
                # Load existing scores
                score_data = {"vitorias": 0, "derrotas": 0, "tempo_recorde": 0}
                if os.path.exists(SCORE_FILE):
                    try:
                        with open(SCORE_FILE, 'r', encoding='utf-8') as f:
                            score_data = json.load(f)
                    except Exception:
                        pass
                
                # Update scores
                if result == 'win':
                    score_data['vitorias'] += 1
                    # Record fastest time
                    if time_taken is not None:
                        current_record = score_data.get('tempo_recorde', 0)
                        if current_record == 0 or time_taken < current_record:
                            score_data['tempo_recorde'] = time_taken
                elif result == 'loss':
                    score_data['derrotas'] += 1
                
                # Write back to local scores.json
                with open(SCORE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(score_data, f, indent=2, ensure_ascii=False)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "scores": score_data}).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_DELETE(self):
        if self.path == '/api/score':
            try:
                score_data = {"vitorias": 0, "derrotas": 0, "tempo_recorde": 0}
                with open(SCORE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(score_data, f, indent=2, ensure_ascii=False)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "scores": score_data}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

# Avoid socket bind errors during restart
socketserver.TCPServer.allow_reuse_address = True

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        print(f"Retro Minesweeper Server running at: http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor finalizado.")
