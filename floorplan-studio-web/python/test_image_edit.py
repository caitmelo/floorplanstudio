import base64, importlib.util, json, os, struct, unittest
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('image_edit',Path(__file__).with_name('image_edit.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def png(w,h):return 'data:image/png;base64,'+base64.b64encode(b'\x89PNG\r\n\x1a\n'+b'\0'*8+struct.pack('>II',w,h)).decode()
class Response:
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self):return json.dumps({'data':[{'b64_json':'test'}]}).encode()
class MaskTests(unittest.TestCase):
 def test_mask_sent_as_multipart(self):
  with patch.dict(os.environ,{'OPENAI_API_KEY':'test-placeholder'}),patch.object(m,'urlopen',return_value=Response()) as upstream:
   result=m.edit_image({'instruction':'Remove car','image':png(128,128),'mask':png(128,128)})
   payload=upstream.call_args.args[0].data
   self.assertIn(b'name="image";',payload);self.assertIn(b'name="mask";',payload)
   self.assertEqual(result['image'],'data:image/png;base64,test')
 def test_mismatched_mask_rejected_before_request(self):
  with patch.object(m,'urlopen') as upstream:
   with self.assertRaises(ValueError):m.edit_image({'instruction':'Remove car','image':png(128,128),'mask':png(64,128)})
   upstream.assert_not_called()
if __name__=='__main__':unittest.main()
