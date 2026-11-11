"""Generate complete static RU/KA/EN pages, translated data and accessible language links."""
from html.parser import HTMLParser
from pathlib import Path
import json,re,html
from catalog import ROOT,CATALOG,RU_OVERRIDES,clean
MISSING=set()
UNCHANGED={'SAY','YES','SAY YES','BEAUTY · COFFEE · BAR','Telegram','WhatsApp','Instagram','Coca-Cola / Sprite','Schweppes / Red Bull','Aperol Spritz','French 75','Negroni / Bellini','Heineken / Corona Extra','Mac & cheese','01 / SAY YES'}
def translate(text,lang):
 key=clean(text)
 if not key:return text
 if lang=='ru':return RU_OVERRIDES.get(key,text)
 if key in CATALOG:return CATALOG[key][lang]
 match=re.match(r'^(\d+ / )(.+)$',key)
 if match and match[2] in CATALOG:return match[1]+CATALOG[match[2]][lang]
 if re.search('[А-Яа-яЁё]',key):MISSING.add(key)
 return text

def data_translate(value,lang,key=None):
 if isinstance(value,list):return [data_translate(x,lang) for x in value]
 if isinstance(value,dict):return {k:data_translate(v,lang,k) for k,v in value.items()}
 if isinstance(value,str):
  if key in ['id','image','price','icon','accent']:return '/'+value if key=='image' and value.startswith('assets/') else value
  return translate(value,lang)
 return value

class Localize(HTMLParser):
 def __init__(self,lang):super().__init__(convert_charrefs=True);self.lang=lang;self.output=[]
 def handle_decl(self,s):self.output.append('<!'+s+'>')
 def handle_starttag(self,tag,attrs):
  values=[]
  for key,value in attrs:
   if value is None:values.append(key);continue
   if key in ['alt','aria-label','title'] or (tag=='meta' and key=='content' and any(k=='name' and v=='description' for k,v in attrs)):value=translate(value,self.lang)
   if tag=='html' and key=='lang':value=self.lang
   if key in ['src','href']:
    if value.startswith('assets/') or value in ['style.css','app.js']:value='/'+value
    if value=='content.js':value=f'/{self.lang}/content.js'
    if tag=='iframe' and 'google.com/maps' in value:value+='&hl='+self.lang
   values.append(key+'="'+html.escape(value,quote=True)+'"')
  self.output.append('<'+tag+(' '+' '.join(values) if values else '')+'>')
 def handle_endtag(self,t):self.output.append('</'+t+'>')
 def handle_data(self,text):self.output.append(html.escape(translate(text,self.lang),quote=False))
 def handle_comment(self,s):self.output.append('<!--'+s+'-->')

base=(ROOT/'dist/index.html').read_text()
client_text=(ROOT/'dist/content.js').read_text();client=json.loads(client_text.removeprefix('window.SAYYES_CONTENT=').strip().rstrip(';'))
UI_KEYS=['Открыть меню','Закрыть меню','Запустить бегущую строку','Приостановить бегущую строку','Предыдущее фото','Следующее фото','Консультация бесплатно.','Выбрать время','BEAUTY / SAY YES','Приостановить видео','Воспроизвести видео','Пауза','Смотреть видео']
for lang in ['ru','ka','en']:
 parser=Localize(lang);parser.feed(base);page=''.join(parser.output)
 labels={'ru':'Русский','ka':'ქართული','en':'English'}
 switch='<div class="language-switch" role="group" aria-label="'+translate('Выбрать язык',lang)+'">'+''.join(f'<a href="/{code}/" lang="{code}" hreflang="{code}" data-language="{code}" aria-label="{name}"'+(' aria-current="page"' if lang==code else '')+'>'+{'ru':'RU','ka':'ქართული','en':'EN'}[code]+'</a>' for code,name in labels.items())+'</div>'
 page=page.replace('<div class="header-actions">','<div class="header-actions">'+switch)
 # Direct locale addresses work without JavaScript; x-default uses the Russian entry.
 alternates=''.join(f'<link rel="alternate" hreflang="{code}" href="/{code}/">' for code in labels)
 page=page.replace('</head>',alternates+'<link rel="alternate" hreflang="x-default" href="/">'+'''<script>try{var p=location.pathname,l=localStorage.getItem('sayyes-language');if(p==='/'&&['ru','ka','en'].includes(l))location.replace('/'+l+'/'+location.search+location.hash);}catch(e){}</script></head>''')
 folder=ROOT/'dist'/lang;folder.mkdir(exist_ok=True);(folder/'index.html').write_text(page)
 ui={key:translate(key,lang) for key in UI_KEYS}
 (folder/'content.js').write_text('window.SAYYES_CONTENT='+json.dumps(data_translate(client,lang),ensure_ascii=False).replace('</','<\\/')+';\nwindow.SAYYES_UI='+json.dumps(ui,ensure_ascii=False)+';\n')
 if lang=='ru':(ROOT/'dist/index.html').write_text(page)
(ROOT/'dist/content.js').unlink(missing_ok=True)
if MISSING:raise RuntimeError('Untranslated text: '+repr(sorted(MISSING)))
print('Generated complete ru/ka/en pages, menus, services, gallery labels and dynamic UI')
