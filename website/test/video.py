from pathlib import Path
import json,subprocess
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parent.parent
class Page(HTMLParser):
 def __init__(self):super().__init__();self.tags=[]
 def handle_starttag(self,t,a):self.tags.append((t,dict(a)))
for name in ['sayyes-film.mp4','sayyes-film-mobile.mp4','craft.mp4','hair.mp4','makeup.mp4']:
 path=ROOT/'dist/video'/name
 probe=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_streams','-show_format','-of','json',str(path)]))
 assert len(probe['streams'])==1 and probe['streams'][0]['codec_name']=='h264'
 assert probe['streams'][0]['codec_type']=='video'
 if name=='sayyes-film-mobile.mp4':assert path.stat().st_size<1_200_000
 duration=float(probe['format']['duration']);assert 2<duration<10
 print('PASS:',name,round(duration,2),'seconds, silent H.264',round(path.stat().st_size/1e6,2),'MB')
for lang in ['ru','ka','en']:
 p=Page();p.feed((ROOT/'dist'/lang/'index.html').read_text())
 videos=[a for t,a in p.tags if t=='video'];assert len(videos)==4
 hero=next(v for v in videos if v.get('id')=='hero-film')
 assert 'src' not in hero and 'autoplay' not in hero and hero['preload']=='none'
 assert 'playsinline' in hero and 'muted' in hero
 assert all('controls' in x for x in videos if x.get('id')!='hero-film')
 for v in videos:
  assert (ROOT/'dist'/v['poster'].lstrip('/')).is_file()
 assert any(t=='iframe' and 'google.com/maps' in a.get('src','') and a.get('loading')=='lazy' and 'hl='+lang in a['src'] for t,a in p.tags)
 assert any('google.com/maps/dir/' in a.get('href','') for t,a in p.tags)
 assert sum('reviews.yandex.ru/user/' in a.get('href','') for t,a in p.tags)==3
 assert '10:00–22:00' in (ROOT/'dist'/lang/'index.html').read_text()
 print('PASS:',lang,'video controls/posters, no unconditional autoplay, map, directions, sourced reviews and confirmed hours')
