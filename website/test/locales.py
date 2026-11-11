from pathlib import Path
from html.parser import HTMLParser
import re,json
ROOT=Path(__file__).resolve().parent.parent
class Page(HTMLParser):
 def __init__(self):super().__init__();self.attrs=[];self.text=[];self.script=False
 def handle_starttag(self,tag,attrs):
  self.attrs.append((tag,dict(attrs)))
  if tag=='script':self.script=True
 def handle_endtag(self,tag):
  if tag=='script':self.script=False
 def handle_data(self,s):
  if not self.script:self.text.append(s)
def values(v):
 if isinstance(v,dict):
  for k,x in v.items():
   if k not in ['image','id','icon','accent']:yield from values(x)
 elif isinstance(v,list):
  for x in v:yield from values(x)
 elif isinstance(v,str):yield v
source=json.loads((ROOT/'source-content.json').read_text())
original_prices=[v['price'] for g in source['menuGroups'] for s in g['sections'] for v in s['items']]
for lang in ['ru','ka','en']:
 folder=ROOT/'dist'/lang;s=(folder/'index.html').read_text();page=Page();page.feed(s)
 assert ('html',{'lang':lang}) in page.attrs
 links=[a for t,a in page.attrs if t=='a' and 'data-language' in a]
 assert len(links)==3 and sum(x.get('aria-current')=='page' for x in links)==1
 assert next(x for x in links if x.get('aria-current')=='page')['data-language']==lang
 for tag,attrs in page.attrs:
  for key in ['href','src']:
   url=attrs.get(key,'')
   if url.startswith('/'):
    path=ROOT/'dist'/url.lstrip('/')
    assert (path/'index.html').is_file() if url.endswith('/') else path.is_file(),url
  if tag=='a' and attrs.get('href','').startswith('#'):
   assert any(a.get('id')==attrs['href'][1:] for _,a in page.attrs),attrs
 js=(folder/'content.js').read_text();data=json.loads(js.split('window.SAYYES_CONTENT=',1)[1].split(';\nwindow.SAYYES_UI=')[0])
 items=[v for g in data['menu'] for sec in g['sections'] for v in sec['items']]
 assert len(items)==32 and [x['price'] for x in items]==original_prices
 assert len(data['services'])==6 and len(data['gallery'])==6
 assert all(x['name'] and x['description'] for x in items)
 if lang!='ru':
  public=' '.join(page.text)+' '.join(v for _,a in page.attrs for k,v in a.items() if k in ['alt','aria-label'])+' '.join(values(data))
  assert not re.search('[А-Яа-яЁё]',public.replace('Русский','')),re.findall('[А-Яа-яЁё][^<>]{0,50}',public)
 assert 'mood-game' not in s and 'game-start' not in s
 print('PASS:',lang,'— complete translated page, 32 menu items, preserved prices, locale links and local resources')
assert 'game-token' not in (ROOT/'dist/app.js').read_text()
assert '.game-' not in (ROOT/'dist/style.css').read_text()
assert '#8c3c35' not in (ROOT/'dist/style.css').read_text()
print('PASS: game removed from rendered pages, JavaScript and CSS; old red palette removed')
