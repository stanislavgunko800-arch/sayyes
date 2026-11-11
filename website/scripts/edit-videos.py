from pathlib import Path
import subprocess,json
root=Path(__file__).resolve().parent.parent;w=root/'work/video';out=root/'dist/video'
w.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--source-directory',type=Path,required=True);args=parser.parse_args()
files={p.name:p for p in args.source_directory.rglob('*') if p.suffix.lower() in ['.mov','.mp4']}
shots=[
 {'id':'craft','file':'ScreenRecording_11-06-2026 18-01-42_1.mov','start':3.0,'duration':3.4,'crop':'1044:1392:30:760'},
 {'id':'hair','file':'ScreenRecording_11-06-2026 18-03-47_1.MP4','start':1.0,'duration':3.4,'crop':'1056:1408:60:350'},
 {'id':'makeup','file':'ScreenRecording_11-06-2026 18-07-40_1.mov','start':3.8,'duration':2.6,'crop':'1050:1400:80:130'}]
for s in shots:
 cmd=['ffmpeg','-v','error','-ss',str(s['start']),'-i',str(files[s['file']]),'-t',str(s['duration']),'-an','-vf',f"crop={s['crop']},scale=720:960:flags=lanczos,setsar=1,fps=24",'-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart','-y',str(w/(s['id']+'.mp4'))]
 subprocess.run(cmd,check=True)
 subprocess.run(['ffmpeg','-v','error','-ss','0.5','-i',str(w/(s['id']+'.mp4')),'-frames:v','1','-y',str(w/(s['id']+'-crop.jpg'))],check=True)
 (out/(s['id']+'.mp4')).write_bytes((w/(s['id']+'.mp4')).read_bytes())
 subprocess.run(['ffmpeg','-v','error','-ss','0.5','-i',str(w/(s['id']+'.mp4')),'-frames:v','1','-c:v','libwebp','-quality','85','-y',str(out/(s['id']+'-poster.webp'))],check=True)
inputs=[]
for s in shots:inputs+=['-i',str(w/(s['id']+'.mp4'))]
filters='[0:v][1:v]xfade=transition=fade:duration=0.3:offset=3.1[v01];[v01][2:v]xfade=transition=fade:duration=0.3:offset=6.2,format=yuv420p[v]'
subprocess.run(['ffmpeg','-v','error',*inputs,'-filter_complex_threads','1','-filter_complex',filters,'-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','24','-movflags','+faststart','-y',str(out/'sayyes-film.mp4')],check=True)
subprocess.run(['ffmpeg','-v','error','-i',str(out/'sayyes-film.mp4'),'-an','-vf','scale=540:720','-c:v','libx264','-preset','fast','-crf','25','-movflags','+faststart','-y',str(out/'sayyes-film-mobile.mp4')],check=True)
subprocess.run(['ffmpeg','-v','error','-ss','1','-i',str(out/'sayyes-film.mp4'),'-frames:v','1','-c:v','libwebp','-quality','85','-y',str(out/'film-poster.webp')],check=True)
(root/'video-edit.json').write_text(json.dumps({'source':'Owner-uploaded screen recordings','shots':shots,'notes':'Cropped social UI and baked captions. No generative replacement. Silent montage with 0.3-second crossfades. Four uploads exceed 32 MiB transfer limit.'},ensure_ascii=False,indent=2))
print([(p.name,round(p.stat().st_size/1e6,2)) for p in out.iterdir()])
