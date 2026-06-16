import http.server
import socketserver
import json
import os
import copy

PORT = 8000
SCORE_FILE = 'scores.json'

DEFAULT_SCORES = {
    "classico": {
        "pontuacao_maxima": 0,
        "linhas_maximas": 0,
        "vitorias": 0,
        "derrotas": 0
    },
    "contrarrelogio": {
        "tempo_recorde": 0
    }
}

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def get_scores(self):
        score_data = copy.deepcopy(DEFAULT_SCORES)
        if os.path.exists(SCORE_FILE):
            try:
                with open(SCORE_FILE, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                    if isinstance(loaded, dict):
                        for k, v in DEFAULT_SCORES.items():
                            if k in loaded:
                                if isinstance(v, dict) and isinstance(loaded[k], dict):
                                    score_data[k].update(loaded[k])
                                else:
                                    score_data[k] = loaded[k]
            except Exception:
                pass
        return score_data

    def save_scores(self, score_data):
        try:
            with open(SCORE_FILE, 'w', encoding='utf-8') as f:
                json.dump(score_data, f, indent=2, ensure_ascii=False)
            return True
        except Exception:
            return False

    def do_GET(self):
        if self.path == '/api/score':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            
            score_data = self.get_scores()
            self.wfile.write(json.dumps(score_data).encode('utf-8'))
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/score':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                mode = data.get('mode', 'classico')
                result = data.get('result') # 'win' or 'loss'
                
                score_data = self.get_scores()
                
                if mode == 'classico':
                    score = data.get('score', 0)
                    lines = data.get('lines', 0)
                    
                    if result == 'win':
                        score_data['classico']['vitorias'] += 1
                    elif result == 'loss':
                        score_data['classico']['derrotas'] += 1
                        
                    # Update personal bests
                    if score > score_data['classico'].get('pontuacao_maxima', 0):
                        score_data['classico']['pontuacao_maxima'] = score
                    if lines > score_data['classico'].get('linhas_maximas', 0):
                        score_data['classico']['linhas_maximas'] = lines
                        
                elif mode == 'contrarrelogio':
                    time_taken = data.get('time', 0) # in seconds
                    
                    if result == 'win' and time_taken > 0:
                        current_record = score_data['contrarrelogio'].get('tempo_recorde', 0)
                        if current_record == 0 or time_taken < current_record:
                            score_data['contrarrelogio']['tempo_recorde'] = time_taken
                
                self.save_scores(score_data)
                
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
                score_data = copy.deepcopy(DEFAULT_SCORES)
                self.save_scores(score_data)
                
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

socketserver.TCPServer.allow_reuse_address = True

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        print(f"Aether Tetris Server running at: http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor finalizado.")
