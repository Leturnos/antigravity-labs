import http.server
import socketserver
import json
import os
from urllib.parse import urlparse, parse_qs

PORT = 8000
SCORE_FILE = 'scores_db.json'

DEFAULT_SCORES = {
    "chess": {
        "vitorias": 0,
        "derrotas": 0,
        "empates": 0
    },
    "minesweeper": {
        "vitorias": 0,
        "derrotas": 0,
        "tempo_recorde": 0
    },
    "tetris": {
        "classico": {
            "pontuacao_maxima": 0,
            "linhas_maximas": 0,
            "vitorias": 0,
            "derrotas": 0
        },
        "contrarrelogio": {
            "tempo_recorde": 0
        }
    },
    "snake": {
        "pontuacao_maxima": 0,
        "comprimento_maximo": 0,
        "partidas_jogadas": 0
    },
    "tictactoe": {
        "vitorias": 0,
        "derrotas": 0,
        "empates": 0
    },
    "poker": {
        "cash": {
            "vitorias": 0,
            "derrotas": 0
        },
        "torneio": {
            "vitorias": 0,
            "derrotas": 0
        },
        "maior_stack": 0
    }
}

def load_db():
    if os.path.exists(SCORE_FILE):
        try:
            with open(SCORE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Ensure all games exist in the database
                for game, default_val in DEFAULT_SCORES.items():
                    if game not in data:
                        data[game] = default_val
                return data
        except Exception:
            pass
    return DEFAULT_SCORES.copy()

def save_db(data):
    try:
        dir_name = os.path.dirname(SCORE_FILE)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
        with open(SCORE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving database: {e}")
        return False

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urlparse(self.path)
        if parsed_url.path == '/api/score':
            query_params = parse_qs(parsed_url.query)
            game = query_params.get('game', [None])[0]
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            
            db = load_db()
            if game in db:
                self.wfile.write(json.dumps(db[game]).encode('utf-8'))
            else:
                # Return entire DB if game not specified or invalid (useful for dashboard launcher)
                self.wfile.write(json.dumps(db).encode('utf-8'))
        else:
            # Default static file serving
            super().do_GET()

    def do_POST(self):
        parsed_url = urlparse(self.path)
        if parsed_url.path == '/api/score':
            query_params = parse_qs(parsed_url.query)
            game = query_params.get('game', [None])[0]
            
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                db = load_db()
                
                if game == 'chess':
                    result = data.get('result')
                    if result == 'win':
                        db['chess']['vitorias'] += 1
                    elif result == 'loss':
                        db['chess']['derrotas'] += 1
                    elif result == 'draw':
                        db['chess']['empates'] += 1
                    save_db(db)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "scores": db['chess']}).encode('utf-8'))
                    
                elif game == 'minesweeper':
                    result = data.get('result')
                    time_taken = data.get('time')
                    if result == 'win':
                        db['minesweeper']['vitorias'] += 1
                        if time_taken is not None:
                            current_record = db['minesweeper'].get('tempo_recorde', 0)
                            if current_record == 0 or time_taken < current_record:
                                db['minesweeper']['tempo_recorde'] = time_taken
                    elif result == 'loss':
                        db['minesweeper']['derrotas'] += 1
                    save_db(db)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "scores": db['minesweeper']}).encode('utf-8'))
                    
                elif game == 'tetris':
                    mode = data.get('mode', 'classico')
                    result = data.get('result')
                    
                    if mode == 'classico':
                        score = data.get('score', 0)
                        lines = data.get('lines', 0)
                        if result == 'win':
                            db['tetris']['classico']['vitorias'] += 1
                        elif result == 'loss':
                            db['tetris']['classico']['derrotas'] += 1
                            
                        if score > db['tetris']['classico'].get('pontuacao_maxima', 0):
                            db['tetris']['classico']['pontuacao_maxima'] = score
                        if lines > db['tetris']['classico'].get('linhas_maximas', 0):
                            db['tetris']['classico']['linhas_maximas'] = lines
                            
                    elif mode == 'contrarrelogio':
                        time_taken = data.get('time', 0)
                        if result == 'win' and time_taken > 0:
                            current_record = db['tetris']['contrarrelogio'].get('tempo_recorde', 0)
                            if current_record == 0 or time_taken < current_record:
                                db['tetris']['contrarrelogio']['tempo_recorde'] = time_taken
                    save_db(db)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "scores": db['tetris']}).encode('utf-8'))
                    
                elif game == 'snake':
                    score = data.get('score', 0)
                    length = data.get('length', 0)
                    
                    db['snake']['partidas_jogadas'] += 1
                    
                    if score > db['snake'].get('pontuacao_maxima', 0):
                        db['snake']['pontuacao_maxima'] = score
                    if length > db['snake'].get('comprimento_maximo', 0):
                        db['snake']['comprimento_maximo'] = length
                        
                    save_db(db)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "scores": db['snake']}).encode('utf-8'))
                    
                elif game == 'tictactoe':
                    result = data.get('result')
                    if result == 'win':
                        db['tictactoe']['vitorias'] += 1
                    elif result == 'loss':
                        db['tictactoe']['derrotas'] += 1
                    elif result == 'draw':
                        db['tictactoe']['empates'] += 1
                    save_db(db)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "scores": db['tictactoe']}).encode('utf-8'))
                    
                elif game == 'poker':
                    mode = data.get('mode') # 'cash' or 'torneio'
                    result = data.get('result') # 'win' or 'loss'
                    stack = data.get('stack', 0)
                    
                    if mode == 'cash':
                        if result == 'win':
                            db['poker']['cash']['vitorias'] += 1
                        elif result == 'loss':
                            db['poker']['cash']['derrotas'] += 1
                    elif mode in ('torneio', 'tournament'):
                        if result == 'win':
                            db['poker']['torneio']['vitorias'] += 1
                        elif result == 'loss':
                            db['poker']['torneio']['derrotas'] += 1
                            
                    if stack > db['poker'].get('maior_stack', 0):
                        db['poker']['maior_stack'] = stack
                        
                    save_db(db)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "scores": db['poker']}).encode('utf-8'))
                    
                else:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b"Invalid or missing game query parameter.")
                    
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_DELETE(self):
        parsed_url = urlparse(self.path)
        if parsed_url.path == '/api/score':
            query_params = parse_qs(parsed_url.query)
            game = query_params.get('game', [None])[0]
            
            try:
                db = load_db()
                if game in db:
                    db[game] = DEFAULT_SCORES[game].copy()
                    save_db(db)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "scores": db[game]}).encode('utf-8'))
                else:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b"Invalid or missing game query parameter.")
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
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

socketserver.TCPServer.allow_reuse_address = True

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        print(f"Central Aether Suite Server running at: http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor finalizado.")
