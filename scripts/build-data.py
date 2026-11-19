"""Produce the small browser dataset from the checked-in source snapshots."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
old = json.loads((ROOT/'data/source2024.json').read_text())
new = json.loads((ROOT/'data/source2026.json').read_text())

# Include state Democratic party designations and identified write-ins.
for st in old.values():
    for office in ['senate', 'house']:
        for c in st[office]:
            if 'Democra' in c['name']:
                c['party'] = 'D'

def margin(d, r):
    return round(100*(d-r)/(d+r), 6)

states = []
for code, entry in old.items():
    hd = sum(c['votes'] for c in entry['house'] if c['party']=='D')
    hr = sum(c['votes'] for c in entry['house'] if c['party']=='R')
    prior = {'type':'House aggregate','dVotes':hd,'rVotes':hr,'margin':margin(hd,hr)}
    note24 = None
    if entry['senate']:
        candidates = entry['senate']
        rs = [c for c in candidates if c['party']=='R']
        ds = [c for c in candidates if c['party']=='D']
        independent = {'ME':'Angus', 'VT':'Bernard', 'NE':'Dan Osborn'}.get(code)
        if independent:
            ds = [c for c in candidates if independent in c['name']]
            note24 = 'Independent opposition candidate used as Democratic-side proxy.'
        d, r = max(ds, key=lambda c:c['votes']), max(rs, key=lambda c:c['votes'])
        valid = sum(c['votes'] for c in candidates if not any(t in c['name'].lower() for t in ['blank','void','over votes','undervote','overvote']))
        prior = {'type':'Senate','dVotes':d['votes'],'rVotes':r['votes'],'margin':round(100*(d['votes']-r['votes'])/valid,6)}
    if code in new['senate']:
        race = new['senate'][code]
        candidates = race['candidates']
        ds = [c for c in candidates if c['party'] in ['D','I']]
        rs = [c for c in candidates if c['party']=='R']
        d, r = max(ds,key=lambda c:c['votes']), max(rs,key=lambda c:c['votes'])
        current = {'type':'Senate','dVotes':d['votes'],'rVotes':r['votes'],'margin':race['margin'],
                   'url':'https://www.callthemap.com/results/senate/'+code.lower(),
                   'updated':race['updated_utc'], 'candidates':d['name']+' / '+r['name']}
        if d['party'] != 'D':
            current['note'] = d['name']+' (independent) used as Democratic-side proxy.'
        winner = race['call']['name']
        winnerParty = 'D' if race['call']['party']=='D' else 'R'
    else:
        rows = [r for r in new['house'] if r['id'].startswith(code+'-')]
        ds = rs = 0
        for row in rows:
            for c in new['houseFallbackRaces'][row['id']]['candidates']:
                if not c: continue
                if c['party']=='D': ds+=c['votes']
                if c['party']=='R': rs+=c['votes']
        current = {'type':'House aggregate','dVotes':ds,'rVotes':rs,'margin':margin(ds,rs),
                   'url':'https://www.callthemap.com/results/house','districts':len(rows)}
        winner = winnerParty = None
    if note24: prior['note']=note24
    prior['url']='https://history.house.gov/Institution/Election-Statistics/2024election/'
    states.append({'code':code,'name':entry['name'],'y2024':prior,'y2026':current,
                   'senateWinner':winner,'senateParty':winnerParty})

# Regular election classes from the U.S. Senate's class rosters.
c1d = {'AZ':'Ruben Gallego','CA':'Adam Schiff','CT':'Chris Murphy','DE':'Lisa Blunt Rochester',
       'HI':'Mazie Hirono','MA':'Elizabeth Warren','MD':'Angela Alsobrooks','ME':'Angus King',
       'MI':'Elissa Slotkin','MN':'Amy Klobuchar','NJ':'Andy Kim','NM':'Martin Heinrich',
       'NV':'Jacky Rosen','NY':'Kirsten Gillibrand','RI':'Sheldon Whitehouse','VA':'Tim Kaine',
       'VT':'Bernie Sanders','WA':'Maria Cantwell','WI':'Tammy Baldwin'}
c1r = {'FL':'Rick Scott','IN':'Jim Banks','MO':'Josh Hawley','MS':'Roger Wicker','MT':'Tim Sheehy',
       'ND':'Kevin Cramer','NE':'Deb Fischer','OH':'Bernie Moreno','PA':'Dave McCormick',
       'TN':'Blackburn successor','TX':'Ted Cruz','UT':'John Curtis','WV':'Jim Justice','WY':'John Barrasso'}
c3d = {'AZ':'Mark Kelly','CA':'Alex Padilla','CO':'Michael Bennet','CT':'Richard Blumenthal',
       'GA':'Raphael Warnock','HI':'Brian Schatz','IL':'Tammy Duckworth','MD':'Chris Van Hollen',
       'NH':'Maggie Hassan','NV':'Catherine Cortez Masto','NY':'Chuck Schumer','OR':'Ron Wyden',
       'PA':'John Fetterman','VT':'Peter Welch','WA':'Patty Murray','OH':'Sherrod Brown'}
c3r = {'AK':'Lisa Murkowski','AL':'Katie Britt','AR':'John Boozman','FL':'Ashley Moody',
       'IA':'Chuck Grassley','ID':'Mike Crapo','IN':'Todd Young','KS':'Jerry Moran','KY':'Rand Paul',
       'LA':'John Kennedy','MO':'Eric Schmitt','NC':'Ted Budd','ND':'John Hoeven','OK':'James Lankford',
       'SC':'Tim Scott','SD':'John Thune','UT':'Mike Lee','WI':'Ron Johnson'}
seats = []
for cls, groups in [(1, [c1d,c1r]), (3,[c3d,c3r])]:
    for group, party in zip(groups,['D','R']):
        for code, name in group.items():
            seats.append({'id':code+'-'+str(cls),'state':code,'class':cls,'party':party,'name':name})
for st in states:
    if st['y2026']['type']=='Senate' and st['code'] not in ['FL','OH']:
        seats.append({'id':st['code']+'-2','state':st['code'],'class':2,'party':st['senateParty'],'name':st['senateWinner']})
assert len(seats)==100
assert sum(s['party']=='D' for s in seats)==56
assert [sum(s['class']==c for s in seats) for c in [1,2,3]]==[33,33,34]
result={'asOf':'2026-11-18','states':states,'seats':seats}
(ROOT/'dist/election-data.json').write_text(json.dumps(result,indent=2)+'\n')
print('50 state baselines; 100 seats; Democratic caucus 56. Class sizes 33 / 33 / 34.')
