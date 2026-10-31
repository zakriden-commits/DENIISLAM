"""Reproduce pinned, attributed game assets. Requires GitHub CLI (gh)."""
import concurrent.futures,subprocess,json,base64
from pathlib import Path
root=Path(__file__).resolve().parent.parent
assets=root/'public/assets'
def get(a):
 dest=assets/a['file']
 if dest.exists() and dest.stat().st_size==a['bytes']:return
 result=subprocess.run(['gh','api',f"repos/{a['repo']}/git/blobs/{a['sha']}",'-H','Accept: application/vnd.github.raw+json'],capture_output=True,check=True).stdout
 if result.startswith(b'{'):
  obj=json.loads(result)
  if 'content' in obj and obj.get('encoding')=='base64':result=base64.b64decode(obj['content'])
 if len(result)!=a['bytes']:raise ValueError('Wrong asset length: '+a['file'])
 dest.write_bytes(result);print(a['file'],len(result),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(get,json.loads((assets/'manifest.json').read_text())))
