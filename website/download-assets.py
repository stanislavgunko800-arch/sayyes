from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,subprocess,hashlib
from PIL import Image
root=Path(__file__).parent;data=json.loads((root/'source-content.json').read_text());paths=set()
def walk(x):
 if isinstance(x,dict):
  for v in x.values():walk(v)
 elif isinstance(x,list):
  for v in x:walk(v)
 elif isinstance(x,str) and x.startswith(('/images/','/uploads/')):paths.add(x)
walk(data)
def get(path):
 name=Path(path).stem+'.webp';dest=root/'dist/assets'/name
 r=subprocess.run(['curl','-fsSL','--max-time','45','--retry','1','https://say-yes-space.com'+path,'-o',str(dest)],capture_output=True)
 if r.returncode:return(path,None)
 try:
  im=Image.open(dest);im.thumbnail((2000,2000));im.convert('RGB').save(dest,'WEBP',quality=84)
  return(path,'assets/'+name)
 except Exception:return(path,None)
with ThreadPoolExecutor(max_workers=8) as pool: mapping=dict(pool.map(get,sorted(paths)))
(root/'asset-map.json').write_text(json.dumps(mapping,ensure_ascii=False,indent=2))
print('Downloaded:',sum(bool(v) for v in mapping.values()),'of',len(paths));print('Missing:',[k for k,v in mapping.items() if not v])
