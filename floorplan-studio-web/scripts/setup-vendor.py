#!/usr/bin/env python3
"""Download the exact pinned OCR/PDF dependencies used by the public editor."""
import hashlib,json
from pathlib import Path
from urllib.request import urlopen
ROOT=Path(__file__).resolve().parents[1]
ASSETS={'pdf.mjs': {'url': 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs', 'sha256': 'a209a2124baa35cbb9015b809926f1bcec9dd1c247296290e205dd9d76cb9128'}, 'pdf.worker.mjs': {'url': 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs', 'sha256': '7c237f83fa56bce645d8af51d183c9c56ba7b2d2928ff42754dc7020bea36323'}, 'tesseract-core-lstm.wasm.js': {'url': 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js', 'sha256': '8f04aa0cc81e7bde33f80e92fa01a7a665f0b4884d098acf5de9c7104a11dfaa'}, 'eng.traineddata.gz': {'url': 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz', 'sha256': '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91'}, 'tesseract.min.js': {'url': 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', 'sha256': 'a8e29918d098b2b06e1012bdaeffb4aec0445c5d5654709023e0bd1f442a80e8'}, 'worker.min.js': {'url': 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js', 'sha256': 'aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc'}}
for name,asset in ASSETS.items():
    target=ROOT/'web'/'vendor'/name
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==asset['sha256']:
        print(name+': verified');continue
    with urlopen(asset['url'],timeout=90) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=asset['sha256']:raise RuntimeError('Checksum mismatch: '+name)
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)
    print(name+': installed and verified')
