#!/usr/bin/env python3
"""Run the standalone static app locally using only Python's standard library."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1', help='Bind address (default: 127.0.0.1)')
    parser.add_argument('--port', type=int, default=4173, help='Port (default: 4173)')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('--port must be between 0 and 65535')
    directory = Path(__file__).resolve().parent / 'dist'
    handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
    try:
        with ThreadingHTTPServer((args.host, args.port), handler) as server:
            print(f'Senate Scenarios: http://{args.host}:{server.server_port}/', flush=True)
            print('Press Ctrl+C to stop.', flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                print('\nServer stopped.', flush=True)
    except OSError as error:
        parser.exit(1, f'Could not start local server: {error}\n')


if __name__ == '__main__':
    main()
