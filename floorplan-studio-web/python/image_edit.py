import base64,json,os,uuid
from urllib.request import Request,urlopen

def edit_image(body):
    if not isinstance(body,dict) or not isinstance(body.get('instruction'),str) or not 0<len(body['instruction'])<=4000:raise ValueError('Invalid instruction')
    image=body.get('image','')
    if not isinstance(image,str) or not image.startswith('data:image/png;base64,'):raise ValueError('Expected PNG')
    raw=base64.b64decode(image.split(',',1)[1],validate=True)
    if len(raw)>5_000_000 or raw[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('Invalid image')
    mask=None
    if body.get('mask'):
        value=body['mask']
        if not isinstance(value,str) or not value.startswith('data:image/png;base64,'):raise ValueError('Expected PNG mask')
        mask=base64.b64decode(value.split(',',1)[1],validate=True)
        if len(mask)>4_000_000 or mask[:8]!=raw[:8] or mask[16:24]!=raw[16:24]:raise ValueError('Invalid mask')
    boundary='floorplan-'+uuid.uuid4().hex
    fields={'model':os.getenv('OPENAI_IMAGE_MODEL','gpt-image-2.5-sunburst'),'prompt':'Edit this floorplan crop according to the user request. Preserve the existing floorplan and make only the requested changes. For removal requests, continue the existing ground surface beneath the object; do not substitute another object. Never add unrequested text. Preserve the exact room geometry, walls, doors, labels and measurements unless explicitly requested otherwise. Match the surrounding floor colour and texture where objects are removed. Do not add labels or invent numbers. Return the same viewpoint and framing. User request: '+body['instruction'],'size':'1024x1024','quality':'medium','output_format':'png'}
    parts=[]
    for k,v in fields.items():parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="selection.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+raw+b'\r\n')
    if mask is not None:parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="mask"; filename="mask.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+mask+b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    req=Request('https://api.openai.com/v1/images/edits',data=b''.join(parts),headers={'Authorization':'Bearer '+os.environ['OPENAI_API_KEY'],'Content-Type':'multipart/form-data; boundary='+boundary})
    with urlopen(req,timeout=180) as response:result=json.load(response)
    data=result['data'][0]['b64_json']
    return {'image':'data:image/png;base64,'+data}
