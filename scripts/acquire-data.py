"""Rebuild the local election snapshot from public results and official 2024 returns.

Requires Python 3, beautifulsoup4, and pdftotext. No runtime data requests.
"""
import concurrent.futures
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path('/tmp/senate-durability-data')
CACHE.mkdir(exist_ok=True)

def flight(html):
    payload = ''.join(json.loads(m) for m in re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html))
    records = {}
    for line in payload.splitlines():
        try:
            key, value = line.split(':', 1)
            records[key] = json.loads(value)
        except (ValueError, json.JSONDecodeError):
            pass
    def resolve(x, depth=0):
        if depth > 25:
            return x
        if isinstance(x, str) and re.match(r'^\$[0-9a-f]+(?::|$)', x):
            bits = x[1:].split(':')
            if bits[0] not in records:
                return x
            v = records[bits[0]]
            for p in bits[1:]:
                if isinstance(v, str):
                    v = resolve(v, depth+1)
                v = (v[3] if p == 'props' else v[int(p)]) if isinstance(v, list) else v[p]
            return resolve(v, depth+1)
        if isinstance(x, dict):
            return {k: resolve(v, depth+1) for k, v in x.items()}
        if isinstance(x, list):
            return [resolve(v, depth+1) for v in x]
        return x
    return records, resolve

def walk(x):
    yield x
    if isinstance(x, dict):
        for v in x.values():
            yield from walk(v)
    elif isinstance(x, list):
        for v in x:
            yield from walk(v)

def download(url, name):
    p = CACHE / name
    if not p.exists():
        p.write_bytes(urllib.request.urlopen(url, timeout=45).read())
    return p.read_text()

def race(st):
    url = 'https://www.callthemap.com/results/senate/' + st.lower()
    records, resolve = flight(download(url, st+'.html'))
    for record in records.values():
        for x in walk(record):
            if isinstance(x, dict) and x.get('schema_version') == 'ctm-results-v1':
                r = resolve(x)
                return st, {k:r[k] for k in ['race_id','state','title','updated_utc','sources','candidates','total_votes','pair','margin','call']}
    raise ValueError('No race found: '+st)

def house_race(row):
    rid = row['id']
    records, resolve = flight(download('https://www.callthemap.com/results/house/'+rid.lower(), rid.lower()+'.html'))
    for record in records.values():
        for x in walk(record):
            if isinstance(x, dict) and x.get('schema_version') == 'ctm-results-v1':
                r = resolve(x)
                return rid, {k:r[k] for k in ['race_id','state','title','updated_utc','sources','candidates','total_votes']}
    # Unopposed race pages publish the full candidate list without the full schema.
    for record in records.values():
        for x in walk(record):
            if isinstance(x, dict) and isinstance(x.get('candidates'), list) and 'pair' in x:
                candidates = resolve(x['candidates'])
                return rid, {'race_id':rid,'state':rid[:2],'title':row['title'],
                    'updated_utc':None,'sources':[{'name':'Call the Map public result page',
                    'url':'https://www.callthemap.com/results/house/'+rid.lower()}],
                    'candidates':candidates,'total_votes':sum(c['votes'] for c in candidates)}
    raise ValueError('No House race found: '+rid)

if __name__ == '__main__':
    states = 'AK AL AR CO DE FL GA IA ID IL KS KY LA MA ME MI MN MS MT NC NE NH NJ NM OH OK OR RI SC SD TN TX VA WV WY'.split()
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        senate = dict(pool.map(race, states))
    records, resolve = flight(download('https://www.callthemap.com/results/house', 'house.html'))
    house = None
    for record in records.values():
        for x in walk(record):
            if isinstance(x, dict) and isinstance(x.get('data'), list) and x['data'] and isinstance(x['data'][0], dict) and x['data'][0].get('id') == 'AK-AL':
                house = resolve(x['data'])
    assert house and len(house) == 435
    fallback_states = set('AZ CA CT HI IN MD MO NV NY ND PA UT VT WA WI'.split())
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        house_full = dict(pool.map(house_race, [r for r in house if r['id'][:2] in fallback_states]))
    (ROOT/'data').mkdir(exist_ok=True)
    (ROOT/'data'/'source2026.json').write_text(json.dumps({'senate':senate,'house':house,'houseFallbackRaces':house_full}, indent=2))
    print('Saved', len(senate), 'Senate races,',len(house),'House summaries and',len(house_full),'complete fallback House races.')
